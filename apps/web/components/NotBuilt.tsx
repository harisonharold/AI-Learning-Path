import { PageState } from "@atlas/ui";

export function NotBuilt({ title, phase, what, unlock }: { title: string; phase: string; what: string; unlock?: string }) {
  return (
    <div className="prose-width space-y-4">
      <h1 className="text-3xl">{title}</h1>
      {unlock ? <p className="text-[var(--ink-muted)]">When built, this area stays locked until you pass {unlock}. You will be able to preview it before then.</p> : null}
      <PageState state="not-built" phase={phase} what={what} />
    </div>
  );
}
