import http from 'node:http';
import { parseWebhook, verifySignature } from './parse.js';

/**
 * Receives WhatsApp webhooks: customer replies and delivery receipts (sent / delivered / read / failed).
 *
 * In Meta's app dashboard (WhatsApp → Configuration → Webhook) set:
 *   Callback URL:  https://your-server.example.com/webhook/whatsapp   (must be public HTTPS)
 *   Verify token:  the value of WHATSAPP_VERIFY_TOKEN
 * and subscribe to the "messages" field.
 */
export function createWebhookServer({ path, verifyToken, appSecret, store, notifier, logger = console }) {
  if (!verifyToken || !appSecret) {
    throw new Error('WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET must be set to run the webhook');
  }

  async function handleEvent(event) {
    if (event.kind === 'status') {
      const message = await store.recordStatus(event);
      if (!message) return; // not one of ours, or an out-of-order receipt
      if (event.status === 'failed') {
        logger.error(`Booking ${message.bookingId}: ${message.stage} message to ${message.recipient} failed: ${event.error}`);
        await notifier.notify({ kind: 'failed', ...message, error: event.error });
      }
      return;
    }

    const { bookingId, stage, duplicate } = await store.recordInbound(event);
    if (duplicate) return; // Meta retries webhooks, so the same reply can arrive twice
    logger.log(`Reply from ${event.name ?? event.from}${bookingId ? ` (booking ${bookingId})` : ''}: ${event.text}`);
    await notifier.notify({ kind: 'reply', ...event, bookingId, stage });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/health') return send(res, 200, 'ok');
    if (url.pathname !== path) return send(res, 404, 'not found');

    // Meta checks the endpoint once when you save the webhook settings.
    if (req.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken;
      return ok ? send(res, 200, url.searchParams.get('hub.challenge') ?? '') : send(res, 403, 'forbidden');
    }
    if (req.method !== 'POST') return send(res, 405, 'method not allowed');

    const raw = await readBody(req);
    if (!verifySignature(raw, req.headers['x-hub-signature-256'], appSecret)) {
      logger.warn('Rejected webhook with an invalid signature');
      return send(res, 401, 'invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return send(res, 400, 'invalid json');
    }

    // Process before answering: if saving fails, a 500 makes Meta retry the webhook later.
    try {
      for (const event of parseWebhook(payload)) await handleEvent(event);
      send(res, 200, 'ok');
    } catch (err) {
      logger.error(`Webhook processing failed: ${err.message}`);
      send(res, 500, 'error');
    }
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain' }).end(body);
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('webhook body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
