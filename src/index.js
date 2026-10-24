#!/usr/bin/env node
import { config } from './config.js';
import { SentLog } from './store.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { RcmBookingSource } from './rcm/rcmSource.js';
import { FileBookingSource } from './rcm/fileSource.js';
import { runOnce } from './runner.js';

// Usage:
//   node src/index.js run        one scan, then exit (use with cron / Task Scheduler)
//   node src/index.js watch      keep running, scanning every SCAN_INTERVAL_MINUTES
//   add --dry-run to either to only log messages
//   add --now=2026-10-31T08:00+10:00 to simulate a scan at a different time (testing)

const [command = 'run', ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run') || config.dryRun;
const nowFlag = flags.find((f) => f.startsWith('--now='))?.slice('--now='.length);

const source =
  config.bookingSource === 'rcm'
    ? new RcmBookingSource({ ...config.rcm, timezoneOffset: config.timezoneOffset })
    : new FileBookingSource({ file: config.bookingsFile, timezoneOffset: config.timezoneOffset });

const whatsapp = new WhatsAppClient({ ...config.whatsapp, dryRun });
const sentLog = new SentLog(config.sentLogFile);

async function scan() {
  try {
    const summary = await runOnce({ source, whatsapp, sentLog, now: nowFlag ? new Date(nowFlag) : new Date() });
    console.log(`[${new Date().toISOString()}] scan complete${dryRun ? ' (dry run)' : ''}:`, summary);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] scan failed:`, err.message);
    process.exitCode = 1;
  }
}

if (command === 'watch') {
  await scan();
  setInterval(scan, config.scanIntervalMinutes * 60 * 1000);
} else if (command === 'run') {
  await scan();
} else {
  console.error(`Unknown command "${command}". Use "run" or "watch".`);
  process.exit(1);
}
