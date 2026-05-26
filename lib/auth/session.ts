import { createServerClientInstance, createAdminClient } from "@/lib/supabase/server";
import type { User } from "@/lib/supabase/types";
import { hashApiKey } from "@/lib/billing/apikey";

/**
 * Retrieves the authenticated user's profile from the database.
 * Returns null if no session exists or user is soft-deleted.
 * Always fetches `is_admin` from DB — never trusts session data for privilege checks.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createServerClientInstance();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) return null;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .is("deleted_at", null)
    .single();

  if (profileError || !profile) return null;

  return profile as User;
}

/**
 * Verifies the current user is an admin by checking the database directly.
 * Never infers admin status from session or JWT claims.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getAuthenticatedUser();

  if (!user || !user.is_admin) {
    throw new Error("Unauthorized: admin access required");
  }

  return user;
}

/**
 * Requires an authenticated user (any plan). Throws if not authenticated.
 */
export async function requireAuth(): Promise<User> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error("Unauthorized: authentication required");
  }

  return user;
}

/**
 * Requires a paid user. Throws if not authenticated or not on paid plan.
 */
export async function requirePaidUser(): Promise<User> {
  const user = await requireAuth();

  if (user.plan !== "paid") {
    throw new Error("Forbidden: paid plan required");
  }

  return user;
}

/**
 * Requires the user to have signed in recently (step-up auth guard).
 * Default freshness window: 15 minutes.
 */
export async function requireRecentAuth(maxAgeMinutes = 15): Promise<User> {
  const supabase = await createServerClientInstance();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) throw new Error("Unauthorized: authentication required");

  const lastSignIn = authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at).getTime() : 0;
  if (!lastSignIn || Date.now() - lastSignIn > maxAgeMinutes * 60 * 1000) {
    throw new Error("Reauthentication required");
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .is("deleted_at", null)
    .single();

  if (profileError || !profile) throw new Error("Unauthorized: authentication required");
  return profile as User;
}

/**
 * Authenticate a request via API key (Bearer epk_... header).
 * Validates the key hash, verifies paid plan, updates last-used timestamp.
 * Returns the user on success, null on failure.
 *
 * Used by v1 API routes that support API key authentication.
 */
export async function authenticateApiKey(authHeader: string | null): Promise<User | null> {
  if (!authHeader?.startsWith("Bearer epk_")) return null;

  const rawKey = authHeader.slice("Bearer ".length);
  const keyHash = hashApiKey(rawKey);

  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user, error } = await (supabase as any)
    .from("users")
    .select("*")
    .eq("api_key_hash", keyHash)
    .eq("plan", "paid")
    .is("deleted_at", null)
    .single();

  if (error || !user) return null;

  // Update last-used timestamp — fire and forget, non-fatal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any)
    .from("users")
    .update({ api_key_last_used_at: new Date().toISOString() })
    .eq("id", user.id)
    .then()
    .catch((e: Error) => console.warn("[auth] Failed to update api_key_last_used_at:", e.message));

  return user as User;
}
