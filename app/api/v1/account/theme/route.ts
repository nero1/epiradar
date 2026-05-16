import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { getRedisClient } from "@/lib/redis/client";
import { z } from "zod";

const THEMES_KEY = "admin:themes";
const ACTIVE_THEME_KEY = "admin:activeTheme";

/**
 * GET /api/v1/account/theme — returns the resolved CSS variables for the calling user.
 * Preference order: user's preferred_theme → admin global active theme → default (empty = CSS vars from stylesheet).
 */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedisClient();
  const themeName = user.preferred_theme ?? (await redis.get(ACTIVE_THEME_KEY)) ?? null;

  if (!themeName || themeName === "default") {
    return NextResponse.json({ themeName: null, variables: {} });
  }

  const themesJson = await redis.get(THEMES_KEY);
  const themes: Array<{ name: string; variables: Record<string, string> }> = themesJson
    ? JSON.parse(String(themesJson))
    : [];

  const theme = themes.find((t) => t.name === themeName);
  return NextResponse.json({
    themeName,
    variables: theme?.variables ?? {},
    preferredTheme: user.preferred_theme,
  });
}

/**
 * PATCH /api/v1/account/theme — set the user's preferred theme by name.
 * Pass null to clear the preference and fall back to the global admin theme.
 */
export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z.object({
    themeName: z.string().min(1).max(60).nullable(),
  }).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { themeName } = parsed.data;

  // Verify the theme exists (or allow null to clear)
  if (themeName !== null) {
    const redis = getRedisClient();
    const themesJson = await redis.get(THEMES_KEY);
    const themes: Array<{ name: string }> = themesJson ? JSON.parse(String(themesJson)) : [];
    const exists = themes.some((t) => t.name === themeName);
    if (!exists) {
      return NextResponse.json({ error: `Theme "${themeName}" does not exist` }, { status: 404 });
    }
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("users")
    .update({ preferred_theme: themeName })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update theme preference" }, { status: 500 });
  }

  return NextResponse.json({ success: true, preferredTheme: themeName });
}
