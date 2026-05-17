import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const WatchlistInsertSchema = z.object({
  type: z.enum(["country", "pathogen", "region"]),
  value: z.string().min(1).max(100),
  alert_mode: z.enum(["daily", "immediate"]).default("daily"),
});

/** GET /api/v1/watchlists — list user's watchlists */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch watchlists" }, { status: 500 });

  return NextResponse.json({ data });
}

/** POST /api/v1/watchlists — add a watchlist item */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = WatchlistInsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Enforce free-tier watchlist limit (max 3)
  if (user.plan === "free") {
    const { count } = await supabase
      .from("watchlists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: "Free plan is limited to 3 watchlists. Upgrade to paid for unlimited." },
        { status: 403 },
      );
    }
  }

  const { data, error } = await supabase
    .from("watchlists")
    .insert({
      user_id: user.id,
      type: parsed.data.type,
      value: parsed.data.value,
      alert_mode: parsed.data.alert_mode,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This watchlist item already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

/** PATCH /api/v1/watchlists?id=... — update alert_mode on an existing item */
export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = z.object({ alert_mode: z.enum(["daily", "immediate"]) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("watchlists")
    .update({ alert_mode: parsed.data.alert_mode })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500 });

  return NextResponse.json({ data });
}

/** DELETE /api/v1/watchlists?id=... — remove a watchlist item */
export async function DELETE(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id); // RLS enforcement at application layer too

  if (error) return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 });

  return NextResponse.json({ success: true });
}
