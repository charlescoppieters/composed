"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import MasterControls from "./MasterControls";
import TrackList from "./TrackList";
import ListenModeToggle from "./ListenModeToggle";
import CreationPanel from "./CreationPanel";

export default function JamSession({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const { room, userId, createRoom, joinRoom, updateSettings, pushTrack, voteRemove, unvoteRemove } = useRoom();
  const joinedRef = useRef(false);

  useEffect(() => {
    if (joinedRef.current || room) return;
    joinedRef.current = true;
    const userName = sessionStorage.getItem("composed-username") || "Anonymous";
    const action = sessionStorage.getItem("composed-action") || "join";

    if (roomCode === "NEW" && action === "create") {
      const settingsStr = sessionStorage.getItem("composed-settings");
      const settings = settingsStr ? JSON.parse(settingsStr) : DEFAULT_SETTINGS;
      createRoom(userName, settings);
    } else {
      joinRoom(roomCode, userName);
    }
  }, [roomCode, room, joinRoom, createRoom]);

  // When room is created, redirect from /room/NEW to the real code
  useEffect(() => {
    if (room && roomCode === "NEW") {
      router.replace(`/room/${room.code}`);
    }
  }, [room, roomCode, router]);
  const {
    isPlaying,
    listenMode,
    startTransport,
    stopTransport,
    setListenMode,
    previewLocal,
    clearLocal,
    setTrackVolume,
  } = useAudioEngine(room?.settings ?? null, room?.tracks ?? []);

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Connecting to room {roomCode}...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Composed</h1>
          <p className="text-gray-400 text-sm">
            Room: <span className="font-mono text-white">{room.code}</span>
            {" · "}
            {room.users.length} online
          </p>
        </div>
        <MasterControls
          settings={room.settings}
          isPlaying={isPlaying}
          onStart={startTransport}
          onStop={stopTransport}
          onUpdateSettings={updateSettings}
        />
      </header>

      <div className="flex-1 flex">
        <div className="w-80 border-r border-gray-800 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Master Tracks</h2>
            <span className="text-gray-500 text-sm">{room.tracks.length} stems</span>
          </div>
          <TrackList
            tracks={room.tracks}
            userId={userId}
            onVoteRemove={voteRemove}
            onUnvoteRemove={unvoteRemove}
            onVolumeChange={setTrackVolume}
            totalUsers={room.users.length}
          />
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <ListenModeToggle mode={listenMode} onChange={setListenMode} />
          </div>
          <CreationPanel
            settings={room.settings}
            userId={userId}
            roomCode={room.code}
            onPreview={previewLocal}
            onClearPreview={clearLocal}
            onPush={pushTrack}
          />
        </div>
      </div>
    </div>
  );
}
