import { AI_MODELS, AI_TIMEOUT_MS, RELEVANCE_THRESHOLD } from "./models";
import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import { z } from "zod";
import type { RawAlert } from "@/lib/ingestion/sources";

/** Result of the full AI scoring pipeline for one alert */
export interface ScoredAlert {
  isRelevant: boolean;
  riskScore: number;
  severityScore: number;
  spreadScore: number;
  noveltyScore: number;
  aiSummary: string;
  countryIso: string[];
  pathogen: string | null;
  caseCount: number | null;
  deathCount: number | null;
}

/** Zod schema for validating AI output — prevents prompt injection from corrupting DB */
const ScoredAlertSchema = z.object({
  isRelevant: z.boolean(),
  riskScore: z.number().min(0).max(100),
  severityScore: z.number().min(0).max(100),
  spreadScore: z.number().min(0).max(100),
  noveltyScore: z.number().min(0).max(100),
  aiSummary: z.string().max(1000),
  countryIso: z.array(z.string().length(2)).max(20),
  pathogen: z.string().max(100).nullable(),
  caseCount: z.number().int().nonnegative().nullable(),
  deathCount: z.number().int().nonnegative().nullable(),
});

/** Build the scoring prompt — user content is wrapped in delimiters to prevent injection */
function buildScoringPrompt(alert: RawAlert): string {
  return `You are a public health expert analyzing disease outbreak reports. Analyze the following alert and respond ONLY with valid JSON matching the schema below. No markdown, no explanation.

Schema:
{
  "isRelevant": boolean (true if this is a genuine outbreak signal),
  "riskScore": number 0-100 (composite outbreak risk),
  "severityScore": number 0-100 (severity of illness),
  "spreadScore": number 0-100 (geographic spread potential),
  "noveltyScore": number 0-100 (how novel/unexpected this pathogen/outbreak is),
  "aiSummary": string (2-3 plain English sentences describing the outbreak),
  "countryIso": string[] (ISO 3166-1 alpha-2 codes for affected countries, empty if unknown),
  "pathogen": string|null (pathogen name, null if unclear),
  "caseCount": number|null (confirmed case count, null if not mentioned),
  "deathCount": number|null (confirmed death count, null if not mentioned)
}

--- BEGIN ALERT ---
Source: ${alert.source}
Title: ${alert.title}
Content: ${alert.content.slice(0, 3000)}
--- END ALERT ---

Respond with JSON only:`;
}

/** Call DeepSeek API for scoring */
async function callDeepSeek(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODELS.deepseek.primary,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
    },
    AI_TIMEOUT_MS,
  );

  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Call Gemini Flash API as fallback */
async function callGemini(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini.fallback}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    },
    AI_TIMEOUT_MS,
  );

  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * Scores a single raw alert through the AI pipeline.
 * Tries DeepSeek first; falls back to Gemini on error/timeout.
 * Validates output schema to prevent prompt injection from corrupting data.
 */
export async function scoreAlert(alert: RawAlert): Promise<ScoredAlert | null> {
  const prompt = buildScoringPrompt(alert);

  let rawJson: string;

  try {
    rawJson = await withRetry(() => callDeepSeek(prompt), {
      maxAttempts: 2,
      baseDelayMs: 1000,
    });
  } catch (deepseekError) {
    console.warn("[ai/pipeline] DeepSeek failed, falling back to Gemini:", (deepseekError as Error).message);
    try {
      rawJson = await withRetry(() => callGemini(prompt), {
        maxAttempts: 2,
        baseDelayMs: 1000,
      });
    } catch (geminiError) {
      console.error("[ai/pipeline] Both AI providers failed:", (geminiError as Error).message);
      return null;
    }
  }

  // Validate and sanitize AI output
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    console.error("[ai/pipeline] AI returned invalid JSON:", rawJson.slice(0, 200));
    return null;
  }

  const result = ScoredAlertSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[ai/pipeline] AI output failed schema validation:", result.error.flatten());
    return null;
  }

  const scored = result.data;

  // Apply relevance threshold — discard noise
  if (!scored.isRelevant || scored.riskScore / 100 < RELEVANCE_THRESHOLD * 0.6) {
    return { ...scored, isRelevant: false };
  }

  return scored;
}

/** Generate a deep AI country/pathogen report (paid tier only) */
export async function generateDeepReport(params: {
  countryIso?: string;
  pathogen?: string;
  recentAlerts: string[];
}): Promise<string> {
  const prompt = `You are a senior public health analyst. Write a structured situation report in markdown format covering:
1. Background and history of this disease/outbreak
2. Current situation (based on provided alert summaries)
3. Transmission risk and spread assessment
4. Recommended actions for health officials and travelers

--- RECENT ALERT SUMMARIES ---
${params.recentAlerts.slice(0, 10).join("\n\n")}
--- END ALERTS ---

${params.countryIso ? `Country focus: ${params.countryIso}` : ""}
${params.pathogen ? `Pathogen focus: ${params.pathogen}` : ""}

Write the report now:`;

  try {
    const response = await withRetry(() => callDeepSeek(prompt), { maxAttempts: 2 });
    return response;
  } catch {
    const response = await withRetry(() => callGemini(prompt), { maxAttempts: 2 });
    return response;
  }
}
