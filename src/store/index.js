import { JsonStore } from './jsonStore.js';
import { SqliteStore } from './sqliteStore.js';
import { PostgresStore } from './postgresStore.js';

/**
 * Where sent messages, delivery receipts and customer replies are kept.
 *   json     data/sent-log.json — single instance only
 *   sqlite   data/notifier.db — several processes on one machine
 *   postgres DATABASE_URL — several instances on any number of machines
 */
export async function createStore({ type, jsonFile, sqliteFile, databaseUrl }) {
  const store =
    type === 'postgres' ? new PostgresStore({ url: databaseUrl })
    : type === 'sqlite' ? new SqliteStore({ file: sqliteFile })
    : type === 'json' ? new JsonStore({ file: jsonFile })
    : null;
  if (!store) throw new Error(`Unknown STORE "${type}". Use json, sqlite or postgres.`);
  await store.init();
  return store;
}
