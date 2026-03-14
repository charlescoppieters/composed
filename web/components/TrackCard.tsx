"use client";
import { Track } from "@/lib/types";
import { STEM_COLORS } from "@/lib/constants";

interface Props {
  track: Track;
  userId: string | null;
  onVoteRemove: (trackId: string) => void;
  onUnvoteRemove: (trackId: string) => void;
  totalUsers: number;
}

export default function TrackCard({
  track,
  userId,
  onVoteRemove,
  onUnvoteRemove,
  totalUsers,
}: Props) {
  const hasVoted = userId ? track.removeVotes.includes(userId) : false;
  const voteCount = track.removeVotes.length;
  const votesNeeded = Math.ceil(totalUsers / 2);

  return (
    <div
      className="bg-gray-900 rounded-lg p-3 space-y-2"
      style={{ borderLeft: `3px solid ${STEM_COLORS[track.stemType]}` }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{track.name}</p>
          <p className="text-xs text-gray-500">
            {track.userName} · {track.stemType}
          </p>
        </div>
        <button
          onClick={() => hasVoted ? onUnvoteRemove(track.id) : onVoteRemove(track.id)}
          className={`text-xs px-2 py-1 rounded transition
            ${hasVoted ? "bg-red-900 text-red-300" : "bg-gray-800 text-gray-400 hover:text-red-400"}`}
        >
          {voteCount}/{votesNeeded} skip
        </button>
      </div>
    </div>
  );
}
