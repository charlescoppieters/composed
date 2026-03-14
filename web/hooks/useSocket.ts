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
