import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueStages } from '../src/schedule.js';
import { parseLocalDateTime } from '../src/rcm/booking.js';
import { normalisePhone } from '../src/phone.js';
import { detectAirport } from '../src/airports.js';

const t = (s) => parseLocalDateTime(s, '+10:00');
const booking = {
  pickupAt: t('2026-11-10 10:00'),
  dropoffAt: t('2026-11-17 10:00'),
  arrivalAt: t('2026-11-10 09:00'),
};

test('week out message opens 7 days before pickup', () => {
  assert.deepEqual(dueStages(booking, t('2026-11-03 09:59')), []);
  assert.deepEqual(dueStages(booking, t('2026-11-03 10:00')), ['week_out']);
});

test('two days out replaces the week out message', () => {
  assert.deepEqual(dueStages(booking, t('2026-11-08 10:00')), ['two_days']);
});

test('day of message is 2 hours before the flight lands', () => {
  assert.deepEqual(dueStages(booking, t('2026-11-10 06:59')), ['two_days']);
  assert.deepEqual(dueStages(booking, t('2026-11-10 07:00')), ['day_of']);
  assert.deepEqual(dueStages(booking, t('2026-11-10 09:00')), []);
});

test('day of falls back to pickup time without a flight', () => {
  const noFlight = { ...booking, arrivalAt: null };
  assert.deepEqual(dueStages(noFlight, t('2026-11-10 08:00')), ['day_of']);
});

test('mid trip check-in at the halfway point', () => {
  assert.deepEqual(dueStages(booking, t('2026-11-13 21:59')), []);
  assert.deepEqual(dueStages(booking, t('2026-11-13 22:00')), ['mid_trip']);
});

test('no mid trip check-in for short hires', () => {
  const short = { ...booking, dropoffAt: t('2026-11-11 10:00') };
  assert.deepEqual(dueStages(short, t('2026-11-10 22:00')), []);
});

test('parses RCM date formats as Brisbane time', () => {
  assert.equal(t('2026-11-10 10:00').toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(t('10/11/2026 10:00').toISOString(), '2026-11-10T00:00:00.000Z');
});

test('normalises Australian and international mobiles', () => {
  assert.equal(normalisePhone('0412 345 678'), '61412345678');
  assert.equal(normalisePhone('+64 21 555 1234'), '64215551234');
  assert.equal(normalisePhone('412345678'), '61412345678');
  assert.equal(normalisePhone(''), null);
});

test('detects Gold Coast and Brisbane airports', () => {
  assert.equal(detectAirport({ pickupLocation: 'Gold Coast Airport' }), 'OOL');
  assert.equal(detectAirport({ pickupLocation: 'Brisbane Airport - Domestic' }), 'BNE');
  assert.equal(detectAirport({ pickupLocation: 'Brisbane City Depot' }), null);
});
