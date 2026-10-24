import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createWebhookServer } from '../src/webhook/server.js';
import { parseWebhook } from '../src/webhook/parse.js';
import { createStore } from '../src/store/index.js';

const SECRET = 'app-secret';
const quiet = { log() {}, warn() {}, error() {} };
let server, base, store;
const notified = [];

before(async () => {
  store = await createStore({ type: 'sqlite', sqliteFile: ':memory:' });
  await store.claim('42', 'week_out');
  await store.complete('42', 'week_out', { to: '61412345678', messageIds: ['wamid.OUT'] });
  server = createWebhookServer({
    path: '/webhook/whatsapp', verifyToken: 'verify-me', appSecret: SECRET, store, logger: quiet,
    notifier: { notify: async (e) => notified.push(e) },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}/webhook/whatsapp`;
});

after(() => server.close());

const replyPayload = {
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '61412345678', profile: { name: 'Sam' } }],
    messages: [{ id: 'wamid.IN', from: '61412345678', timestamp: '1793000000', type: 'text', text: { body: 'Running late!' } }],
  } }] }],
};

const statusPayload = (status, errors) => ({
  entry: [{ changes: [{ value: {
    statuses: [{ id: 'wamid.OUT', recipient_id: '61412345678', status, timestamp: '1793000100', errors }],
  } }] }],
});

function post(payload, secret = SECRET) {
  const body = JSON.stringify(payload);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  return fetch(base, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } });
}

test('answers Meta verification only with the right token', async () => {
  const ok = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123`);
  assert.equal(await ok.text(), '123');
  const bad = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`);
  assert.equal(bad.status, 403);
});

test('rejects webhooks not signed with the app secret', async () => {
  assert.equal((await post(replyPayload, 'not-the-secret')).status, 401);
  assert.equal(notified.length, 0);
});

test('saves and forwards customer replies once, linked to the booking', async () => {
  assert.equal((await post(replyPayload)).status, 200);
  assert.equal((await post(replyPayload)).status, 200); // Meta retry
  assert.equal(notified.length, 1);
  assert.equal(notified[0].bookingId, '42');
  assert.equal(notified[0].text, 'Running late!');
  assert.equal(notified[0].name, 'Sam');
});

test('records delivery receipts and forwards failures', async () => {
  notified.length = 0;
  assert.equal((await post(statusPayload('delivered'))).status, 200);
  assert.equal(notified.length, 0);
  await post(statusPayload('failed', [{ code: 131026, title: 'Message undeliverable' }]));
  assert.equal(notified[0].kind, 'failed');
  assert.match(notified[0].error, /131026/);
});

test('parses template button replies', () => {
  const [event] = parseWebhook({ entry: [{ changes: [{ value: {
    messages: [{ id: 'x', from: '1', timestamp: '1', type: 'button', button: { text: 'All good' } }],
  } }] }] });
  assert.equal(event.text, 'All good');
});
