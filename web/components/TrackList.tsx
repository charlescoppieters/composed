"use client";
import { Track, RoomUser } from "@/lib/types";
import TrackCard from "./TrackCard";

interface Props {
  tracks: Track[];
  userId: string | null;
  users: RoomUser[];
  onVoteDown: (trackId: string) => void;
  onVoteUp: (trackId: string) => void;
  onToggleMute?: (trackId: string) => void;
  mutedTracks?: Set<string>;
  totalUsers: number;
}

export default function TrackList({
  tracks, userId, users, onVoteDown, onVoteUp, onToggleMute, mutedTracks, totalUsers,
}: Props) {
  if (tracks.length === 0) {
    return (
      <div style={{ padding: "12px 0", textAlign: "center" }}>
        <p style={{ color: "#5E584E", fontSize: 11, fontFamily: "var(--fm)" }}>No stems in master yet</p>
      </div>
    );
  }

  return (
    <div>
      {tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          userId={userId}
          users={users}
          onVoteDown={onVoteDown}
          onVoteUp={onVoteUp}
          onToggleMute={onToggleMute}
          isMuted={mutedTracks?.has(track.id)}
          totalUsers={totalUsers}
        />
      ))}
    </div>
  );
}
