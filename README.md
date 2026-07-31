# Nodebook

A visual note-taking app built around nodes and connections. Create nodes, write in them, link them together, and your graph syncs across all your devices in real time.

![Nodebook](https://img.shields.io/badge/status-prototype-orange) ![Vite](https://img.shields.io/badge/built_with-Vite-646CFF) ![Cloudflare](https://img.shields.io/badge/backend-Cloudflare_Workers-F38020)

---

## What it does

- **Node canvas** — double-click anywhere to create a node, drag to move, scroll to zoom
- **Rich notes** — click a node to open a side panel and write in it
- **Connections** — hold Shift and drag from one node to another to link them; click a connector to delete it
- **Multi-select** — hold Ctrl and click nodes, or Ctrl-drag to rubber-band select a group
- **Cloud sync** — edits save automatically and propagate to other open tabs and devices in real time
- **Offline-first** — everything is cached in localStorage; changes made offline flush when you reconnect
- **Export** — download your graph as JSON for backup

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS (no framework), Vite |
| API | Cloudflare Worker (`worker/`) |
| Auth | Email/password, client-side key derivation, opaque session cookie |
| Database | Cloudflare D1 (SQLite; JSON graph document per graph) |
| Real-time | Durable Object per graph, WebSocket fan-out |
| Hosting | Cloudflare Workers — one deploy serves `dist/` and `/api` |

---

## Getting started

### Prerequisites

- Node.js 18+
- A [Cloudflare](https://cloudflare.com) account (Workers, D1, Durable Objects)

### 1. Clone and install

```bash
git clone https://github.com/your-username/nodebook.git
cd nodebook
npm install
```

### 2. Create the database

```bash
npx wrangler login
npx wrangler d1 create nodebook
```

Copy the printed `database_id` into `wrangler.toml`, then create the tables:

```bash
npm run db:migrate          # remote
npm run db:migrate:local    # local dev copy
```

### 3. Environment variables

None required. Cloud mode is the default, so any checkout builds a working app;
there are no secrets on the client, since auth is a same-origin HttpOnly cookie.

Local-only mode is the opt-in, and `serve.mjs` (below) sets it for you.

### 4. Run locally

```bash
npm run dev:cloud
```

Open `http://localhost:8788`. Create an account and start building your graph.
For client work with hot reload, see
[.claude/skills/run-nodebook/SKILL.md](.claude/skills/run-nodebook/SKILL.md).

### 5. Deploy

```bash
npm run deploy              # vite build && wrangler deploy
```

One Worker serves the built assets and the API.

Pushes to `main` deploy automatically via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) — it builds, runs
the D1 migrations, then deploys. Pull requests build and are checked but never
deploy. Two repository secrets are required:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" template, **plus** a `D1 → Edit` permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard URL, or `npx wrangler whoami` |

`wrangler.toml` carries a `[build]` command, so `wrangler deploy` produces
`dist/` itself — `dist/` is gitignored, and without this any checkout-and-deploy
environment fails with *"the directory specified by the assets.directory field
does not exist"*. That also means Cloudflare's own git integration needs no
build command configured in the dashboard.

**GitHub Actions is the only deploy pipeline.** Do not connect this repo under
Workers → Builds in the Cloudflare dashboard as well — both would fire on every
push, and Workers Builds does not apply D1 migrations.

---

## Project structure

```
worker/
├── index.js                # Router: /api/* here, everything else → static assets
├── auth.js                 # Derived-key storage, session cookies
├── graphs.js               # Graph + folder CRUD, all scoped by user_id
└── realtime.js             # GraphRoom Durable Object — WebSocket fan-out

migrations/                 # D1 schema

src/
├── main.js                 # Bootstrap: auth check → canvas or auth screen
├── dom.js                  # Shared DOM element references
├── canvas/
│   ├── state.js            # Graph state: { nodes, edges, view }
│   ├── render.js           # Render loop, SVG edges, pan/zoom transform
│   ├── interactions.js     # Mouse handlers: drag, pan, connect, rubber-band select
│   ├── operations.js       # addNode, deleteNode, selectNode
│   └── keyboard.js         # Keyboard shortcuts
├── sync/
│   ├── client.js           # fetch wrapper for the Worker API + socket URL
│   ├── storage.js          # localStorage read/write (offline cache)
│   ├── cloud.js            # fetchGraph, pushGraph, realtime WebSocket
│   ├── queue.js            # Dirty flag, debounced flush, offline retry
│   └── merge.js            # Version-fenced last-write-wins merge
├── auth/
│   ├── index.js            # Session probe → show canvas or auth form
│   ├── ui.js               # Login/signup form (vanilla JS)
│   ├── crypto.js           # PBKDF2 key derivation — the password stays here
│   ├── session.js          # signIn, signUp, signOut
│   └── pong.js             # Pong background animation on the auth screen
├── utils/
│   ├── toast.js
│   ├── dialog.js
│   ├── export.js
│   ├── id.js               # crypto.randomUUID() wrapper
│   └── sync-status.js      # Status chip: synced / saving / offline
└── styles/
    ├── tokens.css           # CSS custom properties (colors, fonts)
    ├── canvas.css
    ├── panel.css
    ├── topbar.css
    ├── auth.css
    └── dialog.css
```

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | Add node |
| `Delete` / `Backspace` | Delete selected node |
| `Escape` | Deselect |
| Scroll | Zoom in/out |
| Double-click canvas | Add node at cursor |
| Shift + drag from node | Draw connection |
| Ctrl + click node | Add to multi-select |
| Ctrl + drag canvas | Rubber-band select |

---

## Sync architecture

```
In-memory state  →  localStorage (300 ms debounce)  →  D1 via PUT /api/graphs/:id (1.5 s debounce)
                                                              ↓
                                                        GraphRoom Durable Object
                                                              ↓ WebSocket
                                                         other tabs / devices
```

D1 is the source of truth: the Worker writes the row first, increments `version`
server-side, then asks the graph's Durable Object to fan the new revision out to
every other connected socket.

Conflict resolution is last-write-wins with version fencing: the higher `version` number wins. When the remote graph wins, a toast notifies the user. Offline writes queue in localStorage and flush automatically on reconnect.

---

## How auth works

The password never leaves the browser. `src/auth/crypto.js` runs PBKDF2-HMAC-SHA256
at 210,000 iterations (~27 ms) over a salt derived from the email address, and the
API receives only the resulting 256-bit key. The Worker salts and hashes that key
with 1,000 iterations before storing it.

This is what lets full-strength stretching run on the Workers free plan, which
allows 10 ms of CPU per request — doing 210k iterations in the Worker costs ~85 ms
and would fail. Security does not suffer from the low server-side count: the value
being stretched there is a uniformly random 256-bit key, not a guessable password,
and anyone attacking a stolen database still pays the full 210k derivation per
password guess.

Consequences worth knowing:

- The API takes `authKey`, not `password`; posting a password returns `bad_auth_key`.
- Minimum password length is enforced client-side (`MIN_PASSWORD` in `src/auth/crypto.js`)
  because the server cannot see the password.
- Changing the salt recipe or iteration count in `crypto.js` invalidates every
  stored credential — it is a breaking change, not a tuning knob.

---

## Running without the cloud

Build with `VITE_LOCAL_ONLY=1` and the app runs with no account, no Worker and no network — everything stays in `localStorage`. Useful for self-hosted or air-gapped setups, and it's what `.claude/skills/run-nodebook/serve.mjs` uses for driving the canvas without a backend.

---

## License

MIT
