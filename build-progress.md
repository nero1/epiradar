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
