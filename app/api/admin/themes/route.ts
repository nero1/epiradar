import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getRedisClient } from "@/lib/redis/client";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/utils/security";

const ThemeSchema = z.object({
  name: z.string().min(1).max(60),
  variables: z.record(z.string()).refine(
    (vars) => Object.keys(vars).every((k) => k.startsWith("--")),
    { message: "All keys must start with --" },
  ),
});

const THEMES_KEY = "admin:themes";
const ACTIVE_THEME_KEY = "admin:activeTheme";

/** GET /api/admin/themes — list all custom themes and the active theme name */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const redis = getRedisClient();
  const [themesJson, activeTheme] = await Promise.all([
    redis.get(THEMES_KEY),
    redis.get(ACTIVE_THEME_KEY),
  ]);

  const themes = themesJson ? JSON.parse(String(themesJson)) : [];
  return NextResponse.json({ themes, activeTheme: activeTheme ?? "default" });
}

/** POST /api/admin/themes — create or update a custom theme */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ThemeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const redis = getRedisClient();
  const existing = await redis.get(THEMES_KEY);
  const themes: Array<{ name: string; variables: Record<string, string> }> = existing
    ? JSON.parse(String(existing))
    : [];

  const idx = themes.findIndex((t) => t.name === parsed.data.name);
  if (idx >= 0) themes[idx] = parsed.data;
  else themes.push(parsed.data);

  await redis.set(THEMES_KEY, JSON.stringify(themes));
  return NextResponse.json({ success: true, theme: parsed.data }, { status: 201 });
}

/** DELETE /api/admin/themes?name=... — remove a custom theme */
export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = new URL(request.url).searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const redis = getRedisClient();
  const existing = await redis.get(THEMES_KEY);
  const themes: Array<{ name: string }> = existing ? JSON.parse(String(existing)) : [];
  const filtered = themes.filter((t) => t.name !== name);

  await redis.set(THEMES_KEY, JSON.stringify(filtered));

  // If the deleted theme was active, reset to default
  const activeTheme = await redis.get(ACTIVE_THEME_KEY);
  if (String(activeTheme) === name) {
    await redis.set(ACTIVE_THEME_KEY, "default");
  }

  return NextResponse.json({ success: true });
}

/** PATCH /api/admin/themes — activate a theme by name */
export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = z.string().min(1).safeParse(body?.name);
  if (!name.success) {
    return NextResponse.json({ error: "Missing theme name" }, { status: 400 });
  }

  const redis = getRedisClient();
  await redis.set(ACTIVE_THEME_KEY, name.data);
  return NextResponse.json({ success: true, activeTheme: name.data });
}
