import fs from 'node:fs';
import { mapRcmBooking } from './rcmSource.js';

// Reads bookings from a local JSON file. Handy for testing the messaging flow
// before the live RCM connection is set up. Uses the same field mapping as the live API.
export class FileBookingSource {
  constructor({ file, timezoneOffset }) {
    this.file = file;
    this.timezoneOffset = timezoneOffset;
  }

  async fetchBookings() {
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    return raw.map((b) => mapRcmBooking(b, this.timezoneOffset));
  }
}
