# RCM → WhatsApp booking notifier

Scans bookings in **Rental Car Manager (RCM)** and sends customers WhatsApp messages at four points in their trip:

| Stage | When | Message |
|---|---|---|
| `week_out` | 7 days before pickup | Welcome + link to fill out documents |
| `two_days` | 2 days before pickup | "Looking forward to seeing you" + docs reminder |
| `day_of` | 2 hours before the flight lands (or before pickup time if there's no flight) | Airport arrivals at **Gold Coast (OOL)** or **Brisbane (BNE)** get the pickup-location infographic; everyone else gets a "see you today" note |
| `mid_trip` | Halfway through the hire (hires of 2+ days) | Check-in to see that everything is OK |

Each message goes out once per booking. Cancelled bookings are skipped. If a booking is made late (for example 3 days out), the missed stages are skipped rather than sent late.

It also:
- **Leaves out the documents request** in the week-out and two-day messages when RCM shows the customer's documents are already complete.
- **Receives customer replies and delivery receipts** from WhatsApp through a webhook. Replies, and any messages that fail to deliver, can be forwarded to Slack, Teams, Zapier and similar tools.
- **Can run as more than one copy** at once (for example on two servers) without sending anything twice, using SQLite or Postgres.

## Quick start

Requires Node.js 20 or newer. There are no packages to install.

```bash
cp .env.example .env              # then fill it in
npm test                          # unit tests for the timing rules
npm run dry-run                   # logs what would be sent, sends nothing
node src/index.js run --dry-run --now=2026-10-31T07:20+10:00   # simulate a scan at another time
```

The sample bookings in `data/sample-bookings.json` let you try the flow before connecting RCM.

To run it for real, set `DRY_RUN=false`, then choose one:

| Command | What it runs |
|---|---|
| `npm start` | Scans every `SCAN_INTERVAL_MINUTES` (default 15) |
| `npm run run-once` | One scan, then exits; use from cron, e.g. `*/15 * * * *` |
| `npm run webhook` | Only the webhook that receives replies and receipts |
| `npm run all` | Scanning and the webhook in one process |
| `npm run test-send -- <mobile> all` | Sends sample messages to your phone (see below) |

## Testing on your own WhatsApp

Meta gives every new WhatsApp app a free **test phone number**. It can message up to 5 personal WhatsApp numbers that you verify, so you can see exactly what customers will get on your own phone. You don't need business verification, approved templates or a payment method. Run these steps on your own computer.

**1. Get a test number (about 10 minutes)**
1. Go to https://developers.facebook.com, log in with Facebook, and click **My Apps → Create App**. Choose the **Business** type (or "Other" then "Business"), give it any name, and create it.
2. On the app's dashboard, find **WhatsApp** and click **Set up**. If asked, create or pick a business portfolio.
3. Open **WhatsApp → API Setup**. It shows:
   - a **temporary access token** (lasts 24 hours; click "Generate" for a new one),
   - a test **From** number and its **Phone number ID**,
   - a **To** box. Add your personal mobile there, and enter the code WhatsApp sends you.

**2. Configure the project**
```bash
cp .env.example .env
```
In `.env`, set:
```
WHATSAPP_PHONE_NUMBER_ID=<Phone number ID from API Setup>
WHATSAPP_ACCESS_TOKEN=<temporary access token>
DRY_RUN=false
BUSINESS_PHONE=<your number, shown in the messages>
DOCS_URL=https://example.com/checkin?ref={ref}
INFOGRAPHIC_OOL_URL=<any public image link, for now>
INFOGRAPHIC_BNE_URL=<any public image link, for now>
```

**3. Check the connection**
```bash
npm run test-send -- 0412345678 hello_world
```
Use your own mobile number. You should get Meta's "Hello World" message on WhatsApp.

**4. See your own messages**

Your own templates aren't approved yet, so use free-form text for testing:
1. On your phone, **send any message to the test number** (e.g. "hi"). This opens WhatsApp's 24-hour window.
2. In `.env`, set `WHATSAPP_MODE=text`.
3. Run:
   ```bash
   npm run test-send -- 0412345678 all
   ```
   You'll receive all 8 messages: week out, two days (with and without docs done), day of at Gold Coast, Brisbane and a depot (with the infographic image), and mid trip. To send one, replace `all` with `week_out`, `two_days`, `day_of_ool`, `day_of_bne`, `mid_trip` and so on.

Reply to any of them on your phone to test the webhook (below). Free-form mode stops working 24 hours after your last message to the test number; just message it again.

**5. Try the full booking scan**

Put your mobile number in `data/sample-bookings.json`, then pretend it's a particular time:
```bash
npm run run-once -- --now=2026-10-24T13:30+10:00
```
Each message only sends once, so delete `data/sent-log.json` to send them again.

**Common errors**
- `131030 Recipient phone number not in allowed list`: add the number in the **To** box on API Setup.
- `190 ... access token has expired`: generate a new temporary token.
- `131047 Re-engagement message` or `470`: the 24-hour window has closed. Message the test number from your phone again, or use `hello_world`.
- `132001 Template name does not exist`: you're in `WHATSAPP_MODE=template` without your templates created. Use `text` mode for testing.

**Going live:** add your real business number in WhatsApp Manager, create a permanent System User access token, get your templates approved, and switch back to `WHATSAPP_MODE=template`.

## Where to change things

| What | File |
|---|---|
| Message wording, WhatsApp template names | `src/messages/messages.js` |
| Timing of each stage | `src/schedule.js` |
| Airport detection keywords | `src/airports.js` |
| Where replies are forwarded | `REPLY_FORWARD_URL` in `.env` / `src/webhook/notifier.js` |
| Infographic images | `INFOGRAPHIC_OOL_URL` / `INFOGRAPHIC_BNE_URL` in `.env` |
| RCM endpoint and field mapping | `src/rcm/rcmSource.js` |

## Setting up WhatsApp (Meta WhatsApp Cloud API)

1. Create a Meta Business account and a WhatsApp Business app at developers.facebook.com.
2. Add your business phone number, then copy the **Phone number ID** and a **permanent access token** (System User token) into `.env`.
3. **Create message templates in WhatsApp Manager.** WhatsApp only allows free-form messages within 24 hours of the customer messaging you. Every message here is sent by the business first, so each one needs an approved template:

   | Template name | Header | Body variables |
   |---|---|---|
   | `booking_week_out` | none | `{{1}}` first name, `{{2}}` pickup date, `{{3}}` docs link |
   | `booking_two_days` | none | `{{1}}` first name, `{{2}}` pickup date, `{{3}}` docs link |
   | `booking_day_of_airport` | **Image** | `{{1}}` first name, `{{2}}` airport name, `{{3}}` business phone |
   | `booking_day_of` | none | `{{1}}` first name, `{{2}}` pickup time, `{{3}}` pickup location |
   | `booking_mid_trip` | none | `{{1}}` first name, `{{2}}` business phone |
   | `booking_week_out_docs_done` | none | `{{1}}` first name, `{{2}}` pickup date |
   | `booking_two_days_docs_done` | none | `{{1}}` first name, `{{2}}` pickup date |

   The two `_docs_done` templates are used instead of the normal ones when the customer's documents are already complete.

   If you rename a template or change its variables, update `src/messages/messages.js` to match.
4. Host the two infographics at public HTTPS URLs (your website, S3 or similar) and put the URLs in `.env`. `assets/infographics/` is a place to keep the source files.

## Connecting Rental Car Manager

1. Ask RCM support to enable API access for your account. They issue an **API key** and a **secret key**.
2. Set `BOOKING_SOURCE=rcm` and fill in the `RCM_*` values in `.env`.
3. **Check `src/rcm/rcmSource.js` against the RCM API documentation for your account.** The request (endpoint, method name, HMAC signature) and the field names in `mapRcmBooking()` are a best-guess starting point. They need to be confirmed against RCM's documentation, and all of them are in that one file. The mapper already checks several common field-name variants.
4. Check that RCM captures the customer's mobile number, and ideally the flight number and arrival time. Without an arrival time, the day-of message goes out 2 hours before the pickup time.
5. **Documents complete:** `mapRcmBooking()` sets `docsComplete` from a flag such as `documentscomplete` or `checkincomplete` (true / 1 / Y / yes). Change the field name there to whichever RCM field shows that a customer's online check-in or licence upload is done. Bookings are fetched fresh on every scan, so a customer who finishes the documents after the week-out message gets the version without the reminder 2 days out.

Run `npm run dry-run` with `BOOKING_SOURCE=rcm` first, so you can see real bookings come through before anything is sent.

## Receiving replies and delivery receipts (webhook)

WhatsApp tells you when a customer replies and when each message is delivered, read or fails. To receive these:

1. Run the webhook (`npm run webhook` or `npm run all`) somewhere with a **public HTTPS address**: a small cloud server, Render, Railway, Fly.io or similar. To try it from your own computer, a tunnel such as `ngrok http 3000` gives you a temporary public address.
2. In `.env`, set `WHATSAPP_VERIFY_TOKEN` to any random string. Set `WHATSAPP_APP_SECRET` to the value in Meta's app dashboard under **App settings → Basic → App secret**.
3. In Meta's app dashboard, go to **WhatsApp → Configuration → Webhook** and set:
   - **Callback URL:** `https://your-address/webhook/whatsapp`
   - **Verify token:** the same value as `WHATSAPP_VERIFY_TOKEN`

   Then subscribe to the **messages** field.
4. Optional: set `REPLY_FORWARD_URL` to have replies and failed messages sent to your team. A Slack or Microsoft Teams "incoming webhook" URL works as is. A Zapier, Make or n8n webhook can turn them into an email or SMS.

What it does with them:
- Every webhook is checked against your App Secret, and anything not genuinely from Meta is rejected.
- **Replies** are saved, linked to the booking the customer was last messaged about, and forwarded.
- **Delivery receipts** update each sent message's status (sent → delivered → read, or failed). **Failed** messages are logged and forwarded, so staff can phone the customer instead.
- A reply also opens WhatsApp's 24-hour window, so staff can answer it free-form from WhatsApp Manager or a WhatsApp inbox tool.

`GET /health` returns `ok`, for uptime monitors.

## Storage, and running more than one copy

`STORE` in `.env` chooses where sent messages, receipts and replies are kept:

| `STORE` | Where | Use when |
|---|---|---|
| `json` (default) | `data/sent-log.json` | One copy running |
| `sqlite` | `data/notifier.db` | Several processes on one machine, e.g. the scanner and webhook run separately. Built into Node.js 22.13+, nothing to install. |
| `postgres` | `DATABASE_URL` | Copies on different machines. Run `npm install pg` and use any hosted Postgres (Supabase, Neon, Render, AWS RDS...). |

With `sqlite` or `postgres`, each copy "claims" a message in the database before sending it, so if two copies scan at the same moment only one sends. If a copy crashes mid-send, its claim is released after 15 minutes and the message is retried. The tables are created automatically on first start.

To move from `json` to a database, switch `STORE` while no messages are due, or expect a few already-sent messages to be sent again. The database starts empty and does not import `data/sent-log.json`.

## How it works

```
src/index.js           CLI entry point (run / watch)
src/runner.js          one scan: fetch bookings → find due stages → send → record
src/schedule.js        stage timing windows
src/messages/          message content
src/whatsapp/client.js WhatsApp Cloud API client (template or text mode, dry-run)
src/rcm/               RCM API client, file source for testing, booking model
src/store/             sent messages, receipts and replies: JSON file, SQLite or Postgres
src/webhook/           WhatsApp webhook server, payload parsing, reply forwarding
```

Failed sends are not recorded, so they are retried on the next scan while that stage's window is still open.

Run the tests with `npm test`. To include the Postgres store, point `TEST_DATABASE_URL` at a throwaway database.
