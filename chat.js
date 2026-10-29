// POST /api/chat
// headers: Authorization: Bearer <firebase id token>
// body: { messages: [{role:"user"|"assistant", content:string}], mode?: "tutor"|"debug"|"explain" }
// returns: { reply: string }
import { verifyUser, db, FieldValue } from "../lib/firebaseAdmin.js";

const SYSTEM = {
  tutor: `You are an ENTC (Electronics & Telecommunication Engineering) tutor inside a learning platform.
Cover digital electronics, analog circuits, communication systems, sensors, microcontrollers (Arduino-style), signal processing, IoT.
Explain simply first, then add depth. Use small examples, analogies, and short formulas. Keep answers under 150 words unless asked for more.
If the question is unrelated to ENTC/engineering, politely steer back.`,
  debug: `You are a debugging assistant for ENTC students. The user will paste Arduino-style code or describe a circuit problem.
Find the likely cause, explain WHY in 1-2 lines, then give the fix. Be concise.`,
  explain: `The student just answered a quiz question wrongly. Explain the correct answer in simple terms, why their choice was wrong, and give one memory trick. Under 100 words.`,
};

const DAILY_LIMIT = 40; // per user, protects your API credits

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { messages, mode = "tutor" } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: "messages required" });

  // basic rate limit: counter doc per user per day
  const day = new Date().toISOString().slice(0, 10);
  const rlRef = db.doc(`rateLimits/${user.uid}_${day}`);
  const rl = await rlRef.get();
  if ((rl.exists ? rl.data().count : 0) >= DAILY_LIMIT)
    return res.status(429).json({ error: "Daily limit reached" });
  await rlRef.set({ count: FieldValue.increment(1) }, { merge: true });

  // keep only last 10 msgs, cap length
  const trimmed = messages.slice(-10).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content).slice(0, 4000),
  }));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.LLM_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "claude-sonnet-4-6",
        max_tokens: 600,
        system: SYSTEM[mode] || SYSTEM.tutor,
        messages: trimmed,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || "LLM error" });
    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}
