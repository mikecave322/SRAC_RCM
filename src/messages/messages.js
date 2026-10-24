import { AIRPORTS } from '../airports.js';

/**
 * The message for each stage of the trip. Edit the wording here.
 *
 * Each message has two forms:
 *  - template: the WhatsApp template name + its {{1}}, {{2}}... values, in order.
 *    The template wording itself is set up and approved in WhatsApp Manager — keep it in sync with `text`.
 *  - text: the free-form version, used when WHATSAPP_MODE=text and in dry-run logs.
 *
 * ctx = { booking, airportCode, infographicUrl, business, docsUrl, docsComplete, pickupDate, pickupTime }
 *
 * When RCM shows the customer's documents are already complete (ctx.docsComplete), the week-out
 * and two-day messages use a version without the docs request.
 */
export const MESSAGES = {
  // 1 — one week out: welcome + get the paperwork done
  week_out: (ctx) =>
    ctx.docsComplete
      ? {
          template: {
            name: 'booking_week_out_docs_done',
            params: [ctx.booking.firstName, ctx.pickupDate],
          },
          text:
            `Hi ${ctx.booking.firstName}, it's ${ctx.business.name}! Your car is booked for ${ctx.pickupDate}. ` +
            `Thanks for completing your documents already, you're all set for a quick pickup.`,
        }
      : {
          template: {
            name: 'booking_week_out',
            params: [ctx.booking.firstName, ctx.pickupDate, ctx.docsUrl],
          },
          text:
            `Hi ${ctx.booking.firstName}, it's ${ctx.business.name}! Your car is booked for ${ctx.pickupDate}. ` +
            `To make pickup quick, please fill out your rental documents and upload your licence here: ${ctx.docsUrl}`,
        },

  // 2 — two days out: looking forward to seeing you + docs reminder (left out if docs are done)
  two_days: (ctx) =>
    ctx.docsComplete
      ? {
          template: {
            name: 'booking_two_days_docs_done',
            params: [ctx.booking.firstName, ctx.pickupDate],
          },
          text: `Hi ${ctx.booking.firstName}, we're looking forward to seeing you on ${ctx.pickupDate}! Your documents are all done.`,
        }
      : {
          template: {
            name: 'booking_two_days',
            params: [ctx.booking.firstName, ctx.pickupDate, ctx.docsUrl],
          },
          text:
            `Hi ${ctx.booking.firstName}, we're looking forward to seeing you on ${ctx.pickupDate}! ` +
            `Just a reminder to complete your documents if you haven't already: ${ctx.docsUrl}`,
        },

  // 3 — day of, ~2 hours before arrival. Airport arrivals get the pickup infographic.
  day_of: (ctx) =>
    ctx.airportCode
      ? {
          template: {
            name: 'booking_day_of_airport',
            params: [ctx.booking.firstName, AIRPORTS[ctx.airportCode].name, ctx.business.phone],
          },
          imageUrl: ctx.infographicUrl,
          text:
            `Hi ${ctx.booking.firstName}, see you soon! When you land at ${AIRPORTS[ctx.airportCode].name}, ` +
            `here's where to meet us for your car (see the map). Any trouble, call us on ${ctx.business.phone}.`,
        }
      : {
          template: {
            name: 'booking_day_of',
            params: [ctx.booking.firstName, ctx.pickupTime, ctx.booking.pickupLocation],
          },
          text:
            `Hi ${ctx.booking.firstName}, see you today at ${ctx.pickupTime} at ${ctx.booking.pickupLocation}! ` +
            `Any questions, call us on ${ctx.business.phone}.`,
        },

  // 4 — mid trip: check in
  mid_trip: (ctx) => ({
    template: {
      name: 'booking_mid_trip',
      params: [ctx.booking.firstName, ctx.business.phone],
    },
    text:
      `Hi ${ctx.booking.firstName}, just checking in — is everything going well with the car? ` +
      `If you need anything, reply here or call us on ${ctx.business.phone}.`,
  }),
};
