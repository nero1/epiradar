/**
 * k6 load test — EpiRadar public dashboard
 * Target: 1,000 concurrent users on public dashboard (PRD Section 5.1)
 *
 * Run: k6 run tests/load/dashboard.js
 * With target URL: BASE_URL=https://epiradar.io k6 run tests/load/dashboard.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration", true);

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000";

export const options = {
  stages: [
    { duration: "30s", target: 100 },   // Ramp up to 100 users
    { duration: "1m", target: 500 },    // Ramp up to 500 users
    { duration: "2m", target: 1000 },   // Sustain 1,000 concurrent users
    { duration: "30s", target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"],  // 95% of requests under 2s (PRD target)
    errors: ["rate<0.01"],              // Error rate under 1%
    api_duration: ["p(99)<3000"],       // 99% of API calls under 3s
  },
};

const PAGES = [
  "/",
  "/map",
  "/alerts",
  "/pricing",
];

const API_ENDPOINTS = [
  "/api/v1/risk-scores",
  "/api/v1/risk-scores/trend",
  "/api/v1/alerts?limit=10",
];

export default function () {
  // Simulate a user visiting the dashboard
  const page = PAGES[Math.floor(Math.random() * PAGES.length)];
  const pageRes = http.get(`${BASE_URL}${page}`, {
    headers: { "Accept": "text/html,application/xhtml+xml" },
  });

  check(pageRes, {
    "page status 200": (r) => r.status === 200,
    "page loaded fast": (r) => r.timings.duration < 2000,
  });
  errorRate.add(pageRes.status !== 200);

  sleep(0.5);

  // Hit an API endpoint
  const endpoint = API_ENDPOINTS[Math.floor(Math.random() * API_ENDPOINTS.length)];
  const apiRes = http.get(`${BASE_URL}${endpoint}`, {
    headers: { "Accept": "application/json" },
  });

  apiDuration.add(apiRes.timings.duration);
  check(apiRes, {
    "api status 200": (r) => r.status === 200,
    "api has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data !== undefined;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(apiRes.status !== 200);

  sleep(1);
}
