import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { user } from "../../../db/schema/index.ts";
import { audit } from "./audit.ts";

/**
 * GitHub grant revocation is manual (Q16): the platform never sends DELETE to GitHub.
 * Link/steps are UNVERIFIED: docs.github.com was unreachable from the build environment on 2026-11-16.
 */
export const GITHUB_REVOKE_HELP = {
  url: "https://github.com/settings/apps/authorizations",
  verification: "unverified" as const,
  verifiedAt: null,
  note: "Link not yet verified by the source-verification job; GitHub may move this page.",
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
  return GITHUB_REVOKE_HELP;
}
