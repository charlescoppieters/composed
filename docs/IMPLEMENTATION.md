# Composed — Implementation Guide

## What We're Building

A web app where users join a room via code and collaboratively build a looping track. Each user creates their own stem (using 4 levels of creation tools) and pushes it to a shared master loop that plays for everyone in real-time.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Clients                        │
│  Next.js + Tone.js (audio) + Socket.io client   │
│                  Hosted on Vercel                │
└──────────┬──────────────────┬────────────────────┘
           │ WebSocket         │ HTTPS
           ▼                   ▼
┌──────────────────┐  ┌──────────────────────────┐
│  Socket.io Server │  │  Next.js API Routes      │
│  (Railway)        │  │  - /api/generate-loop    │
│                   │  │  - /api/generate-sample  │
│  Room state       │  │  - /api/upload           │
│  (in-memory, no   │  └──────┬──────┬────────────┘
│   database)       │         │      │
└──────────────────┘          │      │
                              ▼      ▼
                    ┌──────────┐  ┌──────────────┐
                    │ Eleven   │  │ Cloudflare   │
                    │ Labs API │  │ R2 (audio    │
                    │          │  │  storage)    │
                    └──────────┘  └──────────────┘
```

**Key decisions:**
- **No database.** Rooms exist in memory on the Socket.io server. When everyone leaves, the room is garbage collected.
- **No auth.** Users enter a name and a room code. That's it.
- **Split deploy.** Vercel doesn't support persistent WebSockets, so the Socket.io server runs separately on Railway (free tier).
- **All audio files** are stored in Cloudflare R2 (S3-compatible, zero egress fees) and served via public URLs.
- **Audio sync** is handled client-side by Tone.js Transport — all clients loop independently at the same BPM/bar count. When a track is pushed, all clients receive the audio URL via WebSocket and add it to their local playback.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Audio | Tone.js |
| Real-time | Socket.io |
| AI Generation | ElevenLabs Sound Generation API |
| Audio Storage | Cloudflare R2 |
| Frontend Hosting | Vercel |
| Server Hosting | Railway |

---

## User Flow

```
Landing Page                    Jam Session
┌─────────────────┐            ┌──────────────────────────────────┐
│                 │            │ Header: Room code, BPM, Key,     │
│  Enter name     │            │         Scale, Bar count, Play   │
│                 │            ├────────────┬─────────────────────┤
│  [Join Room]    │──code───▶  │            │                     │
│    Room code    │            │  Master    │  Creation Panel     │
│                 │            │  Track     │  ┌───┬───┬───┬───┐  │
│  [Create Room]  │──────────▶ │  List      │  │ 1 │ 2 │ 3 │ 4 │  │
│    BPM, Key,    │            │            │  └───┴───┴───┴───┘  │
│    Scale, Bars  │            │  - Track   │                     │
│                 │            │  - Volume  │  [Active tool]      │
└─────────────────┘            │  - Vote    │                     │
                               │            │  [Preview] [Push]   │
                               │            │                     │
                               │  Listen:   │                     │
                               │  My│Master│Both                  │
                               └────────────┴─────────────────────┘
