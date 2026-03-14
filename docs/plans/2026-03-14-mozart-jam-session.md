# Composed: Live Collaborative Jam Session — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web app where users join rooms via code and collaboratively build a looping track — each user creates their own stem and pushes it to a shared master loop that plays for everyone.

**Architecture:** Next.js frontend on Vercel handles UI, audio playback (Tone.js), and proxies ElevenLabs API calls. A separate Socket.io server on Railway manages room state in-memory (no database) and broadcasts updates. Audio files are stored in Cloudflare R2 with public URLs. All clients independently play the master loop using Tone.js Transport synced to a server-authoritative clock.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tone.js, Socket.io, Cloudflare R2 (via AWS SDK S3 client), ElevenLabs API, Tailwind CSS, Railway (Socket.io server), Vercel (frontend)

---

## Project Structure

```
composed/
├── web/                          # Next.js frontend → Vercel
│   ├── app/
│   │   ├── page.tsx              # Landing — create/join room
│   │   ├── room/[code]/
│   │   │   └── page.tsx          # Main jam session page
│   │   ├── api/
│   │   │   ├── generate-loop/route.ts    # ElevenLabs text-to-loop proxy
│   │   │   ├── generate-sample/route.ts  # ElevenLabs text-to-sample proxy
│   │   │   └── upload/route.ts           # Upload audio to R2
│   │   └── layout.tsx
│   ├── components/
│   │   ├── RoomJoin.tsx          # Create/join room form
│   │   ├── JamSession.tsx        # Main session container
│   │   ├── MasterControls.tsx    # BPM, key, bar count, transport
│   │   ├── TrackList.tsx         # List of pushed master tracks
│   │   ├── TrackCard.tsx         # Single track with vote/volume
│   │   ├── ListenModeToggle.tsx  # Solo / Master / Overlay toggle
│   │   ├── CreationPanel.tsx     # Tabbed panel for 4 creation levels
│   │   ├── LoopBrowser.tsx       # Level 1: browse loop library
│   │   ├── TextToLoop.tsx        # Level 2: ElevenLabs generation
│   │   ├── SamplerPads.tsx       # Level 3: sample + pad player
│   │   ├── SynthPlayer.tsx       # Level 4: Tone.js synth + keyboard
│   │   └── WaveformPreview.tsx   # Audio waveform visualizer
│   ├── hooks/
│   │   ├── useSocket.ts          # Socket.io connection manager
│   │   ├── useAudioEngine.ts     # Tone.js transport + player manager
│   │   └── useRoom.ts           # Room state from socket
│   ├── lib/
│   │   ├── audio-engine.ts       # Tone.js engine: transport, players, mixing
│   │   ├── socket.ts             # Socket.io client singleton
│   │   ├── r2.ts                 # R2 upload utility
│   │   ├── elevenlabs.ts         # ElevenLabs prompt builder + API calls
│   │   └── constants.ts          # Musical keys, BPM ranges, etc.
│   ├── public/
│   │   └── loops/                # Pre-loaded loop library (organized by type)
│   │       ├── drums/
│   │       ├── bass/
│   │       ├── chords/
│   │       ├── melody/
│   │       ├── vocals/
│   │       └── fx/
│   ├── tailwind.config.ts
│   ├── next.config.js
│   ├── package.json
│   └── tsconfig.json
├── server/                       # Socket.io server → Railway
│   ├── src/
│   │   ├── index.ts              # Express + Socket.io entry point
│   │   ├── room-manager.ts       # In-memory room CRUD
│   │   └── events.ts             # Socket event handlers
│   ├── package.json
│   └── tsconfig.json
├── shared/                       # Shared types (imported by both)
│   └── types.ts
├── package.json                  # Workspace root
└── turbo.json                    # Turborepo config (optional)
```

## Shared Types

```typescript
// shared/types.ts

export type MusicalKey =
  | "C" | "C#" | "D" | "D#" | "E" | "F"
  | "F#" | "G" | "G#" | "A" | "A#" | "B";

export type Scale = "major" | "minor";

export type StemType = "drums" | "bass" | "chords" | "melody" | "vocals" | "fx";

export interface RoomSettings {
  bpm: number;           // 60-200
  key: MusicalKey;
  scale: Scale;
  barCount: 4 | 8 | 16;
}

export interface Track {
  id: string;
  userId: string;
  userName: string;
  name: string;
  audioUrl: string;       // R2 public URL
  stemType: StemType;
  creationLevel: 1 | 2 | 3 | 4;
  volume: number;         // 0-1
  muted: boolean;
  removeVotes: string[];  // userIds who voted to remove
  pushedAt: number;       // timestamp
}

export interface Room {
  code: string;
  settings: RoomSettings;
  tracks: Track[];
  users: RoomUser[];
  createdAt: number;
}

export interface RoomUser {
  id: string;
  name: string;
  joinedAt: number;
}

export interface LoopMeta {
  id: string;
  filename: string;
  name: string;
  stemType: StemType;
  bpm: number;
  key: MusicalKey;
  scale: Scale;
  tags: string[];
}

// Socket.io event types
export interface ServerToClientEvents {
  "room:state": (room: Room) => void;
  "room:user-joined": (user: RoomUser) => void;
  "room:user-left": (userId: string) => void;
  "room:settings-changed": (settings: RoomSettings) => void;
  "track:pushed": (track: Track) => void;
  "track:removed": (trackId: string) => void;
  "track:vote-updated": (trackId: string, votes: string[]) => void;
  "transport:sync": (position: number) => void;
}

export interface ClientToServerEvents {
  "room:create": (userName: string, settings: RoomSettings, cb: (room: Room) => void) => void;
  "room:join": (code: string, userName: string, cb: (room: Room | null) => void) => void;
  "room:update-settings": (settings: Partial<RoomSettings>) => void;
  "track:push": (track: Omit<Track, "removeVotes" | "pushedAt">) => void;
  "track:vote-remove": (trackId: string) => void;
  "track:unvote-remove": (trackId: string) => void;
}
```

---

## Dev Assignment Overview

| Dev | Focus Area | Tasks |
|-----|-----------|-------|
| **Dev 1** | Infrastructure | Tasks 1-4: Project setup, Socket.io server, R2, room management |
| **Dev 2** | Audio Engine | Tasks 5-7: Tone.js engine, transport sync, mixing/listening modes |
| **Dev 3** | UI/UX | Tasks 8-11: Landing page, jam session layout, track list, controls |
| **Dev 4** | Creation Tools | Tasks 12-15: Loop library, ElevenLabs integration, sampler, synth |

All devs start with Task 1 together (project scaffold), then branch off.

---

## Task 1: Project Scaffolding (All Devs — Do Together)

**Files:**
- Create: `package.json` (root workspace)
- Create: `web/` (Next.js app)
- Create: `server/` (Socket.io server)
- Create: `shared/types.ts`

**Step 1: Initialize workspace root**

```bash
cd /Users/charlescoppieters/Desktop/composed
npm init -y
```

Edit `package.json`:
```json
{
  "name": "composed",
  "private": true,
  "workspaces": ["web", "server", "shared"]
}
```

**Step 2: Scaffold Next.js app**

```bash
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

**Step 3: Install frontend dependencies**

```bash
cd web
npm install tone socket.io-client @aws-sdk/client-s3 uuid
npm install -D @types/uuid
```

**Step 4: Scaffold Socket.io server**

```bash
cd /Users/charlescoppieters/Desktop/composed
mkdir -p server/src
cd server
npm init -y
npm install express socket.io cors uuid
npm install -D typescript @types/express @types/cors @types/uuid ts-node nodemon
npx tsc --init
```

Edit `server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

Edit `server/package.json` scripts:
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**Step 5: Create shared types**

Write `shared/types.ts` with the content from the "Shared Types" section above.

**Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold project — Next.js, Socket.io server, shared types"
```

---

## Task 2: Socket.io Server — Room Management (Dev 1)

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/room-manager.ts`
- Create: `server/src/events.ts`

**Step 1: Write room-manager.ts**

