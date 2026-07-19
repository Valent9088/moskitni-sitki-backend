import { Router } from "express";
import db from "../db.js";
import { notifyNewOrder } from "../bot.js";

const router = Router();

// POST /api/orders — створення нового замовлення (одне або декілька виробів) з калькулятора
router.post("/orders", async (req, res) => {
  try {
    const { customer, items, total } = req.body || {};

    if (!customer?.fullName || !customer?.phone) {
      return res.status(400).json({ error: "Вкажіть ім'я та телефон." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Кошик порожній — додайте хоча б один виріб." });
    }

    const computedTotal = items.reduce((s, i) => s + (Number(i.itemTotal) || 0), 0);

    const insertResult = await db.execute({
      sql: `
        INSERT INTO orders (
          customer_name, customer_phone, messenger, contact_link, address,
          items, total_price, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
      `,
      args: [
        customer.fullName,
        customer.phone,
        customer.messenger || "-",
        customer.contactLink || "",
        customer.address || "",
        JSON.stringify(items),
        total ?? computedTotal,
      ],
    });

    const orderId = Number(insertResult.lastInsertRowid);
    const orderResult = await db.execute({
      sql: "SELECT * FROM orders WHERE id = ?",
      args: [orderId],
    });
    const order = orderResult.rows[0];

    // Надсилаємо повідомлення в Telegram (не блокуємо відповідь клієнту)
    notifyNewOrder(order).catch((err) => console.error("notifyNewOrder error:", err));

    res.status(201).json({ id: order.id, status: order.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Внутрішня помилка сервера." });
  }
});

// GET /api/orders — список замовлень (для внутрішньої панелі, якщо знадобиться)
router.get("/orders", async (req, res) => {
  const { status } = req.query;
  const result = status
    ? await db.execute({ sql: "SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC", args: [status] })
    : await db.execute("SELECT * FROM orders ORDER BY created_at DESC");
  res.json(result.rows);
});

// POST /api/quick-contact — форма швидкої консультації у футері
router.post("/quick-contact", async (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: "Вкажіть ім'я та телефон." });
  }
  await db.execute({
    sql: "INSERT INTO quick_contacts (name, phone) VALUES (?, ?)",
    args: [name, phone],
  });
  res.status(201).json({ ok: true });
});

export default router;
