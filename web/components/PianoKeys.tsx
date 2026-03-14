"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";
import { RoomSettings } from "@/lib/types";

interface Props {
  settings: RoomSettings;
  localDestination: Tone.ToneAudioNode;
}

// 2 octaves of keys starting from the room key
const NOTES_IN_OCTAVE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function buildScale(rootKey: string, scale: "major" | "minor", octaveStart: number, octaveCount: number) {
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
  const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
  const intervals = scale === "major" ? majorIntervals : minorIntervals;
  const rootIndex = NOTES_IN_OCTAVE.indexOf(rootKey);

  const scaleNotes = new Set<string>();
  for (let oct = octaveStart; oct < octaveStart + octaveCount; oct++) {
    for (const interval of intervals) {
      const noteIndex = (rootIndex + interval) % 12;
      const noteOctave = oct + Math.floor((rootIndex + interval) / 12);
      scaleNotes.add(`${NOTES_IN_OCTAVE[noteIndex]}${noteOctave}`);
    }
  }
  return scaleNotes;
}

// Build all keys for display (2 octaves)
function buildKeyboard(octaveStart: number, octaveCount: number) {
  const keys: { note: string; isBlack: boolean }[] = [];
  for (let oct = octaveStart; oct < octaveStart + octaveCount; oct++) {
    for (const note of NOTES_IN_OCTAVE) {
      keys.push({ note: `${note}${oct}`, isBlack: note.includes("#") });
    }
  }
  // Add the root of the next octave
  keys.push({ note: `C${octaveStart + octaveCount}`, isBlack: false });
  return keys;
}

export default function PianoKeys({ settings, localDestination }: Props) {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [octave, setOctave] = useState(3);

  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
    }).connect(localDestination);
    synth.volume.value = -6;
    synthRef.current = synth;
    return () => { synth.dispose(); };
  }, [localDestination]);

  const scaleNotes = buildScale(settings.key, settings.scale, octave, 2);
  const allKeys = buildKeyboard(octave, 2);
  const whiteKeys = allKeys.filter(k => !k.isBlack);
  const blackKeys = allKeys.filter(k => k.isBlack);

  const playNote = useCallback(async (note: string) => {
    await Tone.start();
    synthRef.current?.triggerAttack(note);
    setActiveNotes(prev => new Set(prev).add(note));
  }, []);

  const stopNote = useCallback((note: string) => {
    synthRef.current?.triggerRelease(note);
    setActiveNotes(prev => { const n = new Set(prev); n.delete(note); return n; });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Octave selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>Octave</span>
        {[2, 3, 4, 5].map(o => (
          <button key={o} onClick={() => setOctave(o)} style={{
            padding: "4px 10px", borderRadius: 6, fontFamily: "var(--fm)", fontSize: 11, cursor: "pointer",
            background: octave === o ? "rgba(207,162,75,0.15)" : "transparent",
            border: `1px solid ${octave === o ? "rgba(207,162,75,0.30)" : "rgba(232,226,217,0.06)"}`,
            color: octave === o ? "#CFA24B" : "#5E584E",
          }}>
            {o}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>
          {settings.key} {settings.scale} · highlighted
        </span>
      </div>

      {/* Piano keyboard */}
      <div style={{ position: "relative", height: 160, width: "100%" }}>
        {/* White keys */}
        <div style={{ display: "flex", height: "100%", gap: 2 }}>
          {whiteKeys.map(({ note }) => {
            const inScale = scaleNotes.has(note);
            const isActive = activeNotes.has(note);
            return (
              <button
                key={note}
                onMouseDown={() => playNote(note)}
                onMouseUp={() => stopNote(note)}
                onMouseLeave={() => { if (activeNotes.has(note)) stopNote(note); }}
                style={{
                  flex: 1, borderRadius: "0 0 8px 8px", cursor: "pointer", border: "1px solid rgba(232,226,217,0.08)",
                  background: isActive
                    ? "rgba(207,162,75,0.4)"
                    : inScale
                      ? "#E8E2D9"
                      : "#A09888",
                  display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", paddingBottom: 8,
                  transition: "background 0.08s",
                }}
              >
                <span style={{
                  fontFamily: "var(--fm)", fontSize: 8, color: inScale ? "#141311" : "#5E584E",
                  opacity: 0.7,
                }}>
                  {note.replace(/\d/, "")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Black keys — positioned absolutely */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%", display: "flex", pointerEvents: "none" }}>
          {whiteKeys.map(({ note }, i) => {
            // Find if there's a black key after this white key
            const noteName = note.replace(/\d/, "");
            const oct = note.match(/\d+/)?.[0];
            const hasSharp = !["E", "B"].includes(noteName);
            if (!hasSharp || i === whiteKeys.length - 1) return <div key={note} style={{ flex: 1 }} />;

            const blackNote = `${noteName}#${oct}`;
            const inScale = scaleNotes.has(blackNote);
            const isActive = activeNotes.has(blackNote);
            const whiteWidth = `${100 / whiteKeys.length}%`;

            return (
              <div key={note} style={{ flex: 1, position: "relative" }}>
                <button
                  onMouseDown={() => playNote(blackNote)}
                  onMouseUp={() => stopNote(blackNote)}
                  onMouseLeave={() => { if (activeNotes.has(blackNote)) stopNote(blackNote); }}
                  style={{
                    position: "absolute", right: -10, width: 20, height: "100%",
                    borderRadius: "0 0 5px 5px", cursor: "pointer", pointerEvents: "auto",
                    border: "1px solid rgba(0,0,0,0.3)",
                    background: isActive
                      ? "rgba(207,162,75,0.6)"
                      : inScale
                        ? "#28261F"
                        : "#1E1C19",
                    zIndex: 2, transition: "background 0.08s",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontFamily: "var(--fm)", fontSize: 10, color: "#5E584E", textAlign: "center" }}>
        Click keys to play · Bright keys are in {settings.key} {settings.scale}
      </p>
    </div>
  );
}
