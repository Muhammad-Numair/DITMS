# DITMS Web — Distributed Intelligent Traffic Management System

> Full-stack MERN + Next.js 14 web application.
> Real-time city map always visible. Animated sliding control panel.
> Synchronous vehicle spawning/despawning. Socket.io live updates at 2Hz.

---

## What's New (Latest Changes)

| Change | Detail |
|--------|--------|
| **Single admin** | One user: `admin / admin123`, full access to everything |
| **Persistent city map** | Map fills 100% of viewport — always visible at all times |
| **Animated sidebar** | Right-side panel slides in/out with CSS transition animation |
| **8 tabs in sidebar** | Overview · Signals · Traffic · Emergency · Accidents · Nodes · Analytics · Logs |
| **Real-time spawning** | Synchronous Dijkstra routing — vehicles spawn instantly every tick |
| **Vehicle despawning** | Vehicles disappear when they reach their destination |
| **Live counters** | Total spawned, total despawned, per-type vehicle breakdown |
| **Connection indicator** | Live/Offline status dot in top bar |

---

## Quick Start

```bash
# 1. Bootstrap databases (run once)
cd backend
npm install
npm run db:init

# 2. Start backend (port 5000)
npm run dev

# 3. Start frontend (port 3000, new terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` → auto-login as **admin / admin123**

---

## UI Layout

```
┌─────────────────────────────────── Top Status Bar ──────────────────────────────────────┐
│  🚦 DITMS  ● LIVE  ▶ RUNNING  Tick:1234  Vehicles:47  Spawned:312  Congestion:23%  ⏸ ⏹  │
│                                                                         [⚙ Hide Panel]   │
├──────────────────────────────────────────────────────┬──────────────────────────────────┤
│                                                      │  Tab: Overview / Signals /       │
│                                                      │       Traffic / Emergency /      │
│         CITY MAP (always visible)                    │       Accidents / Nodes /        │
│                                                      │       Analytics / Logs           │
│  • 20 intersections with live signal colours         │                                  │
│  • Vehicle dots moving in real-time                  │  ← Slides in/out with animation  │
│  • Road congestion colour-coded                      │     (400px wide)                 │
│  • Emergency vehicles pulse                          │                                  │
│  • Click intersection → inspector overlay            │                                  │
│  • Zoom with scroll wheel, pan with drag             │                                  │
└──────────────────────────────────────────────────────┴──────────────────────────────────┘
```

---

## Real-Time Architecture

```
Backend (Node.js)                          Frontend (React)
─────────────────                          ─────────────────
setInterval(500ms)                         Zustand store
  │                                          ├── vehicles[]      ← updates every tick
  ├─ _tickSignals()    (synchronous)         ├─ intersections{}  ← signal states
  ├─ _spawnVehicles()  (synchronous Dijkstra)├─ accidents[]
  ├─ _moveVehicles()   (lerp + despawn)      ├─ analytics{}
  ├─ _runAI()          (rule engine)         └─ logs[]
  └─ emit('sim:tick', snapshot)
          │
          └──── Socket.io ──────────────────► useSimStore.initSocket()
                (every 500ms)                 → set({ vehicles, intersections, ... })
                                              → React re-renders SVG map
```

---

## Simulation Engine

- **Spawn rate**: 0–20 vehicles per tick (500ms), default 2
- **Routing**: Built-in synchronous Dijkstra on in-memory adjacency list — no DB wait
- **Movement**: Each tick advances vehicles by `speed × dt` pixels toward next intersection
- **Signals**: GREEN→YELLOW→RED cycle with configurable durations per intersection
- **Despawn**: Vehicles removed when `routeIndex >= route.length - 1`
- **Emergency**: Ignores signals, travels at 1.5× speed, opens green corridor via 2PC

---

## Sidebar Tabs

| Tab | Controls |
|-----|----------|
| **Overview** | KPI cards · Start/Pause/Stop · Speed slider · Rush Hour · Rain Mode · Node health |
| **Signals** | Per-intersection override · Timing config · Bulk all-GREEN/RED · AI on/off · 2PC sync |
| **Traffic** | Spawn rate slider · Manual vehicle spawn with type/origin/destination · Vehicle breakdown |
| **Emergency** | Dispatch ambulance/police/fire truck · Active emergency list |
| **Accidents** | Create accident (severity, lanes, duration) · Resolve · Active list |
| **Nodes** | Crash/recover nodes · Comm delay injection · WAL log · 2PC transaction history |
| **Analytics** | Live line charts (vehicles + congestion + wait) · AI rule activations |
| **Logs** | Real-time event stream · Level filter · Auto-scroll · Clear |

---

## Tech Stack

```
Frontend                     Backend
────────                     ───────
Next.js 14 (App Router)      Node.js + Express + TypeScript
React 18 + TypeScript        Socket.io (2Hz real-time push)
Tailwind CSS v3              Synchronous Dijkstra (in-process)
Zustand (state)              AI Decision Engine (9 rules)
Recharts (charts)            2PC Coordinator
Socket.io-client             PostgreSQL × 5 schemas
                             MongoDB (events/logs)
                             Neo4j (road graph)
                             Redis (optional cache)
```

---

## Default Credentials

| Username | Password | Access |
|----------|----------|--------|
| admin    | admin123 | Full   |

---

## Project Structure

```
ditms-web/
├── backend/
│   ├── src/
│   │   ├── index.ts                    Express + Socket.io boot
│   │   ├── config/cityConfig.ts        20 intersections, 31 roads, districts
│   │   ├── config/database.ts          PG / Mongoose / Neo4j / Redis
│   │   ├── models/index.ts             Mongoose schemas
│   │   ├── services/
│   │   │   ├── simulationEngine.ts     Tick loop + sync Dijkstra spawning
│   │   │   └── aiEngine.ts             AI rules + 2PC coordinator
│   │   ├── socket/socketHandler.ts     All Socket.io events
│   │   ├── routes/index.ts             REST API
│   │   └── utils/dbInit.ts             Database bootstrap
│   └── schemas/pg_schema.sql
│
└── frontend/
    └── src/
        ├── app/
        │   ├── auth/login/page.tsx     Single-click admin login
        │   └── dashboard/
        │       ├── layout.tsx          Auth guard (passthrough)
        │       └── page.tsx            Full-screen map + 8-tab sliding sidebar
        ├── store/
        │   ├── simStore.ts             Live sim state from Socket.io
        │   └── authStore.ts            JWT + single admin
        ├── lib/
        │   ├── socket.ts               Socket factory + API client
        │   ├── utils.ts                Helpers + constants
        │   └── mapConfig.ts            Road list for SVG
        └── hooks/useSocket.ts          Socket init on auth
```
