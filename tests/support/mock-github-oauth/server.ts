/**
 * In-repo mock of the three GitHub endpoints sign-in uses (Q4). Test-only; never part of a product image.
 *   GET  /login/oauth/authorize      -> 302 back to redirect_uri with a code for the "current" mock user
 *   POST /login/oauth/access_token   -> token JSON (form body, like GitHub)
 *   GET  /api/user                   -> the mock user for a bearer token
 *   POST /__mock/user {id,login}     -> choose who "signs in" next (test control)
 *   GET  /__mock/requests            -> every request received, for the AT-27 traffic assertion
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

type MockUser = { id: number; login: string; name: string; email: string | null };
const DEFAULT: MockUser = { id: 123658133, login: "harisonharold", name: "Harison", email: null };
let current: MockUser = DEFAULT;
const codes = new Map<string, MockUser>();
const tokens = new Map<string, MockUser>();
const requests: { method: string; path: string; at: string }[] = [];

const send = (res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (!url.pathname.startsWith("/__mock")) requests.push({ method: req.method ?? "", path: url.pathname, at: new Date().toISOString() });
    if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
      const redirect = url.searchParams.get("redirect_uri");
      if (!redirect || !url.searchParams.get("client_id")) return send(res, 400, { error: "invalid_request" });
      const code = randomBytes(8).toString("hex");
      codes.set(code, current);
      const back = new URL(redirect);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      return res.writeHead(302, { location: back.toString() }).end();
    }
    if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
      const form = new URLSearchParams(raw);
      const u = codes.get(form.get("code") ?? "");
      if (!u || !form.get("client_secret")) return send(res, 200, { error: "bad_verification_code" });
      codes.delete(form.get("code")!);
      const t = "ghu_mock_" + randomBytes(8).toString("hex");
      tokens.set(t, u);
      return send(res, 200, { access_token: t, token_type: "bearer", scope: "", expires_in: 28800, refresh_token: "ghr_mock_" + randomBytes(8).toString("hex"), refresh_token_expires_in: 15897600 });
    }
    if (req.method === "GET" && url.pathname === "/api/user") {
      const u = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      return u ? send(res, 200, { id: u.id, login: u.login, name: u.name, email: u.email, avatar_url: null }) : send(res, 401, { message: "Bad credentials" });
    }
    if (req.method === "POST" && url.pathname === "/__mock/user") {
      current = raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<MockUser>) } : DEFAULT;
      return send(res, 200, current);
    }
    if (req.method === "GET" && url.pathname === "/__mock/requests") return send(res, 200, requests);
    if (req.method === "POST" && url.pathname === "/__mock/reset") { requests.length = 0; current = DEFAULT; return send(res, 200, { ok: true }); }
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    send(res, 404, { message: "Not Found" });
  });
}).listen(Number(process.env.PORT ?? 4010), () => process.stdout.write(`mock-github listening on ${process.env.PORT ?? 4010}\n`));
