// POST /api/chat   Authorization: Bearer <firebase id token>
// body: {
//   messages: [{role, content}],
//   mode: "explain" | "debug" | "interview",
//   tag?: "digital-electronics",   lessonId?: "digital-electronics-01",
//   level?: "simple" | "standard" | "interview",        // explain
//   rung?: 1|2|3|4, attempts?: number,                  // debug (4 = show answer, needs attempts >= 1)
//   jobType?, round?, difficulty?                       // interview
// }
// -> { reply }
import { verifyUser, db, FieldValue } from "../lib/firebaseAdmin.js";

const DAILY_LIMIT = 60;

const BASE = `You are the AI mentor inside an ENTC (Electronics & Telecommunication Engineering) learning platform for B.Tech students.
Be accurate and concise (under 150 words unless asked). If something is outside ENTC/engineering, steer back politely. Never invent facts; say when unsure.`;

const LEVELS = {
  simple: "Audience: new to the topic. Use plain words and an everyday analogy. No jargon without defining it.",
  standard: "Audience: a B.Tech student. Give the definition, formula/truth table where relevant, and one short example.",
  interview: "Audience: preparing for a job interview. Go deeper: implementation details, trade-offs, and typical follow-up questions.",
};

const RUNGS = {
  1: "HINT 1 (nudge): Do NOT give code, function names or the answer. Ask one guiding question that points at where the problem is.",
  2: "HINT 2 (approach): Describe the approach and name the relevant concept or function, but write NO code lines.",
  3: "HINT 3 (near-solution): Describe the exact change needed in words. At most one short code fragment; do NOT give the whole corrected program.",
  4: "SHOW ANSWER: Give the full corrected solution, then explain in 2-3 lines why it works.",
};

async function loadContext(tag, lessonId) {
  let ctx = "";
  if (tag) {
    const t = await db.doc(`topics/${tag}`).get();
    if (t.exists) ctx += `Current topic: ${t.data().title} (#${tag}, Year ${t.data().year}).\n`;
  }
  if (lessonId) {
    const l = await db.doc(`lessons/${lessonId}`).get();
    if (l.exists && l.data().aiContext)
      ctx += `Lesson reference - reuse its terminology and wording instead of inventing new explanations:\n${String(l.data().aiContext).slice(0, 3500)}\n`;
  }
  return ctx;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { messages, mode = "explain", tag, lessonId, level = "standard", rung = 1, attempts = 0, jobType, round, difficulty } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages required" });

  // build system prompt per mode (hint ladder enforced here, not just in UI)
  let system = BASE;
  if (mode === "explain") {
    system += "\n" + (LEVELS[level] || LEVELS.standard);
  } else if (mode === "debug") {
    const r = Number(rung);
    if (![1, 2, 3, 4].includes(r)) return res.status(400).json({ error: "rung must be 1-4" });
    if (r === 4 && Number(attempts) < 1) return res.status(403).json({ error: "Try the challenge first before asking for the answer" });
    system += `\nYou are helping debug Arduino-style C code or a circuit. Find the likely cause. ${RUNGS[r]}`;
  } else if (mode === "interview") {
    system += `\nYou are a mock interviewer. Job type: ${jobType || "core electronics"}. Round: ${round || "technical"}. Difficulty: ${difficulty || "medium"}. Ask ONE question at a time, wait for the answer, then give brief feedback and ask one follow-up.`;
  } else {
    return res.status(400).json({ error: "unknown mode" });
  }
  system += "\n" + (await loadContext(tag, lessonId));

  // rate limit per user per day
  const day = new Date().toISOString().slice(0, 10);
  const rlRef = db.doc(`rateLimits/${user.uid}_${day}`);
  const rl = await rlRef.get();
  if ((rl.exists ? rl.data().count : 0) >= DAILY_LIMIT) return res.status(429).json({ error: "Daily AI limit reached" });
  await rlRef.set({ count: FieldValue.increment(1) }, { merge: true });

  const trimmed = messages.slice(-10).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content).slice(0, 4000),
  }));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.LLM_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.LLM_MODEL || "claude-sonnet-4-6", max_tokens: 700, system, messages: trimmed }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || "LLM error" });
    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return res.status(200).json({ reply });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
}