```typescript
// server/src/room-manager.ts
import { Room, RoomSettings, RoomUser, Track } from "../../shared/types";
import { v4 as uuid } from "uuid";

const rooms = new Map<string, Room>();

function generateCode(): string {
  // 6-char alphanumeric, uppercase
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(settings: RoomSettings): Room {
  const room: Room = {
    code: generateCode(),
    settings,
    tracks: [],
    users: [],
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function addUser(code: string, user: RoomUser): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.users.push(user);
  return room;
}

export function removeUser(code: string, userId: string): void {
  const room = rooms.get(code);
  if (!room) return;
  room.users = room.users.filter((u) => u.id !== userId);
  // Garbage collect empty rooms after 60s
  if (room.users.length === 0) {
    setTimeout(() => {
      const r = rooms.get(code);
      if (r && r.users.length === 0) rooms.delete(code);
    }, 60000);
  }
}

export function updateSettings(code: string, settings: Partial<RoomSettings>): RoomSettings | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.settings = { ...room.settings, ...settings };
  return room.settings;
}

export function pushTrack(code: string, track: Track): Track | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.tracks.push(track);
  return track;
}

export function removeTrack(code: string, trackId: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  room.tracks = room.tracks.filter((t) => t.id !== trackId);
  return true;
}

export function voteRemoveTrack(code: string, trackId: string, userId: string): string[] | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const track = room.tracks.find((t) => t.id === trackId);
  if (!track) return undefined;
  if (!track.removeVotes.includes(userId)) {
    track.removeVotes.push(userId);
  }
  // Auto-remove if majority votes
  if (track.removeVotes.length > room.users.length / 2) {
    room.tracks = room.tracks.filter((t) => t.id !== trackId);
    return undefined; // signal removal
  }
  return track.removeVotes;
}

export function unvoteRemoveTrack(code: string, trackId: string, userId: string): string[] | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const track = room.tracks.find((t) => t.id === trackId);
  if (!track) return undefined;
  track.removeVotes = track.removeVotes.filter((id) => id !== userId);
  return track.removeVotes;
}
```

**Step 2: Write events.ts**

```typescript
// server/src/events.ts
import { Server, Socket } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomUser,
  Track,
} from "../../shared/types";
import * as RoomManager from "./room-manager";
import { v4 as uuid } from "uuid";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Track which room each socket is in
const socketRooms = new Map<string, { code: string; userId: string }>();

export function registerEvents(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.on("connection", (socket: AppSocket) => {
    console.log(`Connected: ${socket.id}`);

    socket.on("room:create", (userName, settings, cb) => {
      const room = RoomManager.createRoom(settings);
      const user: RoomUser = { id: uuid(), name: userName, joinedAt: Date.now() };
      RoomManager.addUser(room.code, user);
      socket.join(room.code);
      socketRooms.set(socket.id, { code: room.code, userId: user.id });
      cb({ ...room, users: [user] });
    });

    socket.on("room:join", (code, userName, cb) => {
      const normalizedCode = code.toUpperCase();
      const existing = RoomManager.getRoom(normalizedCode);
      if (!existing) {
        cb(null);
        return;
      }
      const user: RoomUser = { id: uuid(), name: userName, joinedAt: Date.now() };
      RoomManager.addUser(normalizedCode, user);
      socket.join(normalizedCode);
      socketRooms.set(socket.id, { code: normalizedCode, userId: user.id });
      // Notify others
      socket.to(normalizedCode).emit("room:user-joined", user);
      // Send full state to joiner
      cb(RoomManager.getRoom(normalizedCode)!);
    });

    socket.on("room:update-settings", (settings) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const updated = RoomManager.updateSettings(meta.code, settings);
      if (updated) {
        io.to(meta.code).emit("room:settings-changed", updated);
      }
    });

    socket.on("track:push", (trackData) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const track: Track = {
        ...trackData,
        removeVotes: [],
        pushedAt: Date.now(),
      };
      RoomManager.pushTrack(meta.code, track);
      io.to(meta.code).emit("track:pushed", track);
    });

    socket.on("track:vote-remove", (trackId) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const result = RoomManager.voteRemoveTrack(meta.code, trackId, meta.userId);
      if (result === undefined) {
        // Track was auto-removed by majority
        io.to(meta.code).emit("track:removed", trackId);
      } else {
        io.to(meta.code).emit("track:vote-updated", trackId, result);
      }
    });

    socket.on("track:unvote-remove", (trackId) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const result = RoomManager.unvoteRemoveTrack(meta.code, trackId, meta.userId);
      if (result) {
        io.to(meta.code).emit("track:vote-updated", trackId, result);
      }
    });

    socket.on("disconnect", () => {
      const meta = socketRooms.get(socket.id);
      if (meta) {
        RoomManager.removeUser(meta.code, meta.userId);
        socket.to(meta.code).emit("room:user-left", meta.userId);
        socketRooms.delete(socket.id);
      }
      console.log(`Disconnected: ${socket.id}`);
    });
  });
}
```

**Step 3: Write index.ts**

```typescript
// server/src/index.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { registerEvents } from "./events";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

registerEvents(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Composed server running on port ${PORT}`);
});
```

**Step 4: Test the server starts**

```bash
cd /Users/charlescoppieters/Desktop/composed/server
npm run dev
```

Expected: `Composed server running on port 3001`

**Step 5: Commit**

```bash
git add server/ shared/
git commit -m "feat: Socket.io server with room management and event handling"
```

---

## Task 3: R2 Setup & Upload API (Dev 1)

**Files:**
- Create: `web/lib/r2.ts`
- Create: `web/app/api/upload/route.ts`

**Step 1: Configure R2 environment variables**

Create `web/.env.local`:
```
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=composed-loops
R2_PUBLIC_URL=https://your-r2-public-url.r2.dev
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
ELEVENLABS_API_KEY=your_elevenlabs_key
```

**Step 2: Write R2 utility**

```typescript
// web/lib/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = "audio/wav"
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

**Step 3: Write upload API route**

```typescript
// web/app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const roomCode = formData.get("roomCode") as string;

  if (!file || !roomCode) {
    return NextResponse.json({ error: "Missing file or roomCode" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "wav";
  const key = `rooms/${roomCode}/${uuid()}.${ext}`;
  const url = await uploadToR2(key, buffer, file.type || "audio/wav");

  return NextResponse.json({ url });
}
```

**Step 4: Commit**

```bash
git add web/lib/r2.ts web/app/api/upload/
git commit -m "feat: R2 upload utility and API route"
```

---

## Task 4: Socket Client Hook (Dev 1)

**Files:**
- Create: `web/lib/socket.ts`
- Create: `web/hooks/useSocket.ts`
- Create: `web/hooks/useRoom.ts`

**Step 1: Write socket singleton**

```typescript
// web/lib/socket.ts
import { io, Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "../../shared/types";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001", {
      autoConnect: false,
    });
  }
  return socket;
}
```

**Step 2: Write useSocket hook**

```typescript
// web/hooks/useSocket.ts
"use client";
import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket() {
  const socketRef = useRef(getSocket());

  useEffect(() => {
    const s = socketRef.current;
    if (!s.connected) s.connect();
    return () => {
      s.disconnect();
    };
  }, []);

  return socketRef.current;
}
```

**Step 3: Write useRoom hook**

