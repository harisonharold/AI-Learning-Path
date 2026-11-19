import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { sources, user } from "../../../db/schema/index.ts";
import { audit } from "./audit.ts";

/**
 * GitHub grant revocation is manual (Q16): the platform never sends DELETE to GitHub.
 * The link's status comes from its `sources` row (seed id github-revoke-app), which the verification job re-checks
 * (D-37). The page sits behind GitHub sign-in, so the job can confirm it exists ("partial") but not the steps.
 */
export const GITHUB_REVOKE_HELP = {
  url: "https://github.com/settings/apps/authorizations",
  verification: "unverified" as "verified" | "partial" | "unverified" | "broken",
  verifiedAt: null as Date | null,
  note: "Link not yet verified by the source-verification job; GitHub may move this page.",
  stepsNote: "The steps below are not verified: the settings page needs a GitHub sign-in to read.",
  steps: [
    "Open GitHub and go to Settings.",
    "Under Integrations, open Applications, then the 'Authorized GitHub Apps' tab.",
    "Find 'Systems Atlas' and choose Revoke.",
    "If you also installed the app on repositories, open the 'Installed GitHub Apps' tab and uninstall it there.",
  ],
};

/** Full delete (G §8): FK cascades remove every user-owned row. The audit row survives with user_id = NULL. */
export async function deleteAccount(userId: string) {
  await audit(userId, "account.delete", `user:${userId}`);
  await getDb().delete(user).where(eq(user.id, userId));
  const row = (await getDb().select().from(sources).where(eq(sources.externalId, "content:github-revoke-app")).limit(1))[0];
  return row ? { ...GITHUB_REVOKE_HELP, verification: row.verification, verifiedAt: row.verifiedAt, note: row.verifyNote ?? GITHUB_REVOKE_HELP.note } : GITHUB_REVOKE_HELP;
}
