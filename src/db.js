import { createClient } from "@libsql/client";

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn(
    "⚠️  TURSO_DATABASE_URL / TURSO_AUTH_TOKEN не задані — база даних не працюватиме."
  );
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      customer_name TEXT,
      customer_phone TEXT,
      messenger TEXT,
      contact_link TEXT,
      address TEXT,
      items TEXT,
      total_price REAL,
      status TEXT NOT NULL DEFAULT 'new',
      telegram_message_id INTEGER,
      telegram_chat_id INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS quick_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      name TEXT,
      phone TEXT
    )
  `);
}

export default db;
