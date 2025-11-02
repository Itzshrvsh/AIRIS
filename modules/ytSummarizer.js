const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const ollama = require("ollama"); // make sure you have this imported

async function summarizeYouTubeVideo(videoUrl) {
  try {
    console.log("🎞 Processing video:", videoUrl);

    // --- Helper: extract YouTube ID ---
    const match = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) throw new Error("Invalid YouTube URL");
    const videoId = match[1];

    const transcriptDir = path.join(__dirname, "transcripts");
    if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir);

    const wavPath = path.join(transcriptDir, `${videoId}.wav`);
    const txtPath = path.join(transcriptDir, `${videoId}.txt`);
    const summaryPath = path.join(transcriptDir, `${videoId}_summary.txt`);

    // --- Step 1: Reuse transcript if it already exists ---
    if (fs.existsSync(summaryPath)) {
      console.log("🗂 Using cached summary.");
      return fs.readFileSync(summaryPath, "utf-8");
    }

    // --- Step 2: Download audio using yt-dlp ---
    // --- Step 2: Download audio using yt-dlp ---
        console.log("⬇️ Downloading and converting audio...");
        await new Promise((resolve, reject) => {
        exec(
            // ensure latest yt-dlp, use JSON output, and re-download if broken
            `yt-dlp && yt-dlp -f "bestaudio" --extract-audio --audio-format wav -o "${wavPath}" "${videoUrl}"`,
            (err, stdout, stderr) => {
            if (err) {
                console.error("yt-dlp error:", stderr || stdout);
                return reject(err);
            }
            resolve(stdout);
            }
        );
        });


    // --- Step 3: Transcribe using Whisper Python script ---
    console.log("🧠 Transcribing audio...");
    await new Promise((resolve, reject) => {
      exec(`python transcriber.py "${wavPath}"`, (err, stdout, stderr) => {
        if (err) reject(stderr || stdout);
        else {
          console.log(stdout);
          resolve();
        }
      });
    });

    if (!fs.existsSync(txtPath)) throw new Error("Transcription file missing");

    // --- Step 4: Summarize using your local model ---
    console.log("🪄 Summarizing transcription...");
    const text = fs.readFileSync(txtPath, "utf-8");

    const summary = await ollama.generate({
      model: "llama3",
      prompt: `Summarize the following YouTube transcript clearly and concisely:\n\n${text}`,
    });

    fs.writeFileSync(summaryPath, summary.response, "utf-8");
    console.log("✅ Summary saved:", summaryPath);

    return summary.response;
  } catch (err) {
    console.error("⚠️ Error in summarizeYouTubeVideo:", err);
    return "Error: " + err.message;
  }
}



module.exports = { summarizeYouTubeVideo };
