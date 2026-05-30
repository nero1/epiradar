# EpiRadar Custom Bugs Report
Date: 2026-05-23
Time: 09:42:28 PM UTC

## Critical
1: BUG C-001: `/api/auth/callback` allows open redirect via unvalidated `next` parameter.
   FILES: app/api/auth/callback/route.ts
   FIX: Only allow relative paths that start with `/` and reject protocol/host values; prefer an allowlist of safe internal destinations.

2: BUG C-002: Sensitive admin impersonation magic-link URL is returned directly over API and can be leaked via logs/browser history.
   FILES: app/api/admin/users/route.ts
   FIX: Replace direct URL return with one-time server-side impersonation flow requiring explicit step-up auth + short TTL + non-exportable token; never return raw action link to frontend JSON.

3: BUG C-003: CSRF defenses are missing for cookie-authenticated state-changing endpoints (account/profile/password/theme/watchlist/admin actions).
   FILES: multiple `app/api/**/route.ts` endpoints
   FIX: Add CSRF tokens (double-submit or synchronizer pattern), enforce SameSite=strict/lax where possible, verify `Origin`/`Referer` on mutating routes, and apply centralized middleware checks.

## High
4: BUG H-001: `createAdminClient()` service-role usage is over-broad across user-facing routes, bypassing RLS and increasing blast radius.
   FILES: lib/supabase/server.ts, app/api/v1/reports/route.ts, app/api/v1/exports/pdf/route.ts, app/api/v1/account/delete/route.ts, admin routes
   FIX: Use session-bound client for normal user actions; reserve service-role for narrowly scoped server-only operations, with helper wrappers and explicit authorization checks.

5: BUG H-002: Redis fallback creates a local ioredis client with no endpoint when `UPSTASH_REDIS_URL` is missing, causing noisy failures and retry overhead.
   FILES: lib/redis/client.ts
   FIX: Implement explicit in-memory no-op adapter instead of `new Redis()` to localhost defaults; surface health metric and disable Redis-dependent features gracefully.

6: BUG H-003: Retry strategy is incomplete for third-party fetches; no consistent exponential backoff+jitter policy applied globally.
   FILES: lib/utils/safeFetch.ts, integration modules (AI/email/payments/ingestion)
   FIX: Wrap outbound calls in shared retry utility with bounded retries, full jitter, retryable-status classification, and idempotency-aware behavior.

7: BUG H-004: SSRF allowlist checks hostname only; no scheme/port/private-network hardening and no DNS rebind protections.
   FILES: lib/utils/safeFetch.ts
   FIX: Enforce https-only, explicit allowed ports, IP/DNS resolution guardrails against RFC1918/link-local/loopback, and deny redirects to unapproved destinations.

8: BUG H-005: Admin users API uses offset pagination (`page`) which degrades at scale and can produce inconsistent pages.
   FILES: app/api/admin/users/route.ts
   FIX: Replace with cursor-based pagination (`created_at,id`) and stable ordering; keep optional offset only for tiny admin datasets.

9: BUG H-006: Revenue computation uses hard-coded FX conversion and ambiguous units, risking financial integrity errors.
   FILES: app/api/admin/revenue/route.ts
   FIX: Store provider-native minor units + currency metadata, convert using authoritative FX snapshot tables, and clearly separate cents vs major-unit math.

10: BUG H-007: OAuth callback writes `users` profile manually while DB trigger also creates user; race/duplication paths are possible.
   FILES: app/api/auth/callback/route.ts, supabase/schema.sql
   FIX: Make one canonical creation path (trigger only), then run idempotent profile enrichment update after login.

## Medium
11: BUG M-001: No explicit bot defense/rate-limit layering on several expensive or abuse-prone endpoints beyond partial coverage.
   FILES: multiple API routes
   FIX: Add per-route cost-aware limits, IP+user composite keys, user-agent heuristics, and challenge escalation (Turnstile) for suspicious patterns.

12: BUG M-002: Lack of idempotency key persistence for export/report creation workflows despite accepting key fields.
   FILES: app/api/v1/exports/pdf/route.ts, app/api/v1/reports/route.ts
   FIX: Store idempotency keys with operation hash + response snapshot + TTL; return prior result on duplicate requests.

