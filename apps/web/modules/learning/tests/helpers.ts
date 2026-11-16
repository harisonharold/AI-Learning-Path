import { fileURLToPath } from "node:url";
import { loadContent } from "../internal/content.ts";
import type { EvidenceItem, GateStatus, RubricScore } from "../internal/gates.ts";

export const content = loadContent(fileURLToPath(new URL("../../../../../content", import.meta.url)));
export const gate = (id: string) => content.curriculum.ri_weeks.flatMap((w) => w.gates).find((g) => g.id === id)!;
export const t = (min: number) => new Date(Date.UTC(2026, 10, 16, 12, min));
export const ev = (e: Partial<EvidenceItem> & Pick<EvidenceItem, "kind">): EvidenceItem => ({ passed: null, verified: false, createdAt: t(0), ...e });
export const score = (criterion: string, level: RubricScore["level"], scorer: RubricScore["scorer"] = "self", min = 0): RubricScore => ({ criterion, level, scorer, createdAt: t(min) });
export const statuses = (passed: string[], extra: Record<string, GateStatus> = {}) => new Map<string, GateStatus>([...passed.map((g) => [g, "passed"] as [string, GateStatus]), ...Object.entries(extra)]);
