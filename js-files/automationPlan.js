// js-files/automationPlan.js — NEURALIS plan-and-execute desktop automation.
//
// Technique upgrade over the old one-shot flows: instead of trusting a free
// text blob or one hardcoded eyeball sequence, NEURALIS now asks the AI for a
// typed ACTION PLAN (JSON) built only from audited primitive steps, then
// executes it step-by-step with streaming progress, per-step validation and
// an abort switch.
//
// This file holds the pure, Electron-free parts so they run in plain tests:
//   parsePlan(rawText)   — extract/parse the model's JSON reply
//   validatePlan(plan)   — schema checks + policy limits + deny list
//   executePlan(...)     — generic stepper (runners injected by the caller)
//
// The Electron live runners (robot, exec, clipboard) live in index.js.

const MAX_STEPS = 20;
const MAX_TYPE_CHARS = 3000;
const MAX_PASTE_CHARS = 20000; // clipboard paste can carry long bodies
const MAX_WAIT_MS = 20000;
const MAX_COMMAND_CHARS = 400;

// Actions NEURALIS is allowed to plan. Anything else is rejected.
const ACTION_TYPES = [
  "open",     // launch an app name / URL
  "wait",     // sleep ms
  "hotkey",   // press a chord: keys:["control","t"]
  "press",    // press one key: "enter", "tab", ...
  "type",     // type text via keyboard
  "paste",    // put text on the clipboard and Ctrl+V (safe for long text)
  "say",      // narrate progress to the user (no system effect)
  "command",  // run one cmd.exe command — policy-checked, terse
];

// Destructive patterns never executed, even if the model emits them.
const COMMAND_DENY_RE =
  /(\bformat\b|\bdiskpart\b|\bdel\s+\/[sfq]|\brd\s+\/s|\bremove-item\b.*-recurse|\bshutdown\b|\brestart-computer\b|\bstop-computer\b|\bbcdedit\b|\bbcedit\b|\breg(\.exe)?\s+(delete|add|import)\b|\bschtasks\b|\btaskkill\s+\/f\b|system32|cipher\s+\/w|\bvssadmin\b|mkfs|dd\s+if=)/i;

class PlanError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanError";
  }
}

// ─── Parse the model's reply into a plan object ──────────────────────
function parsePlan(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new PlanError("The planner returned an empty answer.");
  }
  // Prefer a direct parse; fall back to the first {...} block (fences or
  // chatter tolerated).
  let obj;
  try {
    obj = JSON.parse(rawText);
  } catch {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new PlanError("The planner did not return JSON.");
    }
    try {
      obj = JSON.parse(rawText.slice(start, end + 1));
    } catch {
      throw new PlanError("The planner's JSON could not be parsed.");
    }
  }

  // Accept both {"steps":[...]} and a bare [...] (models vary).
  if (Array.isArray(obj)) obj = { steps: obj };
  if (!Array.isArray(obj?.steps)) {
    throw new PlanError('The plan is missing a "steps" array.');
  }
  return obj;
}

// ─── Validate + normalize a parsed plan against policy ───────────────
function str(x) { return String(x ?? ""); }
function isPlainArray(x) { return Array.isArray(x); }

function checkDenyList(command) {
  const cmd = str(command).trim();
  if (!cmd) throw new PlanError("command step is empty");
  if (cmd.length > MAX_COMMAND_CHARS) {
    throw new PlanError(`command step too long (${cmd.length} > ${MAX_COMMAND_CHARS})`);
  }
  if (COMMAND_DENY_RE.test(cmd)) {
    throw new PlanError(`command rejected by safety policy: "${cmd.slice(0, 80)}"`);
  }
  return cmd;
}

