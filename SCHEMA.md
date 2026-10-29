# Backend schema + API contracts (v2, matches the content framework PDF)

## Content collections (public read, seeded by `scripts/seed.js`)
topics/{tag}      tag,title,year,order,thread,prerequisites[],estimatedHours,
                  masteryParts{lesson,lab,code,quiz}, badge, comingSoon
lessons/{id}      tag,title,minutes,goals[],blocks[],tryIt{lab,code,quiz},aiContext
questions/{id}    tag,bank("topic"|"arena"),type,difficulty,timeSec,prompt,options[],answer,explanation,lessonRef
labs/{id}         tag,aim,components[],tasks[{id,text,check,expected}],conclusion[]
challenges/{id}   tag,language,grader,starter,tests[],hints[3],solution,xp
sims/{id}         year,tags[],controls[],outputs[],missions[],notes
gameItems/{id}    tag,game,name,family,imageUrl (add Cloudinary URLs)

NOTE: Firestore forbids arrays inside arrays, so table rows and lab truth tables are stored as [{cells:[...]}]
(lesson table.rows[i].cells, lab tasks[i].expected.outputs[i].cells).
NOTE: answers/solutions are readable by clients (fine for hackathon, not for production).

## User data (written ONLY by /api/progress)
users/{uid}               name,photo,xp,level,streak,lastActive,badges[]
users/{uid}/topics/{tag}  lesson,lab,code,quiz (bool), quizBest (0-100), awarded[], mastered
quizAttempts/{auto}       uid,tag,quizId,score,at
rateLimits/{uid_date}     count   (server only)

## Rules implemented
- XP once per unique activity: lesson 40, lab 60, code 50, quiz 80 (first time score >= 70), sim 70
- Level = floor(xp/100)+1
- Mastered = every part in topic.masteryParts is done (quiz part = best score >= 70) -> badge awarded once
- Year % = average over topics of (done required parts / required parts); next year unlocks at >= 75%
- Set Vercel env UNLOCK_ALL=true for the demo so nothing is locked
- Any ONE completed lesson/lab/challenge counts for that checkpoint (simplification)

## API
POST /api/progress   { type:"lesson"|"lab"|"code"|"quiz"|"sim", tag, id, score? }
  -> { gained, xp, level, xpToNext, streak, topic{...}, newBadges[], passed, yearProgress{1..4}, unlocked{1..4}, gate }
GET  /api/progress
  -> { user{name,xp,level,xpToNext,streak,badges}, topics{tag:{...}}, yearProgress, unlocked, gate }
POST /api/chat       { messages, mode:"explain"|"debug"|"interview", tag?, lessonId?, level?, rung?, attempts?, jobType?, round?, difficulty? }
  -> { reply }
  - explain: level simple|standard|interview; lesson aiContext is injected so wording matches lessons
  - debug: rung 1 nudge, 2 approach, 3 near-solution, 4 full answer (403 unless attempts >= 1)
  - client: include learner's code in the last message content

## Env vars (Vercel)
FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, LLM_API_KEY, UNLOCK_ALL (optional), LLM_MODEL (optional)

## Setup
package.json needs "type": "module" and dep firebase-admin.
Seed: node --env-file=.env.local scripts/seed.js
Paste firestore.rules into the Firebase console (collection read list is in the rules).