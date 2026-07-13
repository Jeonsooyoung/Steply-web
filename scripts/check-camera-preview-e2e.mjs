import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer as createViteServer } from 'vite';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromeExecutable = process.env.STEPLY_CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { requestHandler } = require('../src/routes/apiRouter');
const { attachDashboardWebSocket } = require('../src/ws/dashboardSocket');
const { getSession } = require('../src/services/sessionStore');
const { stage5DataContractFixture } = require('./fixtures/stage5DataContractFixture.cjs');

const MOBILE_SEQUENCE = 42;

function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function closeNodeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function closeWebSocketServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1_000);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.close();
  });
}

function waitForMobileMessage(socket, predicate, timeoutMs = 5_000) {
  const queuedIndex = socket.stePlyMessageQueue.findIndex(predicate);
  if (queuedIndex >= 0) {
    const [message] = socket.stePlyMessageQueue.splice(queuedIndex, 1);
    return Promise.resolve(message);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.stePlyMessageWaiters.delete(waiter);
      reject(new Error('Timed out waiting for the matching Mobile WebSocket message.'));
    }, timeoutMs);
    const waiter = {
      predicate,
      resolve(message) {
        clearTimeout(timer);
        resolve(message);
      },
    };
    socket.stePlyMessageWaiters.add(waiter);
  });
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.stePlyMessageQueue = [];
    socket.stePlyMessageWaiters = new Set();
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (_) {
        return;
      }
      const waiter = [...socket.stePlyMessageWaiters].find((candidate) => candidate.predicate(message));
      if (waiter) {
        socket.stePlyMessageWaiters.delete(waiter);
        waiter.resolve(message);
      } else {
        socket.stePlyMessageQueue.push(message);
      }
    });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Timed out opening WebSocket ${url}`));
    }, 5_000);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
        return;
      }
      if (!message.method) return;
      for (const listener of this.eventListeners.get(message.method) || []) {
        listener(message.params || {}, message.sessionId);
      }
    });
    socket.on('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`Chrome DevTools connection closed during ${pending.method}.`));
      }
      this.pending.clear();
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(new CdpClient(socket)));
      socket.once('error', reject);
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(method, listener) {
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, new Set());
    this.eventListeners.get(method).add(listener);
  }

  off(method, listener) {
    this.eventListeners.get(method)?.delete(listener);
  }

  close() {
    this.socket.close();
  }
}

function launchChrome(url, userDataDir) {
  if (!fs.existsSync(chromeExecutable)) {
    throw new Error(`Chrome executable not found: ${chromeExecutable}. Set STEPLY_CHROME_PATH to a Chromium executable.`);
  }
  const chrome = spawn(chromeExecutable, [
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-gpu',
    '--no-default-browser-check',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900',
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const devtoolsUrl = new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timed out starting headless Chrome.\n${stderr.slice(-4_000)}`));
    }, 10_000);
    chrome.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(match[1]);
    });
    chrome.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Headless Chrome exited before DevTools was ready (code ${code}).\n${stderr.slice(-4_000)}`));
    });
  });
  return { chrome, devtoolsUrl };
}

async function attachToPage(client, expectedOrigin, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { targetInfos } = await client.send('Target.getTargets');
    const page = targetInfos.find((target) => target.type === 'page'
      && (!expectedOrigin || target.url.startsWith(expectedOrigin)));
    if (page) {
      const attached = await client.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
      await client.send('Runtime.enable', {}, attached.sessionId);
      await client.send('Page.enable', {}, attached.sessionId);
      return attached.sessionId;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Could not find the Steply browser target for ${expectedOrigin}.`);
}

