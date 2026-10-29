import { auth } from "./firebase";

// Calls our Vercel API routes with the logged-in user's Firebase token
async function call(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// messages: [{role:"user"|"assistant", content}], mode: "tutor"|"debug"|"explain"
export const chat = (messages, mode = "tutor") => call("/api/chat", { messages, mode });

// type: "lesson"|"quiz"|"challenge"
export const saveProgress = (type, id, score = 0, total = 0) =>
  call("/api/progress", { type, id, score, total });