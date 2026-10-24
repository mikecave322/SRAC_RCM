/**
 * Sends messages through the Meta WhatsApp Cloud API.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * Important WhatsApp rule: you can only send free-form messages within 24 hours of the customer
 * last messaging you. Every message this app sends is business-initiated, so in production use
 * WHATSAPP_MODE=template with templates approved in WhatsApp Manager.
 */
export class WhatsAppClient {
  constructor({ apiVersion, phoneNumberId, accessToken, mode, templateLanguage, dryRun, logger = console }) {
    if (!dryRun && (!phoneNumberId || !accessToken)) {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set (or enable DRY_RUN)');
    }
    Object.assign(this, { apiVersion, phoneNumberId, accessToken, mode, templateLanguage, dryRun, logger });
  }

  /**
   * Sends one prepared message (see src/messages/messages.js).
   * @param {string} to  Phone number in international digits, e.g. 61412345678
   * @param {{template: {name: string, params: string[]}, text: string, imageUrl?: string}} message
   * @returns {Promise<object[]>} API responses; each has messages[0].id, used to match delivery receipts
   */
  async send(to, message) {
    if (this.dryRun) this.logger.log(`[dry-run] message text for ${to}: ${message.text}`);
    const payload = this.mode === 'template' ? this.templatePayload(to, message) : this.textPayloads(to, message);
    const payloads = Array.isArray(payload) ? payload : [payload];
    const results = [];
    for (const p of payloads) results.push(await this.post(p));
    return results;
  }

  templatePayload(to, { template, imageUrl }) {
    const components = [];
    // Templates with an IMAGE header (used for the airport infographic) take the image here.
    if (imageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] });
    if (template.params?.length) {
      components.push({ type: 'body', parameters: template.params.map((text) => ({ type: 'text', text: String(text) })) });
    }
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: template.name, language: { code: this.templateLanguage }, components },
    };
  }

  // Free-form mode: text message, followed by the image if there is one.
  textPayloads(to, { text, imageUrl }) {
    const out = [{ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: true } }];
    if (imageUrl) out.push({ messaging_product: 'whatsapp', to, type: 'image', image: { link: imageUrl } });
    return out;
  }

  async post(payload) {
    if (this.dryRun) {
      this.logger.log(`[dry-run] would send to ${payload.to}:\n${JSON.stringify(payload, null, 2)}`);
      return { dryRun: true };
    }
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(json.error ?? json)}`);
    return json;
  }
}
