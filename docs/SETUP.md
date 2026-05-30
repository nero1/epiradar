# EpiRadar — Setup Guide

## Prerequisites

- Node.js 20+
- A Supabase project (free tier works for development)
- A Redis instance (Upstash free tier or local Redis)
- Optional: Mailgun account for email (paid-user alert digests only)
- Optional: Paystack and/or Dodopayments accounts for billing

---

## 1. Clone and Install

```bash
git clone https://github.com/nero1/epiradar.git
cd epiradar
npm install
```

---

## 2. Environment Variables

Copy the example and fill in your values:

```bash
cp .env.local.example .env.local
```

### Required (core functionality)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only, never expose to client) |
| `NEXT_PUBLIC_APP_URL` | Your app URL, e.g. `https://epiradar.io` |

### AI pipeline

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key (primary AI provider) |
| `GEMINI_API_KEY` | Google Gemini API key (fallback AI provider) |

### Redis / caching

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_URL` | Upstash Redis REST URL (or leave blank for no caching in dev) |
| `UPSTASH_REDIS_TOKEN` | Upstash Redis REST token |
| `REDIS_PROVIDER` | `upstash` or `ioredis` (default: `upstash`) |

### Email — Mailgun (paid-user digests only)

Emails are sent **only to paid users**. Free accounts receive no email.

| Variable | Description |
|---|---|
| `MAILGUN_API_KEY` | Mailgun API key (`key-...`) |
| `MAILGUN_DOMAIN` | Your Mailgun sending domain, e.g. `mg.epiradar.io` |
| `EMAIL_FROM` | From address, e.g. `EpiRadar Alerts <alerts@epiradar.io>` |

### Payments

| Variable | Description |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (for Nigerian users) |
| `DODOPAYMENTS_API_KEY` | Dodopayments API key (for global users) |
| `DODOPAYMENTS_WEBHOOK_SECRET` | Dodopayments webhook signing secret |

### Bot protection

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (public) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key (server only) |

### MFA recovery

TOTP setup now returns one-time backup recovery codes. Store them securely; only hashes are persisted.
Sensitive account mutations (password change, account delete, PIN/TOTP actions) require recent re-authentication.

### CRON security

| Variable | Description |
|---|---|
| `CRON_SECRET` | Secret token for securing CRON endpoints |

---

## 3. Database Setup

Run the schema against your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or paste supabase/schema.sql into the Supabase SQL editor
```

Key schema elements:
- **Core tables**: `users`, `alerts`, `watchlists`, `ingestion_runs`, `billing_events`, `admin_audit_log`, `reports`, `export_logs`
- **RLS enabled** on user/data tables with ownership/admin policies
- **RLS policies**: Row-level security on all tables — users can only see/modify their own data
- **`decrement_pdf_export_quota`**: Atomic Postgres function preventing race conditions on quota
- **`reset_monthly_pdf_quotas`**: Call on the 1st of each month (or set up a Supabase scheduled function)
- **`handle_new_user`**: Trigger that creates a user profile on first OAuth login

---

## 4. Auth Setup (Google OAuth)

In your Supabase project:
1. Go to **Authentication → Providers → Google**
2. Enable Google OAuth
3. Add your Google OAuth client ID and secret
4. Set redirect URL to: `https://your-domain.com/api/auth/callback`
5. In Google Cloud Console, add `https://your-domain.com/api/auth/callback` as an authorized redirect URI

---

## 5. CRON Setup

### Architecture: two-tier cron

