#!/usr/bin/env node
import { config } from './config.js';
import { createStore } from './store/index.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { RcmBookingSource } from './rcm/rcmSource.js';
import { FileBookingSource } from './rcm/fileSource.js';
import { runOnce } from './runner.js';
import { createWebhookServer } from './webhook/server.js';
import { Notifier } from './webhook/notifier.js';
import { testSend } from './testSend.js';

// Usage:
//   node src/index.js run        one scan, then exit (use with cron / Task Scheduler)
//   node src/index.js watch      keep running, scanning every SCAN_INTERVAL_MINUTES
//   node src/index.js webhook    only receive WhatsApp replies and delivery receipts
//   node src/index.js all        watch + webhook in one process
//   node src/index.js test-send <your mobile> [hello_world|all|week_out|...]
//                                send sample messages to your own phone (see README)
//   add --dry-run to run/watch/all to only log messages
//   add --now=2026-10-31T08:00+10:00 to simulate a scan at a different time (testing)

const [command = 'run', ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run') || config.dryRun;
const nowFlag = flags.find((f) => f.startsWith('--now='))?.slice('--now='.length);

if (command === 'test-send') {
  const [phone, what] = flags.filter((f) => !f.startsWith('--'));
  if (!phone) {
    console.error('Usage: node src/index.js test-send <your mobile> [hello_world|all|week_out|two_days|day_of|mid_trip]');
    process.exit(1);
  }
  try {
    await testSend({ whatsapp: new WhatsAppClient({ ...config.whatsapp, dryRun }), phone, what });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
  process.exit();
}

if (!['run', 'watch', 'webhook', 'all'].includes(command)) {
  console.error(`Unknown command "${command}". Use run, watch, webhook, all or test-send.`);
  process.exit(1);
}

const store = await createStore(config.store);

function startScanner() {
  const source =
    config.bookingSource === 'rcm'
      ? new RcmBookingSource({ ...config.rcm, timezoneOffset: config.timezoneOffset })
      : new FileBookingSource({ file: config.bookingsFile, timezoneOffset: config.timezoneOffset });
  const whatsapp = new WhatsAppClient({ ...config.whatsapp, dryRun });

  return async function scan() {
    try {
      const summary = await runOnce({ source, whatsapp, store, now: nowFlag ? new Date(nowFlag) : new Date() });
      console.log(`[${new Date().toISOString()}] scan complete${dryRun ? ' (dry run)' : ''}:`, summary);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] scan failed:`, err.message);
      process.exitCode = 1;
    }
  };
}

function startWebhook() {
  const server = createWebhookServer({
    ...config.webhook,
    store,
    notifier: new Notifier({ forwardUrl: config.webhook.forwardUrl }),
  });
  server.listen(config.webhook.port, () => {
    console.log(`Webhook listening on port ${config.webhook.port} at ${config.webhook.path}`);
  });
}

if (command === 'run') {
  await startScanner()();
  await store.close();
} else {
  if (command === 'webhook' || command === 'all') startWebhook();
  if (command === 'watch' || command === 'all') {
    const scan = startScanner();
    await scan();
    setInterval(scan, config.scanIntervalMinutes * 60 * 1000);
  }
}
