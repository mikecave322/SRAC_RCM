import { SqlStore } from './sqlStore.js';
import { toPostgres } from './sql.js';

/**
 * Postgres database: use this to run more than one instance across machines.
 * Needs the "pg" package: npm install pg
 */
export class PostgresStore extends SqlStore {
  constructor({ url }) {
    super();
    if (!url) throw new Error('DATABASE_URL must be set for STORE=postgres');
    this.url = url;
  }

  async init() {
    let pg;
    try {
      pg = (await import('pg')).default;
    } catch {
      throw new Error('STORE=postgres needs the "pg" package. Run: npm install pg');
    }
    this.pool = new pg.Pool({ connectionString: this.url });
    await super.init();
  }

  async query(sql, params = []) {
    // Postgres can't infer the type of a bare "?" inside the status CASE, so it is cast to text.
    const text = toPostgres(sql).replace(/CASE \$(\d+) /g, 'CASE $$$1::text ');
    return (await this.pool.query(text, params)).rows;
  }

  async close() {
    await this.pool?.end();
  }
}
