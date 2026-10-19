<div align="center">
  <h1>Lucent</h1>
  <p><strong>A multi-user team workspace built on a glass material system</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node-%E2%89%A522.5-3c873a?logo=node.js&logoColor=white" alt="Node 22.5+">
    <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="React 19">
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5">
    <img src="https://img.shields.io/badge/SQLite-node%3Asqlite-003b57?logo=sqlite&logoColor=white" alt="SQLite">
  </p>
</div>

---

Lucent is a complete workspace app: Home, a drag-and-drop task board, calendar, projects, insights,
team directory and per-user settings. The client is React 19 with a hand-written CSS token system for
the glass material, wallpapers and motion. The server is a single Express 5 process backed by SQLite
through `node:sqlite`, so there is no native module to compile and no separate database to run.

---

## Table of Contents

- [About the Project](#about-the-project)
  - [Built With](#built-with)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Security](#security)
- [Limitations](#limitations)
- [Contributing](#contributing)

---

## About the Project

Most workspace demos stop at a static dashboard. Lucent is the whole loop: accounts and sessions,
a seeded workspace with real history, optimistic mutations that survive a reload, computed insights
over 7, 30 and 90 day ranges, and a focus timer that keeps running across navigation because its
sessions are recorded server-side.

The interface is the other half of the project. Every surface reads from one token layer, so theme,
wallpaper, glass mode, transparency and accent can change at runtime without touching a component.
The appearance settings are applied before first paint, which means no flash of the wrong theme on
reload.

### Built With

- [React 19](https://react.dev/) and [React Router 7](https://reactrouter.com/) for the client
- [Vite 7](https://vite.dev/) for the dev server and production bundle
- [TypeScript 5.9](https://www.typescriptlang.org/) in strict mode across client and server
- [Express 5](https://expressjs.com/) for the API
- [`node:sqlite`](https://nodejs.org/api/sqlite.html) for storage, with no ORM and no native build
- [`node:crypto`](https://nodejs.org/api/crypto.html) scrypt for password hashing

---

## Features

**Workspace**

- **Home** with greeting, completion and focus stats, project rings, an agenda for the day, my tasks with working checkboxes, a weekly chart, and a team/activity panel
- **Tasks** with a four-column board, drag and drop between columns, a list view, project and priority filters, text search, and a task drawer for fields, subtasks and comments
- **Calendar** with a six-week month grid, a week view, day selection, an agenda with a current-time marker, and event creation
- **Projects** with a filterable card grid and a detail page covering progress, people, milestones, upcoming events, activity and a burn-up chart
- **Insights** over 7, 30 and 90 days: completed work, on-time rate, focus hours and cycle time, each against the previous period, plus throughput, workload, slowest tasks, a chart/table toggle and CSV export
- **Team** with team filters, presence, local time per member, workload and open task counts
- **Settings** for profile, notifications, appearance, focus session lengths and data export or reset, persisted per user

**Platform**

- Opaque session tokens in an HttpOnly, SameSite=Lax cookie
- scrypt password hashing at N=2^17 with a versioned hash format and rehash on login for older accounts
- Same-origin checks on every state-changing request
- Login rate limiting keyed by email and IP
- Strict security headers, including CSP, `X-Frame-Options` and HSTS in production
- Keyboard support throughout: focus trapping in dialogs, visible focus rings, Enter to open board cards, and a command palette on `Cmd/Ctrl+K`
- Responsive down to 390px, including a single-column week view and 44px touch targets

---

## Getting Started

### Prerequisites

- **Node.js 22.5 or newer** (`node:sqlite` became available in 22.5)
- npm 10 or newer

No database server, Docker or build toolchain is required.

### Installation

```bash
git clone https://github.com/Sanxdy/zen-space.git
cd zen-space
npm install
npm run dev
```

The API starts on `http://localhost:8787` and Vite on `http://localhost:5173`, with `/api` proxied to
the API. Open the Vite URL.

The first boot creates `data/lucent.db` and seeds a demo workspace. Sign in with:

| Account | Password | Role |
| --- | --- | --- |
| `maya@lucent.app` | `demo1234` | Workspace admin |
| any seeded member email | `demo1234` | Member |

You can also register a new account, which joins the seeded workspace as a member.

---

## Usage

```bash
npm run dev        # API (tsx watch) and Vite dev server together
npm run typecheck  # Strict TypeScript for client and server
npm run build      # Client to dist/client, server to dist/server
npm start          # Serve the built app and API from one process
npm run smoke      # Throwaway DB: register, login, mutate, insights, logout
```

The SQLite file lives at `data/lucent.db`. Delete it to reseed from scratch, or use
**Settings → Data → Reset sample data** to restore the seeded content without touching accounts.

The seed writes about 60 days of completed work and focus sessions, marked `archived = 1` so they stay
off the board and out of the CSV export, which gives Insights a real history to compute against. The
current week stays sparse.

---

## Configuration

Every environment variable is optional.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `DATABASE_PATH` | `data/lucent.db` | SQLite file; the directory is created if missing |
| `NODE_ENV` | unset | `production` enables secure cookies and HSTS, and disables the demo seed and open registration |
| `SEED_DEMO` | unset | `1` seeds the demo workspace with its public demo passwords, even in production |
| `ALLOW_OPEN_REGISTRATION` | `1` outside production; same as `SEED_DEMO` in production | `1` lets anyone self-register, `0` closes registration |
| `TRUST_PROXY` | unset | `1` trusts `X-Forwarded-*`, required behind nginx so cookies and the origin check see HTTPS |
| `COOKIE_SECURE` | unset | `false` allows plain-HTTP cookies in production, for local testing only |

### Creating the first account in production

A production boot without `SEED_DEMO=1` starts with no workspace and no accounts. The first account
created through `POST /api/auth/register` bootstraps the workspace: it is named "Lucent Studio", the
registrant becomes its admin, and later registrations join as members.

Registration is closed in production by default. Start the process with `ALLOW_OPEN_REGISTRATION=1`
until the first account exists, then remove it and restart.

With registration closed, an admin can still invite people from **Settings → Team**. The invite issues
a temporary password; registering with that email and the temporary password as `invite_token` lets
the invitee choose their own password.

---

## Architecture

```
client/
  index.html
  public/theme-init.js     applies saved appearance before first paint
  src/
    main.tsx, App.tsx      routing and route guards
    store.tsx              auth, workspace data, optimistic mutations, focus timer
    api.ts, types.ts
    pages/                 Home, Tasks, Calendar, Projects, ProjectDetail,
                           Insights, Team, Settings, Login, Register
    components/            Shell, Sidebar, Toolbar, CommandPalette, FocusIsland,
                           TaskDrawer, modals, charts
    styles/                tokens, base, glass material, components, page layouts
server/
  index.ts                 process entry, static files, security headers
  api.ts                   all REST routes
  auth.ts                  scrypt, sessions, origin guard, rate limit
  db.ts, schema.sql        node:sqlite access and schema
  insights.ts              period stats and bucket series
  seed.ts                  demo workspace
scripts/smoke.ts           end-to-end API check on a temporary database
```

### API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Account and session lifecycle |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/bootstrap` | Everything the shell needs on load |
| `POST` / `PATCH` | `/api/tasks`, `/api/tasks/:id` | Create tasks, update status, position and fields |
| `POST` | `/api/tasks/:id/comments` | Add a comment |
| `POST` / `PATCH` | `/api/projects`, `/api/projects/:id` | Create and update projects |
| `POST` | `/api/events` | Create a calendar event |
| `PATCH` | `/api/settings` | Persist user settings |
| `POST` | `/api/notifications/read` | Mark notifications read |
| `GET` | `/api/insights?range=7\|30\|90` | Period stats and series |
| `POST` | `/api/focus` | Record a focus session |
| `GET` | `/api/export.csv` | CSV export |

---

## Deployment

The app is one Node process behind nginx. Node 22.5 or newer is required.

```bash
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo useradd --system --create-home --shell /usr/sbin/nologin lucent
sudo -u lucent git clone https://github.com/Sanxdy/zen-space.git /srv/lucent
cd /srv/lucent
sudo -u lucent npm ci
sudo -u lucent npm run build
```

`/etc/systemd/system/lucent.service`:

```ini
[Unit]
Description=Lucent
After=network.target

[Service]
Type=simple
User=lucent
WorkingDirectory=/srv/lucent
Environment=NODE_ENV=production
Environment=PORT=8787
Environment=DATABASE_PATH=/srv/lucent/data/lucent.db
Environment=TRUST_PROXY=1
# Environment=ALLOW_OPEN_REGISTRATION=1   # first boot only, then remove
ExecStart=/usr/bin/node dist/server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lucent
```

nginx reverse proxy at `/etc/nginx/sites-available/lucent`, with TLS added by `certbot --nginx`:

```nginx
server {
  listen 80;
  server_name lucent.example.com;

  client_max_body_size 2m;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lucent /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Finish the TLS step before handing out accounts: `Secure` cookies require HTTPS. Back up
`data/lucent.db` together with its `-wal` and `-shm` sidecars, because that file is the whole
workspace.

---

## Security

- Passwords are hashed with scrypt (N=2^17, r=8, p=1) on the async thread pool, never on the request thread
- Hashes are versioned (`scrypt$N$r$p$salt$hash`); accounts created under the older format are rehashed on their next successful login
- Sessions are opaque random tokens stored in an HttpOnly, SameSite=Lax cookie, with an expiry checked on every request
- State-changing requests must be same-origin, either by a matching `Origin` scheme and host or by `Sec-Fetch-Site: same-origin`
- Login attempts are rate limited per email and IP, and successful logins clear the counter
- Responses set a content security policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a referrer policy, HSTS in production, and `Cache-Control: no-store` under `/api`

Found a problem? Open an issue rather than a public proof of concept.

---

## Limitations

- No email delivery, so invitations hand over a temporary password out of band
- No file uploads, OAuth providers or real-time sync between open tabs
- SQLite suits a single process. Running multiple instances would need a shared database
- Presence and seeded people, projects and tasks are sample data, labeled as such in the interface

---

## Contributing

Issues and pull requests are welcome. Before opening a pull request:

```bash
npm run typecheck
npm run smoke
npm run build
```

Keep changes inside the existing token system rather than adding new color or spacing literals, and
run the app at a 390px viewport as well as desktop.

---

<p align="center">Built by <a href="https://github.com/Sanxdy">Sanxdy</a></p>
