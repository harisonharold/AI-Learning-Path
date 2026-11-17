// Module worker: loads self-hosted Pyodide and runs learner code plus optional public practice tests.
import { loadPyodide } from "/sandbox/pyodide/pyodide.mjs";

const ready = loadPyodide({ indexURL: "/sandbox/pyodide/" });

const HARNESS = `
import traceback as _tb
_results = []
for _name, _fn in list(globals().items()):
    if _name.startswith("test_") and callable(_fn):
        try:
            _fn()
            _results.append((_name, True, ""))
        except AssertionError as _e:
            _results.append((_name, False, "AssertionError: " + str(_e)))
        except Exception as _e:
            _results.append((_name, False, type(_e).__name__ + ": " + str(_e)))
_results
`;

self.onmessage = async (ev) => {
  const { id, code, tests } = ev.data || {};
  let stdout = "";
  let stderr = "";
  try {
    const py = await ready;
    py.setStdout({ batched: (s) => { if (stdout.length < 100000) stdout += s + "\n"; } });
    py.setStderr({ batched: (s) => { if (stderr.length < 100000) stderr += s + "\n"; } });
    const ns = py.globals.get("dict")();
    await py.runPythonAsync(code, { globals: ns });
    let results = [];
    if (tests) {
      await py.runPythonAsync(tests, { globals: ns });
      const out = await py.runPythonAsync(HARNESS, { globals: ns });
      results = out.toJs().map(([name, passed, message]) => ({ name, passed, message }));
      out.destroy();
    }
    ns.destroy();
    self.postMessage({ id, ok: true, stdout, stderr, tests: results });
  } catch (e) {
    self.postMessage({ id, ok: false, stdout, stderr: stderr + String(e && e.message ? e.message : e), tests: [] });
  }
};