```typescript
// web/hooks/useRoom.ts
"use client";
import { useState, useEffect, useCallback } from "react";
import { Room, RoomSettings, Track, RoomUser } from "../../shared/types";
import { getSocket } from "@/lib/socket";

export function useRoom() {
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const socket = getSocket();

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on("room:state", setRoom);

    socket.on("room:user-joined", (user: RoomUser) => {
      setRoom((prev) =>
        prev ? { ...prev, users: [...prev.users, user] } : prev
      );
    });

    socket.on("room:user-left", (uid: string) => {
      setRoom((prev) =>
        prev
          ? { ...prev, users: prev.users.filter((u) => u.id !== uid) }
          : prev
      );
    });

    socket.on("room:settings-changed", (settings: RoomSettings) => {
      setRoom((prev) => (prev ? { ...prev, settings } : prev));
    });

    socket.on("track:pushed", (track: Track) => {
      setRoom((prev) =>
        prev ? { ...prev, tracks: [...prev.tracks, track] } : prev
      );
    });

    socket.on("track:removed", (trackId: string) => {
      setRoom((prev) =>
        prev
          ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== trackId) }
          : prev
      );
    });

    socket.on("track:vote-updated", (trackId: string, votes: string[]) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.id === trackId ? { ...t, removeVotes: votes } : t
              ),
            }
          : prev
      );
    });

    return () => {
      socket.off("room:state");
      socket.off("room:user-joined");
      socket.off("room:user-left");
      socket.off("room:settings-changed");
      socket.off("track:pushed");
      socket.off("track:removed");
      socket.off("track:vote-updated");
    };
  }, [socket]);

  const createRoom = useCallback(
    (userName: string, settings: RoomSettings) => {
      socket.emit("room:create", userName, settings, (newRoom) => {
        setRoom(newRoom);
        setUserId(newRoom.users[0].id);
      });
    },
    [socket]
  );

  const joinRoom = useCallback(
    (code: string, userName: string): Promise<boolean> => {
      return new Promise((resolve) => {
        socket.emit("room:join", code, userName, (joinedRoom) => {
          if (joinedRoom) {
            setRoom(joinedRoom);
            // Our user is the last one added
            setUserId(joinedRoom.users[joinedRoom.users.length - 1].id);
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    },
    [socket]
  );

  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      socket.emit("room:update-settings", settings);
    },
    [socket]
  );

  const pushTrack = useCallback(
    (track: Omit<Track, "removeVotes" | "pushedAt">) => {
      socket.emit("track:push", track);
    },
    [socket]
  );

  const voteRemove = useCallback(
    (trackId: string) => {
      socket.emit("track:vote-remove", trackId);
    },
    [socket]
  );

  const unvoteRemove = useCallback(
    (trackId: string) => {
      socket.emit("track:unvote-remove", trackId);
    },
    [socket]
  );

  return {
    room,
    userId,
    createRoom,
    joinRoom,
    updateSettings,
    pushTrack,
    voteRemove,
    unvoteRemove,
  };
}
```

**Step 4: Commit**

```bash
git add web/lib/socket.ts web/hooks/
git commit -m "feat: socket client singleton, useSocket and useRoom hooks"
```

---

## Task 5: Audio Engine — Transport & Playback (Dev 2)

**Files:**
- Create: `web/lib/audio-engine.ts`
- Create: `web/hooks/useAudioEngine.ts`

**Step 1: Write audio engine**

```typescript
// web/lib/audio-engine.ts
import * as Tone from "tone";

export type ListenMode = "solo" | "master" | "overlay";

interface TrackPlayer {
  player: Tone.Player;
  gain: Tone.Gain;
}

class AudioEngine {
  private masterPlayers: Map<string, TrackPlayer> = new Map();
  private localPlayer: TrackPlayer | null = null;
  private listenMode: ListenMode = "overlay";
  private masterGain: Tone.Gain;
  private localGain: Tone.Gain;
  private _isPlaying = false;

  constructor() {
    this.masterGain = new Tone.Gain(1).toDestination();
    this.localGain = new Tone.Gain(1).toDestination();
  }

  async init() {
    await Tone.start();
  }

  get isPlaying() {
    return this._isPlaying;
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
  }

  setBarCount(barCount: number) {
    Tone.getTransport().loopEnd = `${barCount}m`;
    Tone.getTransport().loop = true;
  }

  start() {
    Tone.getTransport().start();
    this._isPlaying = true;
  }

  stop() {
    Tone.getTransport().stop();
    this._isPlaying = false;
  }

  setListenMode(mode: ListenMode) {
    this.listenMode = mode;
    switch (mode) {
      case "solo":
        this.masterGain.gain.value = 0;
        this.localGain.gain.value = 1;
        break;
      case "master":
        this.masterGain.gain.value = 1;
        this.localGain.gain.value = 0;
        break;
      case "overlay":
        this.masterGain.gain.value = 1;
        this.localGain.gain.value = 1;
        break;
    }
  }

  async addMasterTrack(trackId: string, audioUrl: string, volume: number = 1) {
    // Remove existing if replacing
    this.removeMasterTrack(trackId);

    const player = new Tone.Player({
      url: audioUrl,
      loop: true,
      fadeIn: 0.01,
      fadeOut: 0.01,
    });

    const gain = new Tone.Gain(volume);
    player.connect(gain);
    gain.connect(this.masterGain);

    await Tone.loaded();

    // Sync to transport so all tracks play in lock-step
    player.sync().start(0);

    this.masterPlayers.set(trackId, { player, gain });
  }

  removeMasterTrack(trackId: string) {
    const tp = this.masterPlayers.get(trackId);
    if (tp) {
      tp.player.unsync().stop().dispose();
      tp.gain.dispose();
      this.masterPlayers.delete(trackId);
    }
  }

  setMasterTrackVolume(trackId: string, volume: number) {
    const tp = this.masterPlayers.get(trackId);
    if (tp) tp.gain.gain.value = volume;
  }

  setMasterTrackMuted(trackId: string, muted: boolean) {
    const tp = this.masterPlayers.get(trackId);
    if (tp) tp.gain.gain.value = muted ? 0 : 1;
  }

  async setLocalTrack(audioUrl: string) {
    this.clearLocalTrack();

    const player = new Tone.Player({
      url: audioUrl,
      loop: true,
      fadeIn: 0.01,
      fadeOut: 0.01,
    });

    const gain = new Tone.Gain(1);
    player.connect(gain);
    gain.connect(this.localGain);

    await Tone.loaded();
    player.sync().start(0);

    this.localPlayer = { player, gain };
  }

  clearLocalTrack() {
    if (this.localPlayer) {
      this.localPlayer.player.unsync().stop().dispose();
      this.localPlayer.gain.dispose();
      this.localPlayer = null;
    }
  }

  dispose() {
    this.stop();
    this.masterPlayers.forEach((tp) => {
      tp.player.unsync().stop().dispose();
      tp.gain.dispose();
    });
    this.masterPlayers.clear();
    this.clearLocalTrack();
    this.masterGain.dispose();
    this.localGain.dispose();
  }
}

// Singleton
let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) {
    engine = new AudioEngine();
  }
  return engine;
}
```

**Step 2: Write useAudioEngine hook**

```typescript
// web/hooks/useAudioEngine.ts
"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { getAudioEngine, ListenMode } from "@/lib/audio-engine";
import { Track, RoomSettings } from "../../shared/types";

export function useAudioEngine(settings: RoomSettings | null, tracks: Track[]) {
  const engineRef = useRef(getAudioEngine());
  const [isPlaying, setIsPlaying] = useState(false);
  const [listenMode, setListenModeState] = useState<ListenMode>("overlay");
  const prevTrackIdsRef = useRef<Set<string>>(new Set());

  // Sync BPM and bar count when settings change
  useEffect(() => {
    if (!settings) return;
    const engine = engineRef.current;
    engine.setBpm(settings.bpm);
    engine.setBarCount(settings.barCount);
  }, [settings?.bpm, settings?.barCount]);

  // Sync master tracks when tracks array changes
  useEffect(() => {
    const engine = engineRef.current;
    const currentIds = new Set(tracks.map((t) => t.id));
    const prevIds = prevTrackIdsRef.current;

    // Add new tracks
    for (const track of tracks) {
      if (!prevIds.has(track.id)) {
        engine.addMasterTrack(track.id, track.audioUrl, track.volume);
      }
    }

    // Remove old tracks
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        engine.removeMasterTrack(id);
      }
    }

    prevTrackIdsRef.current = currentIds;
  }, [tracks]);

  const startTransport = useCallback(async () => {
    const engine = engineRef.current;
    await engine.init();
    engine.start();
    setIsPlaying(true);
  }, []);

  const stopTransport = useCallback(() => {
    engineRef.current.stop();
    setIsPlaying(false);
  }, []);

  const setListenMode = useCallback((mode: ListenMode) => {
    engineRef.current.setListenMode(mode);
    setListenModeState(mode);
  }, []);

  const previewLocal = useCallback(async (audioUrl: string) => {
    await engineRef.current.setLocalTrack(audioUrl);
  }, []);

  const clearLocal = useCallback(() => {
    engineRef.current.clearLocalTrack();
  }, []);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    engineRef.current.setMasterTrackVolume(trackId, volume);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current.dispose();
    };
  }, []);

  return {
    isPlaying,
    listenMode,
    startTransport,
    stopTransport,
    setListenMode,
    previewLocal,
    clearLocal,
    setTrackVolume,
  };
}
```

