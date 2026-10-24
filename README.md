# RCM → WhatsApp booking notifier

Scans bookings in **Rental Car Manager (RCM)** and sends customers WhatsApp messages at four points in their trip:

| Stage | When | Message |
|---|---|---|
| `week_out` | 7 days before pickup | Welcome + link to fill out documents |
| `two_days` | 2 days before pickup | "Looking forward to seeing you" + docs reminder |
| `day_of` | 2 hours before the flight lands (or before pickup time if there's no flight) | Airport arrivals at **Gold Coast (OOL)** or **Brisbane (BNE)** get the pickup-location infographic; everyone else gets a "see you today" note |
| `mid_trip` | Halfway through the hire (hires of 2+ days) | Check-in to see that everything is OK |

Each message goes out once per booking. Cancelled bookings are skipped. If a booking is made late (for example 3 days out), the missed stages are skipped rather than sent late.

## Quick start

Requires Node.js 20 or newer. There are no packages to install.

```bash
cp .env.example .env              # then fill it in
npm test                          # unit tests for the timing rules
npm run dry-run                   # logs what would be sent, sends nothing
node src/index.js run --dry-run --now=2026-10-31T07:20+10:00   # simulate a scan at another time
```

The sample bookings in `data/sample-bookings.json` let you try the flow before connecting RCM.

To run it for real, set `DRY_RUN=false`, then either:
- `npm start`: keeps running and scans every `SCAN_INTERVAL_MINUTES` (default 15), or
- `npm run run-once` from cron, for example `*/15 * * * *`.

## Where to change things

| What | File |
|---|---|
| Message wording, WhatsApp template names | `src/messages/messages.js` |
| Timing of each stage | `src/schedule.js` |
| Airport detection keywords | `src/airports.js` |
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

   If you rename a template or change its variables, update `src/messages/messages.js` to match.
4. Host the two infographics at public HTTPS URLs (your website, S3 or similar) and put the URLs in `.env`. `assets/infographics/` is a place to keep the source files.

## Connecting Rental Car Manager

1. Ask RCM support to enable API access for your account. They issue an **API key** and a **secret key**.
2. Set `BOOKING_SOURCE=rcm` and fill in the `RCM_*` values in `.env`.
3. **Check `src/rcm/rcmSource.js` against the RCM API documentation for your account.** The request (endpoint, method name, HMAC signature) and the field names in `mapRcmBooking()` are a best-guess starting point. They need to be confirmed against RCM's documentation, and all of them are in that one file. The mapper already checks several common field-name variants.
4. Check that RCM captures the customer's mobile number, and ideally the flight number and arrival time. Without an arrival time, the day-of message goes out 2 hours before the pickup time.

Run `npm run dry-run` with `BOOKING_SOURCE=rcm` first, so you can see real bookings come through before anything is sent.

## How it works

```
src/index.js           CLI entry point (run / watch)
src/runner.js          one scan: fetch bookings → find due stages → send → record
src/schedule.js        stage timing windows
src/messages/          message content
src/whatsapp/client.js WhatsApp Cloud API client (template or text mode, dry-run)
src/rcm/               RCM API client, file source for testing, booking model
src/store.js           sent-message log (data/sent-log.json) so nothing is sent twice
```

Failed sends are not recorded, so they are retried on the next scan while that stage's window is still open.

## Ideas for later

- A webhook endpoint to receive customer replies and delivery status from WhatsApp.
- Skipping the docs reminder when RCM shows the documents are already complete.
- Moving the sent log to a database if you run more than one instance.
