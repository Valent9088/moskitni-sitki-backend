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

    const insert = db.prepare(`
      INSERT INTO orders (
        customer_name, customer_phone, messenger, contact_link, address,
        items, total_price, status
      ) VALUES (@customer_name, @customer_phone, @messenger, @contact_link, @address,
        @items, @total_price, 'new')
    `);

    const info = insert.run({
      customer_name: customer.fullName,
      customer_phone: customer.phone,
      messenger: customer.messenger || "-",
      contact_link: customer.contactLink || "",
      address: customer.address || "",
      items: JSON.stringify(items),
      total_price: total ?? computedTotal,
    });

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid);

    // Надсилаємо повідомлення в Telegram (не блокуємо відповідь клієнту)
    notifyNewOrder(order).catch((err) => console.error("notifyNewOrder error:", err));

    res.status(201).json({ id: order.id, status: order.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Внутрішня помилка сервера." });
  }
});

// GET /api/orders — список замовлень (для внутрішньої панелі, якщо знадобиться)
router.get("/orders", (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  res.json(rows);
});

// POST /api/quick-contact — форма швидкої консультації у футері
router.post("/quick-contact", (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: "Вкажіть ім'я та телефон." });
  }
  db.prepare("INSERT INTO quick_contacts (name, phone) VALUES (?, ?)").run(name, phone);
  res.status(201).json({ ok: true });
});

export default router;
