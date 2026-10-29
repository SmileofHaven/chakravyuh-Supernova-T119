// GET  /api/progress  -> dashboard data
// POST /api/progress  body: { type:"lesson"|"lab"|"code"|"quiz"|"sim", tag, id, score? }  (score = 0-100, quiz only)
// Header: Authorization: Bearer <firebase id token>
import { verifyUser, db, FieldValue } from "../lib/firebaseAdmin.js";

const XP = { lesson: 40, lab: 60, code: 50, quiz: 80, sim: 70 };
const PARTS = ["lesson", "lab", "code", "quiz"]; // mastery checkpoints (sim is XP-only)
const PASS = 70; // quiz % that counts
const UNLOCK_ALL = process.env.UNLOCK_ALL === "true"; // set true on Vercel for the demo
const GATE = 75;

const today = () => new Date().toISOString().slice(0, 10);
const levelOf = (xp) => Math.floor(xp / 100) + 1;
const reqParts = (t) => PARTS.filter((p) => t.masteryParts?.[p] !== false);

// year progress = average topic mastery (done parts / required parts) across all topics in that year
async function yearProgress(uid) {
  const [topicsSnap, progSnap] = await Promise.all([
    db.collection("topics").get(),
    db.collection(`users/${uid}/topics`).get(),
  ]);
  const prog = {};
  progSnap.forEach((d) => (prog[d.id] = d.data()));
  const buckets = { 1: [], 2: [], 3: [], 4: [] };
  topicsSnap.forEach((d) => {
    const t = d.data();
    const req = reqParts(t);
    const done = req.filter((p) => prog[d.id]?.[p]).length;
    buckets[t.year]?.push(req.length ? done / req.length : 0);
  });
  const pct = {};
  for (const y of [1, 2, 3, 4]) {
    const a = buckets[y];
    pct[y] = a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) : 0;
  }
  const unlocked = {
    1: true,
    2: UNLOCK_ALL || pct[1] >= GATE,
    3: UNLOCK_ALL || pct[2] >= GATE,
    4: UNLOCK_ALL || pct[3] >= GATE,
  };
  return { yearProgress: pct, unlocked, gate: GATE };
}

export default async function handler(req, res) {
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const uid = user.uid;

  try {
    // ---------- dashboard ----------
    if (req.method === "GET") {
      const [uSnap, tSnap, yp] = await Promise.all([
        db.doc(`users/${uid}`).get(),
        db.collection(`users/${uid}/topics`).get(),
        yearProgress(uid),
      ]);
      const topics = {};
      tSnap.forEach((d) => (topics[d.id] = d.data()));
      const u = uSnap.exists ? uSnap.data() : { xp: 0, level: 1, streak: 0, badges: [] };
      return res.status(200).json({
        user: { name: u.name, xp: u.xp, level: u.level, xpToNext: 100 - (u.xp % 100), streak: u.streak, badges: u.badges || [] },
        topics,
        ...yp,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

    // ---------- record activity ----------
    const { type, tag, id, score } = req.body || {};
    if (!XP[type] || !tag || !id) return res.status(400).json({ error: "type, tag, id required" });
    if (type === "quiz" && !(typeof score === "number" && score >= 0 && score <= 100))
      return res.status(400).json({ error: "quiz needs score 0-100" });

    const userRef = db.doc(`users/${uid}`);
    const progRef = db.doc(`users/${uid}/topics/${tag}`);
    const topicRef = db.doc(`topics/${tag}`);

    const out = await db.runTransaction(async (t) => {
      const [uSnap, pSnap, tSnap] = await Promise.all([t.get(userRef), t.get(progRef), t.get(topicRef)]);
      if (!tSnap.exists) throw Object.assign(new Error("unknown topic"), { status: 404 });
      const topic = tSnap.data();

      const u = uSnap.exists
        ? uSnap.data()
        : { name: user.name || "Learner", xp: 0, streak: 0, lastActive: null, badges: [] };
      const p = pSnap.exists
        ? pSnap.data()
        : { lesson: false, lab: false, code: false, quiz: false, quizBest: 0, awarded: [], mastered: false };

      // what counts as "done"
      let success = true;
      if (type === "quiz") {
        p.quizBest = Math.max(p.quizBest || 0, score);
        success = score >= PASS;
      }
      if (success && PARTS.includes(type)) p[type] = true;

      // XP once per unique activity
      const key = `${type}:${id}`;
      let gain = 0;
      if (success && !p.awarded.includes(key)) {
        gain = XP[type];
        p.awarded.push(key);
      }

      // streak
      let streak = u.streak || 0;
      if (u.lastActive !== today()) {
        const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        streak = u.lastActive === y ? streak + 1 : 1;
      }

      // mastery + badge
      const newBadges = [];
      const nowMastered = reqParts(topic).every((x) => p[x]);
      if (nowMastered && !p.mastered) {
        p.mastered = true;
        const badge = topic.badge || `${topic.title} Master`;
        if (!(u.badges || []).includes(badge)) {
          newBadges.push(badge);
          u.badges = [...(u.badges || []), badge];
        }
      }

      const xp = (u.xp || 0) + gain;
      t.set(
        userRef,
        { name: u.name, photo: user.picture || null, xp, level: levelOf(xp), streak, lastActive: today(), badges: u.badges || [], updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      t.set(progRef, { ...p, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (type === "quiz")
        t.set(db.collection("quizAttempts").doc(), { uid, tag, quizId: id, score, at: FieldValue.serverTimestamp() });

      return {
        gained: gain,
        xp,
        level: levelOf(xp),
        xpToNext: 100 - (xp % 100),
        streak,
        topic: { lesson: p.lesson, lab: p.lab, code: p.code, quiz: p.quiz, quizBest: p.quizBest, mastered: p.mastered },
        newBadges,
        passed: success,
      };
    });

    const yp = await yearProgress(uid);
    return res.status(200).json({ ...out, ...yp });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Server error" });
  }
}
