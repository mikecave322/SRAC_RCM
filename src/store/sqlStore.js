import { SCHEMA, SQL } from './sql.js';

// How long a "sending" claim is honoured before another instance may take it over.
const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Store logic shared by SQLite and Postgres. Subclasses provide query(sql, params) → rows.
 *
 * Sending a stage works as claim → send → complete (or release on failure). The claim is
 * an atomic insert, so when several instances scan at the same time only one sends.
 */
export class SqlStore {
  async init() {
    for (const statement of SCHEMA) await this.query(statement);
  }

  async has(bookingId, stage) {
    return (await this.query(SQL.has, [bookingId, stage])).length > 0;
  }

  async claim(bookingId, stage, now = new Date()) {
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
    const rows = await this.query(SQL.claim, [bookingId, stage, now.toISOString(), staleBefore]);
    return rows.length > 0;
  }

  /** Marks a claimed stage done. details: { to, messageIds?, skipped? } */
  async complete(bookingId, stage, { to = null, messageIds = [], skipped } = {}) {
    const now = new Date().toISOString();
    const detail = JSON.stringify(skipped ? { skipped } : { messageIds });
    await this.query(SQL.complete, [skipped ? 'skipped' : 'sent', to, now, detail, bookingId, stage]);
    for (const id of messageIds) await this.query(SQL.insertMessage, [id, bookingId, stage, to, now]);
  }

  async release(bookingId, stage) {
    await this.query(SQL.release, [bookingId, stage]);
  }

  /** Applies a WhatsApp delivery receipt. Returns the message's booking/stage, or null if unknown or stale. */
  async recordStatus({ messageId, status, timestamp, error = null }) {
    const rows = await this.query(SQL.updateStatus, [status, timestamp.toISOString(), error, messageId, status]);
    return rows[0] ? { bookingId: rows[0].booking_id, stage: rows[0].stage, recipient: rows[0].recipient } : null;
  }

  /**
   * Saves a customer's message, linked to the booking we last messaged that number about.
   * Returns { bookingId, stage, duplicate }.
   */
  async recordInbound({ messageId, from, type, text, timestamp }) {
    const [latest] = await this.query(SQL.latestBookingFor, [from]);
    const bookingId = latest?.booking_id ?? null;
    const rows = await this.query(SQL.insertInbound, [
      messageId, from, bookingId, type, text ?? null, timestamp.toISOString(),
    ]);
    return { bookingId, stage: latest?.stage ?? null, duplicate: rows.length === 0 };
  }
}
