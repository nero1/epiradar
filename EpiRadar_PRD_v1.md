# EpiRadar — Product Requirements Document

**Version:** 1.0 (MVP)
**Date:** May 2026
**Grant Alignment:** U.S. Department of State — Advancing Global Health Annual Program Statement ($290M)
**Primary Revenue Model:** Freemium SaaS — Paystack (Nigeria) / Dodopayments (global)

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Personas](#2-user-personas)
3. [Feature Matrix by Tier](#3-feature-matrix-by-tier)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Technical Stack](#6-technical-stack)
7. [Core Data Models](#7-core-data-models)
8. [Key API Routes](#8-key-api-routes)
9. [UI / UX Requirements](#9-ui--ux-requirements)
10. [MVP Build Sequence](#10-mvp-build-sequence)
11. [CRON and External Trigger Strategy](#11-cron-and-external-trigger-strategy)
12. [Payments and Billing](#12-payments-and-billing)
13. [Testing Strategy](#13-testing-strategy)
14. [Security Checklist](#14-security-checklist)
15. [Documentation Requirements](#15-documentation-requirements)
16. [Constraints and Assumptions](#16-constraints-and-assumptions)

---

## 1. Product Overview

EpiRadar is an AI-powered infectious disease early warning and surveillance platform. It aggregates signals from WHO alerts, news feeds, academic publications, and social media, runs them through an AI scoring pipeline, and surfaces ranked outbreak risk scores by country and pathogen on a public-facing dashboard.

The platform is simultaneously a public health tool and a SaaS product. Public visitors are converted to free accounts. Free accounts are converted to paid subscribers. The dashboard is a lead magnet; the free account is a lead magnet for paid.

| Field | Detail |
|---|---|
| Product Name | EpiRadar |
| Version | 1.0 (MVP) |
| Target Launch | Q3 2026 |
| Grant Alignment | U.S. Dept. of State — Advancing Global Health APS |
| Revenue Model | Freemium SaaS |

### 1.1 The Problem

Infectious disease outbreaks cause disproportionate economic and human harm when detected late. The 2014 Ebola crisis cost Guinea, Liberia, and Sierra Leone $2.2 billion. SARS cost Asia $40 billion. COVID-19 shut down the world. Health officials, NGO field teams, researchers, and journalists currently rely on fragmented, manually curated sources to track emerging threats. There is no single, AI-powered, low-bandwidth-friendly platform that aggregates, scores, and explains these signals in plain language.

### 1.2 The Solution

EpiRadar continuously ingests public health data sources, runs NLP and AI scoring via DeepSeek (primary) and Gemini Flash (fallback), and presents a ranked, interactive outbreak risk dashboard. It serves four user segments: public health officials who need early warnings, NGO field teams who need country-level context, researchers who need exportable data, and journalists who need plain-language summaries.

### 1.3 Conversion Funnel

Three tiers, each designed to pull users toward the next:

- **Public Dashboard (no account):** Risk scores, top 10 alerts, AI summaries with teaser truncation. Prominent CTAs to create a free account.
- **Free Account (Google auth):** Full alert history (30 days), country watchlists (up to 3), limited PDF exports (3/month), email digest. Collects contact info.
- **Paid Account:** Unlimited watchlists, full AI-generated country and pathogen reports, unlimited PDF and CSV exports, API access, priority data refresh.

---

## 2. User Personas

| Persona | Role | Primary Need | Tier |
|---|---|---|---|
| Health Official | Ministry / WHO staff | Early alerts by country | Free / Paid |
| NGO Field Team | Operational responder | Situation reports | Paid |
| Researcher | Academic / analyst | Data exports, API access | Paid |
| Journalist | Media professional | Plain-language summaries | Free |

---

## 3. Feature Matrix by Tier

| Feature | Public | Free | Paid |
|---|---|---|---|
| Global risk map | Yes | Yes | Yes |
| Top 10 active alerts (truncated) | Yes | Yes | Yes |
| AI outbreak summary (teaser only) | Yes | Yes | Yes |
| Full AI outbreak summaries | No | Yes | Yes |
| Alert history (last 30 days) | No | Yes | Yes |
| Alert history (full archive) | No | No | Yes |
| Country watchlist (up to 3) | No | Yes | Yes |
| Country watchlist (unlimited) | No | No | Yes |
| Email alerts / digest | No | Yes | Yes |
| PDF export | No | 3/month | Unlimited |
| CSV export | No | No | Yes |
| Deep AI country / pathogen reports | No | No | Yes |
| API access | No | No | Yes |
| Light / Dark / Custom theme | Yes | Yes | Yes |

---

## 4. Functional Requirements

### 4.1 Data Ingestion Engine

The ingestion engine is the core of the platform. It runs on a scheduled CRON job (once daily on Vercel Hobby Plan; supplemented by cron-jobs.org for higher frequency) and fetches from:

- WHO Disease Outbreak News (RSS/API)
- ProMED-mail alerts (RSS)
- ReliefWeb health situation reports (API)
- PubMed new publications matching outbreak-related MeSH terms
- Google News RSS for country-level health keywords
- Twitter/X Academic API for volume spike detection (optional, subject to API availability)

Each ingested item is deduped by SHA-256 content hash, stored in Supabase, and queued for AI scoring. Failed fetches retry with exponential backoff (max 5 attempts, jitter applied). Every ingestion run is logged with status, source, item count, and error details for admin monitoring.

### 4.2 AI Scoring Pipeline

Each new item passes through the following steps after ingestion:

1. **Relevance filter:** DeepSeek classifies whether the item is a genuine outbreak signal or noise. Items below threshold are discarded.
2. **Risk scoring:** Items are scored 0–100 on severity, geographic spread, and novelty. Sub-scores are stored separately for transparency.
3. **Entity extraction:** Country (ISO code), region, pathogen, case count, and death count are extracted and stored as structured fields.
4. **Plain-language summary:** A 2–3 sentence plain English summary is generated for each alert.
5. **Deep report generation (paid tier only):** On-demand full structured report covering background, current situation, transmission risk, and recommended actions.

DeepSeek is the primary AI provider. On API error or timeout, the pipeline falls back to Gemini Flash automatically. Model versions are defined in a central constants file (`lib/ai/models.ts`) and can be updated without touching pipeline code.

### 4.3 Public Dashboard

- Interactive world map showing outbreak risk by country (color-coded: green / amber / red / critical)
- Live ticker of top 10 active alerts with severity badge, country flag, pathogen name, and truncated AI summary
- Global risk trend chart (7-day rolling)
- Prominent "Create free account" CTAs embedded in teaser content walls
- SEO-optimized static pages for each country and major pathogen (Next.js SSG, revalidated daily)
- Offline fallback: last cached dashboard renders from service worker when offline

### 4.4 User Accounts

- Google OAuth only for MVP
- On first login, prompt user to set a password and configure a recovery email
- Optional 4-digit PIN for sensitive operations (API key reveal, export, plan upgrade)
- 2FA via TOTP authenticator app (Google Authenticator compatible) — available but not mandatory for free tier; strongly encouraged for paid
- Session management: JWT + Redis (ioredis or Upstash, selected via `REDIS_PROVIDER` env var)
- Account deletion: soft-delete with 30-day recovery window, hard delete after

### 4.5 Watchlists and Alerts

- Free users: up to 3 country watchlists
- Paid users: unlimited watchlists including pathogen-level and region-level watches
- Alert delivery: email digest (daily or immediate, user-configurable). No SMS.
- Email via Resend or Postmark, selected via `EMAIL_PROVIDER` env var
- Idempotency keys prevent duplicate alert emails on retry

### 4.6 Exports

- Free tier: 3 PDF exports per calendar month. Counter resets on the 1st. Atomic decrement enforced at database level.
- Paid tier: unlimited PDF and CSV exports
- Exports are generated server-side, streamed to client, and logged for accounting
- Export rate limiting: max 10 per hour per user to prevent abuse

### 4.7 API Access (Paid Tier)

- REST API with versioned endpoints (`/api/v1/`)
- API keys generated per user, revocable, with last-used timestamp
- Rate limits: 1,000 requests/day for base paid tier, configurable per plan in admin
- Endpoints: `/alerts`, `/countries/{iso}`, `/pathogens`, `/risk-scores`, `/reports`
- OpenAPI spec auto-generated and publicly accessible at `/api/v1/docs`

### 4.8 Admin Panel

- User management: view, suspend, change plan, impersonate (audit logged)
- Ingestion monitoring: source health, last run timestamp, item counts, error rates
- AI pipeline stats: tokens consumed, cost estimate, scoring latency, fallback rate
- Theme management: create, toggle, and assign custom UI themes
- Export and alert volume monitoring
- Manual trigger for ingestion run and AI scoring run
- Revenue dashboard: MRR, churn, new subscriptions (Paystack + Dodopayments combined)
- All admin actions are `is_admin`-verified at database level, not just session level

---

## 5. Non-Functional Requirements

### 5.1 Performance and Scalability

- Target: sub-2s page load on 3G for the public dashboard
- Redis caching for risk scores, country summaries, and top alerts (TTL: 1 hour)
- Cursor-based pagination on all list endpoints
- Connection pooling via Supabase pgBouncer
- Thundering herd mitigation: staggered CRON execution, cache stampede prevention via probabilistic early expiry
- Stateless Next.js API routes deployable to Vercel Edge where appropriate

### 5.2 Security

- Defense in depth: input validation (Zod), parameterized queries, RLS on all Supabase tables
- OWASP Top 10 mitigated: XSS via CSP headers, CSRF via SameSite cookies + CSRF tokens, SQL injection via ORM, SSRF via outbound domain allowlist
- AI prompt injection: user-supplied content sandboxed before passing to AI, output schema-validated
- Bot protection: Cloudflare Turnstile on public forms, rate limiting per IP and per user
- All secrets in environment variables, never in code
- `is_admin` verified from database on every admin action, not inferred from session

### 5.3 Reliability and Data Integrity

- Retries with exponential backoff and jitter on all external API calls
- Idempotency keys on all write operations
- Atomic database transactions for financial operations (plan upgrades, export quota decrements)
- Decimal.js for all financial and quota calculations
- Race condition protection on export quota decrement via database-level atomic update
- Supabase daily automated backups; restoration runbook in SETUP.md

### 5.4 Privacy

- Minimal data collection: email, display name (from Google OAuth), plan, and usage logs only
- No selling or sharing of user data with third parties
- GDPR-compliant deletion flow
- Logs anonymized after 90 days

### 5.5 Offline and Low Bandwidth

- PWA scaffolding: service worker caches last-known dashboard state (risk scores, top alerts)
- Offline banner with last-updated timestamp when network is unavailable
- All assets compressed (Brotli/gzip), images lazy-loaded, fonts subset
- API responses paginated and gzip-compressed
- No autoplay media, no large hero images on mobile

---

## 6. Technical Stack

| Layer | Technology / Notes |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth — Google OAuth. Password + recovery prompt on first login. |
| Session | JWT + Redis. ioredis (self-hosted) or Upstash (serverless) — selected via `REDIS_PROVIDER` env var. |
| Cache | Redis (same instance as session). Separate TTL config per cache type. |
| AI Primary | DeepSeek API. Model version defined in `lib/ai/models.ts`. |
| AI Fallback | Gemini Flash API. Model version in same constants file. |
| On-device AI | Transformers.js (ONNX) for offline NLP — lightweight models optimized for 2–4GB RAM devices. |
| Payments (NG) | Paystack |
| Payments (Global) | Dodopayments |
| Email | Resend (primary) or Postmark (fallback) — selected via `EMAIL_PROVIDER` env var. |
| Deployment | Vercel (Hobby Plan for MVP). GitHub Actions for CI/CD. |
| CRON | Vercel CRON (once daily on Hobby Plan) + cron-jobs.org for higher frequency external triggers. |
| 2FA | TOTP via otplib (Google Authenticator compatible) |
| Styling | Tailwind CSS. Light/Dark/Admin-custom themes via CSS variables. No gradients. No purple. |
| Testing | Playwright (E2E), Vitest (unit/financial), k6 (load) |
| Monitoring | Vercel Analytics + custom admin stats page |
| i18n | next-intl. Initial locale: English. Architecture ready for Hausa, Yoruba, Igbo. |
| Financial math | Decimal.js for all quota and billing calculations |
| Code style | JSDoc comments on all exports. Generous inline comments. |

### AI Model Version Management

All AI model identifiers are stored in `lib/ai/models.ts` as named constants:

```ts
// lib/ai/models.ts
export const AI_MODELS = {
  deepseek: {
    primary: 'deepseek-chat',        // update here if deprecated
    reasoner: 'deepseek-reasoner',
  },
  gemini: {
    fallback: 'gemini-2.0-flash',    // update here if deprecated
  },
} as const;
```

No model string appears anywhere else in the codebase. When a model version is deprecated, update this file only.

---

## 7. Core Data Models

### 7.1 `alerts`

| Field | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Auto-generated |
| `source` | `text` | WHO / ProMED / news / social |
| `source_url` | `text` | Original URL |
| `content_hash` | `text UNIQUE` | SHA-256 of raw content — dedup key |
| `country_iso` | `text[]` | ISO 3166-1 alpha-2 codes |
| `pathogen` | `text` | Extracted pathogen name |
| `risk_score` | `numeric(5,2)` | 0–100 composite score |
| `severity_score` | `numeric(5,2)` | AI sub-score |
| `spread_score` | `numeric(5,2)` | AI sub-score |
| `novelty_score` | `numeric(5,2)` | AI sub-score |
| `ai_summary` | `text` | 2–3 sentence plain language summary |
| `case_count` | `integer` | Extracted or null |
| `death_count` | `integer` | Extracted or null |
| `published_at` | `timestamptz` | Original publication time |
| `ingested_at` | `timestamptz` | When EpiRadar ingested it |
| `is_active` | `boolean` | False when superseded or resolved |

### 7.2 `users`

| Field | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Matches `auth.users.id` |
| `email` | `text UNIQUE` | From Google OAuth |
| `display_name` | `text` | From Google OAuth |
| `plan` | `text` | `public` / `free` / `paid` |
| `plan_expires_at` | `timestamptz` | Null for free |
| `pdf_export_count` | `integer` | Resets monthly (free tier quota) |
| `pdf_export_reset_at` | `date` | Date of next monthly reset |
| `api_key_hash` | `text` | Hashed API key for paid users |
| `totp_secret` | `text encrypted` | TOTP secret if 2FA enabled |
| `pin_hash` | `text` | Optional 4-digit PIN (bcrypt) |
| `is_admin` | `boolean` | Admin flag — verified DB-side on every request |
| `deleted_at` | `timestamptz` | Soft delete timestamp |
| `created_at` | `timestamptz` | Account creation |

### 7.3 `watchlists`

| Field | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Auto-generated |
| `user_id` | `uuid FK` | References `users.id` |
| `type` | `text` | `country` / `pathogen` / `region` |
| `value` | `text` | ISO code, pathogen name, or region name |
| `alert_mode` | `text` | `daily` / `immediate` |
| `created_at` | `timestamptz` | |

### 7.4 `ingestion_runs`

| Field | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Auto-generated |
| `triggered_by` | `text` | `cron` / `manual` / `external` |
| `status` | `text` | `running` / `completed` / `failed` |
| `sources_fetched` | `integer` | Number of sources attempted |
| `items_ingested` | `integer` | New items stored |
| `items_skipped` | `integer` | Dupes skipped |
| `errors` | `jsonb` | Per-source error details |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |

### 7.5 `billing_events`

| Field | Type | Description |
|---|---|---|
| `id` | `uuid PK` | Auto-generated |
| `user_id` | `uuid FK` | References `users.id` |
| `provider` | `text` | `paystack` / `dodopayments` |
| `event_type` | `text` | `charge.success` / `subscription.cancelled` / etc. |
| `amount` | `numeric(12,2)` | In smallest currency unit |
| `currency` | `text` | `NGN` / `USD` / etc. |
| `idempotency_key` | `text UNIQUE` | Prevents duplicate processing |
| `payload` | `jsonb` | Full webhook payload |
| `created_at` | `timestamptz` | |

---

## 8. Key API Routes

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/v1/alerts` | GET | Public / Free / Paid | Paginated alerts. Public: top 10. Free: 30-day history. Paid: full archive. |
| `/api/v1/alerts/[id]` | GET | Public | Single alert detail |
| `/api/v1/countries/[iso]` | GET | Public | Country risk summary and alert list |
| `/api/v1/risk-scores` | GET | Public | All country risk scores for map rendering |
| `/api/v1/reports` | POST | Paid | Trigger deep AI report generation |
| `/api/v1/watchlists` | GET / POST / DELETE | Free / Paid | Watchlist CRUD |
| `/api/v1/exports/pdf` | POST | Free / Paid | PDF export (quota enforced for free) |
| `/api/v1/exports/csv` | POST | Paid | CSV export |
| `/api/auth/google` | GET | — | OAuth initiation |
| `/api/auth/callback` | GET | — | OAuth callback + session creation |
| `/api/admin/ingest` | POST | Admin | Manual ingestion trigger |
| `/api/admin/users` | GET / PATCH | Admin | User management |
| `/api/cron/ingest` | GET | CRON_SECRET | Scheduled ingestion endpoint |
| `/api/v1/docs` | GET | Public | OpenAPI spec |

All list endpoints use cursor-based pagination with an optional offset fallback. All state-changing endpoints require idempotency keys.

---

## 9. UI / UX Requirements

### 9.1 Layout Principles

- Mobile-first: designed at 375px viewport, scales cleanly to desktop without breaking
- Fixed bottom toolbar on mobile with icons and labels: Home, Map, Alerts, Watchlist, Account
- No gradients. No purple hues. Color palette: deep green (`#1A5C4A`), amber (`#D97706`), critical red (`#DC2626`), neutral grays
- Light and Dark mode toggle in navbar/settings. Admin can create additional named themes via admin panel.
- Typography: high-legibility, purposeful. No decorative fonts on data-heavy screens.

### 9.2 Key Screens

| Screen | Notes |
|---|---|
| Home / Dashboard | Risk map, live alert ticker, global trend chart, CTA strip |
| Alert Detail | Full summary, risk score breakdown, source links, share button, PDF export CTA |
| Country Page | Risk score history chart, active alerts list, deep report (paid gate) |
| Watchlist | Saved countries/pathogens, alert digest settings |
| Account | Plan status, export usage, API key management, 2FA setup, PIN setup |
| Admin | Tabbed panel per Section 4.8 |
| Pricing | Single page, Paystack (NG) / Dodopayments (global) toggle |

### 9.3 Offline and Fallback States

- Offline banner at top of every page when `navigator.onLine` is false, with last-updated timestamp
- Cached risk map and last-known alerts render from service worker cache
- Actions requiring network (export, report generation, watchlist save) show a "queued — will retry when online" message
- All elements that require internet have graceful fallback UI, not blank screens or error crashes

### 9.4 Theming

- CSS variable-based theming throughout
- Light and Dark built-in
- Admin can create additional named themes (e.g. high-contrast, brand-specific) via the admin panel and toggle them on/off globally or per-user-group

---

## 10. MVP Build Sequence

### Phase 1: Foundation

**Objective:** Deployable skeleton with auth, database, and CI/CD.

- Initialize Next.js 14 + TypeScript repo with App Router
- Configure Supabase project: schema, RLS policies, auth providers (Google OAuth)
- First-login flow: prompt for password and recovery email
- Configure Redis (Upstash recommended for Vercel Hobby Plan compatibility)
- GitHub Actions CI/CD pipeline deploying to Vercel on push to main
- PWA manifest and service worker scaffold
- Environment variable structure and central AI models constants file (`lib/ai/models.ts`)
- Tailwind CSS with light/dark CSS variable foundation
- Base layout: header, bottom toolbar (mobile), page shell

### Phase 2: Data Ingestion and AI Pipeline

**Objective:** Live data flowing and AI-scored alerts stored in the database.

- Ingestion adapters: WHO RSS, ProMED RSS, ReliefWeb API, PubMed, Google News RSS
- SHA-256 content dedup logic
- DeepSeek relevance filter and risk scoring pipeline
- Gemini Flash fallback with automatic failover on error/timeout
- Entity extraction: country ISO, pathogen, case count, death count
- Plain-language AI summary generation and storage
- Vercel CRON endpoint (`/api/cron/ingest`) secured with `CRON_SECRET`
- cron-jobs.org external trigger setup (documented in SETUP.md)
- Ingestion run logging to `ingestion_runs` table
- Retry logic with exponential backoff and jitter on all external calls

### Phase 3: Public Dashboard

**Objective:** Publicly accessible, SEO-optimized, offline-capable dashboard.

- Interactive world risk map (Leaflet or MapLibre — lightweight, no heavy SDKs)
- Live alert ticker with severity badges, country flags, pathogen labels
- Global 7-day risk trend chart
- Country and pathogen static pages (Next.js SSG with daily ISR revalidation)
- Teaser content walls with "Create free account" CTAs
- Service worker caching for offline dashboard render
- SEO: meta tags, Open Graph, JSON-LD structured data
- Sitemap auto-generation

### Phase 4: Free Account Features

**Objective:** Functional free tier that captures contact info and demonstrates value.

- Full AI summaries for authenticated users
- 30-day alert history with cursor-based pagination
- Country watchlists (max 3) with add/remove
- Email alert digest (daily) via Resend/Postmark
- PDF export with atomic monthly quota enforcement (3/month, resets on 1st)
- Account settings: password, PIN (optional), 2FA setup, recovery email
- Export usage display in account dashboard
- Rate limiting on export endpoint (10/hour/user)

### Phase 5: Paid Tier and Payments

**Objective:** Revenue-generating paid tier with full feature unlock.

- Paystack integration for Nigerian users (IP geolocation to auto-select)
- Dodopayments integration for global users
- Plan upgrade/downgrade flows with idempotency
- Unlimited watchlists (country, pathogen, region)
- Full alert archive access
- Deep AI country/pathogen report generation on demand
- Unlimited PDF and CSV exports
- API key generation, revocation, rate limiting (1,000 req/day base)
- OpenAPI spec at `/api/v1/docs`
- Revenue dashboard in admin panel (MRR, churn, new subs)

### Phase 6: Admin Panel, Security Hardening, and Launch Prep

**Objective:** Operational visibility, security hardening, production readiness.

- Full admin panel (per Section 4.8)
- Custom theme builder for admin
- Bot protection: Cloudflare Turnstile on signup and export forms
- Security headers: CSP, HSTS, X-Frame-Options, Permissions-Policy
- OWASP Top 10 audit and remediation
- AI prompt injection mitigations
- `is_admin` database-level verification on all admin routes
- Load testing with k6 (target: 1,000 concurrent users on public dashboard)
- E2E test suite with Playwright (full user journeys)
- Financial and quota integrity test suite (Vitest)
- `/docs/SETUP.md` and `/docs/HOW-IT-WORKS.md`

---

## 11. CRON and External Trigger Strategy

Vercel Hobby Plan restricts CRON jobs to once per day. The following approach extends this at zero cost:

- Vercel CRON runs at 06:00 UTC daily as the primary trigger
- cron-jobs.org (free tier) is configured to hit `/api/cron/ingest` every 4 hours as a supplementary trigger
- The CRON endpoint is secured: requests without `Authorization: Bearer {CRON_SECRET}` return 401
- Each run is idempotent — re-running within the same window skips already-ingested items via content hash dedup
- Admin panel shows last run timestamp and allows manual trigger
- All run outcomes are logged to `ingestion_runs` table

Setup instructions for cron-jobs.org are detailed in `docs/SETUP.md`.

---

## 12. Payments and Billing

- Nigerian users (detected by IP geolocation): Paystack checkout
- All other users: Dodopayments checkout
- Webhook handlers for both processors with idempotency key validation — every event logged to `billing_events` before any plan change is applied
- Plan activation is atomic: payment confirmed in webhook before plan is updated in database
- Failed payments: 3-day grace period before plan downgrade
- All financial calculations use Decimal.js
- No card data stored — both processors handle PCI compliance
- Webhook signature verification on all incoming events (reject unsigned payloads)

---

## 13. Testing Strategy

Priority order: E2E first, then financial integrity, then load.

| Test Type | Tool | Scope |
|---|---|---|
| E2E (priority 1) | Playwright | Full user journeys: signup, watchlist CRUD, export quota, plan upgrade, API key generation and usage |
| Financial integrity (priority 2) | Vitest | Export quota decrement atomicity, monthly reset, plan activation, billing event logging, Decimal.js precision |
| Load testing (priority 3) | k6 | 1,000 concurrent users on public dashboard; 200 concurrent on authenticated routes |
| Security | OWASP ZAP + manual | Prompt injection, auth bypass, rate limit bypass, CSRF |
| Offline / PWA | Playwright | Network throttling, offline mode, service worker cache verification |
| AI pipeline | Vitest (mocked) | Fallback trigger, output schema validation, prompt injection resistance |

---

## 14. Security Checklist

- Row Level Security (RLS) enabled on all Supabase tables
- `is_admin` verified from database on every privileged operation — never inferred from session data
- All user inputs validated with Zod before processing
- Parameterized queries only — no raw SQL string concatenation
- CSRF protection: `SameSite=Strict` cookies + CSRF tokens on state-changing forms
- XSS protection: Content Security Policy headers, React default escaping
- SSRF protection: allowlist of permitted outbound domains for AI and data source calls
- AI prompt injection: user content wrapped in delimiters before AI calls, output schema-validated
- Rate limiting: per-IP (unauthenticated), per-user (authenticated), per-API-key (paid)
- Bot detection: Cloudflare Turnstile on signup and export forms
- Secrets in env vars only, never in code. `.env.example` provided with placeholder values.
- JWT: 15-minute access token, 7-day refresh token with rotation on use
- TOTP secrets encrypted at rest
- Audit log for all admin actions including impersonation
- Webhook signature verification on all payment provider callbacks
- Idempotency keys on all write operations
- Defense against MEV-style race conditions on quota operations via atomic DB updates
- Re-entrancy protection on export and billing flows
- Memory and data bloat mitigation: paginated queries, TTL on all cache keys, soft-delete with scheduled hard-delete

---

## 15. Documentation Requirements

At project completion, the following files must exist in the `/docs` folder.

### `docs/SETUP.md`

Written for a developer who is not a CLI expert. Must cover:

- Prerequisites and accounts to create (Supabase, Vercel, Google Cloud, Upstash/Redis, Resend/Postmark, Paystack, Dodopayments, cron-jobs.org)
- Step-by-step repo setup and first deployment
- Full list of required environment variables with descriptions and example values
- Where to place env vars (Vercel dashboard, `.env.local` for local dev)
- How to protect secrets — what never goes in git
- Secret rotation runbook (how to rotate each secret category safely)
- Supabase backup and restoration runbook
- cron-jobs.org setup: how to create the job, what URL to use, how to pass the secret
- Paystack and Dodopayments webhook setup and signature verification
- App update / deployment runbook (how to push a new version safely)
- Rollback runbook

### `docs/HOW-IT-WORKS.md`

Detailed reference for developers and operators. Must cover:

- Full user-facing feature documentation (all tiers)
- Full admin-facing feature documentation
- Technical architecture overview with component diagram description
- Data ingestion and AI pipeline walkthrough (step by step)
- Caching strategy and TTL decisions
- Offline / PWA strategy
- Security architecture summary
- Billing and quota logic (how export counts work, how plan activation works)
- API reference overview
- i18n architecture and how to add a new locale
- CRON strategy and the Vercel Hobby Plan workaround

---

## 16. Constraints and Assumptions

| Constraint | Detail |
|---|---|
| Hosting cost | Zero upfront. Vercel Hobby Plan for MVP. Scale to Pro as revenue allows. |
| CRON frequency | Vercel Hobby: once daily. cron-jobs.org used for higher frequency at zero cost. |
| No SMS | All notifications via email only. No Twilio or equivalent. |
| Auth for MVP | Google OAuth only. Telegram auth scaffolded but not activated in MVP. |
| AI spend | DeepSeek primary (lower cost). Gemini Flash fallback. Token consumption tracked in admin. |
| Payments (NG) | Paystack handles NGN. |
| Payments (global) | Dodopayments handles all other currencies. |
| Mobile first | All UI designed at 375px first. Bottom toolbar on mobile. Scales up to desktop cleanly. |
| i18n | English for MVP. Architecture ready for Hausa, Yoruba, Igbo expansion. |
| No card storage | Both payment processors handle PCI compliance. EpiRadar stores no card data. |
| Financial math | Decimal.js for all quota and billing calculations. No native JS float arithmetic on money. |

---

*End of Document — EpiRadar PRD v1.0*
