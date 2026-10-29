// POST /api/progress
// headers: Authorization: Bearer <firebase id token>
// body: { type: "lesson"|"quiz"|"challenge", id: string, score?: number, total?: number }
// returns: { xp, level, streak, completed }
import { verifyUser, db, FieldValue } from "../lib/firebaseAdmin.js";

const XP = { lesson: 20, quiz: 10, challenge: 30 }; // quiz: +10 base + score bonus

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { type, id, score = 0, total = 0 } = req.body || {};
  if (!XP[type] || !id) return res.status(400).json({ error: "bad body" });

  const userRef = db.doc(`users/${user.uid}`);
  const today = new Date().toISOString().slice(0, 10);

  const out = await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    const u = snap.exists
      ? snap.data()
      : { name: user.name || "Learner", xp: 0, streak: 0, lastActive: null, completed: [] };

    const key = `${type}:${id}`;
    const firstTime = !u.completed.includes(key);

    // only award XP first time (quiz retries update best score only)
    let gain = 0;
    if (firstTime) gain = XP[type] + (type === "quiz" ? score * 5 : 0);

    // streak
    let streak = u.streak || 0;
    if (u.lastActive !== today) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      streak = u.lastActive === y ? streak + 1 : 1;
    }

    const xp = (u.xp || 0) + gain;
    const completed = firstTime ? [...u.completed, key] : u.completed;

    t.set(
      userRef,
      {
        name: u.name,
        photo: user.picture || null,
        xp,
        level: Math.floor(xp / 100) + 1,
        streak,
        lastActive: today,
        completed,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (type === "quiz") {
      t.set(db.collection("quizAttempts").doc(), {
        uid: user.uid,
        quizId: id,
        score,
        total,
        at: FieldValue.serverTimestamp(),
      });
    }
    return { xp, level: Math.floor(xp / 100) + 1, streak, completed };
  });

  return res.status(200).json(out);
}
