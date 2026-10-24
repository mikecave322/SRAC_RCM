import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store/index.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notifier-store-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Postgres runs only when TEST_DATABASE_URL points at a disposable database.
const variants = [
  { type: 'json', jsonFile: path.join(dir, 'log.json') },
  { type: 'sqlite', sqliteFile: path.join(dir, 'notifier.db') },
  ...(process.env.TEST_DATABASE_URL ? [{ type: 'postgres', databaseUrl: process.env.TEST_DATABASE_URL }] : []),
];

for (const options of variants) {
  test(`${options.type} store`, async (t) => {
    const store = await createStore(options);
    const id = `b-${Date.now()}-${Math.random()}`;
    const ts = (s) => new Date(`2026-11-01T${s}:00Z`);

    await t.test('only one claim wins, and claimed stages are not yet "sent"', async () => {
      assert.equal(await store.claim(id, 'week_out'), true);
      assert.equal(await store.claim(id, 'week_out'), false);
      assert.equal(await store.has(id, 'week_out'), false);
    });

    await t.test('released claims can be claimed again', async () => {
      await store.release(id, 'week_out');
      assert.equal(await store.claim(id, 'week_out'), true);
    });

    await t.test('completed stages count as sent and stay claimed', async () => {
      await store.complete(id, 'week_out', { to: '61412345678', messageIds: [`wamid.${id}`] });
      assert.equal(await store.has(id, 'week_out'), true);
      assert.equal(await store.claim(id, 'week_out', new Date(Date.now() + 86400000)), false);
      await store.release(id, 'week_out');
      assert.equal(await store.has(id, 'week_out'), true);
    });

    await t.test('delivery receipts never go backwards', async () => {
      const msg = `wamid.${id}`;
      assert.equal((await store.recordStatus({ messageId: msg, status: 'read', timestamp: ts('10:00') })).bookingId, id);
      assert.equal(await store.recordStatus({ messageId: msg, status: 'delivered', timestamp: ts('10:01') }), null);
      assert.ok(await store.recordStatus({ messageId: msg, status: 'failed', timestamp: ts('10:02'), error: 'x' }));
      assert.equal(await store.recordStatus({ messageId: 'wamid.unknown', status: 'read', timestamp: ts('10:03') }), null);
    });

    await t.test('replies are linked to the booking and de-duplicated', async () => {
      const reply = { messageId: `in.${id}`, from: '61412345678', type: 'text', text: 'All good!', timestamp: ts('11:00') };
      assert.deepEqual(await store.recordInbound(reply), { bookingId: id, stage: 'week_out', duplicate: false });
      assert.equal((await store.recordInbound(reply)).duplicate, true);
      const stranger = await store.recordInbound({ ...reply, messageId: `in2.${id}`, from: '61400000000' });
      assert.equal(stranger.bookingId, null);
    });

    if (options.type !== 'json') {
      await t.test('a claim left by a crashed instance can be taken over after 15 minutes', async () => {
        const crashed = new Date('2026-11-01T00:00:00Z');
        assert.equal(await store.claim(id, 'mid_trip', crashed), true);
        assert.equal(await store.claim(id, 'mid_trip', new Date(crashed.getTime() + 10 * 60000)), false);
        assert.equal(await store.claim(id, 'mid_trip', new Date(crashed.getTime() + 16 * 60000)), true);
      });
    }

    await store.close();
  });
}

test('json store reads the old sent-log format', async () => {
  const file = path.join(dir, 'old.json');
  fs.writeFileSync(file, JSON.stringify({ '1001:week_out': { sentAt: '2026-10-24T00:00:00Z' } }));
  const store = await createStore({ type: 'json', jsonFile: file });
  assert.equal(await store.has('1001', 'week_out'), true);
});
