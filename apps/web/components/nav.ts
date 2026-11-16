/** Left rail order from E.2. `phase` = when the page becomes functional; `unlock` = gate that unlocks it (Q7). */
export const NAV = [
  { href: "/today", label: "Today", key: "t", phase: "P1" },
  { href: "/roadmap", label: "Roadmap", key: "r", phase: "P1" },
  { href: "/learn", label: "Learn", key: null, phase: "P1" },
  { href: "/lab", label: "Lab", key: "l", phase: "P2" },
  { href: "/research", label: "Research", key: null, phase: "P3", unlock: "the W8 exam" },
  { href: "/open-source", label: "Open Source", key: null, phase: "P4", unlock: "the W12 exam" },
  { href: "/mentor", label: "Mentor", key: null, phase: "P5" },
  { href: "/interview", label: "Interview", key: null, phase: "P5" },
  { href: "/portfolio", label: "Portfolio", key: null, phase: "P6" },
  { href: "/analytics", label: "Analytics", key: null, phase: "P2" },
  { href: "/settings", label: "Settings", key: null, phase: "P0" },
] as const;
