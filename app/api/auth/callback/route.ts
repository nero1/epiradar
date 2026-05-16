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

  // Check if user profile exists
  const { data: existingProfile } = await adminClient
    .from("users")
    .select("id")
    .eq("id", data.user.id)
    .single();

  if (!existingProfile) {
    // Create user profile for first-time OAuth login
    const { error: insertError } = await adminClient.from("users").insert({
      id: data.user.id,
      email: data.user.email!,
      display_name: data.user.user_metadata?.full_name ?? null,
      plan: "free",
      pdf_export_count: 0,
      is_admin: false,
    });

    if (insertError) {
      console.error("[auth/callback] Failed to create user profile:", insertError.message);
      return NextResponse.redirect(`${origin}/login?error=profile_creation_failed`);
    }

    // Redirect new users to onboarding
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
