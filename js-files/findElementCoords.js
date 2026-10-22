// js-files/findElementCoords.js — locate a UI element's bounding box from a
// screenshot using the central AI vision configuration (js-files/aiConfig.js:
// provider/base URL/key/model resolved from AI Settings, vision override
// supported). Previously ESM in a CommonJS package and hard-coded to Ollama.
const fs = require("fs");
const screenshot = require("screenshot-desktop");
const { generateVisionText } = require("./aiConfig");

async function findElementCoords(elementName = "OK button") {
  try {
    // 1️⃣ Take screenshot
    const imgPath = "./screen.png";
    const imgBuffer = await screenshot({ format: "png" });
    fs.writeFileSync(imgPath, imgBuffer);

    // 2️⃣ Convert image to base64
    const base64Image = imgBuffer.toString("base64");

    // 3️⃣ Construct the prompt
    const prompt = `
      You are a vision model analyzing a desktop screenshot.
      Locate the "${elementName}" and return only a JSON object 
      with its approximate bounding box coordinates as:
      {"x1": <int>, "y1": <int>, "x2": <int>, "y2": <int>}
      If not found, return {"x1": -1, "y1": -1, "x2": -1, "y2": -1}.
    `.trim();

    // 4️⃣ Ask the configured vision model
    const text = await generateVisionText({
      prompt,
      imageBase64: base64Image,
      mimeType: "image/png",
      maxTokens: 200,
    }).catch((err) => {
      console.error("Vision request failed:", err.message);
      return "";
    });

    console.log("Raw vision output:\n", text);

    // 5️⃣ Extract JSON coordinates using regex
    const jsonMatch = String(text).match(/\{.*?\}/s);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const coords = JSON.parse(jsonMatch[0]);
    console.log("Detected coordinates:", coords);
    return coords;
  } catch (err) {
    console.error("Error:", err);
    return null;
  }
}

module.exports = { findElementCoords };

// CLI demo: only runs when invoked directly (node js-files/findElementCoords.js)
if (require.main === module) {
  findElementCoords("send button");
}
