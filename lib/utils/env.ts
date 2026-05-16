/**
 * Returns true when real Supabase credentials are available.
 * During CI builds with placeholder values, DB calls are skipped to allow clean builds.
 */
export function hasSupabaseCredentials(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && url !== "https://placeholder.supabase.co";
}
