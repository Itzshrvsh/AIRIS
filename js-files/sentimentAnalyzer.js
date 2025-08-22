const fs = require('fs');
const axios = require('axios');

async function analyzeSentiment(text) {
  const isQuestion = /(\?|\bdefine\b|\bexplain\b|\btheorem\b|\bdifference\b|\bcomplexity\b)/i.test(text);

  let prompt;
  if (isQuestion) {
    prompt = `
You are AIRIS, an elite digital assistant. The user is in exam/study mode. 
Your job is to answer the question clearly in one or two lines max.
Do NOT describe what you’re doing. Just give the answer.

Question: "${text}"
    `;
  } else {
    prompt = `
You are AIRIS, an elite assistant. The user is reading/watching something. 
Provide a concise 1–2 line insight about what is on the screen.
No fluff, no generic filler.

Screen text: "${text}"
    `;
  }

  const res = await axios.post("http://localhost:11434/api/generate", {
    model: "llama3",
    prompt,
    stream: false
  });

  const answer = res.data.response.trim();

  // Save only if it's a real exam/study Q
  if (isQuestion) {
    fs.appendFileSync("qa_log.txt", `Q: ${text}\nA: ${answer}\n\n`);
  }

  return answer;
}

module.exports = { analyzeSentiment };
