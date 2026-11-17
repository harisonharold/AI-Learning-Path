import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { auditLog, userRoles } from "../../../db/schema/index.ts";
import { sha256Hex } from "./crypto.ts";

export async function audit(userId: string | null, action: string, target: string | null, meta: Record<string, unknown> = {}, ip?: string | null) {
  await getDb().insert(auditLog).values({ userId, action, target, metaJson: meta, ipHash: ip ? sha256Hex(ip) : null });
}

/** Roles come from the DB only, never from a request body (THREAT T-A10). Everyone is a learner. */
export async function rolesOf(userId: string): Promise<Set<"learner" | "reviewer" | "admin">> {
  const rows = await getDb().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return new Set<"learner" | "reviewer" | "admin">(["learner", ...rows.map((r) => r.role)]);
}