**Step 3: Commit**

```bash
git add web/lib/audio-engine.ts web/hooks/useAudioEngine.ts
git commit -m "feat: Tone.js audio engine with transport, mixing, and listen modes"
```

---

## Task 6: Constants & Helpers (Dev 2)

**Files:**
- Create: `web/lib/constants.ts`

**Step 1: Write constants**

```typescript
// web/lib/constants.ts
import { MusicalKey, Scale, StemType } from "../../shared/types";

export const MUSICAL_KEYS: MusicalKey[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export const SCALES: Scale[] = ["major", "minor"];

export const STEM_TYPES: StemType[] = [
  "drums", "bass", "chords", "melody", "vocals", "fx",
];

export const BPM_RANGE = { min: 60, max: 200 };

export const BAR_COUNTS = [4, 8, 16] as const;

export const DEFAULT_SETTINGS = {
  bpm: 120,
  key: "C" as MusicalKey,
  scale: "minor" as Scale,
  barCount: 4 as 4 | 8 | 16,
};

export const STEM_COLORS: Record<StemType, string> = {
  drums: "#EF4444",
  bass: "#F97316",
  chords: "#EAB308",
  melody: "#22C55E",
  vocals: "#3B82F6",
  fx: "#A855F7",
};
```

**Step 2: Commit**

```bash
git add web/lib/constants.ts
git commit -m "feat: musical constants, defaults, and stem color map"
```

---

## Task 7: Landing Page — Create/Join Room (Dev 3)

**Files:**
- Modify: `web/app/page.tsx`
- Create: `web/components/RoomJoin.tsx`

**Step 1: Write RoomJoin component**

