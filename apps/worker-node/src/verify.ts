/**
 * Source verification (F.2, NFR-8). Only records returned by official APIs or the fetched page become facts:
 * arXiv through its export API, GitHub through the REST API (GET only), anything else by URL + page title.
 * A captcha or "Access denied" page is never `verified` (AT-23). Temporary failures (rate limits, timeouts,
 * server errors) leave the stored status alone instead of downgrading a source that may be fine.
 */
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetch.ts";

export type Verification = "verified" | "partial" | "broken";
export interface VerifyResult {
  verification: Verification | "unchanged";
  method: string;
  note: string;
  finalUrl?: string | undefined;
  title?: string | undefined;
  externalId?: string | undefined;
  licence?: string | null | undefined;
  lastActivityAt?: string | null | undefined;
  blockReason?: string | undefined;
  raw?: Record<string, unknown> | undefined;
}
export interface VerifyInput { url: string; kind: string; externalId?: string | null | undefined; expectedTitle?: string | null | undefined }
export interface Endpoints { arxiv: string; github: string }
export const DEFAULT_ENDPOINTS: Endpoints = { arxiv: "https://export.arxiv.org/api/query", github: "https://api.github.com" };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml); return m ? clean(m[1]!) : null; };

export const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/i;
export function arxivIdFromUrl(url: string): string | null {
  const m = /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?\/?(?:[?#].*)?$/i.exec(url);
  return m && ARXIV_ID.test(m[1]!) ? m[1]! : null;
}

export function parseArxivFeed(xml: string, id: string): VerifyResult {
  const entry = /<entry>([\s\S]*?)<\/entry>/i.exec(xml)?.[1];
  if (!entry) return { verification: "broken", method: "arXiv export API", note: `arXiv returned no entry for ${id}` };
  const entryId = tag(entry, "id") ?? "";
  const title = tag(entry, "title");
  if (/\/api\/errors/.test(entryId) || title === "Error" || !title) return { verification: "broken", method: "arXiv export API", note: `arXiv reported an error for ${id}: ${tag(entry, "summary") ?? "unknown"}` };
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)].map((m) => clean(m[1]!));
  const published = tag(entry, "published");
  return {
    verification: "verified", method: "arXiv export API", note: `title, authors and abstract as returned by arXiv for ${id}`,
    title, externalId: id.replace(/v\d+$/, ""), finalUrl: `https://arxiv.org/abs/${id.replace(/v\d+$/, "")}`, lastActivityAt: tag(entry, "updated"),
    raw: { authors, published, abstract: tag(entry, "summary"), arxivEntryId: entryId },
  };
}

/**
 * Bot walls and access-denied pages (AT-23). Titles are always checked. Body phrases are checked only on small pages
 * or error responses: real challenge pages are small, while large normal pages (GitHub's, for example) mention
 * "captcha" in their scripts, which made the first live run flag two good pages.
 */
const CHALLENGE_TITLE = [/captcha/i, /attention required/i, /access denied/i, /just a moment/i, /are you a robot/i, /verify (that )?you are (a )?human/i, /request blocked/i, /security check/i];
const CHALLENGE_BODY = [/cf-challenge|challenge-platform|cf_chl_/i, /g-recaptcha|h-captcha|class="captcha/i, /checking your browser/i, /verify (that )?you are (a )?human/i,
  /enable javascript and cookies to continue/i, /unusual traffic from your computer/i, /access denied/i, /request blocked/i];
const SMALL_PAGE = 64 * 1024;
const SIGN_IN = /\/(login|signin|sign_in|sign-in|session)(\/|\?|$)/i;