13: BUG M-003: Potential thundering-herd/cache stampede mitigation exists (`shouldEarlyRefresh`) but not obviously applied everywhere hot data is fetched.
   FILES: lib/redis/client.ts and data-fetch routes
   FIX: Standardize cache wrapper with lock/lease + stale-while-revalidate and probabilistic early refresh enforcement.

14: BUG M-004: Weak password policy (min length 8) without entropy checks or breached-password screening.
   FILES: app/api/v1/account/password/route.ts
   FIX: Enforce stronger policy (length + complexity/entropy), deny known-compromised passwords (HIBP k-anon), and add attempt throttling.

15: BUG M-005: TOTP setup/verify flow lacks rate limiting and recovery safeguards (backup codes, step-up checks).
   FILES: app/api/v1/account/totp/setup/route.ts, app/api/v1/account/totp/verify/route.ts
   FIX: Add per-user/IP verification throttles, backup recovery codes, and require recent-auth/reauth before enabling/disabling MFA.

16: BUG M-006: Missing dedicated security headers policy in app-level responses (CSP, frame-ancestors, referrer-policy, etc.).
   FILES: next.config.ts / middleware layer (not centrally enforced)
   FIX: Add strict baseline headers globally and per-route overrides for required embeds.

17: BUG M-007: API validation for pagination limits does not reject negatives/NaN robustly in all routes.
   FILES: app/api/v1/reports/route.ts, app/api/admin/users/route.ts
   FIX: Validate query params with zod schemas, clamp bounds, and reject malformed values with 400.

18: BUG M-008: `source_url` and other external text fields may later be rendered/logged without explicit output encoding standards.
   FILES: ingestion + display flows
   FIX: Enforce strict sanitization/escaping policy for all rendered external content and document trusted/escaped sinks.

## Low
19: BUG L-001: Setup docs claim only 5 core tables though schema has additional operational tables; documentation drift risks operator mistakes.
   FILES: docs/SETUP.md, supabase/schema.sql
   FIX: Update setup docs to list all active tables, policies, and migration expectations.

20: BUG L-002: Vercel cron + external cron guidance includes sub-daily external runs; this can conflict with strict “<= daily” deployment policy unless clearly marked optional.
   FILES: docs/SETUP.md, vercel.json
   FIX: Document policy explicitly: Vercel internal crons remain daily max; external scheduler frequencies configurable with recommended safe defaults and idempotency notes.

21: BUG L-003: JSDoc coverage is uneven in route handlers and critical business logic.
   FILES: multiple files
   FIX: Add concise JSDoc on route contracts, security assumptions, and error semantics for maintainability.

22: BUG L-004: No obvious dedicated user-help/support section route for recovery and incident support.
   FILES: app routes/docs
   FIX: Add `/help` with account recovery, billing, privacy, and security FAQ runbooks.

---

## Detailed Forensic Notes (per issue)
1) C-001 Open redirect in OAuth callback.
The callback reads `next` from query params and redirects to `${origin}${next}` without strict validation, creating redirect abuse risk and phishing chaining if malformed values are accepted. A strict sanitizer should permit only known internal paths. Affected file: `app/api/auth/callback/route.ts`.

2) C-002 Impersonation link exposure.
Admin route returns raw `action_link` in JSON. Any frontend logging, browser extension, referer leakage, or compromised admin workstation can disclose this token, granting account takeover. Replace with back-office initiated short-lived internal impersonation tickets and mandatory step-up auth. Affected file: `app/api/admin/users/route.ts`.

3) C-003 CSRF gaps.
State-changing POST/PATCH endpoints rely on cookie auth but do not show CSRF token verification or strict origin checking. This exposes account changes/deletions and admin actions to cross-site request attempts. Add centralized CSRF middleware and per-route defense in depth. Affected files: mutating routes in `app/api/**`.

4) H-001 Overuse of service-role client.
Many user-facing handlers query with admin client, bypassing RLS. While authorization checks exist, any missed check becomes high-impact data exposure risk. Prefer anon/session clients for user data paths and isolate service-role access behind minimal privileged functions. Affected files listed above.

5) H-002 Redis fallback behavior.
When Upstash URL is absent, client instantiates default ioredis configuration instead of deterministic no-op; this can create connection churn or localhost dial attempts in serverless contexts. Implement explicit no-op cache provider with telemetry. Affected file: `lib/redis/client.ts`.

6) H-003 Inconsistent retry/backoff.
Reliable distributed systems require uniform retry semantics with jitter and retry budget controls. Current structure has retry utility but not clearly enforced across all integrations. Standardize wrappers for AI, email, payment, and ingestion fetches. Affected files: integrations and `lib/utils/*`.

