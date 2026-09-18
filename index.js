// Entry point for Render (start command: node index.js).
// Ensures the TypeScript server is compiled, then starts it.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const distServer = path.join(__dirname, 'dist', 'server.js');

if (!fs.existsSync(distServer)) {
  console.log('dist/server.js not found — building TypeScript...');
  execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
}

require(distServer);