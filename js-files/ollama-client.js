// js-files/ollama-client.js — LEGACY spawn-based Ollama helper.
// Historically ran the `ollama run llava` CLI. It now defers the model id
// to the central AI configuration (data/ai-config.json, see
// js-files/aiConfig.js) so the CLI always matches what AI Settings shows.
// Note: this CLI path only works while the configured provider is a local
// Ollama install; other providers should use the standard client (aiConfig.chat).
const { spawn } = require('child_process');
const { readConfig } = require('./aiConfig');

function askOllama(prompt, callback) {
  let model;
  try {
    model = readConfig().model;
  } catch {
    model = undefined; // config unreadable → let the CLI default decide
  }

  const ollama = model && String(model).trim() ? spawn('ollama', ['run', String(model).trim()]) : spawn('ollama', ['run']);

  let response = '';
  ollama.stdout.on('data', (data) => response += data.toString());

  ollama.stderr.on('data', (data) => console.error('Ollama error:', data.toString()));

  ollama.on('close', () => {
    callback(response);
  });

  ollama.stdin.write(prompt + '\n');
  ollama.stdin.end();
}

module.exports = { askOllama };
