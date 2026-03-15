import { Room, RoomSettings, RoomUser, Track } from "../../shared/types";
import { v4 as uuid } from "uuid";

const rooms = new Map<string, Room>();
const queueTimers = new Map<string, ReturnType<typeof setTimeout>>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(settings: RoomSettings): Room {
  const now = Date.now();
  const room: Room = {
    code: generateCode(),
    settings,
    tracks: [],
    trackQueue: [],
    users: [],
    createdAt: now,
    clockStartTime: now,
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
  if (room.users.length === 0) {
    setTimeout(() => {
      const r = rooms.get(code);
      if (r && r.users.length === 0) {
        clearQueueTimer(code);
        rooms.delete(code);
      }
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

export function enqueueTrack(code: string, track: Track): Track | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.trackQueue.push(track);
  return track;
}

export function dequeueTrack(code: string): Track | undefined {
  const room = rooms.get(code);
  if (!room || room.trackQueue.length === 0) return undefined;
  const track = room.trackQueue.shift()!;
  room.tracks.push(track);
  return track;
}

export function dequeueTrackByUser(code: string, trackId: string, userId: string): Track | null {
  const room = rooms.get(code);
  if (!room) return null;
  const idx = room.trackQueue.findIndex((t) => t.id === trackId && t.userId === userId);
  if (idx === -1) return null;
  const [track] = room.trackQueue.splice(idx, 1);
  return track;
}

export function getNextCycleBoundaryMs(code: string): number | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const { bpm, barCount } = room.settings;
  const loopDurationMs = (barCount * 4 * 60 * 1000) / bpm;
  const elapsed = Date.now() - room.clockStartTime;
  return room.clockStartTime + (Math.floor(elapsed / loopDurationMs) + 1) * loopDurationMs;
}

export function getQueueTimer(code: string): ReturnType<typeof setTimeout> | undefined {
  return queueTimers.get(code);
}

export function setQueueTimer(code: string, timer: ReturnType<typeof setTimeout>): void {
  queueTimers.set(code, timer);
}

export function clearQueueTimer(code: string): void {
  const timer = queueTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    queueTimers.delete(code);
  }
}

// Returns updated track, or undefined if track not found
export function voteDownTrack(code: string, trackId: string, userId: string): Track | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const track = room.tracks.find((t) => t.id === trackId);
  if (!track || !track.active) return track; // already off, return as-is
  if (!track.downVotes.includes(userId)) {
    track.downVotes.push(userId);
    track.upVotes = track.upVotes.filter((id) => id !== userId); // clear any up-vote
  }
  if (track.downVotes.length > room.users.length / 2) {
    track.active = false;
    track.downVotes = [];
    track.upVotes = [];
  }
  return track;
}

export function voteUpTrack(code: string, trackId: string, userId: string): Track | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  const track = room.tracks.find((t) => t.id === trackId);
  if (!track || track.active) return track; // already on, return as-is
  if (!track.upVotes.includes(userId)) {
    track.upVotes.push(userId);
    track.downVotes = track.downVotes.filter((id) => id !== userId);
  }
  if (track.upVotes.length > room.users.length / 2) {
    track.active = true;
    track.upVotes = [];
    track.downVotes = [];
  }
  return track;
}
