import fs from "fs";
import screenshot from "screenshot-desktop";
import fetch from "node-fetch";

async function findElementCoords(elementName = "OK button") {
  try {
    // 1️⃣ Take screenshot
    const imgPath = "./screen.png";
    const imgBuffer = await screenshot({ format: "png" });
    fs.writeFileSync(imgPath, imgBuffer);

    // 2️⃣ Convert image to base64 for LLaVA
    const base64Image = imgBuffer.toString("base64");

    // 3️⃣ Construct the prompt
    const prompt = `
      You are a vision model analyzing a desktop screenshot.
      Locate the "${elementName}" and return only a JSON object 
      with its approximate bounding box coordinates as:
      {"x1": <int>, "y1": <int>, "x2": <int>, "y2": <int>}
      If not found, return {"x1": -1, "y1": -1, "x2": -1, "y2": -1}.
    `.trim();

    // 4️⃣ Send to LLaVA via Ollama API
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llava",
        prompt,
        images: [base64Image],
        stream: false,
      }),
    });

    const data = await res.json();
    const text = data.response || data.output || "";

    console.log("Raw LLaVA output:\n", text);

    // 5️⃣ Extract JSON coordinates using regex
    const jsonMatch = text.match(/\{.*?\}/s);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const coords = JSON.parse(jsonMatch[0]);
    console.log("Detected coordinates:", coords);
    return coords;
  } catch (err) {
    console.error("Error:", err);
    return null;
  }
}

// Example usage
findElementCoords("send button");