```

---

## The 4 Creation Levels

### Level 1: Loop Library (Beginner)
Browse a pre-loaded library of loops and stems. Search by type (drums, bass, chords, melody, vocals, fx), preview over the master, and push.

**Prereq:** We need to curate ~30-50 royalty-free loops before the hackathon, tagged with stem type, BPM, and key. Sources: Looperman, Freesound, Splice.

### Level 2: Text-to-Loop (ElevenLabs generates sound + rhythm)
User types a description (e.g. "funky boom bap drums with hi-hat rolls"). We build a detailed prompt including the room's BPM, key, scale, and bar count, then call ElevenLabs Sound Generation API. User previews, can regenerate, then pushes.

### Level 3: Sampler Pads (ElevenLabs generates sound, user creates rhythm)
User describes a sound (e.g. "deep 808 kick"). We generate a one-shot sample via ElevenLabs. Sample loads onto one of 4 pads. User builds a pattern on a 16-step sequencer grid. The pattern is recorded as a loop and can be pushed.

### Level 4: Synth (Experienced musicians)
Tone.js built-in synths (Classic, FM, AM, Pluck). User plays via on-screen piano or computer keyboard (A-L keys = notes). Performance is recorded for one loop duration and can be pushed.

---

## Room Settings (Global)

These are set when creating a room and can be changed by anyone during the session. Changes broadcast to all clients.

| Setting | Options | Default |
|---------|---------|---------|
| BPM | 60–200 | 120 |
| Key | C, C#, D, ... B | C |
| Scale | major, minor | minor |
| Bar Count | 4, 8, 16 | 4 |

All generated content (Levels 2-4) is automatically created in the master key/scale/BPM.

---

## Core Mechanics

### Pushing a Track
When a user pushes their track, the audio file URL is broadcast to all clients. Every client's Tone.js engine loads the audio and syncs it to the shared transport. The track appears in the master track list.

### Listening Modes
Each user can toggle between:
1. **My Track** — hear only your work-in-progress
2. **Master** — hear only the master (all pushed tracks)
3. **Both** — overlay your track on top of the master

### Voting to Remove
Any user can vote to remove a track. When votes exceed 50% of online users, the track is automatically removed.

---

## Project Structure

```
composed/
├── web/                          # Next.js → Vercel
│   ├── app/
│   │   ├── page.tsx              # Landing (create/join room)
│   │   ├── room/[code]/page.tsx  # Jam session
│   │   └── api/
│   │       ├── generate-loop/    # ElevenLabs text-to-loop
│   │       ├── generate-sample/  # ElevenLabs text-to-sample
│   │       └── upload/           # Upload audio to R2
│   ├── components/
│   │   ├── RoomJoin.tsx
│   │   ├── JamSession.tsx        # Main session container
│   │   ├── MasterControls.tsx    # BPM, key, bar count, play/stop
│   │   ├── TrackList.tsx         # Pushed tracks + voting
│   │   ├── TrackCard.tsx         # Single track row
│   │   ├── ListenModeToggle.tsx
│   │   ├── CreationPanel.tsx     # Tabbed container for levels 1-4
│   │   ├── LoopBrowser.tsx       # Level 1
│   │   ├── TextToLoop.tsx        # Level 2
│   │   ├── SamplerPads.tsx       # Level 3
│   │   └── SynthPlayer.tsx       # Level 4
│   ├── hooks/
│   │   ├── useSocket.ts          # Socket.io connection
│   │   ├── useRoom.ts            # Room state management
│   │   └── useAudioEngine.ts     # Tone.js transport + players
│   ├── lib/
│   │   ├── audio-engine.ts       # Tone.js engine singleton
│   │   ├── socket.ts             # Socket.io client singleton
│   │   ├── r2.ts                 # R2 upload utility
│   │   ├── elevenlabs.ts         # Prompt builder for ElevenLabs
│   │   └── constants.ts          # Musical keys, BPM ranges, colors
│   └── public/loops/             # Pre-loaded loop library
│       ├── drums/
│       ├── bass/
│       ├── chords/
│       ├── melody/
│       ├── vocals/
│       └── fx/
├── server/                       # Socket.io → Railway
│   └── src/
│       ├── index.ts              # Express + Socket.io entry
│       ├── room-manager.ts       # In-memory room CRUD
│       └── events.ts             # Socket event handlers
└── shared/
    └── types.ts                  # Shared TypeScript types
