import { NextResponse, type NextRequest } from "next/server";

/**
 * 1. Two origins (PLAN D-14): on SANDBOX_ORIGIN only /sandbox/* is served (never cookies, never /api);
 *    on APP_ORIGIN /sandbox/* is 404.
 * 2. Nonce-based CSP + security headers on every app response.
 * Runs before routing; reads env directly because it may not share modules with the app.
 */
export function proxy(req: NextRequest) {
  const app = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN) : null;
  const sandbox = process.env.SANDBOX_ORIGIN ? new URL(process.env.SANDBOX_ORIGIN) : null;
  const host = req.headers.get("host") ?? "";
  const path = req.nextUrl.pathname;

  if (sandbox && host === sandbox.host) {
    if (!path.startsWith("/sandbox/")) return new NextResponse("Not found", { status: 404 });
    const res = NextResponse.next();
    res.headers.set("content-security-policy", `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; frame-ancestors ${app?.origin ?? "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none'`);
    res.headers.set("cross-origin-resource-policy", "cross-origin");
    return res;
  }
  if (path.startsWith("/sandbox/")) return new NextResponse("Not found", { status: 404 });

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:", // Monaco ships its icon font inline
    `connect-src 'self'${dev ? " ws:" : ""}`,
    `frame-src ${sandbox?.origin ?? "'none'"}`,
    "worker-src 'self' blob:", // Monaco web workers (self-hosted under /monaco)
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  res.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("cross-origin-opener-policy", "same-origin");
  if (process.env.ATLAS_ENV === "production") res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
