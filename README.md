# Ente Nadu

An AI-powered civic issue reporting and resolution platform. Citizens report local problems through Telegram, Gemini AI structures the complaint, administrators verify and assign it to the responsible Municipality or Panchayat, and the citizen receives status updates on Telegram.

**Report. Connect. Resolve.**

## Current status

**Phase 6 — complete.** Citizen Telegram notifications, admin authority-account management, geolocation/security hardening, production configuration, and deployment readiness are all in place on top of the Phases 1–5 flows. The full loop now works citizen → bot → admin → authority → citizen:

- **Citizen flow (Telegram bot):** every status change is pushed back to the citizen as a Telegram message — complaint registered, verified, rejected (with the reason), assigned, under review, in progress, completed. Messages carry the complaint ID and status (plus the local body name for assignments) — never internal database IDs or admin details. Notifications are best-effort: a failed send is logged and never undoes the database write, history, or audit entry.
- **Admin Portal** (`/admin`): dashboard with DB-backed statistics, complaint search/filter, review detail pages with an append-only audit trail, **verify** / **reject** / **assign** / **reassign**, and an **Authorities** page listing local bodies with active/inactive state **plus authority accounts** — each account shows its linked local body and can be deactivated/reactivated (deactivated accounts can no longer log in), which doubles as user-to-authority linking.
- **Authority Portal** (`/authority`): each authority login sees **only its own complaints** (scoped server-side from the JWT's `authorityId`, never from the client), moves work through the strict chain `assigned → under_review → in_progress → completed` with optional notes, sees DB-backed statistics scoped to itself, and completes complaints which record `completedAt`/`completedBy`.
- **Routing & geolocation:** the database, not Gemini, decides the responsible local body. GPS coordinates and manual place names are both supported; out-of-range coordinates are rejected. Unmatched locations stay "pending" for admin verification.
- **Production readiness:** all required credentials are verified on boot in production, request bodies are size-limited, oversized/malformed JSON returns proper `413`/`400` responses, and the frontend supports a remote API base URL (`VITE_API_BASE_URL`) for split-host deployments.

## Technology stack

- **Frontend:** React, Vite, TypeScript, react-router-dom
- **Backend:** Node.js, Express, TypeScript
- **Database:** MongoDB + Mongoose
- **Auth:** JSON Web Tokens (jsonwebtoken), bcryptjs, express-rate-limit
- **Integrations:** Telegram Bot API (telegraf, long polling), Google Gemini API (REST, JSON mode), Cloudinary (photo storage)

## Project structure

```text
ente-nadu/
├── frontend/          # React + Vite + TypeScript
│   └── src/
│       ├── components/  # layout, table, badges, modals, protected route
│       ├── pages/       # Login/Home + admin/* and authority/* portal pages
│       ├── services/    # api client, AuthContext
│       ├── types/       # auth + complaint domain types
│       ├── utils/
│       ├── App.tsx
│       └── main.tsx
├── backend/           # Node.js + Express + TypeScript
│   └── src/
│       ├── config/    # environment + MongoDB connection
│       ├── controllers/
│       ├── middleware/  # error handling, authenticate + requireRole
│       ├── models/    # Mongoose models (users, complaints, sessions, counters, authorities, places, history, audit logs)
│       ├── routes/    # auth + admin/* and authority/* complaint management
│       ├── seeds/     # demo authority + place seed script
│       ├── services/  # auth, place resolution, complaint service + workflow, notifications, Gemini, Cloudinary, Telegram bot
│       ├── scripts/   # verification harnesses (verifySeed/Auth/Bot/Admin/Authority/Phase6)
│       ├── utils/
│       └── server.ts
├── .gitignore
├── README.md
└── package.json       # workspace + dev scripts
```

## Install dependencies

```bash
npm install
```

## Run (dev)

Starts backend and frontend together:

```bash
npm run dev
```

Or individually:

```bash
npm run dev --prefix backend   # backend on http://localhost:5000
npm run dev --prefix frontend  # frontend on http://localhost:5173
```

## Telegram citizen bot

The bot starts automatically with the backend when `TELEGRAM_BOT_TOKEN` is set in `backend/.env` (skipped with a warning otherwise). It uses long polling, so no webhook/URL forwarding is needed for development.

Start a chat with the bot and press start or type `/start`. Report an issue by:

- typing or dictating a description (English, Malayalam, or Manglish),
- attaching a photo (JPG/PNG/WEBP, ≤ 10 MB — stored in Cloudinary),
- sending a live location or naming the place/area.

These can arrive in any order and are re-asked until the report is complete. A preview shows the understood category, severity, location, and the local body that will receive it, with **Confirm / Edit / Cancel** buttons. Confirming creates the complaint with an ID like `EN-2026-00001`, keeps the original citizen wording, and records status history + an audit entry. "My Complaints" lists the citizen's own complaints; tapping one shows its current status. Duplicate confirmations and cross-citizen views are blocked.

Location matching is done by the database, not the AI: Gemini proposes a place name, and the backend resolves it against seeded places/authorities. If a name matches more than one place (e.g. "Thiruvalla" in two districts), the bot asks the citizen to pick; if there is no match — or a bare GPS coordinate is sent — the complaint is submitted with the authority left pending for admin verification. Out-of-range latitude/longitude values are rejected.

### Citizen notifications

Every successful status change sends the citizen a Telegram message (via `notification.service.ts`, reusing the running bot):

| Status change | Message |
| --- | --- |
| Complaint registered | ID + "Submitted" |
| Verified | ID + "Verified" |
| Rejected | ID + "Rejected" + rejection reason |
| Assigned / Reassigned | ID + "Assigned" + local body name |
| Under review / In progress / Completed | ID + status |

The message text contains only the complaint ID, human-readable status, and (for assignments) the local body name — never internal MongoDB IDs or administrator details. Notifications are sent strictly **after** the complaint update, history entry, and audit entry succeed; if sending fails it is logged (with the chat id masked) and the database state is left untouched. When `TELEGRAM_BOT_TOKEN` is unset there is no notifier and nothing is attempted.

### Demo place → authority mapping (seeded)

| Place | District | Local body |
| --- | --- | --- |
| Kunnamthanam | Pathanamthitta | Kunnamthanam Grama Panchayat |
| Adoor | Pathanamthitta | Adoor Municipality |
| Konni | Pathanamthitta | Konni Grama Panchayat |
| Thiruvalla | Pathanamthitta | Thiruvalla Municipality |
| Kottayam | Kottayam | Kottayam Municipality |
| Pala | Kottayam | Pala Municipality |
| Changanassery | Kottayam | Changanassery Municipality |
| Kochi | Ernakulam | Kochi Municipal Corporation |
| Aluva | Ernakulam | Aluva Municipality |
| Angamaly | Ernakulam | Angamaly Municipality |

This is demo data for hackathon development, not an official Kerala local-body database.

End-to-end bot behavior can be tested without real Telegram/Gemini/Cloudinary credentials → `verify:bot` (below) drives the real handler/repos/seeds against an in-memory MongoDB with mocked integrations.

## API

Health check:

```bash
GET /api/health
```

```json
{
  "status": "ok",
  "service": "Ente Nadu API",
  "database": "connected"
}
```

`database` reflects whether the backend can reach MongoDB.

### Auth endpoints

```text
POST /api/auth/login    { "username": "...", "password": "..." }  → { success, token, user }
GET  /api/auth/me       (Bearer token)                            → { success, user }
POST /api/auth/logout   → { success }  (token is discarded client-side)
```

Development-only protected test endpoints are registered when `NODE_ENV !== "production"`:
`GET /api/auth/protected-test`, `GET /api/auth/admin-test`, `GET /api/auth/authority-test`.

### Admin endpoints (Bearer token, `admin` role)

```text
GET  /api/admin/complaints?status=&category=&severity=&authorityId=&search=&page=&limit=
GET  /api/admin/complaints/:complaintId
PATCH /api/admin/complaints/:complaintId/verify   { note? }          submitted → verified
PATCH /api/admin/complaints/:complaintId/reject   { note? }          submitted → rejected
PATCH /api/admin/complaints/:complaintId/assign   { authorityId }    verified → assigned
PATCH /api/admin/complaints/:complaintId/reassign { authorityId }    assigned/under_review/in_progress → assigned
GET  /api/admin/authorities
GET  /api/admin/authority-users
PATCH /api/admin/authority-users/:userId/access  { isActive?, authorityId? }
GET  /api/admin/stats
```

Complaints can be filtered by status, category, severity and assigned authority, searched by description or complaint ID, and paginated (`page`, `limit` ≤ 100). The complaint list/detail responses never include password or hash material; the admin detail includes the append-only **audit trail**; authorities endpoints list local bodies with their active/inactive state. The authority-account endpoints list users with role `authority` (username, name, linked local body, active state — never password hashes) and let an admin deactivate/reactivate an account (a deactivated account can no longer log in) or re-link it to a different local body; only non-admin authority accounts are manageable there.

### Authority endpoints (Bearer token, `authority` role, scoped to own `authorityId`)

```text
GET  /api/authority/complaints?status=&search=&page=&limit=
GET  /api/authority/complaints/:complaintId
PATCH /api/authority/complaints/:complaintId/status  { status, note? }
GET  /api/authority/stats
```

Status moves are restricted to the strict chain `assigned → under_review → in_progress → completed`; anything else (backwards, skips, verify/reject/assign-style actions) is rejected. Completing a complaint records `completedAt` / `completedBy`. Authorities never see the audit trail, can never read or act on another authority's complaints (the API returns a non-revealing `404`), and any client-supplied `authorityId` is ignored.

## Workflow & permissions

| Step | Allowed on | Who | Result |
| --- | --- | --- | --- |
| Verify / Reject | submitted | admin | verified / rejected |
| Assign | verified | admin | assigned |
| Reassign | assigned / under_review / in_progress | admin | assigned (history keeps the previous authority) |
| Under review → In progress → Completed | assigned / under_review / in_progress | assigned authority | completed records `completedAt` + `completedBy` |

`completed` and `rejected` are terminal states. Every transition writes a `ComplaintHistory` entry and an `AuditLog` entry. Invalid state machines return `409`; invalid IDs/inputs return `400`; cross-authority access returns `404`.

## Authentication & access control

- Roles: `admin` and `authority` only. Citizens use the Telegram bot directly (no web accounts).
- `admin` → `/admin`, `authority` → `/authority`; both routes redirect unauthenticated users to `/login`.
- Authorization is enforced **server-side** (`authenticate` + `requireRole`); the frontend protection is only a UX layer.
- Authority isolation: the JWT and authenticated request carry the user's `authorityId`. All Phase 5 authority APIs scope every database query by it and never trust client-supplied `authorityId`; cross-authority reads/writes return `404`.
- **Security note:** the frontend stores the session token in `localStorage` for hackathon simplicity. This is acceptable for the MVP but more durable than server sessions only as long as XSS risk is accepted; a hardened setup would use short-lived tokens + httpOnly cookies.
- Ordering guarantee per transition: **validate request → authorize (JWT role + server-side `authorityId`) → validate the state transition → update the complaint → write `ComplaintHistory` → write `AuditLog` → send the citizen Telegram notification.** A notification failure never reverts the database change.
- Other hardening in place: bcrypt-hashed passwords (never returned in API responses), inactive users blocked at login, rate-limited login, JWT expiry + server-side roll lookup, production error handler returns generic messages (no stack traces), CORS restricted to `CORS_ORIGIN`, JSON bodies limited to 1 MB (oversized → `413`, malformed → `400`), enum-validated status/category/severity inputs, complaint IDs and ObjectIds validated, and photo uploads MIME-sniffed (JPG/PNG/WEBP, ≤ 10 MB).

## Database

Set your `MONGODB_URI` in `backend/.env`. The backend connects to MongoDB on startup (it also starts without one — health then reports `"database": "disconnected"`).

Seed demo authorities and places (idempotent — safe to run repeatedly):

```bash
npm run seed --prefix backend
```

Verify seeding against a throwaway in-memory MongoDB (no `MONGODB_URI` needed — downloads a MongoDB binary on first run):

```bash
npm run verify:seed --prefix backend
```

Verify the full Telegram citizen pipeline (in-memory MongoDB, real seeds, real complaint/history/audit/ownership logic, mocked Telegram/Gemini/Cloudinary):

```bash
npm run verify:bot --prefix backend
```

Verify the Phase 5 admin portal APIs (in-memory MongoDB, real seeds and workflow logic; verify/reject/assign/reassign, filters, audits, stats, role isolation, Phase 4 regression):

```bash
npm run verify:admin --prefix backend
```

Verify the Phase 5 authority portal APIs (in-memory MongoDB; per-authority scoping and isolation, the full status chain with notes and completion fields, blocked admin actions, scoped stats, role isolation, Phase 4 regression):

```bash
npm run verify:authority --prefix backend
```

Verify the Phase 6 flows (in-memory MongoDB; mocked Telegram/Gemini/Cloudinary): citizen notifications for every status change (with correct content and no identifier leaks), rejection reason messaging, assignment/reassignment authority names, **notification failure never undoing the DB**, skipped/illegal transitions, cross-authority and role isolation, admin authority-account management (list/toggle/relink, no password leaks, deactivation blocks login), geolocation (GPS-only stays pending, out-of-range coords rejected, DB-backed routing), the 1 MB body limit (`413`) and malformed JSON check, no secret leakage across APIs, production env fail-fast, plus Phase 4/5 regressions:

```bash
npm run verify:phase6 --prefix backend
```

Seed development accounts (idempotent — safe to run repeatedly):

```bash
npm run seed:admin   # admin from SEED_ADMIN_* env vars
npm run seed:users   # demo authority users (SEED_DEV_PASSWORD); requires the base seed first
```

Admin credentials come from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in `backend/.env`. Demo authority users are `kunnamthanam_gp`, `adoor_municipality`, `kottayam_municipality`, `kochi_municipal_corporation` (password from `SEED_DEV_PASSWORD`). These are development records only, not an official Kerala local-body database. Passwords are bcrypt-hashed and never printed by the seed scripts.

## Environment variables

Copy the template into a real env file before running the backend:

```bash
cp backend/.env.example backend/.env
```

Required for Phase 3 auth: `JWT_SECRET` (generate one, e.g. `openssl rand -hex 32`). Required for admin seeding: `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`. MongoDB is a placeholder; fill it in along with Telegram/Gemini/Cloudinary to enable the bot:

- `TELEGRAM_BOT_TOKEN` — from @BotFather. Without it, the API still runs but the bot is disabled (and no citizen notifications are sent).
- `GEMINI_API_KEY` — used to understand free-text complaints (structured, enum-validated output; gracefully degrades to basic handling if unset or failing).
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — photo storage for complaint attachments.

Frontend (`frontend/.env`): `VITE_API_BASE_URL` — set to the backend's absolute URL for split-host deployments; leave empty in development (the Vite proxy forwards `/api` to `http://localhost:5000`).

### Production requirements

When `NODE_ENV=production` the backend fails fast on boot unless **all** of these are set: `MONGODB_URI`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Development-only endpoints (e.g. the `protected-test` routes) are never registered in production, and the error handler returns generic messages without stack traces.

Never commit `.env`.

## Type checking and build

```bash
npm run typecheck
npm run build
```

## Deployment readiness

This MVP is not deployed yet; the setup below is what it was built for. No deployment has been run, so treat exact operational details as unverified.

- **Frontend → Vercel:** build with `npm run build` (`frontend`), and if the backend lives on another host set `VITE_API_BASE_URL=https://<backend-host>` in the Vercel environment. With same-origin hosting nothing else is needed.
- **Backend → Render:** build command `npm run build` (`backend`), start command `npm start` (= `node dist/server.js`), and set `NODE_ENV=production` plus the credentials above. `assertProductionEnv()` refuses to boot without them.
- **Database → MongoDB Atlas:** point `MONGODB_URI` at your Atlas cluster; run `npm run seed --prefix backend`, `seed:admin`, and `seed:users` once against it.
- **Cloudinary / Telegram / Gemini:** set the corresponding env vars. Telegram uses long polling, so no webhook URL is required.
- **CORS:** set `CORS_ORIGIN` to exactly the frontend origin, and make sure `VITE_API_BASE_URL` and `CORS_ORIGIN` agree.
- Before deploying, run the full local gate — `verify:seed`, `verify:auth`, `verify:bot`, `verify:admin`, `verify:authority`, `verify:phase6`, `typecheck`, `build` — all pass with in-memory MongoDB and mocked integrations (no real credentials required).

## Final regression checklist

1. `npm run verify:seed --prefix backend`
2. `npm run verify:auth --prefix backend`
3. `npm run verify:bot --prefix backend`
4. `npm run verify:admin --prefix backend`
5. `npm run verify:authority --prefix backend`
6. `npm run verify:phase6 --prefix backend`
7. `npm run typecheck` (root)
8. `npm run build` (root)