```

---

## Dev Assignments

### Dev 1 — Infrastructure
**Owns:** Socket.io server, R2 integration, socket client hooks, deployment

| Task | What to build |
|------|--------------|
| Project scaffold | `npm init`, Next.js app, server setup, shared types, git init |
| Socket.io server | `server/src/index.ts`, `room-manager.ts`, `events.ts` — Express + Socket.io with room create/join/leave, track push/remove/vote, settings updates |
| R2 upload | `web/lib/r2.ts` + `web/app/api/upload/route.ts` — upload audio files to Cloudflare R2, return public URL |
| Socket hooks | `web/lib/socket.ts`, `web/hooks/useSocket.ts`, `web/hooks/useRoom.ts` — client-side socket connection + room state management |
| Deploy | Railway for server, Vercel for frontend, R2 bucket setup |

**Socket events to implement:**

| Client → Server | Server → All Clients |
|-----------------|---------------------|
| `room:create` (name, settings) → callback(room) | `room:user-joined` (user) |
| `room:join` (code, name) → callback(room) | `room:user-left` (userId) |
| `room:update-settings` (settings) | `room:settings-changed` (settings) |
| `track:push` (track) | `track:pushed` (track) |
| `track:vote-remove` (trackId) | `track:removed` (trackId) |
| `track:unvote-remove` (trackId) | `track:vote-updated` (trackId, votes) |

---

### Dev 2 — Audio Engine
**Owns:** Tone.js engine, transport, mixing, listen modes

| Task | What to build |
|------|--------------|
| Audio engine | `web/lib/audio-engine.ts` — singleton class managing Tone.js Transport, Player instances for each track, gain nodes for mixing |
| Engine hook | `web/hooks/useAudioEngine.ts` — React hook wrapping the engine, syncs tracks/settings changes |
| Constants | `web/lib/constants.ts` — musical keys, scales, BPM range, bar counts, stem type color map |

**Key behaviors:**
- Transport loops at `{barCount}m` with `bpm` from room settings
- Each pushed track = `Tone.Player` synced to transport via `.sync().start(0)`
- Master tracks route through a shared `masterGain` node
- Local preview routes through a separate `localGain` node
- Listen mode toggles gain values: solo (master=0, local=1), master (1, 0), overlay (1, 1)
- When settings change (BPM, bar count), update transport immediately
- When a track is added/removed, create/dispose the corresponding Player

---

### Dev 3 — UI/UX
**Owns:** All visual components, layout, styling

| Task | What to build |
|------|--------------|
| Landing page | `RoomJoin.tsx` — name input, join (room code) or create (BPM/key/scale/bars) |
| Jam session layout | `JamSession.tsx` — header with room info + master controls, left sidebar for track list, main area for creation panel |
| Master controls | `MasterControls.tsx` — play/stop button, BPM input, key/scale selects, bar count toggle |
| Track list | `TrackList.tsx` + `TrackCard.tsx` — list of pushed tracks, each with name, author, stem type color, volume slider, vote-to-remove button showing vote count |
| Listen mode | `ListenModeToggle.tsx` — 3-way toggle: My Track / Master / Both |

**Design notes:**
- Dark theme (gray-950 background)
- Stem types have assigned colors: drums=red, bass=orange, chords=yellow, melody=green, vocals=blue, fx=purple
- Track cards have a colored left border matching their stem type
- Purple accent color throughout
- Keep it clean and functional — this is a hackathon, not a design showcase

---

### Dev 4 — Creation Tools
**Owns:** All 4 creation levels, ElevenLabs integration

| Task | What to build |
|------|--------------|
| Creation panel | `CreationPanel.tsx` — tabbed container switching between 4 levels |
| Level 1: Loop browser | `LoopBrowser.tsx` — loads `public/loops/index.json`, search + filter by stem type, preview + push buttons |
| Level 2: Text-to-loop | `TextToLoop.tsx` + `web/lib/elevenlabs.ts` + `web/app/api/generate-loop/route.ts` — text input, stem type picker, generate via ElevenLabs, preview/regenerate/push |
| Level 3: Sampler | `SamplerPads.tsx` + `web/app/api/generate-sample/route.ts` — generate one-shot samples, load onto 4 pads, 16-step sequencer grid, record pattern as loop |
| Level 4: Synth | `SynthPlayer.tsx` — Tone.js PolySynth (4 types), on-screen piano + computer keyboard input (A-L keys), record loop |
| Loop library | Curate ~30-50 royalty-free loops, organize in `public/loops/`, create `index.json` with metadata |

**ElevenLabs integration:**
- API endpoint: `POST https://api.elevenlabs.io/v1/sound-generation`
- We build detailed prompts from the user's description + room settings (BPM, key, scale, duration)
- API calls go through Next.js API routes (keeps API key server-side)
- Generated audio is uploaded to R2, URL returned to client
- Generation takes 3-10 seconds — UI needs a loading state

---

## Environment Variables

```
# R2 (Cloudflare)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=composed-loops
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Socket server
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001   # Railway URL in prod

# ElevenLabs
ELEVENLABS_API_KEY=

# Server only
CLIENT_URL=http://localhost:3000               # Vercel URL in prod
```

---

## Build Order

```
Phase 1: Foundation (all devs, ~30 min)
├── Scaffold project together
├── npm installs, tsconfig, git init
│
Phase 2: Parallel work
├── Dev 1: Server + R2 + hooks
├── Dev 2: Audio engine
├── Dev 3: UI components
├── Dev 4: Creation tools + loop library
│
Phase 3: Integration (~1 hr)
├── Connect everything, test full flow
├── Fix bugs
│
Phase 4: Deploy
├── Railway (server) + Vercel (frontend) + R2 bucket
└── Test in production
```

---

## Testing Checklist

- [ ] Create a room → get a 6-char code
- [ ] Join from another tab with the code
- [ ] Both tabs see each other in user count
- [ ] Change BPM → syncs to all clients
- [ ] Change key/scale/bar count → syncs
- [ ] Browse loop library → preview plays over master
- [ ] Push a loop → appears in track list on all clients
- [ ] Volume slider adjusts track volume
- [ ] Vote to remove → vote count updates → track removed at majority
- [ ] Text-to-loop generates audio and can be previewed/pushed
- [ ] Sampler generates samples, loads on pads, step sequencer works, recording pushes
- [ ] Synth plays notes, records loop, pushes
- [ ] Listen mode toggle works (solo/master/both)
- [ ] Leaving a room removes user from count
- [ ] Empty room is cleaned up after 60s
