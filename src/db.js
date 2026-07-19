import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "orders.db"));

db.pragma("journal_mode = WAL");

db.exec(`
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
  );

  CREATE TABLE IF NOT EXISTS quick_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT,
    phone TEXT
  );
`);

export default db;
