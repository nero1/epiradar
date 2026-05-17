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

---

## 11. Feature Reference by Tier

| Feature | Public | Free | Paid |
|---|---|---|---|
| World risk map | ✅ | ✅ | ✅ |
| Alert ticker (top 3 visible) | ✅ | ✅ | ✅ |
| Alert ticker (all) | — | ✅ | ✅ |
| Alert detail page | ✅ | ✅ | ✅ |
| Country pages | ✅ | ✅ | ✅ |
| Pathogen pages | ✅ | ✅ | ✅ |
| Watchlists (up to 3) | — | ✅ | ✅ |
| Watchlists (unlimited) | — | — | ✅ |
| Daily email digest | — | — | ✅ |
| Immediate email alerts | — | — | ✅ |
| PDF export (3/month) | — | ✅ | ✅ |
| PDF export (unlimited) | — | — | ✅ |
| CSV export | — | — | ✅ |
| Deep AI report | — | — | ✅ |
| API key (1,000 req/day) | — | — | ✅ |
| TOTP 2FA | — | ✅ | ✅ |
| PIN lock | — | ✅ | ✅ |

**Tier gating implementation**: `requireAuth()` in `lib/auth/session.ts` returns the authed user. `requirePaidUser()` additionally checks `user.plan === "paid"` and throws a 403 if not. All paid-only routes call `requirePaidUser()` at the top of the handler before any work is done.

---

## 12. Admin Panel Guide

The admin panel is at `/admin`. Access requires `is_admin = true` in the `users` table (DB-verified on every request; never inferred from JWT).

### Tabs

**Overview**
- Ingestion run history: last 10 runs with status, item counts, duration, and per-run errors
- Alert volume: total alerts in DB, active alerts, last ingestion timestamp
- User counts: total users, free vs paid split
- Manual ingestion trigger: fires `POST /api/admin/ingest` immediately

**Users**
- Paginated user table (search by email or name)
- Actions: Suspend/restore (sets `suspended_at`), change plan (free↔paid), toggle admin, impersonate (Supabase magic link, audit-logged)
- Self-demotion is blocked in the API handler

**Revenue**
- MRR this month and last month (Paystack NGN converted to USD via fixed rate; Dodopayments USD as-is)
- Active paid users, new subscriptions MTD
- Churn: users who downgraded or were not renewed MTD, churn rate (%)
- Recent billing events (last 20)

**AI Pipeline**
- Average scoring latency (last 10 runs, in ms)
- Fallback rate: % of items scored by Gemini instead of DeepSeek
- Total tokens consumed across last 10 runs
- Estimated cost in USD (~$0.50/M blended rate)

**Themes**
- Live CSS variable editor for admin/branded themes (stored in Redis)
- Activate a theme globally by name
- Delete a theme (resets to "default" if that theme was active)

**Audit Log**
- Paginated `admin_audit_log` view: action, actor, target, payload, timestamp

**Export Volume**
- PDF and CSV export counts: today vs 7-day rolling

All mutations (suspend, plan change, admin toggle, impersonation, theme activation) are written to `admin_audit_log` with the acting admin's ID.

---

## 13. Quota and Billing Logic

### PDF Export Quota
Free users get **3 PDF exports per calendar month**. The quota is stored in `users.pdf_exports_used` (integer). On each export:

1. API calls the Postgres function `decrement_pdf_export_quota(user_id)` via Supabase RPC
2. The function checks `pdf_exports_used < 3` and atomically increments the counter within a single transaction
3. It returns `true` if allowed, `false` if quota exhausted
4. This prevents race conditions — two simultaneous export requests cannot both succeed when 1 quota remains

On the 1st of each month, `/api/cron/reset-quotas` resets `pdf_exports_used = 0` for all free users.

All quota math uses **Decimal.js** to avoid floating-point representation errors.

### Plan Activation
When a payment webhook arrives (`charge.success` from Paystack, `payment.succeeded` from Dodopayments):
1. Webhook signature is verified (HMAC)
2. `billing_events` upsert with `idempotency_key = provider + event_id` — prevents duplicate upgrades on webhook retries
3. `users.plan = "paid"` and `plan_expires_at = now() + 30 days`

The `/api/cron/expire-plans` job runs every 6 hours and downgrades users whose `plan_expires_at` is in the past back to `"free"`.

### Grace Period
If a payment fails (e.g., renewal), a 3-day grace period is applied: `plan_expires_at` is extended by 3 days rather than immediately downgrading. If payment is not resolved within the grace window, the next plan expiry CRON will downgrade the account.

### Provider Routing
The billing/upgrade endpoint reads the `provider` field from the request body. The pricing page sets this based on IP geolocation: `CF-IPCountry` or `X-Vercel-IP-Country` header == `"NG"` → Paystack (NGN 15,000); all other countries → Dodopayments (USD 29).

---

## 14. API Reference

