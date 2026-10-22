// scripts/restore-tracked-file.js — byte-exact restore of a file from a git
// revision into the working tree (bypasses any shell/PowerShell encoding).
// Usage: node scripts/restore-tracked-file.js <revision> <path>
const { spawnSync } = require("child_process");
const fs = require("fs");

const [, , revision, file] = process.argv;
if (!revision || !file) {
  console.error("usage: node scripts/restore-tracked-file.js <revision> <path>");
  process.exit(2);
}

const res = spawnSync("git", ["show", `${revision}:${file}`], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
if (res.error || res.status !== 0) {
  console.error("git show failed:", res.error || String(res.stderr));
  process.exit(1);
}

const before = fs.existsSync(file) ? fs.statSync(file).size : 0;
fs.writeFileSync(file, res.stdout);
const after = fs.statSync(file).size;
console.log(`restored ${file}: ${before} -> ${after} bytes`);
process.exit(after === res.stdout.length ? 0 : 1);
