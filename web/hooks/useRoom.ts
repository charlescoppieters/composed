"use client";
import { useState, useEffect, useCallback } from "react";
import { Room, RoomSettings, Track, RoomUser } from "@/lib/types";
import { getSocket } from "@/lib/socket";

export function useRoom() {
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [trackQueue, setTrackQueue] = useState<Track[]>([]);
  const socket = getSocket();

  useEffect(() => {
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

    socket.on("queue:updated", (queue: Track[]) => {
      setTrackQueue(queue);
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
      socket.off("queue:updated");
      socket.off("track:vote-updated");
    };
  }, [socket]);

  const createRoom = useCallback(
    (userName: string, settings: RoomSettings) => {
      if (!socket.connected) socket.connect();
      socket.emit("room:create", userName, settings, (newRoom) => {
        setRoom(newRoom);
        setUserId(newRoom.users[0].id);
      });
    },
    [socket]
  );

  const joinRoom = useCallback(
    (code: string, userName: string): Promise<boolean> => {
      if (!socket.connected) socket.connect();
      return new Promise((resolve) => {
        socket.emit("room:join", code, userName, (joinedRoom) => {
          if (joinedRoom) {
            setRoom(joinedRoom);
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
    trackQueue,
    createRoom,
    joinRoom,
    updateSettings,
    pushTrack,
    voteRemove,
    unvoteRemove,
  };
}
