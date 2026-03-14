"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { getAudioEngine, ListenMode } from "@/lib/audio-engine";
import { Track, RoomSettings } from "../../shared/types";

export function useAudioEngine(settings: RoomSettings | null, tracks: Track[]) {
  const engineRef = useRef(getAudioEngine());
  const [isPlaying, setIsPlaying] = useState(false);
  const [listenMode, setListenModeState] = useState<ListenMode>("overlay");
  const prevTrackIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!settings) return;
    const engine = engineRef.current;
    engine.setBpm(settings.bpm);
    engine.setBarCount(settings.barCount);
  }, [settings?.bpm, settings?.barCount]);

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
