# Nodebook

A visual note-taking app built around nodes and connections. Create nodes, write in them, link them together, and your graph syncs across all your devices in real time.

![Nodebook](https://img.shields.io/badge/status-prototype-orange) ![Vite](https://img.shields.io/badge/built_with-Vite-646CFF) ![Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E)

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
| Auth | Supabase GoTrue (email/password) |
| Database | Supabase PostgreSQL (JSONB graph document per user) |
| Real-time | Supabase WebSocket subscriptions |
| Hosting | Vercel (static deploy from `dist/`) |

---

## Getting started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/your-username/nodebook.git
cd nodebook
npm install
```

### 2. Set up Supabase

Run the migration in your Supabase SQL Editor:

```sql
-- supabase/migrations/001_initial_schema.sql
```

Then enable real-time sync:

```sql
ALTER TABLE graphs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE graphs;
```

### 3. Configure environment variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run locally

```bash
npm run dev
```

Open `http://localhost:5173`. Create an account and start building your graph.

### 5. Build for production

```bash
npm run build
```

Output goes to `dist/`. Deploy to Vercel, Netlify, or any static host.

---

## Project structure

```
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
│   ├── client.js           # Supabase singleton
│   ├── storage.js          # localStorage read/write (offline cache)
│   ├── cloud.js            # fetchGraph, pushGraph, real-time subscription
│   ├── queue.js            # Dirty flag, debounced flush, offline retry
│   └── merge.js            # Version-fenced last-write-wins merge
├── auth/
│   ├── index.js            # onAuthStateChange → show canvas or auth form
│   ├── ui.js               # Login/signup form (vanilla JS)
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
In-memory state  →  localStorage (300 ms debounce)  →  Supabase JSONB (1.5 s debounce)
                                                              ↕ real-time WebSocket
                                                         other tabs / devices
```

Conflict resolution is last-write-wins with version fencing: the higher `version` number wins. When the remote graph wins, a toast notifies the user. Offline writes queue in localStorage and flush automatically on reconnect.

---

## Running without Supabase

If `VITE_SUPABASE_URL` is not set, the app runs in local-only mode — no account required, everything stored in `localStorage`. Useful for self-hosted or air-gapped setups.

---

## License

MIT
