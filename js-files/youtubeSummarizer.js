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

async function runYouTubeSummaryWithProgress(url, progressCallback, userPrompt) {
  progressCallback("📥 Fetching transcript...");

  try {
    // Normalize YouTube URL
    const normalizedURL = normalizeURL(url);

    // Download and extract subtitles
    const vttPath = await downloadSubtitles(normalizedURL);
    const transcript = extractVTTText(vttPath);

    if (!transcript || transcript.trim().length < 50) {
      throw new Error("Transcript is too short or missing.");
    }

    progressCallback("🧠 Generating response...");
    const prompt = `${userPrompt}\n\nHere’s the video transcript:\n${transcript}`;

    // askAI is your LLM call (already imported)
    const summary = await askAI(prompt);

    progressCallback("✅ Done!");
    return summary;

  } catch (err) {
    console.error("Error in runYouTubeSummaryWithProgress:", err);
    throw err;
  }
}



module.exports = { runYouTubeSummaryWithProgress, normalizeURL };
