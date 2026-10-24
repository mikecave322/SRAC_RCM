import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testSend } from '../src/testSend.js';

const quiet = { log() {}, warn() {}, error() {} };

function fakeWhatsApp() {
  const sent = [];
  return { sent, send: async (to, message) => sent.push({ to, message }), post: async (p) => sent.push(p) };
}

test('sends every sample message to the given phone', async () => {
  const whatsapp = fakeWhatsApp();
  await testSend({ whatsapp, phone: '0412 345 678', what: 'all', logger: quiet });
  assert.equal(whatsapp.sent.length, 8);
  assert.ok(whatsapp.sent.every((s) => s.to === '61412345678'));
  const names = whatsapp.sent.map((s) => s.message.template.name);
  assert.ok(names.includes('booking_day_of_airport') && names.includes('booking_two_days_docs_done'));
});

test('hello_world sends Meta\'s pre-approved template', async () => {
  const whatsapp = fakeWhatsApp();
  await testSend({ whatsapp, phone: '+61412345678', logger: quiet });
  assert.equal(whatsapp.sent[0].template.name, 'hello_world');
});

test('rejects unknown messages and bad numbers', async () => {
  await assert.rejects(testSend({ whatsapp: fakeWhatsApp(), phone: '0412345678', what: 'nope', logger: quiet }), /Unknown message/);
  await assert.rejects(testSend({ whatsapp: fakeWhatsApp(), phone: '12', logger: quiet }), /mobile number/);
});
