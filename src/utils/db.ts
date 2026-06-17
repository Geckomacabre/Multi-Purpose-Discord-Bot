import { SQL } from 'bun';

export const db = new SQL('sqlite://db.sqlite');

export async function initDb() {
  if (db.options.adapter === 'sqlite') {
    try {
      await db`PRAGMA foreign_keys = ON;`;
      await db`PRAGMA journal_mode = WAL;`;
      await db`PRAGMA busy_timeout = 5000;`;
      await db`PRAGMA wal_autocheckpoint = 1000;`;
      await db`PRAGMA synchronous = NORMAL;`;
    } catch (err) {
      console.error('Failed to set PRAGMA settings:', err);
    }
  }
}
