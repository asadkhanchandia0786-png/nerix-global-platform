import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
export type Row = Record<string, any>;
export interface Query { query<T extends Row = Row>(sql: string, params?: any[]): Promise<{ rows: T[] }> }
export interface DB extends Query { transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T>; close(): Promise<void>; embedded?: PGlite }
export async function openDB(url?: string, path = 'data/postgres'): Promise<DB> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 10000 });
    return { query: (sql, params) => pool.query(sql, params), close: () => pool.end(), async transaction(fn) {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
      catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    }};
  }
  const embedded = await PGlite.create(path);
  // Serialize the entire transaction, including plain reads, on a single connection.
  let tail: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>) => { const p = tail.then(fn, fn); tail = p.catch(() => {}); return p; };
  return { embedded, query: (s, p) => locked(() => embedded.query(s, p)), transaction: fn => locked(() => embedded.transaction(tx => fn(tx))), close: () => locked(() => embedded.close()) };
}
export async function migrate(db: DB) {
  const files = [['001','001-foundation.sql'],['002','002-live-chat.sql'],['003','003-internal-companies.sql'],['004','004-business-software.sql'],['005','005-company-software-billing.sql'],['006','006-inbound-voice.sql']] as const;
  await db.transaction(async tx => {
    // A database advisory lock prevents concurrent first starts from applying schema twice.
    await tx.query('SELECT pg_advisory_xact_lock(7011001)');
    await tx.query('CREATE TABLE IF NOT EXISTS migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const [version,file] of files) if (!(await tx.query('SELECT version FROM migrations WHERE version=$1', [version])).rows.length) {
      const sql = await readFile(new URL(`../database/${file}`, import.meta.url), 'utf8');
      for (const statement of sql.split('-- statement-break')) if (statement.trim()) await tx.query(statement);
      await tx.query('INSERT INTO migrations(version) VALUES ($1)', [version]);
    }
  });
}
