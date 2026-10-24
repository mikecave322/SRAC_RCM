import fs from 'node:fs';
import path from 'node:path';

// Remembers which messages have already gone out so nothing is sent twice.
// A JSON file is fine for one small fleet; swap for a database if you outgrow it.
export class SentLog {
  constructor(file) {
    this.file = file;
    this.entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }

  static key(bookingId, stage) {
    return `${bookingId}:${stage}`;
  }

  has(bookingId, stage) {
    return Boolean(this.entries[SentLog.key(bookingId, stage)]);
  }

  record(bookingId, stage, details = {}) {
    this.entries[SentLog.key(bookingId, stage)] = { sentAt: new Date().toISOString(), ...details };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2));
  }
}
