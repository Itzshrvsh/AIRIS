const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function summarizeYouTubeVideo(videoUrl) {
  try {
    console.log("🎬 Processing video:", videoUrl);
    const videoId = videoUrl.match(/(?:v=|\.be\/)([^&\n?#]+)/)?.[1];
    if (!videoId) throw new Error("Invalid YouTube URL");

    const outputPath = path.join(process.cwd(), "modules", "transcripts", `${videoId}.wav`);

    console.log("🎧 Downloading and converting audio...");
    await execPromise(`yt-dlp -f "bestaudio" --extract-audio --audio-format wav -o "${outputPath}" "${videoUrl}"`);

    if (!fs.existsSync(outputPath)) throw new Error("WAV file not created");

    console.log("🧠 Transcribing audio...");
    const transcript = await transcribeAudio(outputPath);

    console.log("📝 Summarizing...");
    const summary = await summarizeText(transcript);

    console.log("\nSUMMARY:\n", summary);
    return summary;
  } catch (err) {
    console.error("⚠️ Error in summarizeYouTubeVideo:", err);
    return { error: err.message };
  }
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("yt-dlp error:", stderr);
        reject(error);
      } else resolve(stdout);
    });
  });
}

async function transcribeAudio(filePath) {
  const resp = await axios.post("http://localhost:11434/api/generate", {
    model: "whisper",
    input: fs.readFileSync(filePath).toString("base64"),
  });
  return resp.data.output_text || "No transcript found";
}

async function summarizeText(text) {
  const resp = await axios.post("http://localhost:11434/api/generate", {
    model: "mistral",
    prompt: `Summarize this transcript briefly:\n${text}`,
  });
  return resp.data.output_text || "No summary found";
}

module.exports = { summarizeYouTubeVideo };
