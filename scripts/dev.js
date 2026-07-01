const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';

function run(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, ...extraEnv },
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

const server = run('server', 'node', ['server.js'], { PORT: process.env.PORT || '3000' });
const client = run('client', 'npx', ['vite', '--host', '0.0.0.0'], {});

function shutdown() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
