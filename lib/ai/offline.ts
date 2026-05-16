/**
 * On-device AI using Transformers.js (ONNX runtime).
 * Used as an offline fallback when DeepSeek and Gemini APIs are unavailable.
 * Uses a lightweight zero-shot classification pipeline optimized for 2–4 GB RAM devices.
 *
 * Model: Xenova/nli-deberta-v3-small (ONNX, ~85 MB quantized)
 * Lazy-loaded on first use to avoid bloating the initial bundle.
 *
 * To enable: set NEXT_PUBLIC_ENABLE_OFFLINE_AI=true
 * The model is downloaded once and cached in the browser's IndexedDB by Transformers.js.
 */

import type { RawAlert } from "@/lib/ingestion/sources";

/** Minimal scored result from on-device classification */
export interface OfflineClassification {
  isRelevant: boolean;
  /** Estimated risk tier: 0=low, 1=medium, 2=high (maps to 0-33, 34-66, 67-100 range) */
  riskTier: 0 | 1 | 2;
  confidence: number;
}

const OUTBREAK_LABELS = [
  "disease outbreak or epidemic emergency",
  "unrelated health or general news",
];

let pipeline: ((text: string, labels: string[]) => Promise<{ scores: number[]; labels: string[] }>) | null = null;

/** Lazy-load the Transformers.js zero-shot classification pipeline */
async function getPipeline() {
  if (pipeline) return pipeline;

  // Dynamic import keeps Transformers.js out of the server bundle
  const { pipeline: createPipeline, env } = await import("@xenova/transformers");

  // Use WASM backend — no GPU required, works in Node.js and browser
  env.backends.onnx.wasm.numThreads = 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipeline = await createPipeline("zero-shot-classification", "Xenova/nli-deberta-v3-small") as any;
  return pipeline!;
}

/**
 * Classify a raw alert using on-device ONNX inference.
 * Falls back gracefully on any error — never throws.
 * Only available when NEXT_PUBLIC_ENABLE_OFFLINE_AI=true.
 */
export async function classifyAlertOffline(alert: RawAlert): Promise<OfflineClassification | null> {
  if (process.env.NEXT_PUBLIC_ENABLE_OFFLINE_AI !== "true") return null;

  try {
    const classify = await getPipeline();
    const text = `${alert.title}. ${alert.content.slice(0, 512)}`;
    const result = await classify(text, OUTBREAK_LABELS);

    const outbreakScore = result.scores[result.labels.indexOf(OUTBREAK_LABELS[0])];
    const isRelevant = outbreakScore > 0.55;

    // Map confidence to risk tier
    let riskTier: 0 | 1 | 2 = 0;
    if (outbreakScore > 0.85) riskTier = 2;
    else if (outbreakScore > 0.7) riskTier = 1;

    return { isRelevant, riskTier, confidence: outbreakScore };
  } catch (err) {
    console.warn("[ai/offline] On-device classification failed:", (err as Error).message);
    return null;
  }
}

/**
 * Convert an offline risk tier to an approximate numeric score.
 * Used as a last-resort fallback when both cloud AI providers are unavailable.
 */
export function tierToRiskScore(tier: 0 | 1 | 2): { riskScore: number; severityScore: number; spreadScore: number; noveltyScore: number } {
  const base = tier === 2 ? 70 : tier === 1 ? 45 : 20;
  return {
    riskScore: base,
    severityScore: base,
    spreadScore: base - 5,
    noveltyScore: base - 10,
  };
}
