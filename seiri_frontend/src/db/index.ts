// Local storage for SwipeClean.
// Native: expo-sqlite. Web: in-memory (preview only).

import { Platform } from "react-native";

type Row = Record<string, any>;
type DBApi = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: any[]) => Promise<void>;
  getFirstAsync: <T = Row>(sql: string, params?: any[]) => Promise<T | null>;
  getAllAsync: <T = Row>(sql: string, params?: any[]) => Promise<T[]>;
};

let dbInstance: DBApi | null = null;
// Dev-only helpers — safe to remove before shipping.
export async function nukeAppTrash(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM trash");
}

export async function wipeAllAppData(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require("expo-sqlite") as any;
  await SQLite.deleteDatabaseAsync("swipeclean.db");
}

// Simple in-memory implementation for web preview. Persists only for the tab.
function makeMemoryDb(): DBApi {
  const tables: Record<string, any[]> = {
    settings: [],
    albums: [],
    album_items: [],
    trash: [],
    actions: [],
  };
  // We ignore SQL and store only what the app writes via known statements.
  const parseTable = (sql: string): string | null => {
    const m = sql.match(/(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i);
    return m ? m[1] : null;
  };
  return {
    async execAsync() {},
    async runAsync(sql, params = []) {
      const table = parseTable(sql);
      if (!table) return;
      const rows = tables[table] ?? (tables[table] = []);
      if (/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+settings/i.test(sql)) {
        const [key, value] = params;
        const existing = rows.find((r) => r.key === key);
        if (existing) existing.value = value;
        else rows.push({ key, value });
      } else if (/^\s*INSERT\s+INTO\s+albums/i.test(sql)) {
        const [id, name, cover_uri, created_at] = params;
        rows.push({ id, name, cover_uri, created_at });
      } else if (/^\s*UPDATE\s+albums/i.test(sql)) {
        const [name, id] = params;
        const r = rows.find((x) => x.id === id);
        if (r) r.name = name;
      } else if (/^\s*DELETE\s+FROM\s+albums/i.test(sql)) {
        const [id] = params;
        tables.albums = rows.filter((r) => r.id !== id);
      } else if (/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+album_items/i.test(sql)) {
        const [album_id, media_id, added_at] = params;
        const existing = rows.find((r) => r.album_id === album_id && r.media_id === media_id);
        if (existing) existing.added_at = added_at;
        else rows.push({ album_id, media_id, added_at });
      } else if (/^\s*DELETE\s+FROM\s+album_items\s+WHERE\s+album_id/i.test(sql)) {
        const [album_id, media_id] = params;
        if (media_id !== undefined) {
          tables.album_items = rows.filter(
            (r) => !(r.album_id === album_id && r.media_id === media_id),
          );
        } else {
          tables.album_items = rows.filter((r) => r.album_id !== album_id);
        }
      } else if (/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+trash/i.test(sql)) {
        const [media_id, snapshot, deleted_at] = params;
        const existing = rows.find((r) => r.media_id === media_id);
        if (existing) {
          existing.snapshot = snapshot;
          existing.deleted_at = deleted_at;
        } else rows.push({ media_id, snapshot, deleted_at });
      } else if (/^\s*DELETE\s+FROM\s+trash/i.test(sql)) {
        tables.trash = rows.filter((r) => !params.includes(r.media_id));
      }
    },
    async getFirstAsync<T = Row>(sql: string, params: any[] = []): Promise<T | null> {
      const table = parseTable(sql);
      if (!table) return null;
      const rows = tables[table] ?? [];
      if (/settings\s+WHERE\s+key/i.test(sql)) {
        return (rows.find((r) => r.key === params[0]) as T) ?? null;
      }
      return (rows[0] as T) ?? null;
    },
    async getAllAsync<T = Row>(sql: string): Promise<T[]> {
      const table = parseTable(sql);
      if (!table) return [];
      return [...(tables[table] ?? [])] as T[];
    },
  };
}

export async function getDb(): Promise<DBApi> {
  if (dbInstance) return dbInstance;
  if (Platform.OS === "web") {
    dbInstance = makeMemoryDb();
    return dbInstance;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require("expo-sqlite") as any;
  const db = await SQLite.openDatabaseAsync("swipeclean.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, cover_uri TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS album_items (
      album_id TEXT NOT NULL, media_id TEXT NOT NULL, added_at INTEGER NOT NULL,
      PRIMARY KEY (album_id, media_id)
    );
    CREATE TABLE IF NOT EXISTS trash (
      media_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, deleted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  dbInstance = db as unknown as DBApi;
  return dbInstance;
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    if (!row) return fallback;
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      [key, JSON.stringify(value)],
    );
  } catch {}
}
