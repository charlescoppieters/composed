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
      socket.to(normalizedCode).emit("room:user-joined", user);
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
