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
