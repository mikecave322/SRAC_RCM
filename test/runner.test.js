import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/runner.js';
import { createStore } from '../src/store/index.js';
import { parseLocalDateTime } from '../src/rcm/booking.js';

const t = (s) => parseLocalDateTime(s, '+10:00');
const quiet = { log() {}, warn() {}, error() {} };

const booking = (overrides = {}) => ({
  id: '1', reference: 'R1', status: 'confirmed', firstName: 'Sam', lastName: 'Lee', phone: '0412 345 678',
  pickupAt: t('2026-11-10 10:00'), dropoffAt: t('2026-11-12 10:00'), pickupLocation: 'Depot',
  arrivalAt: null, docsComplete: false, ...overrides,
});

function fakeWhatsApp({ fail = false } = {}) {
  const sent = [];
  return {
    dryRun: false,
    sent,
    async send(to, message) {
      if (fail) throw new Error('boom');
      sent.push({ to, message });
      return [{ messages: [{ id: `wamid.${sent.length}` }] }];
    },
  };
}

const source = (...bookings) => ({ fetchBookings: async () => bookings });
const sqlite = () => createStore({ type: 'sqlite', sqliteFile: ':memory:' });

test('sends each stage once', async () => {
  const store = await sqlite();
  const whatsapp = fakeWhatsApp();
  const now = t('2026-11-03 12:00');
  await runOnce({ source: source(booking()), whatsapp, store, now, logger: quiet });
  await runOnce({ source: source(booking()), whatsapp, store, now, logger: quiet });
  assert.equal(whatsapp.sent.length, 1);
  assert.equal(whatsapp.sent[0].message.template.name, 'booking_week_out');
});

test('two instances scanning at once send only one message', async () => {
  const store = await sqlite();
  const a = fakeWhatsApp();
  const b = fakeWhatsApp();
  const now = t('2026-11-03 12:00');
  await Promise.all([
    runOnce({ source: source(booking()), whatsapp: a, store, now, logger: quiet }),
    runOnce({ source: source(booking()), whatsapp: b, store, now, logger: quiet }),
  ]);
  assert.equal(a.sent.length + b.sent.length, 1);
});

test('failed sends are retried on the next scan', async () => {
  const store = await sqlite();
  const now = t('2026-11-03 12:00');
  const failed = await runOnce({ source: source(booking()), whatsapp: fakeWhatsApp({ fail: true }), store, now, logger: quiet });
  assert.equal(failed.failed, 1);
  const whatsapp = fakeWhatsApp();
  await runOnce({ source: source(booking()), whatsapp, store, now, logger: quiet });
  assert.equal(whatsapp.sent.length, 1);
});

test('docs reminder is left out when RCM shows documents complete', async () => {
  const store = await sqlite();
  const whatsapp = fakeWhatsApp();
  await runOnce({ source: source(booking({ docsComplete: true })), whatsapp, store, now: t('2026-11-08 12:00'), logger: quiet });
  assert.equal(whatsapp.sent[0].message.template.name, 'booking_two_days_docs_done');
  assert.doesNotMatch(whatsapp.sent[0].message.text, /reminder/);
});

test('message ids are saved so delivery receipts match the booking', async () => {
  const store = await sqlite();
  await runOnce({ source: source(booking()), whatsapp: fakeWhatsApp(), store, now: t('2026-11-03 12:00'), logger: quiet });
  const match = await store.recordStatus({ messageId: 'wamid.1', status: 'delivered', timestamp: new Date() });
  assert.deepEqual(match, { bookingId: '1', stage: 'week_out', recipient: '61412345678' });
});

test('dry runs record nothing', async () => {
  const store = await sqlite();
  const whatsapp = { ...fakeWhatsApp(), dryRun: true };
  await runOnce({ source: source(booking()), whatsapp, store, now: t('2026-11-03 12:00'), logger: quiet });
  assert.equal(await store.has('1', 'week_out'), false);
});
