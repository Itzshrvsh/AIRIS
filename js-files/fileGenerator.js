const fs = require('fs');
const path = require('path');
const os = require('os');
function saveCodeToDesktop(code, language, filename = "Generated") {
  const extMap = {
    javascript: 'js',
    js: 'js',
    py: 'py',
    python: 'py',
    html: 'html',
    c: 'c',
    cpp: 'cpp',
    asm: 'asm',
    nasm: 'asm',
    java: 'java',
    txt: 'txt',
  };

  const ext = extMap[String(language).toLowerCase()] || 'txt';
  const fullFilename = `${filename}.${ext}`;

  // Older code crashed here when ~/Downloads was missing (it referenced an
  // undefined variable via writeFileSync with {recursive}). Use mkdirSync.
  const outputDir = path.join(os.homedir(), 'Downloads');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, fullFilename);
  fs.writeFileSync(outputPath, code, 'utf8');
  return outputPath;
}

module.exports = { saveCodeToDesktop };
