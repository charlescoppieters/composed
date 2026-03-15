"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { SoloRequest, Room } from "@/lib/types";

export function useSolo(room: Room | null, userId: string | null) {
  const [solo, setSolo] = useState<SoloRequest | null>(room?.solo ?? null);
  const soloRef = useRef(solo);
  soloRef.current = solo;

  useEffect(() => {
    const socket = getSocket();

    const onRequested = (s: SoloRequest) => setSolo(s);
    const onUpdated = (s: SoloRequest) => setSolo(s);
    const onStarted = (s: SoloRequest) => setSolo(s);
    const onEnding = (s: SoloRequest) => setSolo(s);
    const onEnded = () => setSolo(null);

    socket.on("solo:requested", onRequested);
    socket.on("solo:updated", onUpdated);
    socket.on("solo:started", onStarted);
    socket.on("solo:ending", onEnding);
    socket.on("solo:ended", onEnded);

    return () => {
      socket.off("solo:requested", onRequested);
      socket.off("solo:updated", onUpdated);
      socket.off("solo:started", onStarted);
      socket.off("solo:ending", onEnding);
      socket.off("solo:ended", onEnded);
    };
  }, []);

  // Sync from room state for late joiners
  useEffect(() => {
    if (room?.solo && !soloRef.current) {
      setSolo(room.solo);
    }
  }, [room?.solo]);

  const isSoloist = solo?.soloist === userId;
  const isPending = solo?.status === "pending";
  const isActive = solo?.status === "active";
  const isEnding = solo?.status === "ending";

  const requestSolo = useCallback(() => {
    getSocket().emit("solo:request");
  }, []);

  const acceptSolo = useCallback(() => {
    getSocket().emit("solo:accept");
  }, []);

  const denySolo = useCallback(() => {
    getSocket().emit("solo:deny");
  }, []);

  const sendApplause = useCallback(() => {
    getSocket().emit("solo:applause");
  }, []);

  const sendX = useCallback(() => {
    getSocket().emit("solo:x-vote");
  }, []);

  return {
    solo,
    isSoloist,
    isPending,
    isActive,
    isEnding,
    requestSolo,
    acceptSolo,
    denySolo,
    sendApplause,
    sendX,
  };
}
