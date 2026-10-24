import fs from 'node:fs';
import path from 'node:path';

const STATUS_RANK = { sent: 1, delivered: 2, read: 3, failed: 4 };

/**
 * Plain JSON file. Fine for a single instance; use SQLite or Postgres to run more than one,
 * as two processes writing the same file can overwrite each other.
 */
export class JsonStore {
  constructor({ file }) {
    this.file = file;
  }

  async init() {
    const data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {};
    // Older versions stored only the sent stages, keyed "bookingId:stage", at the top level.
    this.data = data.stages ? data : { stages: data, messages: {}, inbound: {} };
  }

  key(bookingId, stage) {
    return `${bookingId}:${stage}`;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  async has(bookingId, stage) {
    const entry = this.data.stages[this.key(bookingId, stage)];
    return Boolean(entry) && entry.status !== 'sending';
  }

  async claim(bookingId, stage, now = new Date()) {
    if (this.data.stages[this.key(bookingId, stage)]) return false;
    this.data.stages[this.key(bookingId, stage)] = { status: 'sending', claimedAt: now.toISOString() };
    return true;
  }

  async complete(bookingId, stage, { to = null, messageIds = [], skipped } = {}) {
    const sentAt = new Date().toISOString();
    this.data.stages[this.key(bookingId, stage)] = skipped
      ? { status: 'skipped', sentAt, skipped }
      : { status: 'sent', sentAt, to, messageIds };
    for (const id of messageIds) {
      this.data.messages[id] = { bookingId, stage, recipient: to, status: 'sent', statusAt: sentAt };
    }
    this.save();
  }

  async release(bookingId, stage) {
    if (this.data.stages[this.key(bookingId, stage)]?.status === 'sending') {
      delete this.data.stages[this.key(bookingId, stage)];
    }
  }

  async recordStatus({ messageId, status, timestamp, error = null }) {
    const message = this.data.messages[messageId];
    if (!message || (STATUS_RANK[status] ?? 0) < (STATUS_RANK[message.status] ?? 0)) return null;
    Object.assign(message, { status, statusAt: timestamp.toISOString(), error });
    this.save();
    return { bookingId: message.bookingId, stage: message.stage, recipient: message.recipient };
  }

  async recordInbound({ messageId, from, type, text, timestamp }) {
    const latest = Object.values(this.data.messages)
      .filter((m) => m.recipient === from)
      .sort((a, b) => b.statusAt.localeCompare(a.statusAt))[0];
    const result = { bookingId: latest?.bookingId ?? null, stage: latest?.stage ?? null, duplicate: false };
    if (this.data.inbound[messageId]) return { ...result, duplicate: true };
    this.data.inbound[messageId] = {
      from, bookingId: result.bookingId, type, text, receivedAt: timestamp.toISOString(),
    };
    this.save();
    return result;
  }

  async close() {}
}
