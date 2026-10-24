import crypto from 'node:crypto';
import { parseLocalDateTime } from './booking.js';

/**
 * Live connection to Rental Car Manager.
 *
 * RCM issues an API key + secret key per account (ask RCM support to enable API access).
 * Requests are signed with an HMAC-SHA256 of the request body using the secret key.
 *
 * NOTE: confirm the exact endpoint, request body and response field names against the
 * RCM API documentation for your account version. Everything RCM-specific lives in this
 * file (the request in fetchBookings and the field mapping in mapRcmBooking), so that
 * is the only place you should need to change.
 */
export class RcmBookingSource {
  constructor({ baseUrl, bookingsPath, apiKey, secretKey, timezoneOffset }) {
    if (!apiKey || !secretKey) throw new Error('RCM_API_KEY and RCM_SECRET_KEY must be set');
    Object.assign(this, { baseUrl, bookingsPath, apiKey, secretKey, timezoneOffset });
  }

  sign(body) {
    return crypto.createHmac('sha256', this.secretKey).update(body).digest('hex');
  }

  /** Fetch bookings with a pickup or return date inside [from, to]. */
  async fetchBookings({ from, to }) {
    const body = JSON.stringify({
      method: 'bookinglist',
      datefrom: formatDate(from),
      dateto: formatDate(to),
      datetype: 'pickup_or_dropoff',
    });
    const url = `${this.baseUrl}${this.bookingsPath}?apikey=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', signature: this.sign(body) },
      body,
    });
    if (!res.ok) throw new Error(`RCM API ${res.status}: ${await res.text()}`);

    const json = await res.json();
    const rows = json.results ?? json.data ?? json.bookings ?? json;
    if (!Array.isArray(rows)) throw new Error(`Unexpected RCM response: ${JSON.stringify(json).slice(0, 300)}`);
    return rows.map((row) => mapRcmBooking(row, this.timezoneOffset));
  }
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// Maps an RCM booking record to our normalised Booking. Adjust field names here if your
// RCM response uses different ones (several common variants are checked).
export function mapRcmBooking(r, timezoneOffset = '+10:00') {
  const pick = (...keys) => keys.map((k) => r[k]).find((v) => v !== undefined && v !== null && v !== '');
  return {
    id: String(pick('reservationid', 'bookingid', 'id')),
    reference: String(pick('reservationref', 'reservationno', 'bookingref', 'reference', 'id')),
    status: pick('status', 'bookingstatus', 'reservationstatus') ?? '',
    firstName: pick('firstname', 'customerfirstname', 'first_name') ?? '',
    lastName: pick('lastname', 'customerlastname', 'last_name') ?? '',
    phone: pick('mobile', 'mobilephone', 'cellphone', 'phone') ?? null,
    email: pick('email', 'customeremail') ?? null,
    pickupAt: parseLocalDateTime(pick('pickupdatetime', 'pickupdate', 'pickup_at'), timezoneOffset),
    dropoffAt: parseLocalDateTime(pick('dropoffdatetime', 'dropoffdate', 'dropoff_at'), timezoneOffset),
    pickupLocation: pick('pickuplocation', 'pickuplocationname', 'pickup_location') ?? '',
    flightNumber: pick('flightin', 'flightnumber', 'arrivalflight') ?? null,
    arrivalAt: parseLocalDateTime(pick('flightarrivaldatetime', 'arrivaldatetime', 'arrival_at'), timezoneOffset),
    arrivalAirport: pick('arrivalairport') ?? null,
  };
}
