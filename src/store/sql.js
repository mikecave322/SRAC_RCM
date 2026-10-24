// SQL shared by the SQLite and Postgres stores. Placeholders are written as ? and
// converted to $1, $2... for Postgres.

export const SCHEMA = [
  // One row per booking + stage. status: sending (claimed, in progress) | sent | skipped
  `CREATE TABLE IF NOT EXISTS sent_stages (
    booking_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    recipient TEXT,
    claimed_at TEXT NOT NULL,
    sent_at TEXT,
    detail TEXT,
    PRIMARY KEY (booking_id, stage)
  )`,
  // Every WhatsApp message we sent, so delivery receipts can be matched back to a booking.
  `CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL,
    status_at TEXT NOT NULL,
    error TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS messages_recipient ON messages (recipient, status_at)`,
  // Messages customers sent us.
  `CREATE TABLE IF NOT EXISTS inbound_messages (
    message_id TEXT PRIMARY KEY,
    sender TEXT NOT NULL,
    booking_id TEXT,
    type TEXT NOT NULL,
    body TEXT,
    received_at TEXT NOT NULL
  )`,
];

// WhatsApp receipts can arrive out of order (e.g. "read" before "delivered"), so a status
// only replaces one of equal or lower rank. "failed" always wins.
const rank = (col) =>
  `CASE ${col} WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE 0 END`;

export const SQL = {
  has: `SELECT 1 FROM sent_stages WHERE booking_id = ? AND stage = ? AND status <> 'sending'`,
  // Insert a claim, or take over a claim left behind by an instance that crashed mid-send.
  claim: `INSERT INTO sent_stages (booking_id, stage, status, claimed_at) VALUES (?, ?, 'sending', ?)
    ON CONFLICT (booking_id, stage) DO UPDATE SET claimed_at = excluded.claimed_at
    WHERE sent_stages.status = 'sending' AND sent_stages.claimed_at < ?
    RETURNING booking_id`,
  complete: `UPDATE sent_stages SET status = ?, recipient = ?, sent_at = ?, detail = ?
    WHERE booking_id = ? AND stage = ?`,
  release: `DELETE FROM sent_stages WHERE booking_id = ? AND stage = ? AND status = 'sending'`,
  insertMessage: `INSERT INTO messages (message_id, booking_id, stage, recipient, status, status_at)
    VALUES (?, ?, ?, ?, 'sent', ?) ON CONFLICT (message_id) DO NOTHING`,
  updateStatus: `UPDATE messages SET status = ?, status_at = ?, error = ?
    WHERE message_id = ? AND ${rank('status')} <= ${rank('?')}
    RETURNING booking_id, stage, recipient`,
  latestBookingFor: `SELECT booking_id, stage FROM messages WHERE recipient = ? ORDER BY status_at DESC LIMIT 1`,
  insertInbound: `INSERT INTO inbound_messages (message_id, sender, booking_id, type, body, received_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (message_id) DO NOTHING RETURNING message_id`,
};

export function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
