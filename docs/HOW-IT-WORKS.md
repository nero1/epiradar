# EpiRadar — How It Works

## System Overview

EpiRadar is an AI-powered infectious disease early warning platform. It continuously monitors public health data sources, scores each report using AI models, and presents ranked, summarized alerts on a real-time dashboard.

```
Data Sources → Ingestion Engine → AI Pipeline → Database → Dashboard
                                                         → Email Alerts
                                                         → API
```

---

## 1. Data Ingestion

**File: `lib/ingestion/sources.ts`**

Every 4–24 hours (depending on CRON configuration), the ingestion engine fetches reports from 5 parallel data sources:

| Source | Type | Focus |
|---|---|---|
| WHO Disease Outbreak News | RSS | Official WHO outbreak declarations |
| ProMED | RSS | Expert-moderated disease intelligence |
| ReliefWeb | REST API | Humanitarian and health crisis reports |
| PubMed NCBI | REST API | Scientific literature on novel pathogens |
| Google News | RSS (4 queries) | Real-time news coverage |

Each source fetcher:
- Wraps all HTTP calls with `fetchWithTimeout` (15s timeout)
- Retries up to 3 times with exponential backoff + jitter (preventing thundering herd)
- Fails independently — a single source failure doesn't block others (via `Promise.allSettled`)

**Deduplication**: Each item is SHA-256 hashed (title + content + source). If the hash already exists in the `alerts` table, the item is skipped. This makes every ingestion run idempotent — safe to run multiple times.

---

## 2. AI Scoring Pipeline

**File: `lib/ai/pipeline.ts`**

Each new item passes through a two-stage AI evaluation:

### Stage 1: Relevance & Scoring
A structured prompt is sent to **DeepSeek** (primary). If DeepSeek fails or times out, it falls back to **Gemini Flash**. The prompt wraps all user-supplied content in `--- BEGIN ALERT ---` / `--- END ALERT ---` delimiters to prevent prompt injection.

The AI returns a JSON object with:
- `isRelevant`: Is this a genuine disease outbreak signal?
- `riskScore` (0–100): Composite outbreak risk
- `severityScore`: Severity of illness
- `spreadScore`: Geographic spread potential
- `noveltyScore`: How unexpected this is
- `aiSummary`: 2–3 plain English sentences
- `countryIso`: Affected country codes
- `pathogen`: Pathogen name
- `caseCount`, `deathCount`: Epidemiological figures if mentioned

### Stage 2: Validation
All AI output is validated by a **Zod schema** before being written to the database. This catches hallucinated fields, out-of-range scores, and malformed arrays. Items that fail validation are silently dropped (not stored).

Items with `riskScore < 36` or `isRelevant: false` are discarded as noise.

### Model versions
All model IDs are centralised in `lib/ai/models.ts`. To upgrade models, change only this file.

---

## 3. Database Layer

**File: `supabase/schema.sql`**

### Tables
- **`alerts`**: Scored outbreak reports with all AI-generated fields
- **`users`**: User profiles, plan, PDF quota, API key hash, TOTP secret
- **`watchlists`**: User's monitored countries/pathogens/regions
- **`ingestion_runs`**: Audit trail of each ingestion job (status, counts, errors)
- **`billing_events`**: Idempotent payment records from Paystack + Dodopayments
- **`admin_audit_log`**: All admin actions with payload

### Row-Level Security (RLS)
Every table has RLS enabled. Users can only read/write their own rows. The admin client (`createAdminClient()`) uses the service role key which bypasses RLS for server-side operations — it is never exposed to the client.

### Race Condition Protection
The `decrement_pdf_export_quota` Postgres function atomically checks and decrements the PDF export count within a single transaction. This prevents two concurrent requests from both being allowed when only one quota remains.

---

## 4. Caching Layer

**File: `lib/redis/client.ts`**

Redis (Upstash in production) caches expensive database queries:

