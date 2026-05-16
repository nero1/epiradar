<INSTRUCTIONS>

# INSTRUCTIONS
For each phase of the plan you complete, append a new update to the end of this file.

Update should be of the form:

```

[Phase number][phase title]
Brief one paragraph concise summary of what was done.
Progress: x% [where x% is the percentage of the plan that has been completed so far (our aim is to eventually get this to 100 percent)]. 

---

[Phase number][phase title]
Brief one paragraph concise summary of what was done.
Progress: y% 

--- 
```

NOTE: Do not change what was already on the file, just append the new update because this is a journal/log

---

</INSTRUCTIONS>

---

[Phase 1][Foundation]
Bootstrapped the full Next.js 16 (App Router) + TypeScript project from scratch. Set up Tailwind CSS with a CSS-variable-based theming system supporting light, dark, and custom admin themes (no purple, no gradients). Created the core directory structure and all foundational library files: `lib/ai/models.ts` (central AI model version constants), `lib/supabase/client.ts` + `lib/supabase/server.ts` + `lib/supabase/types.ts` (typed Supabase clients), `lib/redis/client.ts` (Upstash/ioredis selector with cache stampede prevention), `lib/utils/retry.ts` (exponential backoff + jitter for all external calls), and `lib/auth/session.ts` (DB-verified auth helpers). Built the base layout with a sticky header, mobile bottom toolbar (Home/Map/Alerts/Watchlist/Account), and offline banner. Implemented Google OAuth via Supabase with a `/api/auth/callback` route handler and `/onboarding` page for first-login password/recovery-email setup. Created the complete Supabase schema SQL (all 5 tables + RLS policies + atomic PDF quota decrement function). Set up a PWA manifest and service worker with cache-first/network-first strategies for offline support. Wired up GitHub Actions CI/CD (lint, type-check, unit tests, build, deploy to Vercel). The production build compiles cleanly with all 15 routes, TypeScript passes, and 4 unit tests pass.
Progress: 17%

---
[Phase 2][Data Ingestion and AI Pipeline]
Built the complete data ingestion engine and AI scoring pipeline. Created `lib/ingestion/sources.ts` with parallel fetchers for all 5 data sources (WHO RSS, ProMED RSS, ReliefWeb API, PubMed NCBI, Google News RSS) — each with exponential backoff retries and graceful failure isolation. Implemented SHA-256 content hash deduplication so re-runs skip already-ingested items (idempotent). Built `lib/ai/pipeline.ts` with a DeepSeek primary / Gemini Flash fallback scoring pipeline: each alert is classified for relevance, scored 0–100 on severity/spread/novelty, entity-extracted (country ISO, pathogen, case/death counts), and summarised in plain English. All AI output is Zod schema-validated to prevent prompt injection from corrupting the database. Built `lib/ingestion/run.ts` as the orchestration layer that logs each run to `ingestion_runs`, processes items in batches of 5, and handles race conditions on duplicate inserts. Created `/api/cron/ingest` (secured with CRON_SECRET) and `/api/admin/ingest` (admin-only manual trigger). Added `vercel.json` with daily CRON schedule. 12 unit tests pass including AI fallback, schema validation, and source error isolation.
Progress: 33%

---
[Phase 3][Public Dashboard]
Built the complete public-facing dashboard. Created `lib/data/alerts.ts` as the data access layer with Redis-cached functions for country risk scores, top alerts, and 7-day trend data (1-hour TTL, cache stampede protection). Implemented all public API endpoints: `/api/v1/risk-scores`, `/api/v1/risk-scores/trend`, `/api/v1/alerts` (tier-gated), `/api/v1/alerts/[id]`, `/api/v1/countries/[iso]`. Built three interactive dashboard components: `RiskMap` (Leaflet world map, color-coded by risk level, client-only with `RiskMapClient` wrapper for Next.js 16 compatibility), `AlertTicker` (paginated alert list with severity badges, country flags, teaser paywall at item 3), and `RiskTrendChart` (Recharts 7-day line chart). Updated the home page to use server-side data fetching (ISR, 1-hour revalidate) for fast first paint. Built the alert detail page with score breakdown bars, case/death counts, source link, and paid-tier deep report CTA. Built country pages (`/countries/[iso]`) with `generateStaticParams` for pre-rendering. Added `/alerts/[id]` detail pages with ISR. Implemented auto-generated sitemap and robots.txt. All pages guard against missing Supabase credentials during CI builds. 22 routes build cleanly; 12 tests pass.
Progress: 50%

