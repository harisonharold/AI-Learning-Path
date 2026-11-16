/** Single-account allowlist by immutable numeric GitHub id (PLAN D-08). Logins are never compared. */
export function isAllowedGitHubId(githubId: unknown, allowedId: string): boolean {
  const s = typeof githubId === "number" ? String(githubId) : typeof githubId === "string" ? githubId : "";
  return /^[1-9][0-9]{0,18}$/.test(s) && s === allowedId;
}
