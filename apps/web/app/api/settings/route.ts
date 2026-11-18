import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { settings, updateSettings } from "@/modules/learning/service";
import { audit } from "@/modules/platform/service";
import { setSampleData } from "@/modules/research/service";
import { body, handle } from "../_lib/respond";

const Body = z.object({
  mode: z.enum(["RI", "ACC"]).optional(),
  hoursPerWeek: z.union([z.literal(20), z.literal(30), z.literal(40), z.literal(50)]).optional(),
  timezone: z.string().regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/).max(64).optional(),
  // FR-30 / Q17: sample lab data, off by default; turning it off deletes the sample project.
  sampleData: z.boolean().optional(),
}).strict();

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(() => settings(g.user.id));
}

export async function PUT(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(async () => {
    const s = await updateSettings(g.user.id, b.data);
    if (b.data.sampleData !== undefined) await setSampleData(g.user.id, b.data.sampleData);
    await audit(g.user.id, "settings.update", "user_settings", { fields: Object.keys(b.data) });
    return s;
  });
}
