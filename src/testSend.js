import { buildContext } from './runner.js';
import { MESSAGES } from './messages/messages.js';
import { normalisePhone } from './phone.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Sends sample messages straight to one phone number, so you can see what customers receive.
 * Uses a made-up booking and never touches RCM or the sent-message store.
 *
 *   node src/index.js test-send 0412345678 hello_world   Meta's pre-approved template (checks your setup)
 *   node src/index.js test-send 0412345678 week_out      one stage
 *   node src/index.js test-send 0412345678 all           every stage and variant
 */
export async function testSend({ whatsapp, phone, what = 'hello_world', logger = console }) {
  const to = normalisePhone(phone);
  if (!to) throw new Error(`"${phone}" doesn't look like a mobile number`);

  if (what === 'hello_world') {
    // Every new WhatsApp account has this template approved, so it works before you create your own.
    await whatsapp.post({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    });
    logger.log(`Sent hello_world to ${to}`);
    return;
  }

  const pickupAt = new Date(Date.now() + 7 * DAY);
  const booking = {
    id: 'TEST', reference: 'TEST123', status: 'confirmed', firstName: 'Test', lastName: 'Customer', phone,
    pickupAt, dropoffAt: new Date(pickupAt.getTime() + 5 * DAY), pickupLocation: 'Gold Coast Airport',
    arrivalAt: pickupAt, docsComplete: false,
  };

  const samples = {
    week_out: [booking],
    week_out_docs_done: [{ ...booking, docsComplete: true }, 'week_out'],
    two_days: [booking],
    two_days_docs_done: [{ ...booking, docsComplete: true }, 'two_days'],
    day_of_ool: [booking, 'day_of'],
    day_of_bne: [{ ...booking, pickupLocation: 'Brisbane Airport' }, 'day_of'],
    day_of_depot: [{ ...booking, pickupLocation: 'Surfers Paradise Depot' }, 'day_of'],
    mid_trip: [booking],
  };
  const aliases = { day_of: 'day_of_ool' };
  const names = what === 'all' ? Object.keys(samples) : [aliases[what] ?? what];

  for (const name of names) {
    if (!samples[name]) {
      throw new Error(`Unknown message "${what}". Use hello_world, all, day_of, or one of: ${Object.keys(samples).join(', ')}`);
    }
    const [sampleBooking, stage = name] = samples[name];
    const message = MESSAGES[stage](buildContext(sampleBooking));
    try {
      await whatsapp.send(to, message);
      logger.log(`Sent ${name} to ${to}`);
    } catch (err) {
      logger.error(`Failed to send ${name}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}
