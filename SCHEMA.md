# Firestore schema (agree on this with frontend first)

## Content (read-only for clients, seeded from JSON)
topics/{topicId}
  title, category ("digital"|"comms"|"sensors"|"micro"|"dsp"|"iot"),
  difficulty (1-3), summary, content (markdown), imageUrl (cloudinary), order

questions/{qId}
  topicId, text, options: [string x4], answerIndex, explanation, imageUrl?

challenges/{cId}   (optional)
  title, description, starterCode, tests: [{input, expected}]

## User data (written ONLY by /api/progress)
users/{uid}
  name, photo, xp, level, streak, lastActive ("YYYY-MM-DD"),
  completed: ["lesson:<id>", "quiz:<id>", "challenge:<id>"]

quizAttempts/{autoId}
  uid, quizId, score, total, at

rateLimits/{uid_YYYY-MM-DD}   (server only)
  count

## Leaderboard (client-side query)
query(collection(db,"users"), orderBy("xp","desc"), limit(10))

## API contracts
POST /api/chat      Authorization: Bearer <idToken>
  { messages:[{role,content}], mode:"tutor"|"debug"|"explain" } -> { reply }
POST /api/progress  Authorization: Bearer <idToken>
  { type:"lesson"|"quiz"|"challenge", id, score?, total? } -> { xp, level, streak, completed }

Frontend gets token with: await auth.currentUser.getIdToken()

## Vercel env vars
FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (service account),
LLM_API_KEY, LLM_MODEL (optional)

## package.json deps
firebase-admin (backend), firebase (frontend)