---
[Phase 4][Free Account Features]
Implemented the complete free-tier account experience. Built the account settings page (`/account`) as a server component with a tabbed client component covering: profile (display name update), security (password change, TOTP 2FA setup with pending-prefix activation guard), and export usage (Decimal.js-powered progress bar, plan-aware messaging). Built the watchlist UI (`/watchlist`) with add/remove flow, type selector (country/pathogen/region), alert mode toggle (daily/immediate), and free-tier 3-item cap with upgrade prompt. Created all supporting API routes: `PATCH /api/v1/account/profile`, `POST /api/v1/account/password` (Supabase Auth updateUser), `POST /api/v1/account/totp/setup` and `POST /api/v1/account/totp/verify` (otplib, pending: prefix pattern prevents unverified secrets going live), `GET/POST/DELETE /api/v1/watchlists` (free-tier enforcement, 409 on duplicates). Added PDF export (`POST /api/v1/exports/pdf`) with atomic DB quota decrement via Postgres RPC and CSV export (`POST /api/v1/exports/csv`, paid-only, country/pathogen filters). Built the daily alert digest CRON (`GET /api/cron/digest`, 07:00 UTC) that groups watchlist items by user, matches against last 24h high-risk alerts, and sends personalised HTML digest emails via Resend/Postmark with idempotency keys. Rate limiter implemented with Redis INCR/EXPIRE token-bucket (10 exports/hour, 60 req/min IP, 1000 req/day API key). 31 total tests pass (19 new: quota math precision, Decimal.js floating-point correctness, rate limiter allow/block, email digest HTML validation).
Progress: 67%

---
[Phase 5][Paid Tier and Payments]
Implemented the full revenue-generating paid tier. Built Paystack integration (`lib/billing/paystack.ts`) with HMAC-SHA512 webhook signature verification, payment session initiation (NGN 15,000), and atomic plan upgrade with billing_events upsert idempotency to prevent duplicate upgrades. Built Dodopayments integration (`lib/billing/dodopayments.ts`) with HMAC-SHA256 + timestamp replay-attack protection (5-minute window), checkout session creation ($29 USD), and the same atomic upgrade pattern. Created webhook endpoints `/api/webhooks/paystack` and `/api/webhooks/dodopayments` — both verify signatures before processing and return 200 on processing errors to prevent infinite provider retries. Built `POST /api/v1/billing/upgrade` which selects provider from the request body (frontend detects Nigeria via `Intl.DateTimeFormat` timezone heuristic). Implemented deep AI report endpoint (`POST /api/v1/reports`, paid-only, rate-limited) that fetches relevant alert summaries from the DB and passes them to DeepSeek/Gemini for a structured markdown situation report. Created API key management (`GET/POST/DELETE /api/v1/apikeys`): key generated with `epk_` prefix, SHA-256 hash stored in DB, raw key returned only once at generation. Served the full OpenAPI 3.1 spec at `GET /api/v1/docs` covering all 13 endpoints with request/response schemas. Upgraded the pricing page with a live `PricingClient` that auto-detects region and initiates checkout redirect. 11 new tests cover: Paystack HMAC-SHA512 verification, Dodopayments HMAC-SHA256 verification, tampered payload rejection, missing-secret handling, API key prefix/hash format, determinism, and key≠hash contract.
Progress: 83%

---
[Phase 6][Admin Panel, Security Hardening, and Launch Prep]
Completed the full admin panel and all launch-ready hardening. Built a tabbed admin UI (`AdminClient.tsx`) with five sections: Overview (ingestion run history, alert volumes, user counts by plan, manual ingestion trigger), Users (paginated table with suspend/restore, plan change, admin toggle — all with DB-verified `is_admin`, self-demotion blocked, all actions written to `admin_audit_log`), Revenue (MRR this/last month normalised to USD via Decimal.js with NGN→USD conversion, active paid users, new subscriptions MTD, recent billing events), Theme Builder (custom CSS variable themes stored in Redis, activate globally by name), and Audit Log (paginated `admin_audit_log` view). Created admin API routes: `GET/PATCH /api/admin/users`, `GET /api/admin/stats`, `GET /api/admin/revenue`, `GET/POST/PATCH /api/admin/themes`, `GET /api/admin/audit`. Built Cloudflare Turnstile integration: server-side `verifyTurnstileToken()` (skips in dev/CI when key not set) and `TurnstileWidget` client component (lazy-loads Turnstile script via `onload` callback). Created `.env.local.example` documenting all 20+ environment variables. Added Playwright E2E test suite (`tests/e2e/public-dashboard.spec.ts`) with 14 tests covering public dashboard load, auth redirect enforcement, API access control, OpenAPI spec validation, and mobile layout. Built k6 load test (`tests/load/dashboard.js`) targeting 1,000 concurrent users with 4-stage ramp, p95 < 2s threshold, and < 1% error rate target. Excluded e2e/load from Vitest. Wrote comprehensive `docs/SETUP.md` (prerequisites, env vars, DB setup, OAuth, CRON, Turnstile, payments, deployment) and `docs/HOW-IT-WORKS.md` (full architecture: ingestion, AI pipeline, caching, auth, rate limiting, payment flow, email digest, all security measures). All 42 Vitest tests pass, TypeScript clean.
Progress: 100%

---
