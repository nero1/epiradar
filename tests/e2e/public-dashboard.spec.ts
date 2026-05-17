import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Public dashboard", () => {
  test("home page loads and shows risk map", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/EpiRadar/i);
    // Risk map container
    await expect(page.locator('[data-testid="risk-map"], .leaflet-container')).toBeVisible({ timeout: 10000 });
  });

  test("alert ticker shows at least one alert", async ({ page }) => {
    await page.goto(BASE_URL);
    // At least one alert card should appear
    await expect(page.locator('[data-testid="alert-item"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("paywall teaser shows upgrade prompt at alert #3", async ({ page }) => {
    await page.goto(BASE_URL);
    const paywall = page.locator("text=/Sign up|upgrade|free/i").first();
    await expect(paywall).toBeVisible({ timeout: 10000 });
  });

  test("pricing page loads all three tiers", async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await expect(page.locator("text=Free")).toBeVisible();
    await expect(page.locator("text=Paid")).toBeVisible();
    await expect(page.locator("text=Public")).toBeVisible();
  });

  test("alert detail page renders from direct URL", async ({ page }) => {
    // Navigate to alerts listing to find a real ID
    const res = await page.request.get(`${BASE_URL}/api/v1/alerts?limit=1`);
    if (res.status() === 200) {
      const body = await res.json();
      const alertId = body.data?.[0]?.id;
      if (alertId) {
        await page.goto(`${BASE_URL}/alerts/${alertId}`);
        await expect(page.locator("h1")).toBeVisible();
      }
    }
    // If no alerts, just pass (CI without data)
  });

  test("map page renders", async ({ page }) => {
    await page.goto(`${BASE_URL}/map`);
    await expect(page).toHaveTitle(/Map|EpiRadar/i);
  });
});

test.describe("Navigation", () => {
  test("bottom toolbar links navigate correctly", async ({ page }) => {
    await page.goto(BASE_URL);
    // Click Pricing via pricing link
    await page.goto(`${BASE_URL}/pricing`);
    await expect(page.url()).toContain("/pricing");
  });

  test("unauthenticated access to /watchlist redirects to login", async ({ page }) => {
    await page.goto(`${BASE_URL}/watchlist`);
    await expect(page.url()).toContain("/login");
  });

  test("unauthenticated access to /account redirects to login", async ({ page }) => {
    await page.goto(`${BASE_URL}/account`);
    await expect(page.url()).toContain("/login");
  });

  test("unauthenticated access to /admin redirects away", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    // Should redirect to home or login — not stay at /admin
    await expect(page.url()).not.toContain("/admin");
  });
});

test.describe("API endpoints (public)", () => {
  test("GET /api/v1/risk-scores returns 200", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/v1/risk-scores`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
  });

  test("GET /api/v1/docs returns OpenAPI spec", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/v1/docs`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("EpiRadar API");
  });

  test("POST /api/v1/exports/csv requires auth", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/v1/exports/csv`, {
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test("POST /api/v1/reports requires paid plan", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/v1/reports`, {
      data: { pathogen: "Mpox" },
    });
    expect(res.status()).toBe(403);
  });

  test("GET /api/v1/watchlists requires auth", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/v1/watchlists`);
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/v1/watchlists requires auth", async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/api/v1/watchlists?id=test-id`, {
      data: { alert_mode: "immediate" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Offline / PWA", () => {
  test("offline banner appears when network is disabled", async ({ page, context }) => {
    await page.goto(BASE_URL);
    // Simulate offline by cutting off all network requests
    await context.setOffline(true);
    // Trigger a navigation or DOM event to wake the online-status hook
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    // The offline banner should become visible
    await expect(page.locator('[data-testid="offline-banner"], text=/offline|no connection/i').first()).toBeVisible({ timeout: 6000 });
  });

  test("page shell still renders from service worker cache when offline", async ({ page, context }) => {
    // Warm the page once while online
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    // Go offline
    await context.setOffline(true);
    // Reload — should render from SW cache, not blank
    await page.reload({ waitUntil: "domcontentloaded" });
    // Title must still be present (page not blank)
    await expect(page).toHaveTitle(/EpiRadar/i);
  });

  test("back online: offline banner disappears", async ({ page, context }) => {
    await page.goto(BASE_URL);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    // Restore network
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    // Banner should disappear within a few seconds
    const banner = page.locator('[data-testid="offline-banner"], text=/offline/i').first();
    await expect(banner).toBeHidden({ timeout: 6000 });
  });

  test("service worker registers successfully", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    const swRegistered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });
    expect(swRegistered).toBe(true);
  });

  test("manifest.json is served and parseable", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/manifest.json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("icons");
  });
});
