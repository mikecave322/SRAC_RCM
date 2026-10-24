import crypto from 'node:crypto';

/**
 * Checks the X-Hub-Signature-256 header Meta sends with every webhook, so nobody else can
 * post fake replies or receipts. Signed with your app's App Secret.
 */
export function verifySignature(rawBody, header, appSecret) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Pulls the readable part out of any kind of inbound message.
function messageText(m) {
  switch (m.type) {
    case 'text': return m.text?.body;
    case 'button': return m.button?.text; // quick-reply button on a template
    case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
    case 'location': return [m.location?.name, m.location?.address].filter(Boolean).join(', ') || 'location';
    case 'reaction': return m.reaction?.emoji;
    default: return m[m.type]?.caption ?? `[${m.type}]`;
  }
}

/**
 * Turns a WhatsApp webhook payload into simple events:
 *   { kind: 'reply',  messageId, from, name, type, text, timestamp }
 *   { kind: 'status', messageId, recipient, status, timestamp, error }
 */
export function parseWebhook(payload) {
  const events = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const names = Object.fromEntries((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const m of value.messages ?? []) {
        events.push({
          kind: 'reply',
          messageId: m.id,
          from: m.from,
          name: names[m.from] ?? null,
          type: m.type,
          text: messageText(m) ?? null,
          timestamp: new Date(Number(m.timestamp) * 1000),
        });
      }

      for (const s of value.statuses ?? []) {
        const err = s.errors?.[0];
        events.push({
          kind: 'status',
          messageId: s.id,
          recipient: s.recipient_id,
          status: s.status,
          timestamp: new Date(Number(s.timestamp) * 1000),
          error: err ? `${err.code}: ${err.title}${err.error_data?.details ? ` (${err.error_data.details})` : ''}` : null,
        });
      }
    }
  }
  return events;
}
