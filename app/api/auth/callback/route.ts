import { createServerClientInstance, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * OAuth callback handler.
 * After Google redirects here, exchanges the code for a session and creates a user profile if new.
 * New users are redirected to /onboarding to set a password and recovery email.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createServerClientInstance();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/callback] OAuth exchange failed:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const adminClient = createAdminClient();

  // Profile creation is handled by DB trigger (handle_new_user).
  // Here we only perform idempotent enrichment.
  const { error: enrichError } = await adminClient
    .from("users")
    .update({
      email: data.user.email ?? undefined,
      display_name: data.user.user_metadata?.full_name ?? null,
    })
    .eq("id", data.user.id);

  if (enrichError) {
    console.error("[auth/callback] Failed to enrich profile:", enrichError.message);
  }

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
