// scripts/test-input-worker.js — safe end-to-end check of the pyautogui
// input worker used as the robotjs fallback. Only ZERO-displacement mouse
// ops are performed (cursor moves to its own current position), and no keys
// are typed — the user's desktop is untouched.
const { spawn } = require("child_process");
const path = require("path");

const p = spawn("python", [path.join("python", "input_worker.py")], { windowsHide: true });
let out = "";

const finish = (code, extra) => {
  console.log(extra || "");
  try { p.kill(); } catch {}
  process.exitCode = code;
  p.on("close", () => process.exit(process.exitCode));
};

p.stderr.on("data", (d) => console.error("stderr:", String(d).slice(0, 300)));
p.stdout.on("data", (d) => (out += d));
p.on("close", () => process.exit(process.exitCode || 0));

setTimeout(() => {
  console.error("TIMEOUT — worker did not complete the scripted ops");
  finish(1);
}, 12000);

// 1) handshake
// 2) getPosition → 3) moveMouse to exactly that point (no net move)
// 4) keyTap list check happens JS-side (unit), not here (won't type).
function parsedLines() {
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

const tick = setInterval(() => {
  const msgs = parsedLines();
  if (!msgs.some((m) => m.op === "ready")) return;
  const pos = msgs.find((m) => typeof m.x === "number");
  if (!pos && msgs.length >= 1) {
    if (!msgs.some((m) => m.id === 1)) p.stdin.write(`${JSON.stringify({ op: "getPosition", id: 1 })}\n`);
    return;
  }
  if (pos && !msgs.some((m) => m.id === 99)) {
    console.log("cursor at", pos.x, pos.y, "— requesting zero-displacement move...");
    p.stdin.write(`${JSON.stringify({ op: "moveMouse", x: pos.x, y: pos.y, id: 99 })}\n`);
    return;
  }
  const ack = msgs.find((m) => m.id === 99);
  if (ack && ack.ok) {
    clearInterval(tick);
    finish(0, "✅ input worker moveMouse ack OK (no net cursor displacement)");
  } else if (ack && ack.ok === false) {
    clearInterval(tick);
    finish(1, `❌ moveMouse failed: ${ack.error}`);
  }
}, 150);
