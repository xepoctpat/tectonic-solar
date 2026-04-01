#!/usr/bin/env node
/**
 * Friendly local launcher for Space-Earth Monitor.
 * - Reuses an already-running local server when available
 * - Starts the Node proxy server when needed
 * - Opens the browser automatically unless --no-open is passed
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 3000;
const appUrl = `http://localhost:${port}`;
const shouldOpenBrowser = !process.argv.includes('--no-open');
const startupTimeoutMs = 20000;
let shuttingDown = false;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function probeApp() {
  return new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/',
      method: 'GET',
      timeout: 1500,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        resolve(res.statusCode === 200 && body.includes('Space-Earth Monitor'));
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForAppReady(timeoutMs = startupTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeApp()) {
      return true;
    }
    await delay(500);
  }
  return false;
}

function openBrowser(url) {
  if (!shouldOpenBrowser) {
    console.log(`[launch] Browser auto-open disabled. Visit ${url}`);
    return;
  }

  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    console.warn(`[launch] Could not auto-open browser: ${error.message}`);
    console.log(`[launch] Open ${url} manually.`);
  }
}

async function main() {
  if (await probeApp()) {
    console.log(`[launch] Reusing existing Space-Earth Monitor instance at ${appUrl}`);
    openBrowser(appUrl);
    return;
  }

  console.log(`[launch] Starting Space-Earth Monitor on ${appUrl}...`);
  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });

  let serverExitedEarly = false;
  serverProcess.on('exit', (code, signal) => {
    serverExitedEarly = true;
    if (!shuttingDown && code !== 0) {
      console.error(`[launch] Server exited before ready (${signal || code}).`);
    }
  });

  const ready = await waitForAppReady();
  if (!ready) {
    shuttingDown = true;
    if (!serverExitedEarly && !serverProcess.killed) {
      serverProcess.kill('SIGINT');
    }
    throw new Error(`Server did not become ready within ${startupTimeoutMs / 1000} seconds`);
  }

  console.log(`[launch] App ready at ${appUrl}`);
  openBrowser(appUrl);
  console.log('[launch] Press Ctrl+C to stop the local server.');

  const forwardSignal = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!serverProcess.killed) {
      serverProcess.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  serverProcess.on('exit', code => {
    process.exit(typeof code === 'number' ? code : 0);
  });
}

main().catch(error => {
  console.error(`[launch] ${error.message}`);
  process.exit(1);
});