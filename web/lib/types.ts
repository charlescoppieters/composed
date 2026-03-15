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
  removeVotes: string[];  // legacy
  downVotes: string[];    // userIds who voted to remove
  upVotes: string[];      // userIds who voted to keep
  active: boolean;        // whether track is active in mix
  pushedAt: number;       // timestamp
}

export interface Room {
  code: string;
  settings: RoomSettings;
  tracks: Track[];
  trackQueue: Track[];
  users: RoomUser[];
  createdAt: number;
  clockStartTime: number;  // shared epoch for transport sync
}

export type InstrumentMode = "generate" | "sequence" | "live";

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
  "track:updated": (track: Track) => void;
  "track:vote-updated": (trackId: string, votes: string[]) => void;
  "queue:updated": (queue: Track[]) => void;
  "transport:sync": (position: number) => void;
}

export interface ClientToServerEvents {
  "room:create": (userName: string, settings: RoomSettings, cb: (room: Room) => void) => void;
  "room:join": (code: string, userName: string, cb: (room: Room | null) => void) => void;
  "room:update-settings": (settings: Partial<RoomSettings>) => void;
  "track:push": (track: Omit<Track, "removeVotes" | "downVotes" | "upVotes" | "active" | "pushedAt">) => void;
  "track:vote-down": (trackId: string) => void;
  "track:vote-up": (trackId: string) => void;
  "track:dequeue": (trackId: string, cb: (track: Track | null) => void) => void;
  "clock:ping": (clientTime: number, cb: (serverTime: number) => void) => void;
}
