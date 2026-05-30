import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { getAlertById } from "@/lib/data/alerts";
import { checkAndDecrementPdfQuota, generateAlertPdfHtml, getRemainingQuota } from "@/lib/export/pdf";
import { rateLimitExport } from "@/lib/ratelimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getIdempotentResponse, reserveIdempotencyKey, setIdempotentResponse } from "@/lib/utils/idempotency";
import { isSameOriginMutation } from "@/lib/utils/security";
import { z } from "zod";

const ExportSchema = z.object({
  alertId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(128),
  turnstileToken: z.string().optional(),
});

/**
 * POST /api/v1/exports/pdf — generate a PDF export for an alert.
 * Free users: 3/month, atomically decremented at DB level.
 * Paid users: unlimited.
 * Rate limited: 10/hour/user.
 * Returns the HTML document for client-side printing/downloading.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check
  const rl = await rateLimitExport(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 3600000) / 1000)) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { alertId, turnstileToken, idempotencyKey } = parsed.data;

  const prior = await getIdempotentResponse<{ html: string; filename: string }>(`pdf:${user.id}:${alertId}`, idempotencyKey);
  if (prior) {
    return new NextResponse(prior.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${prior.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const reserved = await reserveIdempotencyKey(`pdf:${user.id}:${alertId}`, idempotencyKey);
  if (!reserved) {
    return NextResponse.json({ error: "Duplicate request", code: "IDEMPOTENCY_REPLAY" }, { status: 409 });
  }

  // Bot protection: verify Turnstile token on export forms (PRD §5.2 / §14)
  const clientIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? undefined;
  const turnstilePassed = await verifyTurnstileToken(turnstileToken ?? "", clientIp);
  if (!turnstilePassed) {
    return NextResponse.json({ error: "Bot protection failed. Please complete the verification." }, { status: 403 });
  }

  // Fetch alert
  const alert = await getAlertById(alertId);
  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  // Check and decrement quota (atomic DB function prevents race conditions)
  const allowed = await checkAndDecrementPdfQuota(user.id, user.plan);
  if (!allowed) {
    const remaining = getRemainingQuota(user.pdf_export_count, user.plan);
    return NextResponse.json(
      {
        error: "PDF export quota exhausted. Resets on the 1st of next month.",
        remaining: remaining.toNumber(),
        upgradeUrl: "/pricing",
      },
      { status: 403 },
    );
  }

  const { html, filename } = generateAlertPdfHtml(alert);
  await setIdempotentResponse(`pdf:${user.id}:${alertId}`, idempotencyKey, { html, filename });

  // Log export for admin volume monitoring (non-fatal if it fails)
  const supabase = await createServerClientInstance();
  supabase
    .from("export_logs")
    .insert({ user_id: user.id, export_type: "pdf", alert_id: alertId })
    .then(() => {})
    .catch(() => {});

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