```typescript
// web/components/RoomJoin.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { DEFAULT_SETTINGS, MUSICAL_KEYS, SCALES, BAR_COUNTS } from "@/lib/constants";
import { MusicalKey, Scale } from "../../shared/types";

export default function RoomJoin() {
  const router = useRouter();
  const { createRoom, joinRoom } = useRoom();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  // Create room settings
  const [bpm, setBpm] = useState(DEFAULT_SETTINGS.bpm);
  const [key, setKey] = useState<MusicalKey>(DEFAULT_SETTINGS.key);
  const [scale, setScale] = useState<Scale>(DEFAULT_SETTINGS.scale);
  const [barCount, setBarCount] = useState<4 | 8 | 16>(DEFAULT_SETTINGS.barCount);

  const handleJoin = async () => {
    if (!name.trim() || !roomCode.trim()) {
      setError("Enter your name and room code");
      return;
    }
    const success = await joinRoom(roomCode, name);
    if (success) {
      router.push(`/room/${roomCode.toUpperCase()}`);
    } else {
      setError("Room not found");
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    createRoom(name, { bpm, key, scale, barCount });
    // Room code comes back via callback — we navigate once we have it
    // This is handled by listening to room state changes
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight">Composed</h1>
          <p className="text-gray-400 mt-2">Collaborative Jam Sessions</p>
        </div>

        {/* Name input — always shown */}
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("join")}
            className={`flex-1 py-2 rounded-lg font-medium transition
              ${mode === "join" ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
          >
            Join Room
          </button>
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-2 rounded-lg font-medium transition
              ${mode === "create" ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
          >
            Create Room
          </button>
        </div>

        {mode === "join" ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Room code (e.g. ABC123)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                         text-white text-center text-2xl tracking-widest uppercase
                         placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleJoin}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition"
            >
              Join Session
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* BPM */}
            <div className="flex items-center justify-between">
              <label className="text-gray-400">BPM</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="w-32"
                />
                <span className="w-10 text-right font-mono">{bpm}</span>
              </div>
            </div>

            {/* Key + Scale */}
            <div className="flex items-center justify-between gap-4">
              <label className="text-gray-400">Key</label>
              <div className="flex gap-2">
                <select
                  value={key}
                  onChange={(e) => setKey(e.target.value as MusicalKey)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  {MUSICAL_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={scale}
                  onChange={(e) => setScale(e.target.value as Scale)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  {SCALES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bar count */}
            <div className="flex items-center justify-between">
              <label className="text-gray-400">Loop Length</label>
              <div className="flex gap-2">
                {BAR_COUNTS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBarCount(b)}
                    className={`px-4 py-2 rounded-lg font-mono transition
                      ${barCount === b ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
                  >
                    {b} bars
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition"
            >
              Create Session
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-center text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Update page.tsx**

```typescript
// web/app/page.tsx
import RoomJoin from "@/components/RoomJoin";

export default function Home() {
  return <RoomJoin />;
}
```

**Step 3: Commit**

```bash
git add web/app/page.tsx web/components/RoomJoin.tsx
git commit -m "feat: landing page with room create/join UI"
```

---

## Task 8: Jam Session Page — Main Layout (Dev 3)

**Files:**
- Create: `web/app/room/[code]/page.tsx`
- Create: `web/components/JamSession.tsx`
- Create: `web/components/MasterControls.tsx`
- Create: `web/components/ListenModeToggle.tsx`

**Step 1: Write JamSession container**

```typescript
// web/components/JamSession.tsx
"use client";
import { useRoom } from "@/hooks/useRoom";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import MasterControls from "./MasterControls";
import TrackList from "./TrackList";
import ListenModeToggle from "./ListenModeToggle";
import CreationPanel from "./CreationPanel";

export default function JamSession({ roomCode }: { roomCode: string }) {
  const { room, userId, updateSettings, pushTrack, voteRemove, unvoteRemove } = useRoom();
  const {
    isPlaying,
    listenMode,
    startTransport,
    stopTransport,
    setListenMode,
    previewLocal,
    clearLocal,
    setTrackVolume,
  } = useAudioEngine(room?.settings ?? null, room?.tracks ?? []);

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Connecting to room {roomCode}...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Composed</h1>
          <p className="text-gray-400 text-sm">
            Room: <span className="font-mono text-white">{room.code}</span>
            {" · "}
            {room.users.length} online
          </p>
        </div>
        <MasterControls
          settings={room.settings}
          isPlaying={isPlaying}
          onStart={startTransport}
          onStop={stopTransport}
          onUpdateSettings={updateSettings}
        />
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Left: Track list */}
        <div className="w-80 border-r border-gray-800 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Master Tracks</h2>
            <span className="text-gray-500 text-sm">{room.tracks.length} stems</span>
          </div>
          <TrackList
            tracks={room.tracks}
            userId={userId}
            onVoteRemove={voteRemove}
            onUnvoteRemove={unvoteRemove}
            onVolumeChange={setTrackVolume}
            totalUsers={room.users.length}
          />
        </div>

        {/* Right: Creation panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <ListenModeToggle mode={listenMode} onChange={setListenMode} />
          </div>
          <CreationPanel
            settings={room.settings}
            userId={userId}
            roomCode={room.code}
            onPreview={previewLocal}
            onClearPreview={clearLocal}
            onPush={pushTrack}
          />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Write MasterControls**

```typescript
// web/components/MasterControls.tsx
"use client";
import { RoomSettings } from "../../shared/types";
import { MUSICAL_KEYS, SCALES, BAR_COUNTS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
  onUpdateSettings: (s: Partial<RoomSettings>) => void;
}

export default function MasterControls({ settings, isPlaying, onStart, onStop, onUpdateSettings }: Props) {
  return (
    <div className="flex items-center gap-4">
      {/* Play/Stop */}
      <button
        onClick={isPlaying ? onStop : onStart}
        className={`px-6 py-2 rounded-lg font-semibold transition
          ${isPlaying ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"}`}
      >
        {isPlaying ? "Stop" : "Play"}
      </button>

      {/* BPM */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-400">BPM</span>
        <input
          type="number"
          min={60}
          max={200}
          value={settings.bpm}
          onChange={(e) => onUpdateSettings({ bpm: Number(e.target.value) })}
          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center font-mono"
        />
      </div>

      {/* Key */}
      <div className="flex items-center gap-1 text-sm">
        <select
          value={settings.key}
          onChange={(e) => onUpdateSettings({ key: e.target.value as any })}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
        >
          {MUSICAL_KEYS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <select
          value={settings.scale}
          onChange={(e) => onUpdateSettings({ scale: e.target.value as any })}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
        >
          {SCALES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Bar count */}
      <div className="flex gap-1">
        {BAR_COUNTS.map((b) => (
          <button
            key={b}
            onClick={() => onUpdateSettings({ barCount: b })}
            className={`px-3 py-1 rounded text-sm font-mono transition
              ${settings.barCount === b ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Write ListenModeToggle**

```typescript
// web/components/ListenModeToggle.tsx
"use client";
import { ListenMode } from "@/lib/audio-engine";

interface Props {
  mode: ListenMode;
  onChange: (mode: ListenMode) => void;
}

const modes: { value: ListenMode; label: string }[] = [
  { value: "solo", label: "My Track" },
  { value: "master", label: "Master" },
  { value: "overlay", label: "Both" },
];

export default function ListenModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition
            ${mode === m.value ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 4: Write room page**

```typescript
// web/app/room/[code]/page.tsx
import JamSession from "@/components/JamSession";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JamSession roomCode={code} />;
}
```

**Step 5: Commit**

```bash
git add web/app/room/ web/components/JamSession.tsx web/components/MasterControls.tsx web/components/ListenModeToggle.tsx
git commit -m "feat: jam session page with master controls and listen mode toggle"
```

---

## Task 9: Track List & Voting UI (Dev 3)

**Files:**
- Create: `web/components/TrackList.tsx`
- Create: `web/components/TrackCard.tsx`

**Step 1: Write TrackCard**

```typescript
// web/components/TrackCard.tsx
"use client";
import { Track } from "../../shared/types";
import { STEM_COLORS } from "@/lib/constants";

interface Props {
  track: Track;
  userId: string | null;
  onVoteRemove: (trackId: string) => void;
  onUnvoteRemove: (trackId: string) => void;
  onVolumeChange: (trackId: string, volume: number) => void;
  totalUsers: number;
}

export default function TrackCard({
  track,
  userId,
  onVoteRemove,
  onUnvoteRemove,
  onVolumeChange,
  totalUsers,
}: Props) {
  const hasVoted = userId ? track.removeVotes.includes(userId) : false;
  const voteCount = track.removeVotes.length;
  const votesNeeded = Math.ceil(totalUsers / 2);

  return (
    <div
      className="bg-gray-900 rounded-lg p-3 space-y-2"
      style={{ borderLeft: `3px solid ${STEM_COLORS[track.stemType]}` }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{track.name}</p>
          <p className="text-xs text-gray-500">
            {track.userName} · {track.stemType}
          </p>
        </div>
        <button
          onClick={() => hasVoted ? onUnvoteRemove(track.id) : onVoteRemove(track.id)}
          className={`text-xs px-2 py-1 rounded transition
            ${hasVoted ? "bg-red-900 text-red-300" : "bg-gray-800 text-gray-400 hover:text-red-400"}`}
        >
          {voteCount}/{votesNeeded} skip
        </button>
      </div>

      {/* Volume slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        defaultValue={track.volume}
        onChange={(e) => onVolumeChange(track.id, Number(e.target.value))}
        className="w-full h-1 accent-purple-500"
      />
    </div>
  );
}
```

**Step 2: Write TrackList**

```typescript
// web/components/TrackList.tsx
"use client";
import { Track } from "../../shared/types";
import TrackCard from "./TrackCard";

interface Props {
  tracks: Track[];
  userId: string | null;
  onVoteRemove: (trackId: string) => void;
  onUnvoteRemove: (trackId: string) => void;
  onVolumeChange: (trackId: string, volume: number) => void;
  totalUsers: number;
}

export default function TrackList({
  tracks,
  userId,
  onVoteRemove,
  onUnvoteRemove,
  onVolumeChange,
  totalUsers,
}: Props) {
  if (tracks.length === 0) {
    return (
      <div className="text-gray-600 text-sm text-center py-8">
        No tracks yet. Create one and push it!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          userId={userId}
          onVoteRemove={onVoteRemove}
          onUnvoteRemove={onUnvoteRemove}
          onVolumeChange={onVolumeChange}
          totalUsers={totalUsers}
        />
      ))}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add web/components/TrackList.tsx web/components/TrackCard.tsx
git commit -m "feat: track list with voting and volume controls"
```

---

## Task 10: Creation Panel — Tab Container (Dev 4)

**Files:**
- Create: `web/components/CreationPanel.tsx`

**Step 1: Write tabbed creation panel**

```typescript
// web/components/CreationPanel.tsx
"use client";
import { useState } from "react";
import { RoomSettings, Track, StemType } from "../../shared/types";
import LoopBrowser from "./LoopBrowser";
import TextToLoop from "./TextToLoop";
import SamplerPads from "./SamplerPads";
import SynthPlayer from "./SynthPlayer";

interface Props {
  settings: RoomSettings;
  userId: string | null;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onClearPreview: () => void;
  onPush: (track: Omit<Track, "removeVotes" | "pushedAt">) => void;
}

const levels = [
  { id: 1, label: "Loop Library", description: "Browse pre-made loops" },
  { id: 2, label: "Text → Loop", description: "AI-generated loops" },
  { id: 3, label: "Sampler", description: "Play AI samples on pads" },
  { id: 4, label: "Synth", description: "Play synths live" },
] as const;

export default function CreationPanel({
  settings,
  userId,
  roomCode,
  onPreview,
  onClearPreview,
  onPush,
}: Props) {
  const [activeLevel, setActiveLevel] = useState(1);

  const handlePush = (audioUrl: string, name: string, stemType: StemType) => {
    if (!userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: "", // filled by server from socket state
      name,
      audioUrl,
      stemType,
      creationLevel: activeLevel as 1 | 2 | 3 | 4,
      volume: 1,
      muted: false,
    });
    onClearPreview();
  };

  return (
    <div>
      {/* Level tabs */}
      <div className="flex gap-2 mb-6">
        {levels.map((level) => (
          <button
            key={level.id}
            onClick={() => setActiveLevel(level.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${activeLevel === level.id
                ? "bg-purple-600 text-white"
                : "bg-gray-900 text-gray-400 hover:text-white"}`}
          >
            <span className="block">{level.label}</span>
            <span className="block text-xs opacity-60">{level.description}</span>
          </button>
        ))}
      </div>

      {/* Active creation tool */}
      {activeLevel === 1 && (
        <LoopBrowser
          settings={settings}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
      {activeLevel === 2 && (
        <TextToLoop
          settings={settings}
          roomCode={roomCode}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
      {activeLevel === 3 && (
        <SamplerPads
          settings={settings}
          roomCode={roomCode}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
      {activeLevel === 4 && (
        <SynthPlayer
          settings={settings}
          roomCode={roomCode}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/components/CreationPanel.tsx
git commit -m "feat: tabbed creation panel for 4 creation levels"
```

---

## Task 11: Level 1 — Loop Browser (Dev 4)

**Files:**
- Create: `web/components/LoopBrowser.tsx`
- Create: `web/public/loops/index.json` (loop metadata catalog)

**Step 1: Create loop library index**

The loop library is a collection of pre-tagged audio files. For the hackathon, curate ~30-50 royalty-free loops and drop them in `web/public/loops/` organized by stem type. Create an index file:

```json
// web/public/loops/index.json
[
  {
    "id": "drums-boom-bap-01",
    "filename": "drums/boom-bap-01.wav",
    "name": "Boom Bap Kit",
    "stemType": "drums",
    "bpm": 90,
    "key": "C",
    "scale": "minor",
    "tags": ["boom bap", "hip hop", "chill"]
  },
  {
    "id": "bass-sub-01",
    "filename": "bass/sub-bass-01.wav",
    "name": "Deep Sub Bass",
    "stemType": "bass",
    "bpm": 120,
    "key": "C",
    "scale": "minor",
    "tags": ["sub", "deep", "electronic"]
  }
]
```

(Populate with real loops before the hackathon.)

**Step 2: Write LoopBrowser component**

```typescript
// web/components/LoopBrowser.tsx
"use client";
import { useState, useEffect } from "react";
import { RoomSettings, StemType, LoopMeta } from "../../shared/types";
import { STEM_TYPES, STEM_COLORS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

export default function LoopBrowser({ settings, onPreview, onPush }: Props) {
  const [loops, setLoops] = useState<LoopMeta[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<StemType | "all">("all");
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/loops/index.json")
      .then((res) => res.json())
      .then(setLoops)
      .catch(console.error);
  }, []);

  const filtered = loops.filter((loop) => {
    if (filterType !== "all" && loop.stemType !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        loop.name.toLowerCase().includes(q) ||
        loop.tags.some((t) => t.includes(q)) ||
        loop.stemType.includes(q)
      );
    }
    return true;
  });

  const handlePreview = async (loop: LoopMeta) => {
    setPreviewingId(loop.id);
    await onPreview(`/loops/${loop.filename}`);
  };

  return (
    <div className="space-y-4">
      {/* Search + Filter */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search loops..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as StemType | "all")}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">All types</option>
          {STEM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Loop grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((loop) => (
          <div
            key={loop.id}
            className="bg-gray-900 rounded-lg p-4 space-y-2 hover:bg-gray-800 transition"
            style={{ borderLeft: `3px solid ${STEM_COLORS[loop.stemType]}` }}
          >
            <div>
              <p className="font-medium text-sm">{loop.name}</p>
              <p className="text-xs text-gray-500">
                {loop.stemType} · {loop.bpm} BPM · {loop.key} {loop.scale}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePreview(loop)}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition
                  ${previewingId === loop.id
                    ? "bg-yellow-600"
                    : "bg-gray-700 hover:bg-gray-600"}`}
              >
                {previewingId === loop.id ? "Previewing" : "Preview"}
              </button>
              <button
                onClick={() => onPush(`/loops/${loop.filename}`, loop.name, loop.stemType)}
                className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs font-medium transition"
              >
                Push
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-600 text-center py-8 text-sm">
          No loops found. Try a different search or filter.
        </p>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add web/components/LoopBrowser.tsx web/public/loops/
git commit -m "feat: Level 1 loop browser with search, filter, preview, and push"
```

---

## Task 12: Level 2 — ElevenLabs Text-to-Loop (Dev 4)

**Files:**
- Create: `web/lib/elevenlabs.ts`
- Create: `web/app/api/generate-loop/route.ts`
- Create: `web/components/TextToLoop.tsx`

**Step 1: Write ElevenLabs prompt builder**

```typescript
// web/lib/elevenlabs.ts
import { RoomSettings, StemType } from "../../shared/types";

export function buildLoopPrompt(
  userQuery: string,
  settings: RoomSettings,
  stemType: StemType
): string {
  const durationSeconds = (settings.barCount * 4 * 60) / settings.bpm;

  return [
    `Create a ${stemType} loop.`,
    `Musical style/description: ${userQuery}.`,
    `Key: ${settings.key} ${settings.scale}.`,
    `Tempo: ${settings.bpm} BPM.`,
    `Duration: exactly ${durationSeconds.toFixed(1)} seconds (${settings.barCount} bars of 4/4).`,
    `The loop must seamlessly repeat. No fade out.`,
    stemType === "drums" ? "Purely percussive, no melodic content." : "",
    stemType === "bass" ? "Low frequency bass line only." : "",
    stemType === "vocals" ? "Vocal chop or vocal hook only." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSamplePrompt(
  userQuery: string,
  settings: RoomSettings
): string {
  return [
    `Create a single-shot musical sample/sound.`,
    `Description: ${userQuery}.`,
    `Key: ${settings.key} ${settings.scale}.`,
    `Duration: 1-3 seconds. Clean, no reverb tail.`,
    `This will be used as a one-shot sample to play on pads.`,
  ].join(" ");
}
```

**Step 2: Write generate-loop API route**

```typescript
// web/app/api/generate-loop/route.ts
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { buildLoopPrompt } from "@/lib/elevenlabs";
import { RoomSettings, StemType } from "../../../shared/types";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { query, settings, stemType, roomCode } = (await req.json()) as {
    query: string;
    settings: RoomSettings;
    stemType: StemType;
    roomCode: string;
  };

  const prompt = buildLoopPrompt(query, settings, stemType);

  // Call ElevenLabs Sound Generation API
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: (settings.barCount * 4 * 60) / settings.bpm,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: "ElevenLabs generation failed", details: errorText },
      { status: 500 }
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const key = `rooms/${roomCode}/generated/${uuid()}.mp3`;
  const url = await uploadToR2(key, audioBuffer, "audio/mpeg");

  return NextResponse.json({ url, prompt });
}
```

**Step 3: Write TextToLoop component**

```typescript
// web/components/TextToLoop.tsx
"use client";
import { useState } from "react";
import { RoomSettings, StemType } from "../../shared/types";
import { STEM_TYPES, STEM_COLORS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

export default function TextToLoop({ settings, roomCode, onPreview, onPush }: Props) {
  const [query, setQuery] = useState("");
  const [stemType, setStemType] = useState<StemType>("drums");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!query.trim()) return;
    setIsGenerating(true);
    setError("");
    setGeneratedUrl(null);

    try {
      const res = await fetch("/api/generate-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, settings, stemType, roomCode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { url } = await res.json();
      setGeneratedUrl(url);
      await onPreview(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Describe a loop and AI will generate it in{" "}
        <span className="text-white font-mono">{settings.key} {settings.scale}</span> at{" "}
        <span className="text-white font-mono">{settings.bpm} BPM</span>.
      </p>

      {/* Stem type selector */}
      <div className="flex gap-2 flex-wrap">
        {STEM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setStemType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
              ${stemType === t ? "text-white" : "bg-gray-900 text-gray-400"}`}
            style={stemType === t ? { backgroundColor: STEM_COLORS[t] } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Query input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={`Describe your ${stemType} loop... (e.g., "funky boom bap with hi-hat rolls")`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !query.trim()}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
                     disabled:text-gray-500 rounded-lg font-semibold transition"
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Generated result */}
      {generatedUrl && (
        <div className="bg-gray-900 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-400">Generated loop ready:</p>
          <div className="flex gap-2">
            <button
              onClick={() => onPreview(generatedUrl)}
              className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition"
            >
              Preview Again
            </button>
            <button
              onClick={() => handleGenerate()}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition"
            >
              Regenerate
            </button>
            <button
              onClick={() => onPush(generatedUrl, query.slice(0, 30), stemType)}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition"
            >
              Push to Master
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add web/lib/elevenlabs.ts web/app/api/generate-loop/ web/components/TextToLoop.tsx
git commit -m "feat: Level 2 text-to-loop with ElevenLabs generation and prompt builder"
```

---

## Task 13: Level 3 — Sampler Pads (Dev 4)

**Files:**
- Create: `web/app/api/generate-sample/route.ts`
- Create: `web/components/SamplerPads.tsx`

**Step 1: Write generate-sample API route**

```typescript
// web/app/api/generate-sample/route.ts
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { buildSamplePrompt } from "@/lib/elevenlabs";
import { RoomSettings } from "../../../shared/types";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { query, settings, roomCode } = (await req.json()) as {
    query: string;
    settings: RoomSettings;
    roomCode: string;
  };

  const prompt = buildSamplePrompt(query, settings);

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: 2,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const key = `rooms/${roomCode}/samples/${uuid()}.mp3`;
  const url = await uploadToR2(key, audioBuffer, "audio/mpeg");

  return NextResponse.json({ url });
}
```

**Step 2: Write SamplerPads component**

This is the most complex UI component. Users generate a sample, it loads onto pads, they tap pads to build a pattern on a step sequencer grid, then record the pattern as a loop.

```typescript
// web/components/SamplerPads.tsx
"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "../../shared/types";
import { STEM_TYPES, STEM_COLORS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

const STEPS = 16; // 16th-note grid
const PAD_COUNT = 4;

export default function SamplerPads({ settings, roomCode, onPreview, onPush }: Props) {
  const [sampleQuery, setSampleQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [samples, setSamples] = useState<(string | null)[]>(Array(PAD_COUNT).fill(null));
  const [activePad, setActivePad] = useState(0);
  const [grid, setGrid] = useState<boolean[][]>(
    Array(PAD_COUNT).fill(null).map(() => Array(STEPS).fill(false))
  );
  const [stemType, setStemType] = useState<StemType>("drums");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const playersRef = useRef<(Tone.Player | null)[]>(Array(PAD_COUNT).fill(null));
  const sequenceRef = useRef<Tone.Sequence | null>(null);
  const recorderRef = useRef<Tone.Recorder | null>(null);

  const generateSample = async (padIndex: number) => {
    if (!sampleQuery.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sampleQuery, settings, roomCode }),
      });
      const { url } = await res.json();

      const newSamples = [...samples];
      newSamples[padIndex] = url;
      setSamples(newSamples);

      // Load into Tone.Player
      if (playersRef.current[padIndex]) {
        playersRef.current[padIndex]!.dispose();
      }
      playersRef.current[padIndex] = new Tone.Player(url).toDestination();
      await Tone.loaded();
    } catch (err) {
      console.error("Sample generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleStep = (padIndex: number, stepIndex: number) => {
    const newGrid = grid.map((row) => [...row]);
    newGrid[padIndex][stepIndex] = !newGrid[padIndex][stepIndex];
    setGrid(newGrid);
  };

  const triggerPad = (padIndex: number) => {
    const player = playersRef.current[padIndex];
    if (player && player.loaded) {
      player.start();
    }
  };

  const playSequence = useCallback(() => {
    // Stop existing
    if (sequenceRef.current) {
      sequenceRef.current.dispose();
    }

    const stepsPerBar = 16; // 16th notes
    const totalSteps = (settings.barCount / 4) * stepsPerBar * 4;

    sequenceRef.current = new Tone.Sequence(
      (time, step) => {
        for (let pad = 0; pad < PAD_COUNT; pad++) {
          const gridStep = step % STEPS;
          if (grid[pad][gridStep] && playersRef.current[pad]?.loaded) {
            playersRef.current[pad]!.start(time);
          }
        }
      },
      Array.from({ length: totalSteps }, (_, i) => i),
      "16n"
    );

    sequenceRef.current.start(0);
  }, [grid, settings.barCount]);

  const startRecording = async () => {
    const recorder = new Tone.Recorder();
    recorderRef.current = recorder;

    // Connect all players to recorder
    playersRef.current.forEach((player) => {
      if (player) player.connect(recorder);
    });

    recorder.start();
    playSequence();
    Tone.getTransport().start();
    setIsRecording(true);

    // Stop after one full loop
    const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;
    setTimeout(async () => {
      Tone.getTransport().stop();
      const recording = await recorder.stop();
      const blob = new Blob([recording], { type: "audio/webm" });

      // Upload to R2
      const formData = new FormData();
      formData.append("file", blob, "sampler-recording.webm");
      formData.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();
      setRecordedUrl(url);
      setIsRecording(false);
    }, loopDuration * 1000 + 200);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      sequenceRef.current?.dispose();
      recorderRef.current?.dispose();
      playersRef.current.forEach((p) => p?.dispose());
    };
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        Generate samples, load them onto pads, and build a pattern.
      </p>

      {/* Sample generation */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Describe a sample... (e.g., 'deep 808 kick')"
          value={sampleQuery}
          onChange={(e) => setSampleQuery(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={() => generateSample(activePad)}
          disabled={isGenerating}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
                     rounded-lg text-sm font-medium transition"
        >
          {isGenerating ? "Loading..." : `Load Pad ${activePad + 1}`}
        </button>
      </div>

      {/* Pads */}
      <div className="flex gap-3">
        {Array.from({ length: PAD_COUNT }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setActivePad(i);
              triggerPad(i);
            }}
            className={`w-20 h-20 rounded-xl font-bold text-lg transition
              ${activePad === i ? "ring-2 ring-purple-400" : ""}
              ${samples[i] ? "bg-purple-700 hover:bg-purple-600" : "bg-gray-800 text-gray-600"}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Step sequencer grid */}
      <div className="space-y-1">
        {Array.from({ length: PAD_COUNT }).map((_, padIndex) => (
          <div key={padIndex} className="flex gap-1 items-center">
            <span className="w-8 text-xs text-gray-500 text-right">{padIndex + 1}</span>
            {Array.from({ length: STEPS }).map((_, stepIndex) => (
              <button
                key={stepIndex}
                onClick={() => toggleStep(padIndex, stepIndex)}
                disabled={!samples[padIndex]}
                className={`w-8 h-8 rounded transition text-xs
                  ${stepIndex % 4 === 0 ? "ml-1" : ""}
                  ${grid[padIndex][stepIndex]
                    ? "bg-purple-500"
                    : samples[padIndex]
                      ? "bg-gray-800 hover:bg-gray-700"
                      : "bg-gray-900 text-gray-700"
                  }`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Stem type + record */}
      <div className="flex gap-3 items-center">
        <select
          value={stemType}
          onChange={(e) => setStemType(e.target.value as StemType)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          {STEM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={startRecording}
          disabled={isRecording || samples.every((s) => !s)}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-700
                     rounded-lg text-sm font-medium transition"
        >
          {isRecording ? "Recording..." : "Record Loop"}
        </button>
      </div>

      {/* Recorded result */}
      {recordedUrl && (
        <div className="bg-gray-900 rounded-lg p-4 flex gap-2">
          <button
            onClick={() => onPreview(recordedUrl)}
            className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium"
          >
            Preview
          </button>
          <button
            onClick={() => onPush(recordedUrl, `Sampler pattern`, stemType)}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
          >
            Push to Master
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add web/app/api/generate-sample/ web/components/SamplerPads.tsx
git commit -m "feat: Level 3 sampler with AI sample generation, pads, and step sequencer"
```

---

## Task 14: Level 4 — Synth Player (Dev 4)

**Files:**
- Create: `web/components/SynthPlayer.tsx`

**Step 1: Write SynthPlayer component**

Uses Tone.js built-in synths. User selects synth type, plays via on-screen keyboard or computer keyboard, records a loop.

```typescript
// web/components/SynthPlayer.tsx
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "../../shared/types";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

type SynthType = "synth" | "fm" | "am" | "pluck";

const SYNTH_TYPES: { value: SynthType; label: string }[] = [
  { value: "synth", label: "Classic" },
  { value: "fm", label: "FM" },
  { value: "am", label: "AM" },
  { value: "pluck", label: "Pluck" },
];

// Map computer keys to notes (2 octaves)
const KEY_NOTE_MAP: Record<string, string> = {
  a: "C4", w: "C#4", s: "D4", e: "D#4", d: "E4", f: "F4",
  t: "F#4", g: "G4", y: "G#4", h: "A4", u: "A#4", j: "B4",
  k: "C5", o: "C#5", l: "D5", p: "D#5",
};

const PIANO_KEYS = [
  { note: "C4", black: false }, { note: "C#4", black: true },
  { note: "D4", black: false }, { note: "D#4", black: true },
  { note: "E4", black: false }, { note: "F4", black: false },
  { note: "F#4", black: true }, { note: "G4", black: false },
  { note: "G#4", black: true }, { note: "A4", black: false },
  { note: "A#4", black: true }, { note: "B4", black: false },
  { note: "C5", black: false }, { note: "C#5", black: true },
  { note: "D5", black: false }, { note: "D#5", black: true },
  { note: "E5", black: false },
];

export default function SynthPlayer({ settings, roomCode, onPreview, onPush }: Props) {
  const [synthType, setSynthType] = useState<SynthType>("synth");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const recorderRef = useRef<Tone.Recorder | null>(null);

  // Create synth
  useEffect(() => {
    if (synthRef.current) synthRef.current.dispose();

    const synthOptions: Record<SynthType, () => Tone.PolySynth> = {
      synth: () => new Tone.PolySynth(Tone.Synth),
      fm: () => new Tone.PolySynth(Tone.FMSynth),
      am: () => new Tone.PolySynth(Tone.AMSynth),
      pluck: () => new Tone.PolySynth(Tone.PluckSynth as any),
    };

    synthRef.current = synthOptions[synthType]().toDestination();
    return () => { synthRef.current?.dispose(); };
  }, [synthType]);

  const noteOn = useCallback((note: string) => {
    synthRef.current?.triggerAttack(note);
    setActiveNotes((prev) => new Set(prev).add(note));
  }, []);

  const noteOff = useCallback((note: string) => {
    synthRef.current?.triggerRelease(note);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  }, []);

  // Computer keyboard handler
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const note = KEY_NOTE_MAP[e.key.toLowerCase()];
      if (note) noteOn(note);
    };
    const up = (e: KeyboardEvent) => {
      const note = KEY_NOTE_MAP[e.key.toLowerCase()];
      if (note) noteOff(note);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [noteOn, noteOff]);

  const startRecording = async () => {
    await Tone.start();
    const recorder = new Tone.Recorder();
    recorderRef.current = recorder;
    synthRef.current?.connect(recorder);
    recorder.start();
    setIsRecording(true);
    setRecordedUrl(null);

    // Auto-stop after one loop duration
    const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;
    setTimeout(async () => {
      const recording = await recorder.stop();
      const blob = new Blob([recording], { type: "audio/webm" });

      const formData = new FormData();
      formData.append("file", blob, "synth-recording.webm");
      formData.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();
      setRecordedUrl(url);
      setIsRecording(false);
    }, loopDuration * 1000);
  };

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        Play synths with your keyboard (A-L keys = notes) or click the piano.
        Record a {settings.barCount}-bar loop.
      </p>

      {/* Synth type selector */}
      <div className="flex gap-2">
        {SYNTH_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSynthType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${synthType === t.value ? "bg-purple-600" : "bg-gray-900 text-gray-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Piano keyboard */}
      <div className="flex relative h-32 select-none">
        {PIANO_KEYS.filter((k) => !k.black).map((key) => (
          <button
            key={key.note}
            onMouseDown={() => noteOn(key.note)}
            onMouseUp={() => noteOff(key.note)}
            onMouseLeave={() => noteOff(key.note)}
            className={`flex-1 border border-gray-700 rounded-b-lg flex items-end justify-center pb-2 text-xs transition
              ${activeNotes.has(key.note)
                ? "bg-purple-400 text-black"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {key.note.replace("4", "").replace("5", "")}
          </button>
        ))}
        {/* Black keys positioned absolutely */}
        {PIANO_KEYS.filter((k) => k.black).map((key, i) => {
          const whiteIndex = PIANO_KEYS.filter((k) => !k.black).findIndex(
            (wk) => wk.note === key.note.replace("#", "")
          );
          // Position black keys between their white keys
          const leftPercent = ((whiteIndex + 0.65) / PIANO_KEYS.filter((k) => !k.black).length) * 100;
          return (
            <button
              key={key.note}
              onMouseDown={() => noteOn(key.note)}
              onMouseUp={() => noteOff(key.note)}
              onMouseLeave={() => noteOff(key.note)}
              className={`absolute top-0 w-[6%] h-20 rounded-b-md z-10 text-xs transition
                ${activeNotes.has(key.note)
                  ? "bg-purple-600 text-white"
                  : "bg-gray-900 text-gray-400 hover:bg-gray-800"}`}
              style={{ left: `${leftPercent}%` }}
            />
          );
        })}
      </div>

      {/* Record button */}
      <div className="flex gap-3 items-center">
        <button
          onClick={startRecording}
          disabled={isRecording}
          className={`px-6 py-3 rounded-lg font-semibold transition
            ${isRecording
              ? "bg-red-700 animate-pulse"
              : "bg-red-600 hover:bg-red-500"}`}
        >
          {isRecording ? `Recording (${settings.barCount} bars)...` : "Record Loop"}
        </button>
        {isRecording && (
          <span className="text-red-400 text-sm">Play your part now!</span>
        )}
      </div>

      {/* Recorded result */}
      {recordedUrl && (
        <div className="bg-gray-900 rounded-lg p-4 flex gap-2">
          <button
            onClick={() => onPreview(recordedUrl)}
            className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium"
          >
            Preview
          </button>
          <button
            onClick={() => startRecording()}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium"
          >
            Re-record
          </button>
          <button
            onClick={() => onPush(recordedUrl, `Synth (${synthType})`, "melody")}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
          >
            Push to Master
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/components/SynthPlayer.tsx
git commit -m "feat: Level 4 synth player with keyboard input and loop recording"
```

---

## Task 15: Environment & Deployment Config

**Files:**
- Create: `web/.env.example`
- Modify: `web/next.config.js`
- Create: `server/Dockerfile` (for Railway)

**Step 1: Create .env.example**

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=composed-loops
R2_PUBLIC_URL=
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
ELEVENLABS_API_KEY=
```

**Step 2: Create Railway Dockerfile for server**

```dockerfile
# server/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
COPY shared/ ./shared/
WORKDIR /app/server
RUN npm install
COPY server/ .
RUN npx tsc
EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/index.js"]
```

**Step 3: Commit**

```bash
git add web/.env.example server/Dockerfile
git commit -m "chore: env example and Railway Dockerfile for deployment"
```

---

## Task 16: Integration Testing & Polish

**Files:** All components

**Step 1:** Start both servers locally:
```bash
# Terminal 1
cd server && npm run dev
# Terminal 2
cd web && npm run dev
```

**Step 2:** Test the full flow:
1. Open `localhost:3000` → create a room
2. Open a second tab → join with the room code
3. Browse loop library → preview → push to master
4. Verify both tabs hear the pushed track
5. Test text-to-loop generation
6. Test sampler pads
7. Test synth recording
8. Test vote-to-remove
9. Test BPM/key/bar count changes sync across tabs
10. Test listen mode toggles (solo/master/overlay)

**Step 3:** Fix any issues found in integration testing.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: integration testing fixes"
```

---

## Task 17: Deploy

**Step 1: Deploy Socket.io server to Railway**

```bash
# Install Railway CLI if needed
npm install -g @railway/cli
railway login
railway init
railway up
```

Set environment variable `CLIENT_URL` to your Vercel URL.

**Step 2: Deploy Next.js to Vercel**

```bash
cd web
npx vercel
```

Set all environment variables from `.env.example` in Vercel dashboard.
Set `NEXT_PUBLIC_SOCKET_URL` to your Railway server URL.

**Step 3: Configure Cloudflare R2**

1. Create bucket `composed-loops` in Cloudflare dashboard
2. Enable public access on the bucket
3. Create API token with R2 read/write permissions
4. Add credentials to both Vercel and Railway env vars

**Step 4: Verify production deployment end-to-end**

---

## Parallelization Guide for 4 Devs

```
Task 1 (All together — 30 min)
    │
    ├── Dev 1: Tasks 2, 3, 4         (server + R2 + socket hooks)
    ├── Dev 2: Tasks 5, 6            (audio engine + constants)
    ├── Dev 3: Tasks 7, 8, 9         (UI: landing, session, tracks)
    └── Dev 4: Tasks 10, 11, 12, 13, 14  (creation panel + all 4 levels)
    │
    ▼
Task 15 (any dev — config/deploy prep)
Task 16 (all devs — integration testing)
Task 17 (any dev — deploy)
```
