/**
 * Passes customer replies and failed messages on to staff, by POSTing JSON to REPLY_FORWARD_URL.
 * The body includes a "text" field, so a Slack or Teams incoming-webhook URL works as is;
 * Zapier / Make / n8n webhooks can use the other fields (e.g. to email or text the team).
 */
export class Notifier {
  constructor({ forwardUrl, logger = console }) {
    this.forwardUrl = forwardUrl;
    this.logger = logger;
  }

  async notify(event) {
    if (!this.forwardUrl) return;
    const booking = event.bookingId ? ` (booking ${event.bookingId})` : '';
    const text =
      event.kind === 'reply'
        ? `WhatsApp reply from ${event.name ?? event.from} +${event.from}${booking}: ${event.text}`
        : `WhatsApp ${event.stage} message to +${event.recipient}${booking} failed: ${event.error}`;
    try {
      const res = await fetch(this.forwardUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...event }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // A forwarding problem shouldn't lose the webhook; it's already saved in the store.
      this.logger.error(`Could not forward to REPLY_FORWARD_URL: ${err.message}`);
    }
  }
}
