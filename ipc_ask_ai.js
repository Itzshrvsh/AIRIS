// ipc_ask_ai.js
const { ipcRenderer } = require('electron');

(async () => {
  const command = process.argv.slice(2).join(' ');
  try {
    const response = await ipcRenderer.invoke('ask-ai', command);
    console.log(JSON.stringify({ type: 'ai', result: response }));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message || err }));
  }
})();




```
System.out.println("Hello World!");
```