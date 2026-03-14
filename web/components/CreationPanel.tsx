"use client";
import { RoomSettings, Track, StemType } from "@/lib/types";
import * as Tone from "tone";
import SamplerPads from "./SamplerPads";

interface Props {
  settings: RoomSettings;
  userId: string | null;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (track: Omit<Track, "removeVotes" | "pushedAt">) => void;
}

export default function CreationPanel({
  settings,
  userId,
  roomCode,
  localDestination,
  onPush,
}: Props) {
  const handlePush = (audioUrl: string, name: string, stemType: StemType) => {
    if (!userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: "",
      name,
      audioUrl,
      stemType,
      creationLevel: 3,
      volume: 1,
      muted: false,
    });
  };

  return (
    <SamplerPads
      settings={settings}
      roomCode={roomCode}
      localDestination={localDestination}
      onPush={handlePush}
    />
  );
}
