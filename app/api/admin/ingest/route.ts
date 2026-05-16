import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { runIngestion } from "@/lib/ingestion/run";

/**
 * Manual ingestion trigger for admin users.
 * is_admin is verified from the database — never from session alone.
 */
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await runIngestion("manual");
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/ingest] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