The Vercel Hobby (free) plan only executes cron jobs **once per day** maximum.
`vercel.json` uses this once-daily slot as the baseline for every endpoint.
For jobs that benefit from higher-frequency runs (ingestion, plan expiry), a
supplementary external scheduler — [cron-jobs.org](https://cron-jobs.org) (free tier) —
calls the same endpoints more frequently with an `Authorization: Bearer {CRON_SECRET}`
header for authentication.

All cron endpoints are idempotent, so being called from both Vercel and cron-jobs.org
on the same day is safe.

### Vercel (baseline — once daily)

`vercel.json` schedules all five jobs:

| Endpoint | Schedule | Purpose |
|---|---|---|
| `/api/cron/ingest` | 06:00 UTC daily | Fetch and ingest new disease alerts |
| `/api/cron/digest` | 07:00 UTC daily | Send watchlist email digests to paid users |
| `/api/cron/expire-plans` | 02:00 UTC daily | Downgrade users whose paid plan has lapsed |
| `/api/cron/hard-delete` | 03:00 UTC daily | Purge accounts soft-deleted 30+ days ago |
| `/api/cron/reset-quotas` | 00:00 UTC on the 1st | Reset monthly PDF export quotas |

Vercel sends `Authorization: Bearer {CRON_SECRET}` automatically when the env var is set.

### cron-jobs.org (supplementary — optional, can be higher frequency)

For endpoints where daily is not frequent enough, add supplementary jobs on cron-jobs.org:

**`/api/cron/ingest` — recommended every 24 hours (or higher frequency externally if your policy allows)**
1. Create a free account at [cron-jobs.org](https://cron-jobs.org)
2. Add a job: URL → `https://your-domain.com/api/cron/ingest`
3. Schedule: daily at a fixed UTC hour (minimum-cost default)
4. Add request header: `Authorization: Bearer {your-CRON_SECRET}`
5. Add request header: `x-cron-source: external`

**`/api/cron/expire-plans` — recommended every 24 hours (or higher frequency externally if your policy allows)**
1. Add a second job: URL → `https://your-domain.com/api/cron/expire-plans`
2. Schedule: daily at a fixed UTC hour (minimum-cost default)
3. Add request header: `Authorization: Bearer {your-CRON_SECRET}`

The remaining three endpoints (`digest`, `hard-delete`, `reset-quotas`) are
daily or monthly by design — Vercel's once-daily cron is sufficient for them.

---

## 6. Cloudflare Turnstile Setup

1. Go to [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
2. Create a new site widget
3. Set site key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
4. Set secret key → `TURNSTILE_SECRET_KEY`

The `TurnstileWidget` component automatically renders the challenge on login and export forms when the site key is configured. If not configured, the widget is hidden (for local development).

---

## 7. Payment Setup

### Paystack (Nigerian users)
1. Create account at paystack.com
2. Get secret key from Dashboard → Settings → API Keys
3. Set up webhook pointing to `https://your-domain.com/api/webhooks/paystack`
4. Configure webhook to send `charge.success` events

### Dodopayments (global users)
1. Create account at dodopayments.com
2. Get API key and webhook secret
3. Set up webhook pointing to `https://your-domain.com/api/webhooks/dodopayments`
4. Configure to send `payment.succeeded` events

---

## 8. Local Development

```bash
npm run dev
```

The app runs at `http://localhost:3000`. Without Supabase credentials, pages that require data will show empty states gracefully (no crashes).

---

## 9. Running Tests

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright) — requires running server
npm run dev &
npx playwright test tests/e2e/

# Load tests (k6) — requires k6 installed
k6 run tests/load/dashboard.js
```

---

## 10. Deployment

### Vercel (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

### Supabase Database Restoration

If you need to restore from backup:
1. Download backup from Supabase dashboard
2. `psql $DATABASE_URL < backup.sql`
3. Verify RLS policies are intact: `\dp` in psql

---

## 11. Protecting Secrets

**What never goes in git:**
- `.env.local` — add to `.gitignore` (already included)
- Any file containing `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, `DODOPAYMENTS_API_KEY`, `MAILGUN_API_KEY`, `CRON_SECRET`, `TOTP_ENCRYPTION_KEY`

**Safe to commit:**
- `.env.local.example` — contains only placeholder values, no real secrets
- `next.config.ts`, `vercel.json` — contain no secrets
- Supabase migrations/schema (no credentials inside)

**Production secrets storage:**
- All secrets go into **Vercel → Settings → Environment Variables** (encrypted at rest)
- Never log secrets; never return them in API responses
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — ensure it is never prefixed with `NEXT_PUBLIC_`

---

## 12. Secret Rotation Runbook

Rotate secrets without downtime using this sequence:

### Supabase Service Role Key
1. In Supabase dashboard → Settings → API → regenerate service role key
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables
3. Trigger a Vercel redeploy
4. Verify API health at `/api/v1/risk-scores`

### CRON_SECRET
1. Generate a new secret: `openssl rand -hex 32`
2. Update `CRON_SECRET` in Vercel environment variables
3. Update the same secret in all cron-jobs.org job headers
4. Trigger redeploy — old jobs will 401 until header is updated

### Paystack Secret Key
1. Roll key in Paystack dashboard → Settings → API Keys
2. Update `PAYSTACK_SECRET_KEY` in Vercel
3. **Do not** update the webhook signature secret simultaneously — rotate separately
4. Monitor webhook logs for 401s

### Dodopayments Webhook Secret
1. Generate new secret in Dodopayments dashboard
2. Update `DODOPAYMENTS_WEBHOOK_SECRET` in Vercel
3. Redeploy — there is a ~30s gap where webhooks may fail; Dodopayments will retry

### Mailgun API Key
1. Create a new API key in Mailgun dashboard
2. Update `MAILGUN_API_KEY` in Vercel
3. Old key can be revoked after confirming first successful send

### TOTP Encryption Key
1. **Warning:** Rotating this key invalidates all existing TOTP setups for users
2. Generate: `openssl rand -hex 32`
3. Update `TOTP_ENCRYPTION_KEY` in Vercel
4. Notify users that 2FA must be re-enrolled

---

## 13. App Update / Deployment Runbook

### Standard update (no schema changes)
```bash
git checkout main
git pull
# Make changes
npm test                    # all Vitest tests pass
npx tsc --noEmit           # TypeScript clean
git push origin main       # triggers Vercel auto-deploy
```

### Update with database schema changes
1. Apply migration to Supabase: paste changes into SQL editor or use `supabase db push`
2. Verify RLS policies still cover new tables/columns
3. Update `lib/supabase/types.ts` to match new schema
4. Deploy app code after schema is live (never before)

### Verifying a deployment
1. Check Vercel deployment logs for build errors
2. Hit `/api/v1/risk-scores` — expect 200 with `{"data":[...]}`
3. Hit `/api/v1/docs` — expect OpenAPI spec JSON
4. Trigger a manual ingestion: `POST /api/admin/ingest` (requires admin auth)

---

## 14. Rollback Runbook

### Application rollback (Vercel)
1. Go to Vercel dashboard → Deployments
2. Find the last known-good deployment
3. Click **Promote to Production**
4. No code changes needed — Vercel redeploys that build instantly

### Database rollback
1. Supabase does not support point-in-time restore on free tier
2. For paid Supabase: use PITR from dashboard
3. For free tier: restore from the most recent manual backup (`.sql` file)
4. Re-run any migrations that were applied after the backup

### Emergency: take site offline
Set environment variable `MAINTENANCE_MODE=true` and redeploy. (Add a middleware check if needed.)

