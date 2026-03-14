"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/hooks/useRoom";
import { DEFAULT_SETTINGS, MUSICAL_KEYS, SCALES, BAR_COUNTS } from "@/lib/constants";
import { MusicalKey, Scale } from "../../shared/types";

export default function RoomJoin() {
  const router = useRouter();
  const { room, createRoom, joinRoom } = useRoom();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  const [bpm, setBpm] = useState(DEFAULT_SETTINGS.bpm);
  const [key, setKey] = useState<MusicalKey>(DEFAULT_SETTINGS.key);
  const [scale, setScale] = useState<Scale>(DEFAULT_SETTINGS.scale);
  const [barCount, setBarCount] = useState<4 | 8 | 16>(DEFAULT_SETTINGS.barCount);

  // Navigate when room is created
  useEffect(() => {
    if (room) {
      router.push(`/room/${room.code}`);
    }
  }, [room, router]);

  const handleJoin = async () => {
    if (!name.trim() || !roomCode.trim()) {
      setError("Enter your name and room code");
      return;
    }
    sessionStorage.setItem("composed-username", name);
    const success = await joinRoom(roomCode, name);
    if (success) {
      router.push(`/room/${roomCode.toUpperCase()}`);
    } else {
      setError("Room not found");
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    sessionStorage.setItem("composed-username", name);
    createRoom(name, { bpm, key, scale, barCount });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight">Composed</h1>
          <p className="text-gray-400 mt-2">Collaborative Jam Sessions</p>
        </div>

        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />

        <div className="flex gap-2">
          <button
            onClick={() => setMode("join")}
            className={`flex-1 py-2 rounded-lg font-medium transition
              ${mode === "join" ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
          >
            Join Room
          </button>
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-2 rounded-lg font-medium transition
              ${mode === "create" ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
          >
            Create Room
          </button>
        </div>

        {mode === "join" ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Room code (e.g. ABC123)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                         text-white text-center text-2xl tracking-widest uppercase
                         placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleJoin}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition"
            >
              Join Session
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-gray-400">BPM</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="w-32"
                />
                <span className="w-10 text-right font-mono">{bpm}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="text-gray-400">Key</label>
              <div className="flex gap-2">
                <select
                  value={key}
                  onChange={(e) => setKey(e.target.value as MusicalKey)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  {MUSICAL_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={scale}
                  onChange={(e) => setScale(e.target.value as Scale)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  {SCALES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-gray-400">Loop Length</label>
              <div className="flex gap-2">
                {BAR_COUNTS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBarCount(b)}
                    className={`px-4 py-2 rounded-lg font-mono transition
                      ${barCount === b ? "bg-purple-600" : "bg-gray-800 text-gray-400"}`}
                  >
                    {b} bars
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition"
            >
              Create Session
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-center text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
