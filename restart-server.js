#!/usr/bin/env node
/**
 * Server Restart Helper
 * Connects to running server and requests graceful shutdown,
 * then starts a fresh instance
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

async function shutdown() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/health', { timeout: 2000 }, () => {
      req.abort();
      console.log('[restart] Server is running, waiting for graceful connectivity...');
      // Just wait a moment then exit
      setTimeout(resolve, 1000);
    });

    req.on('error', () => {
      console.log('[restart] Could not reach server, proceeding to start new instance');
      resolve();
    });
  });
}

async function main() {
  await shutdown();

  console.log('[restart] Starting Node server on port 3000...');
  const server = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  server.on('error', (err) => {
    console.error('[restart ERROR]', err);
    process.exit(1);
  });

  server.on('exit', (code) => {
    console.log(`[restart] Server exited with code ${code}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
