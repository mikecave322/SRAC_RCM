import { config } from './config.js';
import { detectAirport } from './airports.js';
import { normalisePhone } from './phone.js';
import { MESSAGES } from './messages/messages.js';
import { dueStages } from './schedule.js';
import { isActive } from './rcm/booking.js';

const DAY = 24 * 60 * 60 * 1000;

export function buildContext(booking) {
  const fmt = (opts) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', ...opts }).format(booking.pickupAt);
  const airportCode = detectAirport(booking);
  return {
    booking,
    airportCode,
    infographicUrl: airportCode ? config.infographics[airportCode] : null,
    business: config.business,
    docsComplete: Boolean(booking.docsComplete),
    docsUrl: config.business.docsUrl.replace('{ref}', encodeURIComponent(booking.reference)),
    pickupDate: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    pickupTime: fmt({ hour: 'numeric', minute: '2-digit' }),
  };
}

/**
 * One scan: pull bookings around today, work out which messages are due, send them.
 * Safe to run as often as you like — already-sent messages are tracked in the sent log.
 */
export async function runOnce({ source, whatsapp, store, now = new Date(), logger = console }) {
  const bookings = await source.fetchBookings({
    from: new Date(now.getTime() - 60 * DAY), // long hires still on the road need mid-trip check-ins
    to: new Date(now.getTime() + 8 * DAY),
  });

  const summary = { scanned: bookings.length, sent: 0, skipped: 0, failed: 0 };

  for (const booking of bookings.filter(isActive)) {
    for (const stage of dueStages(booking, now)) {
      if (await store.has(booking.id, stage)) continue;
      // Dry runs only log, so they never claim or record anything.
      if (!whatsapp.dryRun && !(await store.claim(booking.id, stage, now))) continue; // another instance has it

      const to = normalisePhone(booking.phone);
      if (!to) {
        logger.warn(`Booking ${booking.reference}: no valid mobile number, skipping ${stage}`);
        if (!whatsapp.dryRun) await store.complete(booking.id, stage, { skipped: 'no valid phone' });
        summary.skipped++;
        continue;
      }

      const ctx = buildContext(booking);
      if (ctx.airportCode && !ctx.infographicUrl) {
        logger.warn(`No infographic URL set for ${ctx.airportCode} (INFOGRAPHIC_${ctx.airportCode}_URL)`);
      }
      const message = MESSAGES[stage](ctx);
      try {
        const results = await whatsapp.send(to, message);
        if (!whatsapp.dryRun) {
          const messageIds = results.map((r) => r.messages?.[0]?.id).filter(Boolean);
          await store.complete(booking.id, stage, { to, messageIds });
        }
        logger.log(`Booking ${booking.reference}: sent ${stage}${ctx.docsComplete ? ' (docs complete)' : ''} to ${to}`);
        summary.sent++;
      } catch (err) {
        // Released, so it is retried on the next scan while the window is still open.
        if (!whatsapp.dryRun) await store.release(booking.id, stage);
        logger.error(`Booking ${booking.reference}: failed to send ${stage}: ${err.message}`);
        summary.failed++;
      }
    }
  }
  return summary;
}
