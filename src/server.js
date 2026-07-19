import "dotenv/config";
import express from "express";
import cors from "cors";
import ordersRouter from "./routes/orders.js";
import { launchBot } from "./bot.js";
import "./db.js"; // ініціалізує БД та таблиці при старті

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "*",
  })
);
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api", ordersRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Бекенд запущено на порту ${PORT}`);
  launchBot();
});
