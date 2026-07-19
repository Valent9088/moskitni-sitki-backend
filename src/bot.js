import { Telegraf, Markup } from "telegraf";
import db from "./db.js";

const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn("⚠️  TELEGRAM_BOT_TOKEN не заданий — бот не буде запущений.");
}

export const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new Telegraf(process.env.TELEGRAM_BOT_TOKEN)
  : null;

const STATUS_LABELS = {
  new: "🆕 Нове",
  in_progress: "🟡 В роботі",
  ready: "🟢 Готово",
  delivered: "🔵 Доставлено клієнту",
};

function statusKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🟡 В роботі", `status:${orderId}:in_progress`),
      Markup.button.callback("🟢 Готово", `status:${orderId}:ready`),
    ],
    [Markup.button.callback("🔵 Доставлено клієнту", `status:${orderId}:delivered`)],
  ]);
}

function buildOrderMessage(order) {
  const items = order.items ? JSON.parse(order.items) : [];

  const itemsText = items
    .map((it, idx) => {
      const s = it.selection || {};
      const extrasParts = [];
      if (s.handleKey) extrasParts.push(`Ручки: ${s.handleKey === "metal" ? "Метал" : "Пластик"}`);
      if (s.metalHinges) extrasParts.push("Металеві завіси з автодотягуванням");
      if (s.brakeMechanism) extrasParts.push("Гальмівний механізм");
      if (s.mounted) extrasParts.push("Монтаж");
      const extrasText = extrasParts.length ? `\n   Комплектація: ${extrasParts.join(", ")}` : "";

      return `${idx + 1}) ${it.label}
   Кількість: ${it.quantity} шт × ${it.result?.total ?? "-"} грн = ${it.itemTotal} грн${extrasText}`;
    })
    .join("\n\n");

  return `🚨 НОВЕ ЗАМОВЛЕННЯ №${order.id}
👤 Клієнт: ${order.customer_name}
📞 Телефон: ${order.customer_phone}
📱 Соцмережа для звʼязку: ${order.messenger}
🤳 Посилання на інстаграм: ${order.contact_link || "-"}
📍 Адреса: ${order.address}

📦 ВИРОБИ (${items.length}):
${itemsText}

💰 РАЗОМ: ${order.total_price} грн
-----------------------------------------
Статус замовлення: ${STATUS_LABELS[order.status] || STATUS_LABELS.new}`;
}

/**
 * Надсилає повідомлення про нове замовлення усім дозволеним ID.
 */
export async function notifyNewOrder(order) {
  if (!bot) return;
  for (const chatId of ALLOWED_IDS) {
    try {
      const msg = await bot.telegram.sendMessage(chatId, buildOrderMessage(order), statusKeyboard(order.id));
      await db.execute({
        sql: "UPDATE orders SET telegram_message_id = ?, telegram_chat_id = ? WHERE id = ?",
        args: [msg.message_id, chatId, order.id],
      });
    } catch (err) {
      console.error(`Не вдалося надіслати повідомлення в чат ${chatId}:`, err.message);
    }
  }
}

if (bot) {
  // Доступ лише для дозволених ID
  bot.use((ctx, next) => {
    const id = ctx.from?.id;
    if (!ALLOWED_IDS.includes(id)) {
      return ctx.reply("⛔ Доступ заборонено.");
    }
    return next();
  });

  bot.start((ctx) => ctx.reply("👋 Вітаю! Це CRM-бот moskitni_sitki. Команда /orders — список поточних замовлень."));

  bot.command("orders", async (ctx) => {
    const result = await db.execute(
      "SELECT * FROM orders WHERE status != 'delivered' ORDER BY created_at DESC LIMIT 20"
    );
    const rows = result.rows;

    if (rows.length === 0) {
      return ctx.reply("Немає активних замовлень.");
    }

    for (const order of rows) {
      await ctx.reply(buildOrderMessage(order), statusKeyboard(order.id));
    }
  });

  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data; // "status:<id>:<newStatus>"
    const [, orderIdStr, newStatus] = data.split(":");
    const orderId = Number(orderIdStr);

    if (!STATUS_LABELS[newStatus]) {
      return ctx.answerCbQuery("Невідомий статус");
    }

    await db.execute({
      sql: "UPDATE orders SET status = ? WHERE id = ?",
      args: [newStatus, orderId],
    });
    const result = await db.execute({
      sql: "SELECT * FROM orders WHERE id = ?",
      args: [orderId],
    });
    const order = result.rows[0];

    if (!order) {
      return ctx.answerCbQuery("Замовлення не знайдено");
    }

    try {
      await ctx.editMessageText(buildOrderMessage(order), statusKeyboard(order.id));
    } catch (err) {
      // повідомлення могло бути вже змінене конкурентно — ігноруємо
    }
    await ctx.answerCbQuery(`Статус оновлено: ${STATUS_LABELS[newStatus]}`);
  });
}

export function launchBot() {
  if (!bot) return;
  bot.launch();
  console.log("🤖 Telegram-бот запущено");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
