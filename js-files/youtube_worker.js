const fs = require("fs");
const path = require("path");
const ytdl = require("@distube/ytdl-core");
const { spawnSync, execSync } = require("child_process");
const axios = require("axios");

const TRANSCRIPT_DIR = path.join(__dirname, "../transcripts");
const PYTHON_DIR = path.join(__dirname, "../python");

if (!fs.existsSync(TRANSCRIPT_DIR)) fs.mkdirSync(TRANSCRIPT_DIR);
if (!fs.existsSync(PYTHON_DIR)) fs.mkdirSync(PYTHON_DIR);

async function summarizeYouTubeVideo(url) {
  try {
    console.log("🎬 Processing video:", url);
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) throw new Error("Invalid YouTube URL");
    const videoId = match[1];

    const transcriptFile = path.join(TRANSCRIPT_DIR, `${videoId}.txt`);
    const summaryFile = path.join(TRANSCRIPT_DIR, `${videoId}_summary.txt`);
    let transcript;

    // If transcript exists, skip re-transcription
    if (fs.existsSync(transcriptFile)) {
      console.log("💾 Using cached transcript:", transcriptFile);
      transcript = fs.readFileSync(transcriptFile, "utf8");
    } else {
      console.log("⬇️ Downloading and transcribing video...");
      await downloadAndConvertToWav(videoId, url);
      transcript = await runPythonWhisperTranscriber(videoId);

      if (!transcript || transcript.length < 20)
        throw new Error("Transcription failed or empty text returned.");

      fs.writeFileSync(transcriptFile, transcript, "utf8");
      console.log("✅ Transcript saved:", transcriptFile);
    }

    // If summary exists, skip regeneration
    if (fs.existsSync(summaryFile)) {
      console.log("💾 Using cached summary:", summaryFile);
      return fs.readFileSync(summaryFile, "utf8");
    }

    // Summarize using AI (Ollama / local LLM)
    console.log("🧠 Generating summary...");
    const summary = await askAI(
      `Summarize this YouTube video transcript in clear, detailed language:\n\n${transcript.slice(0, 8000)}`
    );

    fs.writeFileSync(summaryFile, summary, "utf8");
    console.log("✅ Summary saved:", summaryFile);

    return summary;

  } catch (err) {
    console.error("❌ Error in summarizeYouTubeVideo:", err.message);
    return "Failed to summarize video.";
  }
}

// === Download and convert audio to WAV ===
// === Download and convert audio to WAV ===
async function downloadAndConvertToWav(videoId, url) {
  const wavPath = path.join(TRANSCRIPT_DIR, `${videoId}.wav`);
  console.log("🎧 Downloading and converting to WAV...");

  try {
    execSync(`yt-dlp -f "bestaudio" --extract-audio --audio-format wav -o "${wavPath}" "${url}"`, {
      stdio: "inherit"
    });
    console.log("✅ Audio ready:", wavPath);
    return wavPath;
  } catch (err) {
    console.error("💥 yt-dlp failed:", err.message);
    throw err;
  }
}


// === Run Python whisper transcriber ===
async function runPythonWhisperTranscriber(videoId) {
  const wavPath = path.join(TRANSCRIPT_DIR, `${videoId}.wav`);
  if (!fs.existsSync(wavPath)) throw new Error("WAV file not found.");

  const sampleWav = path.join(PYTHON_DIR, "sample.wav");
  fs.copyFileSync(wavPath, sampleWav);

  const stopFile = path.join(PYTHON_DIR, "stop.txt");
  if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);

  console.log("🐍 Running Python Whisper transcriber...");
  const pyProcess = spawnSync("python", [path.join(PYTHON_DIR, "transcriber.py")], {
    encoding: "utf8",
    cwd: PYTHON_DIR,
  });

  if (pyProcess.error) throw pyProcess.error;

  const stdout = pyProcess.stdout.trim();
  const stderr = pyProcess.stderr.trim();
  if (stderr) console.error("⚠️ Python stderr:", stderr);

  const lines = stdout.split("\n").map((l) => l.trim());
  const text = lines[lines.length - 1] || "";
  console.log("📝 Transcribed text length:", text.length);
  return text;
}

// === Ask AI for summary ===
async function askAI(prompt) {
  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "llama3",
      prompt,
      stream: false,
    });
    return response.data.response || "No summary generated.";
  } catch (err) {
    console.error("❌ AI generation error:", err.message);
    return "AI summarization failed.";
  }
}

module.exports = { summarizeYouTubeVideo };
