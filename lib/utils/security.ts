import type { NextRequest } from "next/server";

/**
 * Basic CSRF defense for cookie-authenticated mutation routes.
 * Requires same-origin Origin (preferred) or Referer host match.
 */
export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const expected = appUrl ? new URL(appUrl).origin : (host ? `${proto}://${host}` : null);
  if (!expected) return false;

  try {
    if (origin) {
      return new URL(origin).origin === expected;
    }

    if (referer) {
      return new URL(referer).origin === expected;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Indicates whether a method is state-changing and should be CSRF-guarded.
 */
export function isMutationMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}
