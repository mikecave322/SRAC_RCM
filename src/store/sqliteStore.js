import fs from 'node:fs';
import path from 'node:path';
import { SqlStore } from './sqlStore.js';

/**
 * SQLite database file, using the SQLite built into Node.js (22.13+), so nothing to install.
 * Safe for several processes on the same machine. For instances on different machines use Postgres.
 */
export class SqliteStore extends SqlStore {
  constructor({ file }) {
    super();
    this.file = file;
  }

  async init() {
    const { DatabaseSync } = await import('node:sqlite');
    if (this.file !== ':memory:') fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    // Switching to WAL mode (so several processes can share the file) can report "locked"
    // straight away while another process opens the same new file, so retry briefly.
    for (let attempt = 1; ; attempt++) {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
        break;
      } catch (err) {
        if (attempt >= 50 || !/locked|busy/i.test(err.message)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await super.init();
  }

  async query(sql, params = []) {
    const statement = this.db.prepare(sql);
    return /^\s*SELECT|RETURNING/i.test(sql) ? statement.all(...params) : (statement.run(...params), []);
  }

  async close() {
    this.db?.close();
  }
}
