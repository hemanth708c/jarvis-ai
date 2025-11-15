// index.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
if (!OPENAI_KEY) {
  console.warn("Warning: OPENAI_API_KEY not set. The assistant endpoint will fail until you set it in .env");
}

const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use("/api/", limiter);

app.post("/api/assistant", async (req, res) => {
  try {
    const { message, history } = req.body || {};
    const systemPrompt = "You are Jarvis, a helpful assistant. Keep answers short and actionable.";
    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-6).map(h => ({ role: h.role, content: h.text })) : []),
      { role: "user", content: message || "" }
    ];

    const payload = {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages
    };

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {

      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error("LLM error:", txt);
      return res.status(500).send("LLM provider error: " + txt);
    }

    const json = await r.json();
    const reply = json.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate a reply.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Jarvis backend listening on http://localhost:${PORT}`));