function validateStep(step, index) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new PlanError(`step ${index + 1} is not an object`);
  }
  const action = str(step.action).toLowerCase().trim();
  if (!ACTION_TYPES.includes(action)) {
    throw new PlanError(`step ${index + 1}: unknown action "${step.action}"`);
  }

  const out = { action };

  if (action === "open") {
    const target = str(step.target ?? step.app ?? step.url).trim();
    if (!target) throw new PlanError(`step ${index + 1}: open needs a target`);
    if (target.length > 200) throw new PlanError(`step ${index + 1}: open target too long`);
    out.target = target;
  } else if (action === "wait") {
    let ms = Number(step.ms ?? step.seconds ?? 1000);
    if (Number.isFinite(step.seconds)) ms = step.seconds * 1000;
    if (!Number.isFinite(ms) || ms < 0) throw new PlanError(`step ${index + 1}: wait needs ms >= 0`);
    out.ms = Math.min(Math.round(ms), MAX_WAIT_MS);
    if (out.ms === 0) out.ms = 100;
  } else if (action === "hotkey") {
    const keys = isPlainArray(step.keys) ? step.keys : str(step.keys).split(/[+\-\s]+/);
    const clean = keys.map(str).map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!clean.length || clean.length > 4) {
      throw new PlanError(`step ${index + 1}: hotkey needs 1-4 keys`);
    }
    if (!clean.every((k) => /^[a-z0-9]+$/i.test(k))) {
      throw new PlanError(`step ${index + 1}: hotkey keys must be simple names`);
    }
    out.keys = clean.slice(0, 4);
  } else if (action === "press") {
    const key = str(step.key ?? step.keys).trim().toLowerCase();
    if (!key || !/^[a-z0-9]+$/.test(key)) {
      throw new PlanError(`step ${index + 1}: press needs a single key name`);
    }
    out.key = key;
  } else if (action === "type" || action === "paste") {
    const text = str(step.text);
    if (!text.trim()) throw new PlanError(`step ${index + 1}: ${action} needs text`);
    const cap = action === "paste" ? MAX_PASTE_CHARS : MAX_TYPE_CHARS;
    if (text.length > cap) {
      throw new PlanError(`step ${index + 1}: text too long (>${cap} chars)`);
    }
    out.text = text;
  } else if (action === "say") {
    const text = str(step.text ?? step.message).trim();
    if (text) out.text = text.slice(0, 200);
    else return null; // a "say" with no text is dropped, not an error
  } else if (action === "command") {
    out.command = checkDenyList(step.command ?? step.cmd);
  }

  return out;
}

function validatePlan(parsed) {
  const steps = [];
  const source = parsed.steps;
  if (source.length > MAX_STEPS) {
    throw new PlanError(`plan too long (${source.length} > ${MAX_STEPS} steps)`);
  }
  for (let i = 0; i < source.length; i++) {
    const clean = validateStep(source[i], i);
    if (clean) steps.push(clean);
  }
  if (!steps.length) throw new PlanError("plan has no executable steps");
  return { n: steps.length, steps };
}

// ─── Generic executor. inject() supplies the real primitives: ────────
//   runners: { open(target), wait(ms), hotkey(keys), press(key),
//              type(text), paste(text), say(text), command(cmd) }
//   isAborted() → boolean, checked between steps
//   onResult({index, step, ok, detail}) → streams progress
async function executePlan(plan, { runners, isAborted, onResult }) {
  if (!runners) throw new PlanError("executePlan needs runners");
  const report = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (isAborted && isAborted()) {
      const aborted = { index: i, step, ok: false, detail: "aborted by user" };
      report.push(aborted);
      onResult && onResult(aborted);
      return { ok: false, aborted: true, results: report };
    }
    let ok = false, detail = "";
    try {
      const fn = runners[step.action];
      if (typeof fn !== "function") throw new PlanError(`no runner for "${step.action}"`);
      detail = await fn(step);
      ok = true;
    } catch (err) {
      ok = false;
      detail = err.message || String(err);
    }
    const res = { index: i, step, ok, detail };
    report.push(res);
    onResult && onResult(res);
    if (!ok) return { ok: false, aborted: false, results: report };
  }
  return { ok: true, aborted: false, results: report };
}

module.exports = {
  PlanError,
  ACTION_TYPES,
  COMMAND_DENY_RE,
  MAX_STEPS,
  MAX_TYPE_CHARS,
  MAX_PASTE_CHARS,
  MAX_WAIT_MS,
  MAX_COMMAND_CHARS,
  parsePlan,
  validatePlan,
  executePlan,
};
