# Reference solution: server-side only, never served before the gate passes (X-06).
# atlas-solution-canary-ex-w01-91c4
LEVELS = {"DEBUG", "INFO", "WARN", "ERROR"}


def count_levels(lines):
    counts = {}
    for line in lines:
        parts = line.split()
        if len(parts) > 1 and parts[1] in LEVELS:
            counts[parts[1]] = counts.get(parts[1], 0) + 1
    return counts
