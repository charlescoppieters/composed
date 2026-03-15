import { Server, Socket } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomUser,
  Track,
  SoloRequest,
} from "../../shared/types";
import * as RoomManager from "./room-manager";
import { v4 as uuid } from "uuid";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

const socketRooms = new Map<string, { code: string; userId: string }>();

function scheduleNextDequeue(io: AppServer, code: string): void {
  const boundary = RoomManager.getNextCycleBoundaryMs(code);
  if (boundary === undefined) return;
  const room = RoomManager.getRoom(code);
  if (!room || room.trackQueue.length === 0) {
    RoomManager.clearQueueTimer(code);
    return;
  }
  const delay = Math.max(0, boundary - Date.now());
  const timer = setTimeout(() => {
    const track = RoomManager.dequeueTrack(code);
    if (track) {
      io.to(code).emit("track:pushed", track);
    }
    const updatedRoom = RoomManager.getRoom(code);
    if (updatedRoom) {
      io.to(code).emit("queue:updated", updatedRoom.trackQueue);
    }
    RoomManager.clearQueueTimer(code);
    if (updatedRoom && updatedRoom.trackQueue.length > 0) {
      scheduleNextDequeue(io, code);
    }
  }, delay);
  RoomManager.setQueueTimer(code, timer);
}

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
      socket.to(normalizedCode).emit("room:user-joined", user);
      cb(RoomManager.getRoom(normalizedCode)!);
    });

    socket.on("room:update-settings", (settings) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const updated = RoomManager.updateSettings(meta.code, settings);
      if (updated) {
        io.to(meta.code).emit("room:settings-changed", updated);
        // Reschedule queue timer if BPM or barCount changed
        if (settings.bpm !== undefined || settings.barCount !== undefined) {
          const room = RoomManager.getRoom(meta.code);
          if (room && room.trackQueue.length > 0) {
            RoomManager.clearQueueTimer(meta.code);
            scheduleNextDequeue(io, meta.code);
          }
        }
      }
    });

    socket.on("track:push", (trackData) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const track: Track = {
        ...trackData,
        active: true,
        downVotes: [],
        upVotes: [],
        pushedAt: Date.now(),
      };
      RoomManager.enqueueTrack(meta.code, track);
      const room = RoomManager.getRoom(meta.code);
      if (room) {
        io.to(meta.code).emit("queue:updated", room.trackQueue);
      }
      if (!RoomManager.getQueueTimer(meta.code)) {
        scheduleNextDequeue(io, meta.code);
      }
    });

    socket.on("track:vote-down", (trackId) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const track = RoomManager.voteDownTrack(meta.code, trackId, meta.userId);
      if (track) io.to(meta.code).emit("track:updated", track);
    });

    socket.on("track:vote-up", (trackId) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const track = RoomManager.voteUpTrack(meta.code, trackId, meta.userId);
      if (track) io.to(meta.code).emit("track:updated", track);
    });

    socket.on("track:dequeue", (trackId, cb) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) { cb(null); return; }
      const track = RoomManager.dequeueTrackByUser(meta.code, trackId, meta.userId);
      if (track) {
        const room = RoomManager.getRoom(meta.code);
        if (room) io.to(meta.code).emit("queue:updated", room.trackQueue);
      }
      cb(track);
    });

    socket.on("clock:ping", (_clientTime, cb) => {
      cb(Date.now());
    });

    // ─── Solo handlers ───

    socket.on("solo:request", () => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const room = RoomManager.getRoom(meta.code);
      if (!room) return;
      const user = room.users.find((u) => u.id === meta.userId);
      if (!user) return;
      const solo = RoomManager.requestSolo(meta.code, meta.userId, user.name);
      if (!solo) return;

      if (room.users.length <= 1) {
        // Auto-start for solo user
        const boundary = RoomManager.getNextBarBoundaryMs(meta.code);
        const delay = Math.max(0, (boundary ?? 0) - Date.now());
        setTimeout(() => {
          const started = RoomManager.startSolo(meta.code);
          if (started) io.to(meta.code).emit("solo:started", started);
        }, delay);
      }
      io.to(meta.code).emit("solo:requested", solo);
    });

    socket.on("solo:accept", () => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const result = RoomManager.acceptSolo(meta.code, meta.userId);
      if (!result) return;
      io.to(meta.code).emit("solo:updated", result.solo);
      if (result.allAccepted) {
        const boundary = RoomManager.getNextBarBoundaryMs(meta.code);
        const delay = Math.max(0, (boundary ?? 0) - Date.now());
        setTimeout(() => {
          const started = RoomManager.startSolo(meta.code);
          if (started) io.to(meta.code).emit("solo:started", started);
        }, delay);
      }
    });

    socket.on("solo:deny", () => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      RoomManager.denySolo(meta.code);
      io.to(meta.code).emit("solo:ended");
    });

    socket.on("solo:applause", () => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const solo = RoomManager.soloApplause(meta.code, meta.userId);
      if (solo) io.to(meta.code).emit("solo:updated", solo);
    });

    socket.on("solo:x-vote", () => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      const result = RoomManager.soloXVote(meta.code, meta.userId);
      if (!result) return;
      if (result.allXd) {
        const room = RoomManager.getRoom(meta.code);
        if (room && room.solo) room.solo.status = "ending";
        io.to(meta.code).emit("solo:ending", result.solo);
        const boundary = RoomManager.getNextBarBoundaryMs(meta.code);
        const delay = Math.max(0, (boundary ?? 0) - Date.now());
        setTimeout(() => {
          RoomManager.endSolo(meta.code);
          io.to(meta.code).emit("solo:ended");
        }, delay);
      } else {
        io.to(meta.code).emit("solo:updated", result.solo);
      }
    });

    socket.on("solo:note-on", (note) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      socket.to(meta.code).emit("solo:remote-note-on", note);
    });

    socket.on("solo:note-off", (note) => {
      const meta = socketRooms.get(socket.id);
      if (!meta) return;
      socket.to(meta.code).emit("solo:remote-note-off", note);
    });

    socket.on("disconnect", () => {
      const meta = socketRooms.get(socket.id);
      if (meta) {
        // If soloist disconnects, end solo immediately
        const room = RoomManager.getRoom(meta.code);
        if (room?.solo) {
          if (room.solo.soloist === meta.userId) {
            RoomManager.endSolo(meta.code);
            socket.to(meta.code).emit("solo:ended");
          } else if (room.solo.status === "pending") {
            // Re-check acceptance threshold when a voter leaves
            const othersCount = room.users.filter(
              (u) => u.id !== room.solo!.soloist && u.id !== meta.userId
            ).length;
            if (othersCount > 0 && room.solo.accepts.filter((id) => id !== meta.userId).length >= othersCount) {
              const boundary = RoomManager.getNextBarBoundaryMs(meta.code);
              const delay = Math.max(0, (boundary ?? 0) - Date.now());
              setTimeout(() => {
                const started = RoomManager.startSolo(meta.code);
                if (started) io.to(meta.code).emit("solo:started", started);
              }, delay);
            }
          }
        }
        RoomManager.removeUser(meta.code, meta.userId);
        socket.to(meta.code).emit("room:user-left", meta.userId);
        socketRooms.delete(socket.id);
      }
      console.log(`Disconnected: ${socket.id}`);
    });
  });
}
