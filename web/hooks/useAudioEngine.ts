"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { getAudioEngine, ListenMode } from "@/lib/audio-engine";
import { Track, RoomSettings, Room } from "@/lib/types";
import { getSocket } from "@/lib/socket";

async function calibrateClock(rounds = 10): Promise<number> {
  const socket = getSocket();
  const samples: { offset: number; rtt: number }[] = [];

  for (let i = 0; i < rounds; i++) {
    const sample = await new Promise<{ offset: number; rtt: number }>((resolve) => {
      // Use Date.now() for the ping since the server uses Date.now()
      const clientTime = Date.now();
      socket.emit("clock:ping", clientTime, (serverTime: number) => {
        const rtt = Date.now() - clientTime;
        // offset = how far server clock is ahead of client clock
        // serverTime = clientTime + offset  =>  offset = serverTime - clientTime - rtt/2
        resolve({ offset: serverTime - clientTime - rtt / 2, rtt });
      });
    });
    samples.push(sample);
    // Small delay between pings to avoid burst congestion
    await new Promise((r) => setTimeout(r, 20));
  }

  // Sort by RTT — lowest RTT = most symmetric = most accurate
  samples.sort((a, b) => a.rtt - b.rtt);
  // Take the best 40% (most accurate samples)
  const bestCount = Math.max(3, Math.ceil(samples.length * 0.4));
  const best = samples.slice(0, bestCount);
  return best.reduce((sum, s) => sum + s.offset, 0) / best.length;
}

export function useAudioEngine(room: Room | null, tracks: Track[]) {
  const engineRef = useRef(getAudioEngine());
  const [listenMode, setListenModeState] = useState<ListenMode>("overlay");
  const prevTrackIdsRef = useRef<Set<string>>(new Set());
  const clockOffsetRef = useRef(0);
  const calibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncedRef = useRef(false);

  // Clock calibration and sync on room join
  useEffect(() => {
    if (!room || syncedRef.current) return;
    syncedRef.current = true;

    const engine = engineRef.current;

    (async () => {
      await engine.init();
      const offset = await calibrateClock(10);
      clockOffsetRef.current = offset;
      engine.syncToClock(room.clockStartTime, offset, room.settings.bpm, room.settings.barCount);

      // Recalibrate every 30s
      calibrationIntervalRef.current = setInterval(async () => {
        const newOffset = await calibrateClock(3);
        clockOffsetRef.current = newOffset;
        engine.recalibrate(newOffset, room.settings.bpm, room.settings.barCount);
      }, 30000);
    })();

    return () => {
      if (calibrationIntervalRef.current) {
        clearInterval(calibrationIntervalRef.current);
      }
    };
  }, [room]);

  // Sync settings changes (BPM, barCount)
  useEffect(() => {
    if (!room || !syncedRef.current) return;
    const engine = engineRef.current;
    engine.syncToClock(room.clockStartTime, clockOffsetRef.current, room.settings.bpm, room.settings.barCount);
  }, [room?.settings.bpm, room?.settings.barCount]);

  // Track management
  useEffect(() => {
    const engine = engineRef.current;
    const currentIds = new Set(tracks.map((t) => t.id));
    const prevIds = prevTrackIdsRef.current;

    for (const track of tracks) {
      if (!prevIds.has(track.id)) {
        engine.addMasterTrack(track.id, track.audioUrl, track.volume);
      }
    }

    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        engine.removeMasterTrack(id);
      }
    }

    prevTrackIdsRef.current = currentIds;
  }, [tracks]);

  const setListenMode = useCallback((mode: ListenMode) => {
    engineRef.current.setListenMode(mode);
    setListenModeState(mode);
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback(async () => {
    await engineRef.current.init();
    engineRef.current.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    engineRef.current.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    engineRef.current.stop();
    setIsPlaying(false);
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

  useEffect(() => {
    return () => {
      engineRef.current.dispose();
    };
  }, []);

  const getLocalDestination = useCallback(() => {
    return engineRef.current.getLocalDestination();
  }, []);

  const getTimeUntilNextBoundaryMs = useCallback(() => {
    return engineRef.current.getTimeUntilNextBoundaryMs();
  }, []);

  return {
    isPlaying,
    listenMode,
    setListenMode,
    play,
    pause,
    stop,
    previewLocal,
    clearLocal,
    setTrackVolume,
    getLocalDestination,
    getTimeUntilNextBoundaryMs,
  };
}
