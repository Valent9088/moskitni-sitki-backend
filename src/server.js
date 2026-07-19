import "dotenv/config";
import express from "express";
import cors from "cors";
import ordersRouter from "./routes/orders.js";
import { bot, launchBot } from "./bot.js";
import { initDb } from "./db.js";

const app = express();

// Маршрут для Telegram webhook має бути ПЕРЕД express.json(),
// оскільки Telegraf сам парсить тіло запиту.
const WEBHOOK_PATH = "/telegram-webhook";
if (bot) {
  app.use(bot.webhookCallback(WEBHOOK_PATH));
}

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
  })
);
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api", ordersRouter);

const PORT = process.env.PORT || 4000;

async function start() {
  await initDb(); // створює таблиці в Turso, якщо їх ще немає
  app.listen(PORT, async () => {
    console.log(`✅ Бекенд запущено на порту ${PORT}`);
    await launchBot(WEBHOOK_PATH);
  });
}

start().catch((err) => {
  console.error("❌ Не вдалося запустити сервер:", err);
  process.exit(1);
});