7) H-004 SSRF hardening incomplete.
Host allowlist is good but insufficient alone. Missing scheme/port validation, redirect chain validation, and DNS/IP class checks can leave edge SSRF vectors. Extend validator before network calls. Affected file: `lib/utils/safeFetch.ts`.

8) H-005 Offset pagination scalability.
Admin users endpoint uses page/offset, which grows slower and less stable under concurrent writes. Cursor pagination improves performance and consistency. Affected file: `app/api/admin/users/route.ts`.

9) H-006 Revenue integrity risk.
Hardcoded NGN→USD factor and assumptions around `amount` units can produce accounting drift and misleading dashboards. Use precise minor units and versioned FX rates. Affected file: `app/api/admin/revenue/route.ts`.

10) H-007 Duplicate user creation paths.
DB trigger already inserts user rows on auth user creation, while OAuth callback also inserts on first login. Under races, this can produce noisy errors or inconsistent fields. Consolidate to one source of truth. Affected files: `supabase/schema.sql`, `app/api/auth/callback/route.ts`.

11) M-001 Abuse controls uneven.
Turnstile and some rate limits exist, but abuse-resistant architecture should layer protections across expensive endpoints and admin surfaces, including adaptive challenges. Affected files: multiple API routes.

12) M-002 Idempotency not fully implemented.
Exports require `idempotencyKey` but key is not persisted/checked, so retries can duplicate processing and quota impact. Implement idempotency table and replay semantics. Affected file: `app/api/v1/exports/pdf/route.ts` (and similar create endpoints).

13) M-003 Stampede mitigation incomplete.
`shouldEarlyRefresh` exists but no centralized cache strategy visible ensuring lock/SWR usage in all hotspots. This can spike DB/API load at cache expiry. Affected files: caching/data-fetch areas.

14) M-004 Password policy weak.
Minimum length-only controls are inadequate for modern account defense. Add stronger policy and breached-password checks. Affected file: `app/api/v1/account/password/route.ts`.

15) M-005 MFA lifecycle robustness.
TOTP setup/verify lacks visible throttling, recovery-code workflow, and reauthentication gates for sensitive toggles. Add these for account recovery resilience and brute-force resistance. Affected files: TOTP routes.

16) M-006 Security headers baseline.
No centralized strict header policy is evident; app should enforce CSP, HSTS (at edge), X-Content-Type-Options, and related headers. Affected files: platform config/middleware.

17) M-007 Query param validation gaps.
Some numeric query params use direct `Number/parseInt` without strict schema checks, potentially allowing invalid values and edge-case behavior. Affected files: admin users/reports routes.

18) M-008 Output encoding policy gaps.
Externally sourced data may eventually flow into UI/reporting. Without explicit sanitizer/escaping standards, latent XSS/log-injection risks remain. Affected files: ingestion/rendering pipeline.

19) L-001 Setup documentation drift.
Docs table count and operational notes underrepresent current schema, risking deployment/config errors. Affected files: setup doc and schema.

20) L-002 Cron policy clarity.
Given zero-cost hosting constraints, docs should emphasize daily max on Vercel and explicitly separate external cron frequencies and rationale. Affected files: `vercel.json`, `docs/SETUP.md`.

21) L-003 JSDoc consistency.
Core flows have partial docs; more consistent JSDoc would reduce regression risk and onboarding time. Affected files: multiple.

22) L-004 User help route missing.
No obvious dedicated help center route for recovery/security/billing guidance. Add one for usability and support burden reduction.

---
Performance/Structure/Security Rating (current): **6.8 / 10**
After implementing recommended fixes: **8.9 / 10**

Brief review: The app shows strong foundations (typed stack, RLS intent, atomic quota DB function, some bot/rate limiting), but several high-impact security and integrity gaps remain around redirect safety, CSRF, privilege boundaries, idempotency, and financial/reliability rigor.

---
Generated by forensic static analysis.
Date: 2026-05-23
Time: 09:42:28 PM UTC


Update note (2026-05-26): Output encoding hardening for HTML email/PDF templates has been implemented via shared escaping utility.
Update note (2026-05-26 #2): Recent-auth step-up coverage extended to profile/theme/PIN/TOTP sensitive mutations; MFA backup-code recovery endpoint added and documented.
