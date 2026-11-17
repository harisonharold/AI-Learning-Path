// Practice-check runner (PLAN D-14). Runs only on SANDBOX_ORIGIN. Accepts messages only from the parent origin
// given in ?parent= (the app sets it; frame-ancestors limits who can embed this page). Results are practice only.
(function () {
  "use strict";
  var parentOrigin;
  try { parentOrigin = new URL(new URLSearchParams(location.search).get("parent") || "").origin; } catch (e) { return; }
  if (!parentOrigin || parentOrigin === "null" || parentOrigin === location.origin) return;

  var worker = null;
  function freshWorker() {
    if (worker) worker.terminate();
    worker = new Worker("/sandbox/worker.js", { type: "module" });
    return worker;
  }
  freshWorker();

  window.addEventListener("message", function (ev) {
    if (ev.origin !== parentOrigin || ev.source !== window.parent) return;
    var m = ev.data;
    if (!m || m.type !== "run" || typeof m.id !== "string" || typeof m.code !== "string") return;
    var timeoutMs = Math.min(Math.max(Number(m.timeoutMs) || 10000, 1000), 30000);
    var w = worker;
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      freshWorker(); // kill the runaway program
      window.parent.postMessage({ type: "result", id: m.id, ok: false, timedOut: true, stdout: "", stderr: "Stopped after " + timeoutMs / 1000 + " s (time limit).", tests: [] }, parentOrigin);
    }, timeoutMs);
    w.onmessage = function (e) {
      if (done || !e.data || e.data.id !== m.id) return;
      done = true;
      clearTimeout(timer);
      window.parent.postMessage(Object.assign({ type: "result" }, e.data), parentOrigin);
    };
    w.postMessage({ id: m.id, code: m.code, tests: typeof m.tests === "string" ? m.tests : null });
  });
  window.parent.postMessage({ type: "ready" }, parentOrigin);
})();
