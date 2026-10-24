import { config } from './config.js';
import { detectAirport } from './airports.js';
import { normalisePhone } from './phone.js';
import { MESSAGES } from './messages/messages.js';
import { dueStages } from './schedule.js';
import { isActive } from './rcm/booking.js';

const DAY = 24 * 60 * 60 * 1000;

function buildContext(booking) {
  const fmt = (opts) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', ...opts }).format(booking.pickupAt);
  const airportCode = detectAirport(booking);
  return {
    booking,
    airportCode,
    infographicUrl: airportCode ? config.infographics[airportCode] : null,
    business: config.business,
    docsUrl: config.business.docsUrl.replace('{ref}', encodeURIComponent(booking.reference)),
    pickupDate: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    pickupTime: fmt({ hour: 'numeric', minute: '2-digit' }),
  };
}

/**
 * One scan: pull bookings around today, work out which messages are due, send them.
 * Safe to run as often as you like — already-sent messages are tracked in the sent log.
 */
export async function runOnce({ source, whatsapp, sentLog, now = new Date(), logger = console }) {
  const bookings = await source.fetchBookings({
    from: new Date(now.getTime() - 60 * DAY), // long hires still on the road need mid-trip check-ins
    to: new Date(now.getTime() + 8 * DAY),
  });

  const summary = { scanned: bookings.length, sent: 0, skipped: 0, failed: 0 };

  for (const booking of bookings.filter(isActive)) {
    for (const stage of dueStages(booking, now)) {
      if (sentLog.has(booking.id, stage)) continue;

      const to = normalisePhone(booking.phone);
      if (!to) {
        logger.warn(`Booking ${booking.reference}: no valid mobile number, skipping ${stage}`);
        sentLog.record(booking.id, stage, { skipped: 'no valid phone' });
        summary.skipped++;
        continue;
      }

      const ctx = buildContext(booking);
      if (ctx.airportCode && !ctx.infographicUrl) {
        logger.warn(`No infographic URL set for ${ctx.airportCode} (INFOGRAPHIC_${ctx.airportCode}_URL)`);
      }
      const message = MESSAGES[stage](ctx);
      try {
        const result = await whatsapp.send(to, message);
        if (!whatsapp.dryRun) sentLog.record(booking.id, stage, { to, result });
        logger.log(`Booking ${booking.reference}: sent ${stage} to ${to}`);
        summary.sent++;
      } catch (err) {
        // Not recorded, so it is retried on the next scan while the window is still open.
        logger.error(`Booking ${booking.reference}: failed to send ${stage}: ${err.message}`);
        summary.failed++;
      }
    }
  }
  return summary;
}
