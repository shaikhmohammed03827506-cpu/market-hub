'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const port = 43217;
const origin = `http://127.0.0.1:${port}`;
const serverPath = path.join(__dirname, '..', 'server.js');
const environment = {
  ...process.env,
  PORT: String(port),
  ADMIN_EMAIL: 'owner@example.test',
  ADMIN_PASSWORD: 'controlled-admin-password',
  SESSION_SECRET: 'controlled-test-session-secret-that-is-long-enough'
};

async function startServer() {
  const child = spawn(process.execPath, [serverPath], { env: environment, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/healthz`);
      if (response.ok) return child;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  child.kill();
  throw new Error('Test server did not become ready.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise(resolve => child.once('exit', resolve));
}

test('admin session remains valid after a server restart', async () => {
  let child = await startServer();
  try {
    const login = await fetch(`${origin}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: environment.ADMIN_EMAIL, password: environment.ADMIN_PASSWORD })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];

    await stopServer(child);
    child = await startServer();

    const session = await fetch(`${origin}/api/auth/admin/session`, { headers: { cookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { authenticated: true });
  } finally {
    await stopServer(child);
  }
});
