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

// Порядок статусів для команди /all та для читабельного виводу
const STATUS_ORDER = ["new", "in_progress", "ready", "delivered"];

function statusKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🟡 В роботі", `status:${orderId}:in_progress`),
      Markup.button.callback("🟢 Готово", `status:${orderId}:ready`),
    ],
    [Markup.button.callback("🔵 Доставлено клієнту", `status:${orderId}:delivered`)],
  ]);
}

// Екранування спецсимволів HTML, щоб адреса/ім'я клієнта не ламали розмітку Telegram
function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      const extrasLine = extrasParts.length ? `\n   <i>Комплектація: ${esc(extrasParts.join(", "))}</i>` : "";

      return `<b>${idx + 1}.</b> ${esc(it.label)}
   ${it.quantity} шт × ${it.result?.total ?? "-"} грн = <b>${it.itemTotal} грн</b>${extrasLine}`;
    })
    .join("\n\n");

  const createdAt = order.created_at ? new Date(order.created_at.replace(" ", "T") + "Z") : null;
  const dateStr = createdAt
    ? createdAt.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return `<b>🚨 ЗАМОВЛЕННЯ №${order.id}</b>${dateStr ? `  <i>(${dateStr})</i>` : ""}

👤 <b>Клієнт:</b> ${esc(order.customer_name)}
📞 <b>Телефон:</b> ${esc(order.customer_phone)}
📱 <b>Зв'язок:</b> ${esc(order.messenger)}${order.contact_link ? ` — ${esc(order.contact_link)}` : ""}
📍 <b>Адреса:</b> ${esc(order.address)}

📦 <b>ВИРОБИ (${items.length}):</b>

${itemsText}

💰 <b>РАЗОМ: ${order.total_price} грн</b>

Статус: <b>${STATUS_LABELS[order.status] || STATUS_LABELS.new}</b>`;
}

async function sendOrderList(ctx, rows, emptyText) {
  if (rows.length === 0) {
    return ctx.reply(emptyText);
  }
  for (const order of rows) {
    await ctx.reply(buildOrderMessage(order), {
      parse_mode: "HTML",
      ...statusKeyboard(order.id),
    });
  }
}

/**
 * Надсилає повідомлення про нове замовлення усім дозволеним ID.
 */
export async function notifyNewOrder(order) {
  if (!bot) return;
  for (const chatId of ALLOWED_IDS) {
    try {
      const msg = await bot.telegram.sendMessage(chatId, buildOrderMessage(order), {
        parse_mode: "HTML",
        ...statusKeyboard(order.id),
      });
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

  const HELP_TEXT = `👋 CRM-бот moskitni_sitki. Доступні команди:

/orders — активні замовлення (нові + в роботі + готові)
/new — лише нові замовлення
/inprogress — замовлення в роботі
/ready — готові, очікують доставки
/delivered — доставлені (останні 20)
/all — усі замовлення (останні 30)
/help — цей список команд`;

  bot.start((ctx) => ctx.reply(HELP_TEXT));
  bot.help((ctx) => ctx.reply(HELP_TEXT));

  bot.command("orders", async (ctx) => {
    const result = await db.execute(
      "SELECT * FROM orders WHERE status != 'delivered' ORDER BY created_at DESC LIMIT 20"
    );
    await sendOrderList(ctx, result.rows, "Немає активних замовлень.");
  });

  bot.command("new", async (ctx) => {
    const result = await db.execute({
      sql: "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 20",
      args: ["new"],
    });
    await sendOrderList(ctx, result.rows, "Немає нових замовлень.");
  });

  bot.command("inprogress", async (ctx) => {
    const result = await db.execute({
      sql: "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 20",
      args: ["in_progress"],
    });
    await sendOrderList(ctx, result.rows, "Немає замовлень в роботі.");
  });

  bot.command("ready", async (ctx) => {
    const result = await db.execute({
      sql: "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 20",
      args: ["ready"],
    });
    await sendOrderList(ctx, result.rows, "Немає готових замовлень.");
  });

  bot.command("delivered", async (ctx) => {
    const result = await db.execute({
      sql: "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 20",
      args: ["delivered"],
    });
    await sendOrderList(ctx, result.rows, "Ще немає доставлених замовлень.");
  });

  bot.command("all", async (ctx) => {
    const result = await db.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 30");
    await sendOrderList(ctx, result.rows, "Замовлень ще немає.");
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
      await ctx.editMessageText(buildOrderMessage(order), {
        parse_mode: "HTML",
        ...statusKeyboard(order.id),
      });
    } catch (err) {
      // повідомлення могло бути вже змінене конкурентно — ігноруємо
    }
    await ctx.answerCbQuery(`Статус оновлено: ${STATUS_LABELS[newStatus]}`);
  });
}

export async function launchBot(webhookPath) {
  if (!bot) return;

  await bot.telegram
    .setMyCommands([
      { command: "orders", description: "Активні замовлення (нові + в роботі + готові)" },
      { command: "new", description: "Лише нові замовлення" },
      { command: "inprogress", description: "Замовлення в роботі" },
      { command: "ready", description: "Готові, очікують доставки" },
      { command: "delivered", description: "Доставлені замовлення" },
      { command: "all", description: "Усі замовлення (останні 30)" },
      { command: "help", description: "Список команд" },
    ])
    .catch((err) => console.error("Не вдалося зареєструвати команди бота:", err.message));

  // На Render (і будь-якому продакшн-хостингу) використовуємо webhook —
  // це усуває конфлікт "409: terminated by other getUpdates request",
  // який виникає з long polling під час перезапуску/деплою.
  const publicUrl = process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL;

  if (publicUrl && webhookPath) {
    const webhookUrl = `${publicUrl.replace(/\/$/, "")}${webhookPath}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`🤖 Telegram-бот запущено у режимі webhook: ${webhookUrl}`);
  } else {
    // Локальна розробка без публічної адреси — звичайний long polling
    await bot.telegram.deleteWebhook().catch(() => {});
    bot.launch();
    console.log("🤖 Telegram-бот запущено у режимі polling (локальна розробка)");
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }
}
