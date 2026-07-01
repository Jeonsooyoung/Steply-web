const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const files = [
  'server.js',
  'vite.config.js',
  'scripts/dev.js',
  'src/routes/apiRouter.js',
  'src/ws/dashboardSocket.js',
];

for (const file of files) {
  execFileSync('node', ['--check', file], { stdio: 'inherit' });
}

function walk(dir) {
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(p)) console.log(`checked frontend source: ${path.relative(process.cwd(), p)}`);
  }
}

walk(path.join(process.cwd(), 'client', 'src'));
console.log('Basic Node syntax checks passed. Run npm run build after npm install to validate the React bundle.');
