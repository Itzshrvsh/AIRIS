const axios = require("axios");

async function askAI(prompt, onChunk) {
  try {
    const response = await axios({
      method: "post",
      url: "http://localhost:11434/api/generate",
      data: {
        model: "llava", // or mistral for faster text
        prompt,
        stream: true,
      },
      responseType: "stream",
    });

    return new Promise((resolve) => {
      let fullResponse = "";

      response.data.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.response) {
              fullResponse += json.response;
              if (onChunk) onChunk(json.response);
            }
          } catch {
            // ignore partial JSON lines
          }
        }
      });

      const finalize = () => resolve(fullResponse);
      response.data.on("end", finalize);
      response.data.on("close", finalize);
      response.data.on("error", finalize);
    });
  } catch (err) {
    console.error("[🔥 AI Error]:", err.message);
    return "⚠️ AI unavailable.";
  }
}

module.exports = { askAI };
