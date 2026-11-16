/** Structured JSON logger with secret redaction (X-03). No dependency. */
type Level = "debug" | "info" | "warn" | "error";
const SENSITIVE_KEY = /(secret|token|password|passwd|authorization|cookie|api[-_]?key|private[-_]?key|signature|key_enc)/i;

let knownSecrets: string[] = [];
export function registerSecrets(values: string[]): void {
  knownSecrets = values.filter((v) => v.length >= 6);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth]";
  if (typeof value === "string") {
    let s = value;
    for (const secret of knownSecrets) if (s.includes(secret)) s = s.split(secret).join("[REDACTED]");
    return s.replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "$1 [REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

export type Sink = (line: string) => void;
let sink: Sink = (line) => process.stdout.write(line + "\n");
export function setSink(s: Sink): void {
  sink = s;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), level, msg: redact(msg), ...(redact(fields) as object) }));
}
