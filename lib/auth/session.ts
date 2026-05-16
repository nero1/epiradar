import { createServerClientInstance } from "@/lib/supabase/server";
import type { User } from "@/lib/supabase/types";

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
