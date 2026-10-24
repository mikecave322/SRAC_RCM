/**
 * The normalised booking shape the rest of the app works with.
 * Whatever RCM returns gets mapped into this, so the scheduler never cares about RCM field names.
 *
 * @typedef {Object} Booking
 * @property {string} id              RCM booking id
 * @property {string} reference       Booking/reservation number shown to the customer
 * @property {string} status          e.g. "booking", "confirmed", "cancelled", "on hire"
 * @property {string} firstName
 * @property {string} lastName
 * @property {string|null} phone      Raw mobile number
 * @property {string|null} email
 * @property {Date} pickupAt          Pickup date/time
 * @property {Date} dropoffAt         Return date/time
 * @property {string} pickupLocation  Pickup location name
 * @property {string|null} flightNumber
 * @property {Date|null} arrivalAt    Flight arrival time, if the customer gave one
 * @property {string|null} arrivalAirport  "OOL" / "BNE" if known
 * @property {boolean} docsComplete   true when RCM shows the customer's documents are done
 */

// Parses an RCM local date/time ("2026-11-01 09:30", "01/11/2026 09:30", ISO...) into a Date.
// Strings without a timezone are treated as local business time (TIMEZONE_OFFSET).
export function parseLocalDateTime(value, offset = '+10:00') {
  if (!value) return null;
  if (value instanceof Date) return value;
  let s = String(value).trim();

  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const [, d, m, y, hh = '00', mm = '00'] = dmy;
    s = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}`;
  }
  s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += offset;

  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

const CANCELLED = ['cancelled', 'canceled', 'quote', 'quotation', 'no show'];

export function isActive(booking) {
  return !CANCELLED.includes(String(booking.status ?? '').toLowerCase());
}
