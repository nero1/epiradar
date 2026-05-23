# EpiRadar Bug Fix Plan
Date: 2026-05-23
Time: 09:42:28 PM UTC

## Phase 0 — Immediate Containment (Critical)
1. Patch OAuth callback redirect validation (`next`) to internal-safe paths only.
2. Disable direct return of admin impersonation magic links; replace with internal step-up gated flow.
3. Implement CSRF defense layer for all mutating cookie-authenticated endpoints.

## Phase 1 — Security and Access Boundary Hardening (High)
4. Refactor user-facing routes to session-scoped Supabase clients; minimize service-role usage.
5. Expand SSRF guard: enforce https, allowed ports, redirect validation, private-IP/DNS protections.
6. Add centralized security headers (CSP baseline, frame protections, nosniff, referrer policy).
7. Add route-level abuse controls (rate limit tiers, bot challenge escalation, suspicious request heuristics).

## Phase 2 — Reliability, Scalability, and Data Integrity
8. Implement standard retry/backoff+jitter wrapper and migrate all third-party integrations.
9. Implement idempotency store for exports/reports/payment side effects with replay support.
10. Replace offset pagination in admin users API with cursor pagination.
11. Add cache stampede prevention framework (SWR + lock/lease + early refresh) and migrate hot endpoints.
12. Replace Redis missing-config fallback with explicit no-op cache provider.

## Phase 3 — Financial/Accounting Integrity
13. Redesign revenue pipeline to strict minor-unit accounting with currency metadata.
14. Add FX snapshot table/process for normalized dashboards.
15. Add reconciliation checks between billing events and user plan transitions.

## Phase 4 — Auth/MFA/Recovery Robustness
16. Strengthen password policy and compromised-password checks.
17. Add TOTP verify throttling, backup recovery codes, and recent-auth requirement for MFA state changes.
18. Consolidate user profile creation to one canonical path (DB trigger + idempotent enrichment).
19. Document and implement account recovery/reactivation runbook with auditable flow.

## Phase 5 — Operational Quality and UX
20. Update setup docs to match schema and cron policy constraints (Vercel daily max, external cron setup details).
21. Add `/help` page and support guidance (security, privacy, billing, account recovery).
22. Expand JSDoc coverage for security assumptions and API contracts.
23. Add observability: structured logs, security event audit fields, dashboard alerts for anomalies.

## Delivery Sequencing / Milestones
- Milestone A (1–2 days): Items 1–3.
- Milestone B (3–5 days): Items 4–7.
- Milestone C (4–7 days): Items 8–12.
- Milestone D (3–5 days): Items 13–15.
- Milestone E (3–5 days): Items 16–19.
- Milestone F (2–3 days): Items 20–23.

## Validation Checklist per Milestone
- Security tests (CSRF, SSRF, authz regression, open-redirect tests).
- Load tests for pagination/cache/retry behavior.
- Financial consistency tests for currency math and reconciliation.
- Chaos/retry tests for external dependency outages.
- Documentation review and runbook drills.

---
Prepared for implementation review.
Date: 2026-05-23
Time: 09:42:28 PM UTC
