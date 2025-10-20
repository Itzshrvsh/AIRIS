const fs = require('fs');
const path = './data/memory.json';
const { execSync } = require('child_process');

// Utility: Load memory safely
function loadMemory() {
  if (!fs.existsSync(path)) return { chatHistory: [], summaries: {} };
  try {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    // Ensure both keys exist
    if (!data.chatHistory) data.chatHistory = [];
    if (!data.summaries) data.summaries = {};
    return data;
  } catch (e) {
    console.error('⚠️ Memory JSON corrupted, resetting...', e.message);
    return { chatHistory: [], summaries: {} };
  }
}

// Save memory safely
function saveMemory(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// Summarize input into keywords / short form
function summarizeInput(input) {
  if (!input || typeof input !== 'string') return '';
  const lower = input.toLowerCase();
  const parts = lower.match(/\b\w+\b/g) || [];
  return parts.slice(0, 20).join(', '); // max 20 words
}


// Remember input with optional key

function remember(key, value) {
  const memory = loadMemory();
  if (!memory.summaries) memory.summaries = {}; // safe fallback

  const summary = summarizeInput(value);
  if (!key) key = summary;

  memory.summaries[key] = value;

  memory.chatHistory.push({
    time: new Date().toISOString(),
    user: value,
    assistant: null
  });

  saveMemory(memory);
  return summary;
}

// Recall memory intelligently
function recall(keyword) {
  if (!keyword || typeof keyword !== 'string') return null; // guard against undefined/null

  const memory = loadMemory();
  if (!memory.summaries) return null; // prevent undefined errors

  // Exact match
  if (memory.summaries[keyword]) return memory.summaries[keyword];

  // Search through summaries for partial match
  const lowerKeyword = keyword.toLowerCase();
  for (const [k, v] of Object.entries(memory.summaries)) {
    if (!k) continue; // skip undefined keys
    if (typeof k !== 'string') continue; // skip non-string keys
    if (k.toLowerCase().includes(lowerKeyword)) return v;
  }

  return null;
}

// Update chat with assistant response
function logChat(userMessage, assistantMessage) {
  const memory = loadMemory();
  memory.chatHistory.push({
    time: new Date().toISOString(),
    user: userMessage,
    assistant: assistantMessage
  });
  saveMemory(memory);
}

// Smart retrieval + AI response generator (simplified)
function answerFromMemory(userInput) {
  const found = recall(userInput);

  if (found) {
    return `🤖 Sorry about that, I know your ${userInput}… it’s ${found}`;
  }

  return null; // Nothing found, normal AI call continues
}

module.exports = {
  remember,
  recall,
  logChat,
  loadMemory,
  answerFromMemory,
};
