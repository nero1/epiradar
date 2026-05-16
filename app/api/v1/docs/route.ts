import { NextResponse } from "next/server";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://epiradar.io";

const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "EpiRadar API",
    version: "1.0.0",
    description: "AI-powered infectious disease early warning API. Paid plan required for most endpoints. Rate limit: 1,000 req/day per API key.",
    contact: { email: "api@epiradar.io" },
  },
  servers: [{ url: `${appUrl}/api/v1`, description: "Production" }],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key from /account. Include as: Authorization: Bearer epk_...",
      },
    },
    schemas: {
      Alert: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          source: { type: "string", enum: ["WHO", "ProMED", "ReliefWeb", "PubMed", "GoogleNews"] },
          country_iso: { type: "array", items: { type: "string", minLength: 2, maxLength: 2 } },
          pathogen: { type: "string", nullable: true },
          risk_score: { type: "number", minimum: 0, maximum: 100 },
          severity_score: { type: "number", minimum: 0, maximum: 100 },
          spread_score: { type: "number", minimum: 0, maximum: 100 },
          novelty_score: { type: "number", minimum: 0, maximum: 100 },
          ai_summary: { type: "string", nullable: true },
          case_count: { type: "integer", nullable: true },
          death_count: { type: "integer", nullable: true },
          published_at: { type: "string", format: "date-time" },
          ingested_at: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          upgradeUrl: { type: "string", nullable: true },
        },
      },
    },
  },
  paths: {
    "/alerts": {
      get: {
        summary: "List active alerts",
        description: "Returns paginated active alerts ordered by risk score. Free tier returns top 10 with teaser summaries. Paid tier returns full data with cursor pagination.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque pagination cursor from previous response" },
          { name: "countryIso", in: "query", schema: { type: "string", minLength: 2, maxLength: 2 } },
          { name: "pathogen", in: "query", schema: { type: "string" } },
          { name: "minRisk", in: "query", schema: { type: "integer", minimum: 0, maximum: 100 } },
        ],
        responses: {
          200: {
            description: "Alert list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Alert" } },
                    cursor: { type: "string", nullable: true },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
    "/alerts/{id}": {
      get: {
        summary: "Get alert by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Alert detail", content: { "application/json": { schema: { $ref: "#/components/schemas/Alert" } } } },
          404: { description: "Not found" },
        },
      },
    },
    "/risk-scores": {
      get: {
        summary: "Country risk scores",
        description: "Returns composite risk scores for all countries with active alerts.",
        responses: {
          200: {
            description: "Risk scores by country",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object", properties: { country_iso: { type: "string" }, risk_score: { type: "number" }, alert_count: { type: "integer" } } } },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/risk-scores/trend": {
      get: {
        summary: "7-day global risk trend",
        responses: {
          200: { description: "Daily risk scores for last 7 days" },
        },
      },
    },
    "/countries/{iso}": {
      get: {
        summary: "Country summary",
        parameters: [{ name: "iso", in: "path", required: true, schema: { type: "string", minLength: 2, maxLength: 2 } }],
        responses: {
          200: { description: "Country risk summary and active alerts" },
          404: { description: "No data for country" },
        },
      },
    },
    "/reports": {
      post: {
        summary: "Generate deep AI report (Paid only)",
        description: "Generate a detailed AI-written situation report for a country or pathogen.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  countryIso: { type: "string", minLength: 2, maxLength: 2 },
                  pathogen: { type: "string", maxLength: 100 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Generated report in Markdown" },
          403: { description: "Paid plan required" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
    "/exports/csv": {
      post: {
        summary: "Export alerts as CSV (Paid only)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  countryIso: { type: "string" },
                  pathogen: { type: "string" },
                  limit: { type: "integer", maximum: 10000, default: 1000 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "CSV file download", content: { "text/csv": {} } },
          403: { description: "Paid plan required" },
        },
      },
    },
    "/exports/pdf": {
      post: {
        summary: "Export alert as PDF",
        description: "Free: 3/month. Paid: unlimited.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["alertId", "idempotencyKey"],
                properties: {
                  alertId: { type: "string", format: "uuid" },
                  idempotencyKey: { type: "string", maxLength: 128 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "HTML file for printing/PDF download" },
          403: { description: "Quota exhausted" },
          404: { description: "Alert not found" },
        },
      },
    },
    "/watchlists": {
      get: { summary: "List user watchlists", responses: { 200: { description: "Watchlist items" } } },
      post: {
        summary: "Add watchlist item",
        description: "Free tier limited to 3 items.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "value"],
                properties: {
                  type: { type: "string", enum: ["country", "pathogen", "region"] },
                  value: { type: "string", maxLength: 100 },
                  alert_mode: { type: "string", enum: ["daily", "immediate"], default: "daily" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created" },
          403: { description: "Free tier limit reached" },
          409: { description: "Duplicate item" },
        },
      },
      delete: {
        summary: "Remove watchlist item",
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Deleted" } },
      },
    },
    "/apikeys": {
      get: { summary: "API key status (Paid only)", responses: { 200: { description: "Key status" } } },
      post: { summary: "Generate/rotate API key (Paid only)", responses: { 201: { description: "New key — shown once only" } } },
      delete: { summary: "Revoke API key (Paid only)", responses: { 200: { description: "Revoked" } } },
    },
  },
};

/** GET /api/v1/docs — serves the OpenAPI 3.1 spec as JSON */
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
