import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePaidUser } from "@/lib/auth/session";
import { createServerClientInstance } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/billing/apikey";
import { isSameOriginMutation } from "@/lib/utils/security";

/**
 * GET /api/v1/apikeys — return current API key status (hashed, not the raw key).
 * POST /api/v1/apikeys — generate or rotate the API key. Returns the raw key ONCE.
 * DELETE /api/v1/apikeys — revoke the API key.
 *
 * Paid tier only. The raw key is returned only at generation time — never stored.
 */
export async function GET() {
  let user;
  try {
    user = await requirePaidUser();
  } catch {
    return NextResponse.json({ error: "Paid plan required", upgradeUrl: "/pricing" }, { status: 403 });
  }

  return NextResponse.json({
    hasApiKey: !!user.api_key_hash,
    keyPrefix: user.api_key_hash ? "epk_***" : null,
    lastUsedAt: user.api_key_last_used_at ?? null,
    rateLimit: "1,000 requests/day",
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requirePaidUser();
  } catch {
    return NextResponse.json({ error: "Paid plan required", upgradeUrl: "/pricing" }, { status: 403 });
  }

  const { key, hash } = generateApiKey();

  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("users")
    .update({ api_key_hash: hash })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Failed to generate API key" }, { status: 500 });

  return NextResponse.json({
    apiKey: key,
    warning: "Store this key securely — it will not be shown again.",
  }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  let user;
  try {
    user = await requirePaidUser();
  } catch {
    return NextResponse.json({ error: "Paid plan required", upgradeUrl: "/pricing" }, { status: 403 });
  }

  const supabase = await createServerClientInstance();
  const { error } = await supabase
    .from("users")
    .update({ api_key_hash: null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });

  return NextResponse.json({ success: true, message: "API key revoked." });
}
