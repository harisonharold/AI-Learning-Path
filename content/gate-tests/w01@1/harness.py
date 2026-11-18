"""atlas-lab gate harness (stdlib only). Loads the learner's /work/solution.py, then runs the bundle's tests in the
order listed in /bundle/tests.txt and prints one JSON result line. Runs with no network, a read-only root and limits."""

import json
import sys
import time
import traceback

MARKER = "ATLAS_LAB_RESULT "


def main() -> int:
    ns: dict = {"__name__": "solution"}
    results = []
    try:
        with open("/work/solution.py", encoding="utf-8") as f:
            exec(compile(f.read(), "solution.py", "exec"), ns)  # noqa: S102 - learner code, sandboxed container
        with open("/bundle/test_hidden.py", encoding="utf-8") as f:
            exec(compile(f.read(), "test_hidden.py", "exec"), ns)  # noqa: S102
    except Exception:  # report a load failure as every test failing
        msg = traceback.format_exc(limit=3)[-1500:]
        names = open("/bundle/tests.txt", encoding="utf-8").read().split()
        results = [{"test": n, "passed": False, "duration_ms": 0.0, "message": "could not load: " + msg} for n in names]
        print(MARKER + json.dumps({"results": results}))
        return 0
    for name in open("/bundle/tests.txt", encoding="utf-8").read().split():
        start = time.perf_counter()
        try:
            ns[name]()
            results.append({"test": name, "passed": True, "duration_ms": (time.perf_counter() - start) * 1000})
        except Exception as e:
            detail = f"{type(e).__name__}: {e}"[:1500] if str(e) else type(e).__name__
            elapsed = (time.perf_counter() - start) * 1000
            results.append({"test": name, "passed": False, "duration_ms": elapsed, "message": detail})
    print(MARKER + json.dumps({"results": results}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