function captureJsonResponse(client, sessionId, urlPath, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let requestId = null;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out capturing browser response for ${urlPath}.`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      client.off('Network.responseReceived', onResponse);
      client.off('Network.loadingFinished', onFinished);
      client.off('Network.loadingFailed', onFailed);
    };
    const onResponse = (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      let pathname;
      try {
        pathname = new URL(event.response.url).pathname;
      } catch (_) {
        return;
      }
      if (pathname !== urlPath) return;
      if (event.response.status < 200 || event.response.status >= 300) {
        cleanup();
        reject(new Error(`${urlPath} returned HTTP ${event.response.status}.`));
        return;
      }
      requestId = event.requestId;
    };
    const onFinished = async (event, eventSessionId) => {
      if (eventSessionId !== sessionId || event.requestId !== requestId) return;
      cleanup();
      try {
        const response = await client.send('Network.getResponseBody', { requestId }, sessionId);
        const body = response.base64Encoded
          ? Buffer.from(response.body, 'base64').toString('utf8')
          : response.body;
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    };
    const onFailed = (event, eventSessionId) => {
      if (eventSessionId !== sessionId || event.requestId !== requestId) return;
      cleanup();
      reject(new Error(`${urlPath} browser request failed: ${event.errorText}`));
    };
    client.on('Network.responseReceived', onResponse);
    client.on('Network.loadingFinished', onFinished);
    client.on('Network.loadingFailed', onFailed);
  });
}

function waitForProcessExit(child, timeoutMs = 2_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

async function evaluate(client, sessionId, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'unknown browser exception';
    throw new Error(detail);
  }
  return response.result?.value;
}

async function waitForBrowserValue(client, sessionId, expression, predicate, label, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await evaluate(client, sessionId, expression);
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}. Last browser value: ${JSON.stringify(lastValue)}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steply-camera-preview-e2e-'));
const apiServer = http.createServer(requestHandler);
const webSocketServer = attachDashboardWebSocket(apiServer);
let vite;
let chrome;
let cdp;
let mobileSocket;
let browserSessionId;

try {
  await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiPort = apiServer.address().port;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const requestedBrowserPort = await allocateLoopbackPort();
  vite = await createViteServer({
    root: path.join(root, 'client'),
    configFile: false,
    plugins: [react()],
    appType: 'spa',
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: requestedBrowserPort,
      strictPort: true,
      proxy: {
        '/api': { target: apiOrigin, changeOrigin: true },
        '/ws': { target: apiOrigin, changeOrigin: true, ws: true },
      },
    },
  });
  await vite.listen();
  const browserPort = vite.httpServer.address().port;
  assert.equal(browserPort, requestedBrowserPort, '[S6-CAMERA-E2E-01] isolated Vite server uses its allocated port');
  const browserOrigin = `http://127.0.0.1:${browserPort}`;
  const launched = launchChrome('about:blank', tempRoot);
  chrome = launched.chrome;
  cdp = await CdpClient.connect(await launched.devtoolsUrl);
  browserSessionId = await attachToPage(cdp, null);
  await cdp.send('Network.enable', {}, browserSessionId);
  const bundlePromise = captureJsonResponse(cdp, browserSessionId, '/api/session/create');
  await cdp.send('Page.navigate', { url: `${browserOrigin}/display/connect` }, browserSessionId);
  const bundle = await bundlePromise;
  assert.ok(bundle?.session?.id && bundle?.qrPayload, '[S6-CAMERA-E2E-01] browser session bundle is captured at the HTTP boundary');
  const qr = JSON.parse(bundle.qrPayload);
  const dataContract = stage5DataContractFixture({
    id: 'camera-preview-e2e-profile',
    displayName: 'Camera Preview E2E',
  });
  const connectResponse = await fetch(`${apiOrigin}/api/session/${bundle.session.id}/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Steply-Pairing-Token': qr.pairingToken,
    },
    body: JSON.stringify({
      connectionSessionId: bundle.session.id,
      sessionId: bundle.session.id,
      pairingToken: qr.pairingToken,
      dataContract,
      assessmentSession: null,
    }),
  });
  assert.equal(connectResponse.status, 200, '[S6-CAMERA-E2E-01] strict QR/profile connection succeeds');

  await waitForBrowserValue(
    cdp,
    browserSessionId,
    'window.location.pathname',
    (value) => value === '/display/home',
    'the connected display home route',
  );
  await cdp.send('Page.navigate', { url: `${browserOrigin}/display/exercises/balance-practice/live` }, browserSessionId);
  await waitForBrowserValue(
    cdp,
    browserSessionId,
    'window.location.pathname',
    (value) => value === '/display/exercises/balance-practice/live',
    'the guided exercise route',
  );
  await waitForBrowserValue(
    cdp,
    browserSessionId,
    'window.__steplyDiag?.opened === true',
    Boolean,
    'the guided exercise dashboard socket',
  );

  const connectedSession = getSession(bundle.session.id);
  assert.ok(connectedSession?.connectedAt && connectedSession?.pairingTokenConsumedAt, '[S6-CAMERA-E2E-02] fixture is an already connected active session');
  connectedSession.expiresAtEpochMs = Date.now() - 1;

  mobileSocket = await openSocket(`ws://127.0.0.1:${apiPort}/ws?sessionId=${bundle.session.id}&role=mobile`);
  const resumedSession = await waitForMobileMessage(
    mobileSocket,
    (message) => message.type === 'session' || message.type === 'error',
  );
  assert.equal(resumedSession.type, 'session', '[S6-CAMERA-E2E-02] pairing TTL does not close a connected active Mobile stream');
  const streamReadyPromise = waitForMobileMessage(
    mobileSocket,
    (message) => message.type === 'remote-camera-status' && message.status === 'stream-ready',
  );
  mobileSocket.send(JSON.stringify({ type: 'hello', role: 'sender', source: 'android' }));
  await streamReadyPromise;

  const jpegBase64 = await evaluate(cdp, browserSessionId, `(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#4f8a7b';
    context.fillRect(0, 0, 2, 2);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
  })()`);
  const jpeg = Buffer.from(jpegBase64, 'base64');
  assert.equal(jpeg[0], 0xff, '[S6-CAMERA-E2E-01] fixture has a JPEG SOI marker');
  assert.equal(jpeg[1], 0xd8, '[S6-CAMERA-E2E-01] fixture has a JPEG SOI marker');
  assert.equal(jpeg[jpeg.length - 2], 0xff, '[S6-CAMERA-E2E-01] fixture has a JPEG EOI marker');
  assert.equal(jpeg[jpeg.length - 1], 0xd9, '[S6-CAMERA-E2E-01] fixture has a JPEG EOI marker');

  const previewAckPromise = waitForMobileMessage(
    mobileSocket,
    (message) => message.type === 'remote-camera-frame-ack'
      && message.source === 'camera-preview'
      && message.mobileSequence === MOBILE_SEQUENCE,
    15_000,
  );
  mobileSocket.send(JSON.stringify({
    type: 'camera-frame-meta',
    mobileSequence: MOBILE_SEQUENCE,
    capturedAtUptimeMs: 1_234,
    sentAtEpochMs: Date.now(),
    byteLength: jpeg.length,
  }));
  mobileSocket.send(jpeg);

  const preview = await waitForBrowserValue(
    cdp,
    browserSessionId,
    `(() => {
      const image = document.querySelector('img[alt="Live phone camera"]');
      if (!image) return { pathname: window.location.pathname, found: false };
      const rect = image.getBoundingClientRect();
      const style = window.getComputedStyle(image);
      return {
        pathname: window.location.pathname,
        found: true,
        visible: rect.width > 0 && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0,
        src: image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        binaryFrames: window.__steplyDiag?.binaryFrames || 0,
      };
    })()`,
    (value) => value?.pathname === '/display/exercises/balance-practice/live'
      && value.found
      && value.visible
      && value.src?.startsWith('blob:')
      && value.complete
      && value.naturalWidth > 0
      && value.naturalHeight > 0
      && value.binaryFrames > 0,
    'a decoded visible phone preview on the guided exercise route',
  );
  assert.equal(preview.pathname, '/display/exercises/balance-practice/live', '[S6-CAMERA-E2E-01] preview remains visible on the guided exercise route');
  assert.equal(preview.src.startsWith('blob:'), true, '[S6-CAMERA-E2E-01] preview uses the relayed binary Blob URL');
  assert.ok(preview.naturalWidth > 0 && preview.naturalHeight > 0, '[S6-CAMERA-E2E-01] browser decoded the JPEG');

  const previewAck = await previewAckPromise;
  assert.equal(previewAck.mobileSequence, MOBILE_SEQUENCE, '[S6-CAMERA-E2E-01] preview ACK preserves Mobile sequence correlation');
  assert.equal(previewAck.source, 'camera-preview', '[S6-CAMERA-E2E-01] ACK proves browser preview consumption');

  console.log('S6 camera preview browser E2E passed.');
} catch (error) {
  if (cdp && browserSessionId) {
    const diagnostics = await evaluate(cdp, browserSessionId, `({
      pathname: window.location.pathname,
      diagnostic: window.__steplyDiag || null,
      preview: (() => {
        const image = document.querySelector('img[alt="Live phone camera"]');
        return image ? { src: image.src, complete: image.complete, naturalWidth: image.naturalWidth } : null;
      })(),
      bodyText: document.body?.innerText?.slice(0, 1_000) || '',
    })`).catch(() => null);
    if (diagnostics) console.error('Browser diagnostics:', JSON.stringify(diagnostics, null, 2));
  }
  throw error;
} finally {
  await closeSocket(mobileSocket);
  if (cdp) {
    await cdp.send('Browser.close').catch(() => {});
    cdp.close();
  }
  const chromeExited = await waitForProcessExit(chrome);
  if (!chromeExited && chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await waitForProcessExit(chrome);
  }
  if (vite) await vite.close();
  await closeWebSocketServer(webSocketServer);
  await closeNodeServer(apiServer);
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.warn(`Could not remove Chrome temp profile ${tempRoot}: ${error.message}`);
  }
}
