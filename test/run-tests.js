// test/run-tests.js — aggregates all standalone Node test files.
// Usage: node test/run-tests.js  (also wired as `npm test`)

const { spawn } = require("child_process");
const path = require("path");

const FILES = ["test/aiConfig.test.js", "test/automationPlan.test.js"];

let failures = 0;
async function run(file) {
  return new Promise((resolve) => {
    const exited = spawn(process.execPath, [file], { stdio: "inherit" });
    exited.on("close", (code) => {
      if (code !== 0) {
        failures += 1;
        console.error(`\n[run-tests] ${file} FAILED (exit ${code})`);
      }
      resolve();
    });
    exited.on("error", (err) => {
      failures += 1;
      console.error(`\n[run-tests] could not start ${file}: ${err.message}`);
      resolve();
    });
  });
}

(async () => {
  for (const file of FILES) {
    console.log(`› ${path.basename(file)}`);
    await run(file);
  }
  if (failures) {
    console.error(`\n[run-tests] ${failures} test file(s) failed.`);
    process.exit(1);
  }
  console.log("\n[run-tests] all test files passed.");
})();
