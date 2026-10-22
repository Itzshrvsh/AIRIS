// js-files/appLauncher.js — resolves user app names to launchable targets.
//
// The old NEURALIS flow sent the raw AI answer straight into
// `start "" "<name>"`, which only works for apps registered on PATH.
// This module makes launching robust and testable (no Electron imports):
//
//   normalizeRequest()  — strip filler words from "open the spotify please"
//   scoreName()         — fuzzy score of a candidate against the target
//   scanStartMenu()     — collect .lnk/.exe entries from Start Menu folders
//   pickBestCandidate() — best Start-Menu match (returns null when unsure)
//   buildLaunchCommand()— cmd.exe command for the resolved target
//
// Windows paths only; every function is pure except scanStartMenu's fs use.

const fs = require("fs");
const path = require("path");
const stringSimilarity = require("string-similarity");

// ─── Filler words stripped from voice/chat requests ────────────────
const FILLER = /\b(please|can you|could you|would you|kindly|just|now)\b/gi;
const OPEN_WORDS = /^(open|launch|start|run|go to|show me|set up|bring up)\s+/i;
const TRAILING = /^(?:the|a|an|my)\s+|\s+(?:app|application|program|window)$/gi;

function normalizeRequest(text) {
  let t = String(text ?? "")
    .replace(FILLER, " ")
    .replace(/[.!?]+$/, "")
    .trim();
  // Words like "open" may appear anywhere ("can you open spotify") but the
  // first word is almost always the verb, so only strip from the start.
  while (OPEN_WORDS.test(t)) t = t.replace(OPEN_WORDS, "").trim();
  t = t.replace(/["']/g, "").trim();
  // Drop leading articles and a trailing generic noun ("calculator app").
  t = t
    .replace(/^(?:the|a|an|my)\s+/i, "")
    .replace(/\s+(?:app|application|program|window)$/i, "")
    .trim();
  return t.toLowerCase();
}

// ─── Known aliases: friendly name → Start Menu title / exe hint ─────
const KNOWN_ALIASES = {
  spotify: "spotify",
  chrome: "chrome",
  "google chrome": "chrome",
  opera: "opera",
  "opera gx": "opera gx",
  edge: "edge",
  "microsoft edge": "edge",
  vscode: "visual studio code",
  "visual studio code": "visual studio code",
  code: "visual studio code",
  notepad: "notepad",
  notepadpp: "notepad++",
  "notepad++": "notepad++",
  calculator: "calculator",
  calc: "calculator",
  word: "word",
  excel: "excel",
  powerpoint: "powerpoint",
  outlook: "outlook",
  teams: "teams",
  discord: "discord",
  steam: "steam",
  telegram: "telegram",
  whatsapp: "whatsapp",
  cmd: "cmd",
  powershell: "powershell",
  git: "git bash",
  explorer: "file explorer",
  taskmgr: "task manager",
  "task manager": "task manager",
  settings: "settings",
};

// ─── Fuzzy scoring ─────────────────────────────────────────────────
function scoreName(name, target) {
  const n = String(name ?? "").toLowerCase();
  const t = String(target ?? "").toLowerCase();
  if (!n || !t) return 0;

  let score = stringSimilarity.compareTwoStrings(n, t); // 0..1
  if (n === t) return 1;
  if (n.startsWith(t)) score = Math.max(score, 0.92);
  if (n.includes(t)) score = Math.max(score, 0.85);
  if (t.includes(n)) score = Math.max(score, 0.8);
  // File-name words, e.g. "Google Chrome" vs target "chrome"
  const words = n.split(/[\s\-_.+()]+/).filter(Boolean);
  if (words.some((w) => w === t)) score = Math.max(score, 0.9);
  return score;
}

// ─── Start Menu scanning ───────────────────────────────────────────
const LINK_EXT_RE = /\.(lnk|exe)$/i;

function scanStartMenu(dirs, { maxEntries = 4000 } = {}) {
  const found = [];
  const stack = [...new Set(dirs.filter(Boolean))];

  while (stack.length && found.length < maxEntries) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // missing/unreadable folder is normal
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && LINK_EXT_RE.test(e.name)) {
        found.push({
          name: path.basename(e.name).replace(LINK_EXT_RE, ""),
          path: full,
        });
      }
    }
  }
  return found;
}

const CONFIDENT_MATCH = 0.55; // below this the AI/open-map path is safer

function pickBestCandidate(target, candidates) {
  const best = { score: 0, match: null };
  for (const c of candidates) {
    let s = scoreName(c.name, target);
    // Bonus when the folder hint matches (e.g. ...\Spotify\Spotify.exe)
    if (!s && c.path) s = scoreName(path.basename(path.dirname(c.path)), target);
    if (s > best.score) {
      best.score = s;
      best.match = c;
    }
  }
  if (!best.match || best.score < CONFIDENT_MATCH) return null;
  return best.match;
}

// ─── Launch command builders (pure — caller decides how to exec) ────
function isHttpTarget(target) {
  return /^(https?:\/\/|www\.)\S+$/i.test(String(target ?? "").trim());
}

function buildLaunchCommand(target, resolved = null) {
  const t = String(target ?? "").trim();
  if (isHttpTarget(t)) {
    const url = /^www\./i.test(t) ? `https://${t}` : t;
    return `start "" "${quoteSafe(url)}"`;
  }
  if (resolved && resolved.path) {
    return `start "" "${quoteSafe(resolved.path)}"`;
  }
  // Last resort: let Windows resolve a registered app name.
  return `start "" "${quoteSafe(t)}"`;
}

function quoteSafe(s) {
  return String(s ?? "").replace(/"/g, "");
}

module.exports = {
  FILLER,
  KNOWN_ALIASES,
  CONFIDENT_MATCH,
  normalizeRequest,
  scoreName,
  scanStartMenu,
  pickBestCandidate,
  isHttpTarget,
  buildLaunchCommand,
  quoteSafe,
};