function htmlTitle(body: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  return m ? clean(m[1]!) : null;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function judgePage(r: SafeFetchResult, expectedTitle?: string | null): VerifyResult {
  const method = "HTTP GET + page title (safeFetch)";
  if (!r.ok) {
    if (r.reason === "timeout" || r.reason === "network") return { verification: "unchanged", method, note: `temporary failure: ${r.detail}`, finalUrl: r.finalUrl, blockReason: r.reason };
    return { verification: "broken", method, note: `not fetched: ${r.detail}`, finalUrl: r.finalUrl, blockReason: r.reason };
  }
  const body = r.body.toString("utf8");
  const title = htmlTitle(body);
  const finalPath = new URL(r.finalUrl).pathname + new URL(r.finalUrl).search;
  if (r.redirects.length && SIGN_IN.test(finalPath) && r.status < 400) {
    return { verification: "partial", method, note: "redirects to a sign-in page; the page exists but its content needs an account to check", finalUrl: r.finalUrl, title: title ?? undefined };
  }
  const challenged = CHALLENGE_TITLE.some((re) => re.test(title ?? "")) || ((body.length < SMALL_PAGE || r.status >= 400) && CHALLENGE_BODY.some((re) => re.test(body)));
  if (challenged) {
    return { verification: r.status >= 400 ? "broken" : "partial", method, note: `HTTP ${r.status}: looks like a captcha or access-denied page, so the content could not be checked`, finalUrl: r.finalUrl, title: title ?? undefined };
  }
  if (r.status === 429 || r.status >= 500) return { verification: "unchanged", method, note: `temporary failure: HTTP ${r.status}`, finalUrl: r.finalUrl };
  if (r.status >= 400) return { verification: "broken", method, note: `HTTP ${r.status}`, finalUrl: r.finalUrl };
  if (!title) return { verification: "partial", method, note: `HTTP ${r.status} but the page has no title to check`, finalUrl: r.finalUrl };
  if (expectedTitle && !norm(title).includes(norm(expectedTitle).slice(0, 40)) && !norm(expectedTitle).includes(norm(title).slice(0, 40))) {
    return { verification: "partial", method, note: `HTTP ${r.status}; the page title changed to "${title}"`, finalUrl: r.finalUrl, title };
  }
  return { verification: "verified", method, note: `HTTP ${r.status}, title "${title}"`, finalUrl: r.finalUrl, title };
}

function githubTarget(url: string): { owner: string; repo: string; issue?: number } | null {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:issues|pull)\/(\d+))?\/?$/.exec(url);
  if (!m || ["settings", "orgs", "apps", "login", "sponsors"].includes(m[1]!)) return null;
  return { owner: m[1]!, repo: m[2]!, ...(m[3] ? { issue: Number(m[3]) } : {}) };
}

export async function verifySource(input: VerifyInput, opts: { endpoints?: Endpoints; fetchOptions?: SafeFetchOptions } = {}): Promise<VerifyResult> {
  const ep = opts.endpoints ?? DEFAULT_ENDPOINTS;
  const fo = opts.fetchOptions ?? {};
  const arxiv = input.kind === "paper" ? arxivIdFromUrl(input.url) ?? (input.externalId && ARXIV_ID.test(input.externalId) ? input.externalId : null) : null;
  if (arxiv) {
    const r = await safeFetch(`${ep.arxiv}?id_list=${encodeURIComponent(arxiv)}`, { ...fo, accept: "application/atom+xml" });
    if (!r.ok) return judgePage(r);
    if (r.status !== 200) return { verification: r.status === 429 || r.status >= 500 ? "unchanged" : "broken", method: "arXiv export API", note: `arXiv API answered HTTP ${r.status}` };
    return parseArxivFeed(r.body.toString("utf8"), arxiv);
  }
  const gh = githubTarget(input.url);
  if (gh && (input.kind === "repo" || input.kind === "issue")) {
    const path = gh.issue ? `/repos/${gh.owner}/${gh.repo}/issues/${gh.issue}` : `/repos/${gh.owner}/${gh.repo}`;
    const r = await safeFetch(`${ep.github}${path}`, { ...fo, accept: "application/vnd.github+json" });
    const method = `GitHub REST GET ${gh.issue ? "/repos/{o}/{r}/issues/{n}" : "/repos/{o}/{r}"}`;
    if (!r.ok) return judgePage(r);
    if (r.status === 404 || r.status === 410) return { verification: "broken", method, note: `GitHub says HTTP ${r.status}` };
    if (r.status !== 200) return { verification: "unchanged", method, note: `temporary failure: GitHub HTTP ${r.status} (rate limit or outage)` };
    const j = JSON.parse(r.body.toString("utf8")) as Record<string, unknown>;
    if (gh.issue) {
      return { verification: "verified", method, note: `issue ${String(j.state)}${j.pull_request ? " (pull request)" : ""}`, title: String(j.title ?? ""), finalUrl: String(j.html_url ?? input.url),
        lastActivityAt: (j.updated_at as string) ?? null, raw: { state: j.state, closed_at: j.closed_at, comments: j.comments } };
    }
    const licence = (j.license as { spdx_id?: string } | null)?.spdx_id ?? null;
    return { verification: "verified", method, note: `${j.archived ? "ARCHIVED repository; " : ""}licence ${licence ?? "none reported"}`, title: `${String(j.full_name)}: ${String(j.description ?? "")}`.slice(0, 500),
      finalUrl: String(j.html_url ?? input.url), licence, lastActivityAt: (j.pushed_at as string) ?? null, raw: { archived: j.archived, stars: j.stargazers_count, default_branch: j.default_branch } };
  }
  const page = judgePage(await safeFetch(input.url, fo), input.expectedTitle);
  if (input.kind === "price" && page.verification !== "broken") page.note = `price page (figures are estimates, read on ${new Date().toISOString().slice(0, 10)}): ${page.note}`;
  return page;
}
