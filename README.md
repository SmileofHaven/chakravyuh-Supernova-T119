# Supernova — Smart ENTC Learning & Innovation Platform

A responsive React/Vite learning-platform prototype inspired by the supplied **ENTC_Platform_Curriculum_Content_Framework.pdf** and the Vanta globe reference. Built for GitHub and Vercel.

## Included
- Globe-inspired dark interface with animated page transitions, responsive navigation, hover states and floating AI drawer.
- Curriculum year/topic navigation (Years 1–4).
- Interactive lesson cards, quiz, smart street-light simulation, coding challenge preview, progress dashboard, leaderboard mock, career track and profile privacy toggle.
- PDF-aligned curriculum topics, section taxonomy and demo sequence.
- Motion animation library (`motion`) and Lucide icons.

## Run locally
```bash
npm install
npm run dev
```
Build:
```bash
npm run build
npm run preview
```

## Deploy to Vercel
1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Framework preset: **Vite**; Build command `npm run build`; Output directory `dist`.
4. Deploy. No API key is required for this frontend demo.

## Important demo / production boundary
This repository is a **frontend prototype**, not a production-authenticated platform. The quiz, XP, streak, profile and leaderboard data are illustrative/local UI states. The AI drawer is a prepared interface and does not call a live model. Do not present simulated scores as verified rankings or certifications.

To make it production-ready, add a server-side backend and:
- Auth: managed auth or secure server sessions; HttpOnly + Secure + SameSite cookies; CSRF protection; email verification, password reset, MFA/admin MFA.
- Passwords: Argon2id (preferred) or bcrypt with appropriate work factor. Never store plaintext or reversible passwords.
- Admin: server-side role checks on every admin API and page data request; deny by default; audit log; never rely on hiding a frontend route.
- API keys: store only in server environment/secret manager. Never put provider keys in `VITE_*` variables, client bundles, git, or browser storage.
- Database: parameterized queries/ORM, least-privilege DB user, TLS, backups, migrations, retention policy and access logging. Avoid collecting unnecessary student data.
- Security: schema validation, contextual output encoding, sanitization for rich text, CSP, security headers, rate limiting, login throttling, request size limits, abuse monitoring, dependency updates and lockfile.
- AI: authenticated server endpoint, quotas/rate limits, prompt/data boundaries, no sensitive profile data in prompts by default.
- Certificates: only issue server-verified completion certificates after defined assessments; avoid claiming accreditation.
- Rankings/privacy: opt-in public profile and achievements; never publish email/contact/education records or precise activity history.
- Simulations: label simplified browser models; validate against engineering reference values before describing as accurate.

## Content source
Curriculum topic lists, learning modes, the four-year progression, and demo ideas are based on the user-provided framework PDF. It states that the syllabus reflects typical Indian B.Tech ENTC programmes and should be verified against the user's university syllabus. The prototype does not claim official university syllabus coverage.

## Theme
The hero globe is a CSS-built globe/grid with orbiting lines and points; it is inspired by the Vanta globe effect but does not load Vanta or copy its source.