All endpoints are under `/api/v1/`. Full OpenAPI 3.1 spec is at `GET /api/v1/docs`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/risk-scores` | None | Country risk scores (cached 1hr) |
| GET | `/api/v1/risk-scores/trend` | None | 7-day global risk averages |
| GET | `/api/v1/alerts` | Free+ | Paginated alert list |
| GET | `/api/v1/alerts/[id]` | None | Single alert detail |
| GET | `/api/v1/countries/[iso]` | None | Country summary + alerts |
| GET | `/api/v1/pathogens` | None | Top pathogens with risk scores |
| POST | `/api/v1/reports` | Paid | Generate + persist a deep AI report |
| GET | `/api/v1/reports` | Paid | List saved reports (cursor pagination) |
| GET | `/api/v1/watchlists` | Free+ | List watchlist items |
| POST | `/api/v1/watchlists` | Free+ | Add watchlist item (3-item cap for free) |
| PATCH | `/api/v1/watchlists` | Free+ | Update `alert_mode` on a watchlist item |
| DELETE | `/api/v1/watchlists` | Free+ | Remove watchlist item |
| POST | `/api/v1/exports/pdf` | Free+ | Export alert as PDF (quota enforced) |
| POST | `/api/v1/exports/csv` | Paid | Export alerts as CSV |
| GET | `/api/v1/apikeys` | Paid | List API keys |
| POST | `/api/v1/apikeys` | Paid | Create API key (returned once) |
| DELETE | `/api/v1/apikeys` | Paid | Revoke API key |
| PATCH | `/api/v1/account/profile` | Free+ | Update display name or recovery email |
| POST | `/api/v1/account/password` | Free+ | Change password |
| POST | `/api/v1/account/totp/setup` | Free+ | Begin TOTP setup |
| POST | `/api/v1/account/totp/verify` | Free+ | Activate TOTP after verification |
| POST | `/api/v1/account/pin` | Free+ | Set / update PIN |
| DELETE | `/api/v1/account/pin` | Free+ | Remove PIN |
| PATCH | `/api/v1/account/pin` | Free+ | Verify PIN |
| POST | `/api/v1/account/delete` | Free+ | Soft-delete account |
| POST | `/api/v1/billing/upgrade` | Free+ | Initiate checkout |

**Authentication methods:**
- Session cookie (browser): Set by Supabase after OAuth login; sent automatically by the browser
- API key header (programmatic): `Authorization: Bearer epk_<hex>` — key hash looked up in `users.api_key_hash`, `api_key_last_used_at` updated on each request

---

## 15. i18n Architecture

**Files: `lib/i18n/config.ts`, `messages/en.json`**

EpiRadar is scaffolded for multi-language support using a lightweight message dictionary pattern. The planned locales align with Nigerian linguistic diversity:

| Code | Language | Status |
|---|---|---|
| `en` | English | Active (complete) |
| `ha` | Hausa | Scaffolded (empty dictionary) |
| `yo` | Yoruba | Scaffolded (empty dictionary) |
| `ig` | Igbo | Scaffolded (empty dictionary) |

### Adding a new locale

1. Create `messages/{locale}.json` (copy `messages/en.json` and translate values)
2. Add the locale code to `SUPPORTED_LOCALES` in `lib/i18n/config.ts`
3. Add the locale's display name to the `LOCALE_NAMES` map in the same file
4. Restart the dev server — the locale becomes available in the language selector

The i18n system is not yet wired into the UI (pending locale-aware routing). The scaffold ensures message keys are centralised so no string literals need to be hunted down when translations are added.

---

## 16. CRON Strategy

### Scheduled jobs (vercel.json)

| Job | Schedule | Purpose |
|---|---|---|
| `/api/cron/ingest` | 06:00 UTC daily | Fetch all 5 sources, score new alerts, fire immediate emails |
| `/api/cron/digest` | 07:00 UTC daily | Send daily email digest to paid users with watchlist matches |
| `/api/cron/reset-quotas` | 00:00, 1st of month | Reset free-user PDF export quota (`pdf_exports_used = 0`) |
| `/api/cron/expire-plans` | Every 6 hours | Downgrade users whose `plan_expires_at` has passed |
| `/api/cron/hard-delete` | 03:00 UTC daily | Permanently delete accounts soft-deleted > 30 days ago |

All CRON endpoints require `Authorization: Bearer {CRON_SECRET}`. Vercel injects this automatically when the env var is set. External callers (cron-jobs.org) must send the header manually.

### Vercel Hobby Plan limitation
The Vercel Hobby plan supports a minimum CRON interval of **once per day**. For higher-frequency ingestion (every 4 hours), use [cron-jobs.org](https://cron-jobs.org):
1. Create a free account and add a job pointing to `https://your-domain.com/api/cron/ingest`
2. Set the schedule to every 4 hours
3. Add the headers `Authorization: Bearer {CRON_SECRET}` and `x-cron-source: external`

The ingestion endpoint is fully idempotent — running it multiple times within the same window safely skips already-ingested items.

### CRON security
Every CRON handler validates the bearer token:
```typescript
if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```
There is no IP allowlist — the secret token is the sole authentication mechanism, which is compatible with both Vercel's internal scheduler and external services like cron-jobs.org.