| Cache key | TTL | Contents |
|---|---|---|
| `risk-scores:all` | 1 hour | All country risk scores |
| `alerts:top:{n}` | 1 hour | Top N alerts |
| `risk-trend:7d` | 1 hour | Daily risk averages for last 7 days |
| `country:{iso}` | 1 hour | Country summary + alerts |

**Cache stampede prevention**: When a cache entry is within the last 10% of its TTL, there's a probabilistic chance it will be refreshed early. This prevents all instances from refetching simultaneously when a popular cache key expires.

If Redis is unavailable, all cache operations fail silently — the app falls back to direct database queries (no crashes).

---

## 5. Authentication

**File: `lib/auth/session.ts`**

Authentication uses **Supabase Auth** with Google OAuth:

1. User clicks "Sign in with Google"
2. Supabase handles the OAuth redirect
3. On return, `/api/auth/callback` exchanges the code for a session
4. A Supabase trigger (`handle_new_user`) creates a user profile in the `users` table on first login

**Admin verification**: `requireAdmin()` always re-queries the `users` table to check `is_admin`. It never trusts the JWT claim alone. This means admin status can be revoked immediately without waiting for token expiry.

---

## 6. Rate Limiting

**File: `lib/ratelimit/index.ts`**

Redis-backed token bucket rate limiting using `INCR` + `EXPIRE`:

| Scope | Limit |
|---|---|
| Export endpoints | 10/hour per user |
| API key (paid) | 1,000/day per key |
| Public IP | 60/minute per IP |

When Redis is unavailable, rate limiting fails open (requests are allowed through). This is intentional — a Redis outage should not take down the product.

---

## 7. Payment Flow

```
User clicks "Upgrade" → POST /api/v1/billing/upgrade
  → Detects region (Nigeria = Paystack, global = Dodopayments)
  → Creates checkout session (with idempotency key)
  → Redirects user to payment provider

Payment succeeds → Provider sends webhook to /api/webhooks/{provider}
  → Signature verified (HMAC)
  → Billing event recorded in DB (idempotent upsert)
  → User plan upgraded to "paid" with 30-day expiry
```

All amounts are handled with **Decimal.js** to avoid floating-point precision errors.

---

## 8. Email Alert Digest

**File: `app/api/cron/digest/route.ts`**

Daily at 07:00 UTC:
1. Fetch all watchlist items with `alert_mode = "daily"`
2. Group by user
3. Fetch high-risk alerts from the last 24 hours
4. Match each user's watchlist items against the alert set
5. For each user with matching alerts, send an HTML digest email via Resend/Postmark
6. Idempotency key: `digest-{userId}-{date}` prevents duplicate sends on retries

---

## 9. Security Hardening

### Input validation
All user input is validated with Zod before touching the database. This prevents SQL injection (via Supabase's parameterized queries), stored XSS, and malformed data.

### Content Security Policy
`next.config.ts` sets a strict CSP that limits script execution to known origins and blocks inline scripts.

### Admin panel security
- `is_admin` verified from DB on every admin request — never from session
- All admin mutations are written to `admin_audit_log`
- Self-demotion is blocked (admin cannot remove their own admin access)

### Webhook security
- Paystack: HMAC-SHA512 verification on `x-paystack-signature`
- Dodopayments: HMAC-SHA256 on `webhook-signature` + 5-minute timestamp replay protection
- Processing failures return HTTP 200 to prevent provider infinite retries

### Bot protection
Cloudflare Turnstile is integrated on signup and export forms. The server-side `verifyTurnstileToken()` function validates the client token. If `TURNSTILE_SECRET_KEY` is not set (dev/CI), verification is skipped.

---

## 10. PWA / Offline Support

**File: `public/sw.js`**

The service worker uses a hybrid caching strategy:
- **Cache-first**: Static assets, fonts, icons (long TTL)
- **Network-first**: API responses, pages (falls back to cache if offline)

The offline banner (`components/ui/OfflineBanner`) detects network loss and shows the last-updated timestamp so users know when data was last fetched.
