import "server-only";
import { getDb } from "../../../db/client.ts";
import { auditLog } from "../../../db/schema/index.ts";
import { sha256Hex } from "./crypto.ts";

export async function audit(userId: string | null, action: string, target: string | null, meta: Record<string, unknown> = {}, ip?: string | null) {
  await getDb().insert(auditLog).values({ userId, action, target, metaJson: meta, ipHash: ip ? sha256Hex(ip) : null });
}
