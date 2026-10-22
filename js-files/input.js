// js-files/input.js — robotjs-compatible input control with a Python
// fallback backend.
//
// `robotjs` (2017-era native module) needs the ClangCL MSVC toolset to
// build against modern Electron; without it the whole app fails to start
// (it `require()`s robotjs at the top). This module keeps the native module
// when available and otherwise provides the SAME API implemented over a
// single persistent pyautogui worker (python/input_worker.py). Just require
// it instead of "robotjs":
//
//     const robot = require("./js-files/input").robot;
//
const { spawn } = require("child_process");
const path = require("path");

const DEFAULT_DELAY_MS = 50;

function createPythonRobot() {
  let worker = null;
  let alive = false;
  let reqId = 0;
  let sendError = null;
  let lastMouse = { x: 0, y: 0 };

  function log(...args) {
    console.log("[input-bridge]", ...args);
  }

  function ensureWorker() {
    if (worker && alive) return worker;
    const script = path.join(__dirname, "..", "python", "input_worker.py");
    worker = spawn("python", [script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    alive = true;
    sendError = null;

    worker.stdout.setEncoding("utf8");
    let buffer = "";
    worker.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        if (!raw.trim()) continue;
        try {
          const msg = JSON.parse(raw);
          if (msg.op === "ready") {
            alive = true;
            log("pyautogui worker ready");
          } else if (msg.op === undefined && typeof msg.x === "number") {
            lastMouse = { x: msg.x, y: msg.y };
          } else if (msg.ok === false && msg.error) {
            log("worker error:", msg.error.slice(0, 200));
          }
        } catch {
          /* non-JSON noise (e.g. pyautogui warnings) */
        }
      }
    });
    worker.stderr.setEncoding("utf8");
    worker.stderr.on("data", (d) => log("stderr:", String(d).slice(0, 300).trim()));
    worker.on("exit", () => {
      alive = false;
      log("worker exited — next call restarts it");
    });
    return worker;
  }

  function send(payload) {
    const id = ++reqId;
    try {
      const child = ensureWorker();
      child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
      return id;
    } catch (err) {
      if (!sendError) {
        sendError = err.message;
        log("send failed:", err.message);
      }
      return null;
    }
  }

  // Electron's screen module gives us the true cursor instantly — far better
  // than an IPC roundtrip for index.js's 60 ms tracking timer.
  function getMousePos() {
    try {
      const { screen } = require("electron");
      if (screen && typeof screen.getCursorScreenPoint === "function") {
        const p = screen.getCursorScreenPoint();
        lastMouse = { x: p.x, y: p.y };
        return lastMouse;
      }
    } catch {
      /* not in the main process — fall back to cached position */
    }
    return lastMouse;
  }

  const robot = {
    __backend: "python",
    getMousePos,
    setKeyboardDelay: (delay = DEFAULT_DELAY_MS) => send({ op: "setKeyboardDelay", delay }),
    keyTap: (key, ...mods) => send({ op: "keyTap", key, mods: mods.filter(Boolean) }),
    keyDown: (key) => send({ op: "keyDown", key }),
    keyUp: (key) => send({ op: "keyUp", key }),
    typeString: (text) => send({ op: "typeString", text: String(text ?? "") }),
    typeStringDelayed: (text, delay = 120) => send({ op: "typeStringDelayed", text: String(text ?? ""), delay }),
    moveMouse: (x, y) => {
      lastMouse = { x, y };
      return send({ op: "moveMouse", x, y: Math.max(0, y) });
    },
    moveMouseSmooth: (x, y, speed) => send({ op: "moveMouseSmooth", x, y: Math.max(0, y), speed }),
    mouseClick: (button = "left", double = false) => send({ op: "mouseClick", button, double }),
    dragMouse: (x, y) => send({ op: "dragMouse", x, y: Math.max(0, y) }),
    scroll: (dx = 0, dy = 0) => send({ op: "scroll", dx, dy }),
  };

  return robot;
}

function createNativeRobot(nativeModule) {
  return new Proxy(nativeModule, {
    get(target, prop) {
      if (prop === "__backend") return "robotjs";
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Prefer the native robotjs build; fall back to the pyautogui worker. */
function resolveRobot() {
  try {
    const native = require("robotjs");
    if (native && typeof native.getMousePos === "function" && typeof native.keyTap === "function") {
      return createNativeRobot(native);
    }
    throw new Error("robotjs exports incomplete");
  } catch (err) {
    const reason = err && err.code === "MODULE_NOT_FOUND" ? "not built/installed" : err.message;
    console.warn(
      `[input] ⚠️ native robotjs unavailable (${reason}) — using the pyautogui input worker. ` +
      "Install the ClangCL component of VS Build Tools and run " +
      "`npx electron-rebuild -f -w robotjs` to restore the native backend."
    );
    return createPythonRobot();
  }
}

module.exports = { robot: resolveRobot(), createPythonRobot, resolveRobot };
