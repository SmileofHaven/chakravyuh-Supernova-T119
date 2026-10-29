import { auth } from "./firebase";

async function call(path, method = "POST", body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---- AI ----
// Explain: chat(msgs, { mode:"explain", level:"simple"|"standard"|"interview", tag, lessonId })
// Debug:   chat(msgs, { mode:"debug", rung:1|2|3|4, attempts, tag })   (rung 4 = show answer, needs attempts>=1)
// Interview: chat(msgs, { mode:"interview", jobType, round, difficulty })
export const chat = (messages, opts = {}) => call("/api/chat", "POST", { messages, mode: "explain", ...opts });

// ---- Progress ----
// type: "lesson"|"lab"|"code"|"quiz"|"sim";  score (0-100) only for quiz
// returns { gained, xp, level, xpToNext, streak, topic, newBadges, passed, yearProgress, unlocked, gate }
export const saveProgress = (type, tag, id, score) => call("/api/progress", "POST", { type, tag, id, score });

// returns { user:{name,xp,level,xpToNext,streak,badges}, topics:{[tag]:{lesson,lab,code,quiz,quizBest,mastered}}, yearProgress, unlocked, gate }
export const getDashboard = () => call("/api/progress", "GET");
