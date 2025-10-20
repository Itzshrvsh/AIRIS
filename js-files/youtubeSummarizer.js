const fs = require("fs");
const { exec } = require("child_process");
const { askAI } = require("./aiRequest");

function normalizeURL(url) {
  if (url.includes("youtu.be/")) {
    const id = url.split("youtu.be/")[1].split("?")[0];
    return `https://www.youtube.com/watch?v=${id}`;
  }
  return url;
}

function extractVTTText(vttPath) {
  const vttData = fs.readFileSync(vttPath, "utf8");
  return vttData
    .split("\n")
    .filter(line => line && !line.includes("-->") && isNaN(line))
    .join(" ");
}

function downloadSubtitles(url) {
  return new Promise((resolve, reject) => {
    const cmd = `yt-dlp --write-auto-sub --sub-lang en --skip-download -o "ytvideo.%(ext)s" "${url}"`;
    exec(cmd, (err) => {
      if (err) return reject(err);
      const vttPath = "ytvideo.en.vtt";
      if (!fs.existsSync(vttPath)) return reject("Subtitle file not found");
      resolve(vttPath);
    });
  });
}

async function runYouTubeSummaryWithProgress(url, progressCallback) {
  url = normalizeURL(url);
  progressCallback?.("📥 Downloading subtitles…");
  const vttPath = await downloadSubtitles(url);

  progressCallback?.("📄 Extracting text from subtitles…");
  const rawText = extractVTTText(vttPath);

  const chunkSize = 2000;
  const chunks = [];
  for (let i = 0; i < rawText.length; i += chunkSize) {
    chunks.push(rawText.slice(i, i + chunkSize));
  }

  const chunkSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    progressCallback?.(`📝 Summarizing chunk ${i + 1} of ${chunks.length}…`);
    const summary = await askAI(`Summarize this snippet clearly:\n\n${chunks[i]}`);
    chunkSummaries.push(summary);
  }

  progressCallback?.("🔗 Combining chunk summaries…");
  const fullSummary = await askAI(`Combine into a clear summary:\n\n${chunkSummaries.join("\n\n")}`);
  const shortSummary = await askAI(`Make a punchy one-line summary:\n\n${fullSummary}`);

  fs.writeFileSync("youtube_summary.txt", fullSummary, "utf8");

  return { full: fullSummary, short: shortSummary };
}

module.exports = { runYouTubeSummaryWithProgress, normalizeURL };
