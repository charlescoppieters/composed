"use client";
import { Track } from "../../shared/types";
import TrackCard from "./TrackCard";

interface Props {
  tracks: Track[];
  userId: string | null;
  onVoteRemove: (trackId: string) => void;
  onUnvoteRemove: (trackId: string) => void;
  onVolumeChange: (trackId: string, volume: number) => void;
  totalUsers: number;
}

export default function TrackList({
  tracks,
  userId,
  onVoteRemove,
  onUnvoteRemove,
  onVolumeChange,
  totalUsers,
}: Props) {
  if (tracks.length === 0) {
    return (
      <div className="text-gray-600 text-sm text-center py-8">
        No tracks yet. Create one and push it!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          userId={userId}
          onVoteRemove={onVoteRemove}
          onUnvoteRemove={onUnvoteRemove}
          onVolumeChange={onVolumeChange}
          totalUsers={totalUsers}
        />
      ))}
    </div>
  );
}
