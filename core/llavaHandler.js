import { analyzeAndStore, fetchMemoryContext } from './memoryManager.js';
import { exec } from 'child_process';

function runLLaVA(prompt) {
  return new Promise((resolve) => {
    let output = '';
    const cmd = `ollama run llava "${prompt.replace(/"/g, '\\"')}"`;
    const proc = exec(cmd);
    proc.stdout.on('data', (chunk) => (output += chunk));
    proc.on('close', () => resolve(output.trim()));
  });
}

export async function askAIRIS(userId, userInput) {
  // 1. Retrieve memory context
  const memoryContext = await fetchMemoryContext(userId, userInput);

  // 2. Inject it into prompt
  const fullPrompt = `
[User's previous context]
- ${memoryContext}

[User says now]
${userInput}

Respond naturally and consider their mood and memory.
`;

  // 3. Ask LLaVA
  const response = await runLLaVA(fullPrompt);

  // 4. Store new memory
  await analyzeAndStore(userId, userInput);
  await analyzeAndStore(userId, response); // optional — so LLaVA remembers what it said

  return response;
}
