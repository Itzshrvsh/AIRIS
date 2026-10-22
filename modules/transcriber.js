// modules/transcriber.js — YouTube summarization via the central AI config.
//
// Summary step: uses the central configuration (provider/base URL/API key +
// summarizer model, falling back to the main model) — see js-files/aiConfig.js.
// Transcription step: tries the OpenAI-compatible /audio/transcriptions
// endpoint (supported by LM Studio and friends with a whisper model loaded),
// then falls back to AIRIS's legacy Ollama-native shape for old setups.

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { generateText, getActiveConfig, buildEndpointURL, resolveFeatureModel, normalizeBaseURL } = require("../js-files/aiConfig");

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

// ─── Transcription ───────────────────────────────────────────────────────

async function transcribeAudio(filePath) {
  if (!fs.existsSync(filePath)) return "No transcript found";
  const audioBuffer = fs.readFileSync(filePath);

  // 1) OpenAI-compatible transcription (POST {baseURL}/audio/transcriptions)
  try {
    const config = getActiveConfig();
    const model = resolveFeatureModel("transcription", config);
    const url = buildEndpointURL(config.baseURL, "/audio/transcriptions");
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), path.basename(filePath));
    form.append("model", model);
    const headers = {};
    if (config.apiKey && config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    const res = await axios.post(url, form, { headers, timeout: config.timeoutMs || 120000, maxBodyLength: Infinity });
    const text = res.data?.text || res.data?.response || "";
    if (String(text).trim()) return String(text).trim();
    console.warn("⚠️ Transcription endpoint returned no text; trying legacy route...");
  } catch (err) {
    console.warn("⚠️ OpenAI-compatible transcription unavailable:", err.response?.status || err.message || err);
  }

  // 2) Legacy Ollama-native attempt (old AIRIS behaviour, kept for fallback)
  try {
    const config = getActiveConfig();
    const base = normalizeBaseURL(config.baseURL);
    const ollamaHost = base.replace(/\/v1$/i, "");
    const model = resolveFeatureModel("transcription", config) || "whisper";
    const resp = await axios.post(
      `${ollamaHost}/api/generate`,
      { model, input: audioBuffer.toString("base64") },
      { timeout: config.timeoutMs || 120000 }
    );
    return resp.data.output_text || "No transcript found";
  } catch (err) {
    console.error("⚠️ Legacy transcription failed:", err.response?.status || err.message || err);
    return "No transcript found";
  }
}

// ─── Summarization (central AI config) ───────────────────────────────────

async function summarizeText(text) {
  const transcript = String(text || "").trim();
  if (!transcript || transcript === "No transcript found") {
    return "No transcript found";
  }
  try {
    const summary = await generateText(
      `Summarize this transcript briefly:\n${transcript.slice(0, 8000)}`,
      { feature: "summarizer", maxTokens: 500 }
    );
    return String(summary || "").trim() || "No summary found";
  } catch (err) {
    console.error("⚠️ AI summarization error:", err.message || err);
    return "AI summarization failed.";
  }
}

module.exports = { summarizeYouTubeVideo };
