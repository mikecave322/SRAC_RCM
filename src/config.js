import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader so the project has no dependencies.
function loadDotEnv(file = path.resolve('.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

loadDotEnv();

const env = (key, fallback = '') => process.env[key] ?? fallback;

export const config = {
  bookingSource: env('BOOKING_SOURCE', 'file'),
  bookingsFile: env('BOOKINGS_FILE', 'data/sample-bookings.json'),

  store: {
    type: env('STORE', 'json'),
    jsonFile: env('SENT_LOG_FILE', 'data/sent-log.json'),
    sqliteFile: env('SQLITE_FILE', 'data/notifier.db'),
    databaseUrl: env('DATABASE_URL'),
  },

  timezoneOffset: env('TIMEZONE_OFFSET', '+10:00'),
  scanIntervalMinutes: Number(env('SCAN_INTERVAL_MINUTES', '15')),
  dryRun: env('DRY_RUN', 'true') === 'true',

  business: {
    name: env('BUSINESS_NAME', 'Your Car Rentals'),
    phone: env('BUSINESS_PHONE', ''),
    docsUrl: env('DOCS_URL', ''),
  },

  rcm: {
    baseUrl: env('RCM_BASE_URL', 'https://apis.rentalcarmanager.com'),
    bookingsPath: env('RCM_BOOKINGS_PATH', '/booking/v3.2/bookings'),
    apiKey: env('RCM_API_KEY'),
    secretKey: env('RCM_SECRET_KEY'),
  },

  whatsapp: {
    apiVersion: env('WHATSAPP_API_VERSION', 'v21.0'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
    mode: env('WHATSAPP_MODE', 'template'),
    templateLanguage: env('WHATSAPP_TEMPLATE_LANGUAGE', 'en'),
  },

  webhook: {
    port: Number(env('PORT', env('WEBHOOK_PORT', '3000'))),
    path: env('WEBHOOK_PATH', '/webhook/whatsapp'),
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    forwardUrl: env('REPLY_FORWARD_URL'),
  },

  infographics: {
    OOL: env('INFOGRAPHIC_OOL_URL'),
    BNE: env('INFOGRAPHIC_BNE_URL'),
  },
};
