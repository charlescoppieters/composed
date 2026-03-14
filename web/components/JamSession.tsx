"use client";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/hooks/useRoom";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { ListenMode } from "@/lib/audio-engine";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { STEM_COLORS } from "@/lib/constants";
import { Track } from "@/lib/types";
import TrackList from "./TrackList";
import CreationPanel from "./CreationPanel";

const LISTEN_MODES: { value: ListenMode; label: string }[] = [
  { value: "solo", label: "My Track" },
  { value: "master", label: "Master" },
  { value: "overlay", label: "Both" },
];

export default function JamSession({ roomCode }: { roomCode: string }) {
  const { room, userId, trackQueue, createRoom, joinRoom, updateSettings, pushTrack, voteRemove, unvoteRemove } = useRoom();
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

  // When room is created, update URL from /room/NEW to the real code (without remounting)
  useEffect(() => {
    if (room && roomCode === "NEW") {
      window.history.replaceState(null, "", `/room/${room.code}`);
    }
  }, [room, roomCode]);

  const {
    listenMode,
    setListenMode,
    getLocalDestination,
  } = useAudioEngine(room, room?.tracks ?? []);

  const [localDest, setLocalDest] = useState<any>(null);

  // Get the local destination once audio engine is initialized
  useEffect(() => {
    if (room && !localDest) {
      setLocalDest(getLocalDestination());
    }
  }, [room, localDest, getLocalDestination]);

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
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span className="font-mono text-white">{room.settings.bpm} BPM</span>
          <span>·</span>
          <span>{room.settings.key} {room.settings.scale}</span>
          <span>·</span>
          <span>{room.settings.barCount} bars</span>
        </div>
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
            totalUsers={room.users.length}
          />

          {trackQueue.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-400">Queue</h2>
                <span className="text-gray-600 text-sm">{trackQueue.length} pending</span>
              </div>
              <div className="space-y-2">
                {trackQueue.map((track: Track, i: number) => (
                  <div
                    key={track.id}
                    className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 opacity-60"
                    style={{ borderLeftColor: STEM_COLORS[track.stemType], borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{track.name}</p>
                        <p className="text-xs text-gray-500">
                          {track.userName} · {track.stemType}
                        </p>
                      </div>
                      <span className="text-xs text-gray-600 font-mono">#{i + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {/* Listen mode toggle */}
          <div className="flex items-center gap-1 mb-6">
            <span className="text-gray-400 text-sm mr-2">Listen:</span>
            {LISTEN_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setListenMode(mode.value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition
                  ${listenMode === mode.value
                    ? "bg-purple-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {localDest && (
            <CreationPanel
              settings={room.settings}
              userId={userId}
              roomCode={room.code}
              localDestination={localDest}
              onPush={pushTrack}
            />
          )}
        </div>
      </div>
    </div>
  );
}
