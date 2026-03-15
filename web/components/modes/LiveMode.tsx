"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";
import { INSTRUMENT_CONFIGS } from "@/lib/instrument-config";
import { bufferToWav } from "@/lib/audio-utils";
import { buildScale, buildKeyboard } from "@/lib/music-utils";
import { DRUM_KITS, BASS_PRESETS, MELODY_PRESETS, CHORDS_PRESETS, FX_KITS, SampleKit, SamplerPreset } from "@/lib/sample-catalog";
import CommitBar from "@/components/CommitBar";
import WaveformPreview from "@/components/WaveformPreview";

interface Props {
  settings: RoomSettings;
  stemType: StemType;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (audioUrl: string, name: string, stemType: StemType, creationLevel: 1 | 2 | 3 | 4) => void;
}

type RecordState = "idle" | "countdown" | "recording" | "preview";

// Drum pad definitions
const DRUM_PADS = [
  { label: "Kick", note: "C1" },
  { label: "Snare", note: "D1" },
  { label: "CH", note: "F#1" },
  { label: "OH", note: "A#1" },
  { label: "Clap", note: "D#1" },
  { label: "Rim", note: "C#1" },
  { label: "Lo Tom", note: "G1" },
  { label: "Hi Tom", note: "A1" },
];

export default function LiveMode({ settings, stemType, roomCode, localDestination, onPush }: Props) {
  const config = INSTRUMENT_CONFIGS[stemType];
  const inputType = config.live.inputType;

  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [countdown, setCountdown] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [octave, setOctave] = useState(config.sequencer.defaultOctave ?? 3);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const presets: (SampleKit | SamplerPreset)[] = (() => {
    if (inputType === "pads" && stemType === "drums") return DRUM_KITS;
    if (inputType === "pads" && stemType === "fx") return FX_KITS;
    if (inputType === "keyboard" && stemType === "bass") return BASS_PRESETS;
    if (inputType === "keyboard" && stemType === "melody") return MELODY_PRESETS;
    if (inputType === "keyboard" && stemType === "chords") return CHORDS_PRESETS;
    return [];
  })();
  const defaultPreset: SampleKit = { id: "synth", name: "Synth", samples: null };
  const [_selectedPreset, setSelectedPreset] = useState<SampleKit | SamplerPreset>(presets[0] ?? defaultPreset);
  const selectedPreset = presets.find(p => p.id === _selectedPreset.id) ?? presets[0] ?? defaultPreset;
  const [kitLoading, setKitLoading] = useState(false);
  const samplePlayersRef = useRef<Tone.Player[]>([]);
  const samplerRef = useRef<Tone.Sampler | null>(null);

  const recorderRef = useRef<Tone.Recorder | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const drumSynthsRef = useRef<Tone.ToneAudioNode[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;
  const beatDuration = 60 / settings.bpm;
  const totalBeats = settings.barCount * 4;

  // Recording progress tracking
  const [recordProgress, setRecordProgress] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(0);
  const recordStartRef = useRef<number>(0);
  const progressRafRef = useRef<number>(0);

  // Create synths/players/samplers for pads/keyboard modes
  useEffect(() => {
    if (inputType === "microphone") return;
    let cancelled = false;

    if (inputType === "pads") {
      if (selectedPreset.samples) {
        // Sample kit mode (drums or FX pads)
        setKitLoading(true);
        drumSynthsRef.current = [];
        samplerRef.current = null;
        const labels = stemType === "fx"
          ? Array.from({ length: 8 }, (_, i) => `Pad ${i + 1}`)
          : DRUM_PADS.map(p => p.label);
        const players = labels.map(label => {
          const url = selectedPreset.samples![label];
          return new Tone.Player(url).connect(localDestination);
        });
        samplePlayersRef.current = players;
        Tone.loaded().then(() => { if (!cancelled) setKitLoading(false); });
        return () => { cancelled = true; players.forEach(p => p.dispose()); };
      }
      // Synth kit mode
      samplePlayersRef.current = [];
      samplerRef.current = null;
      const synths = DRUM_PADS.map((_, i) => {
        switch (i) {
          case 0: return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 } }).connect(localDestination);
          case 1: return new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } }).connect(localDestination);
          case 2: return new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(localDestination);
          case 3: return new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.3, release: 0.1 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(localDestination);
          case 4: return new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 } }).connect(localDestination);
          case 5: return new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 } }).connect(localDestination);
          case 6: return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 4, envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 } }).connect(localDestination);
          default: return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 3, envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.2 } }).connect(localDestination);
        }
      });
      drumSynthsRef.current = synths;
      return () => { synths.forEach(s => s.dispose()); };
    }

    // Keyboard mode
    if (selectedPreset.samples) {
      // Sampler preset
      setKitLoading(true);
      synthRef.current = null;
      const sampler = new Tone.Sampler(selectedPreset.samples).connect(localDestination);
      sampler.volume.value = -6;
      samplerRef.current = sampler;
      Tone.loaded().then(() => { if (!cancelled) setKitLoading(false); });
      return () => { cancelled = true; sampler.dispose(); };
    }

    // Default synth
    samplerRef.current = null;
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.8 },
    }).connect(localDestination);
    synth.volume.value = -6;
    synthRef.current = synth;
    return () => { synth.dispose(); };
  }, [localDestination, inputType, selectedPreset, stemType]);

  // Progress animation during recording
  const startProgressTracking = useCallback(() => {
    recordStartRef.current = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - recordStartRef.current) / 1000;
      const progress = Math.min(elapsed / loopDuration, 1);
      const beat = Math.floor(elapsed / beatDuration);
      setRecordProgress(progress);
      setCurrentBeat(beat);
      if (progress < 1) {
        progressRafRef.current = requestAnimationFrame(tick);
      }
    };
    progressRafRef.current = requestAnimationFrame(tick);
  }, [loopDuration, beatDuration]);

  const stopProgressTracking = useCallback(() => {
    cancelAnimationFrame(progressRafRef.current);
    setRecordProgress(0);
    setCurrentBeat(0);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    await Tone.start();
    setRecordState("countdown");
    setRecordedUrl(null);
    setRecordedBlob(null);
    stopProgressTracking();

    if (inputType === "microphone") {
      // Request mic permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicError(null);

        // Countdown
        let count = 4;
        setCountdown(count);
        countdownRef.current = setInterval(() => {
          count--;
          if (count <= 0) {
            clearInterval(countdownRef.current!);
            setRecordState("recording");
            startProgressTracking();

            // Start mic recording
            const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            chunksRef.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = () => {
              stopProgressTracking();
              const blob = new Blob(chunksRef.current, { type: "audio/webm" });
              const url = URL.createObjectURL(blob);
              setRecordedUrl(url);
              setRecordedBlob(blob);
              setRecordState("preview");
              stream.getTracks().forEach(t => t.stop());
            };
            recorder.start();
            mediaRecorderRef.current = recorder;

            // Auto-stop after loop duration
            recordTimeoutRef.current = setTimeout(() => {
              if (recorder.state === "recording") recorder.stop();
            }, loopDuration * 1000);
          } else {
            setCountdown(count);
          }
        }, (60 / settings.bpm) * 1000); // Beat interval
      } catch {
        setMicError("Microphone access denied. Please allow microphone access.");
        setRecordState("idle");
      }
      return;
    }

    // Tone.Recorder for pads/keyboard
    const recorder = new Tone.Recorder();
    localDestination.connect(recorder);
    recorderRef.current = recorder;

    // Countdown (1 bar of beats)
    let count = 4;
    setCountdown(count);
    countdownRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countdownRef.current!);
        setRecordState("recording");
        startProgressTracking();
        recorder.start();

        // Auto-stop after loop duration
        recordTimeoutRef.current = setTimeout(async () => {
          stopProgressTracking();
          const blob = await recorder.stop();
          localDestination.disconnect(recorder);
          const url = URL.createObjectURL(blob);
          setRecordedUrl(url);
          setRecordedBlob(blob);
          setRecordState("preview");
        }, loopDuration * 1000);
      } else {
        setCountdown(count);
      }
    }, (60 / settings.bpm) * 1000);
  }, [inputType, localDestination, loopDuration, settings.bpm, startProgressTracking, stopProgressTracking]);

  // Stop recording manually
  const stopRecording = useCallback(async () => {
    if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    stopProgressTracking();

    if (inputType === "microphone" && mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else if (recorderRef.current) {
      const blob = await recorderRef.current.stop();
      localDestination.disconnect(recorderRef.current);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      setRecordedBlob(blob);
      setRecordState("preview");
    }
  }, [inputType, localDestination, stopProgressTracking]);

  // Trigger drum/fx pad
  const triggerPad = async (index: number) => {
    await Tone.start();
    if (selectedPreset.samples) {
      const player = samplePlayersRef.current[index];
      if (player?.loaded) { player.stop(); player.start(); }
      return;
    }
    const synth = drumSynthsRef.current[index];
    if (!synth) return;
    const t = Tone.now();
    if (synth instanceof Tone.MembraneSynth) {
      const notes: Record<number, string> = { 0: "C1", 5: "G3", 6: "G1", 7: "D2" };
      synth.triggerAttackRelease(notes[index] || "C2", "8n", t);
    } else if (synth instanceof Tone.NoiseSynth) {
      synth.triggerAttackRelease("16n", t);
    } else if (synth instanceof Tone.MetalSynth) {
      synth.triggerAttackRelease("32n", t);
    }
  };

  // Piano key handlers
  const playNote = useCallback(async (note: string) => {
    await Tone.start();
    if (samplerRef.current) {
      samplerRef.current.triggerAttack(note);
    } else {
      synthRef.current?.triggerAttack(note);
    }
    setActiveNotes(prev => new Set(prev).add(note));
  }, []);

  const stopNote = useCallback((note: string) => {
    if (samplerRef.current) {
      samplerRef.current.triggerRelease(note);
    } else {
      synthRef.current?.triggerRelease(note);
    }
    setActiveNotes(prev => { const n = new Set(prev); n.delete(note); return n; });
  }, []);

  // Commit
  const commit = async () => {
    if (!recordedBlob) return;
    setIsCommitting(true);
    try {
      const fd = new FormData();
      const ext = inputType === "microphone" ? "webm" : "webm";
      fd.append("file", recordedBlob, `${stemType}-live.${ext}`);
      fd.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      onPush(url, `Live ${config.label}`, stemType, 4);
      setRecordedUrl(null);
      setRecordedBlob(null);
      setRecordState("idle");
    } catch (err) { console.error("Upload failed:", err); }
    finally { setIsCommitting(false); }
  };

  const clear = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setRecordState("idle");
    setMicError(null);
  };

  // Build piano keyboard
  const scaleNotes = buildScale(settings.key, settings.scale, octave, 2);
  const allKeys = buildKeyboard(octave, 2);
  const whiteKeys = allKeys.filter(k => !k.isBlack);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>

      {/* Record controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "12px 0" }}>
        {recordState === "idle" && (
          <button onClick={startRecording} style={{
            width: 56, height: 56, borderRadius: "50%", border: "2px solid #C46B5A", background: "rgba(196,107,90,0.15)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
          }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#C46B5A" }} />
          </button>
        )}
        {recordState === "countdown" && (
          <div style={{ fontSize: 48, fontWeight: 700, color: "#CFA24B", fontFamily: "var(--fm)" }}>
            {countdown}
          </div>
        )}
        {recordState === "recording" && (
          <button onClick={stopRecording} style={{
            width: 56, height: 56, borderRadius: "50%", border: "2px solid #C46B5A", background: "rgba(196,107,90,0.3)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            animation: "pulse 1s ease-in-out infinite",
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 3, background: "#C46B5A" }} />
          </button>
        )}
        {recordState === "preview" && (
          <button onClick={startRecording} style={{
            padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: "rgba(196,107,90,0.15)", border: "1px solid rgba(196,107,90,0.3)", color: "#C46B5A",
          }}>
            Re-record
          </button>
        )}
        <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>
          {recordState === "idle" && "Press to record"}
          {recordState === "countdown" && "Get ready..."}
          {recordState === "recording" && "Recording..."}
          {recordState === "preview" && "Preview your recording"}
        </span>
      </div>

      {/* Mic error */}
      {micError && (
        <div style={{
          padding: "12px 16px", borderRadius: 10, fontSize: 13,
          background: "rgba(196,107,90,0.1)", border: "1px solid rgba(196,107,90,0.3)", color: "#C46B5A",
        }}>
          {micError}
        </div>
      )}

      {/* Preset selector (for pads and keyboard) */}
      {presets.length > 1 && (recordState === "idle" || recordState === "recording") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>
            {inputType === "pads" ? "Kit" : "Sound"}
          </span>
          {presets.map(p => (
            <button key={p.id} onClick={() => setSelectedPreset(p)} style={{
              padding: "4px 10px", borderRadius: 6, fontFamily: "var(--fm)", fontSize: 11, cursor: "pointer",
              background: selectedPreset.id === p.id ? `${config.color}25` : "transparent",
              border: `1px solid ${selectedPreset.id === p.id ? `${config.color}50` : "rgba(232,226,217,0.06)"}`,
              color: selectedPreset.id === p.id ? config.color : "#5E584E",
            }}>
              {p.name}
            </button>
          ))}
          {kitLoading && (
            <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "#5E584E", marginLeft: 4 }}>Loading...</span>
          )}
        </div>
      )}

      {/* Input area */}
      {inputType === "pads" && (recordState === "idle" || recordState === "recording") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {(stemType === "fx" && selectedPreset.samples
            ? Array.from({ length: 8 }, (_, i) => ({ label: `Pad ${i + 1}` }))
            : DRUM_PADS
          ).map((pad, i) => (
            <button key={i} onClick={() => triggerPad(i)} style={{
              height: 72, borderRadius: 12, fontWeight: 600, fontSize: 12, cursor: "pointer",
              background: `${config.color}15`, border: `1px solid ${config.color}30`, color: config.color,
              transition: "transform 0.1s",
            }}
              onMouseDown={e => { (e.target as HTMLElement).style.transform = "scale(0.94)"; }}
              onMouseUp={e => { (e.target as HTMLElement).style.transform = ""; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.transform = ""; }}
            >
              {pad.label}
            </button>
          ))}
        </div>
      )}

      {inputType === "keyboard" && (recordState === "idle" || recordState === "recording") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Octave selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>Octave</span>
            {[2, 3, 4, 5].map(o => (
              <button key={o} onClick={() => setOctave(o)} style={{
                padding: "4px 10px", borderRadius: 6, fontFamily: "var(--fm)", fontSize: 11, cursor: "pointer",
                background: octave === o ? `${config.color}25` : "transparent",
                border: `1px solid ${octave === o ? `${config.color}50` : "rgba(232,226,217,0.06)"}`,
                color: octave === o ? config.color : "#5E584E",
              }}>
                {o}
              </button>
            ))}
          </div>

          {/* Piano keys */}
          <div style={{ position: "relative", height: 140, width: "100%" }}>
            <div style={{ display: "flex", height: "100%", gap: 2 }}>
              {whiteKeys.map(({ note }) => {
                const inScale = scaleNotes.has(note);
                const isActive = activeNotes.has(note);
                return (
                  <button key={note}
                    onMouseDown={() => playNote(note)}
                    onMouseUp={() => stopNote(note)}
                    onMouseLeave={() => { if (activeNotes.has(note)) stopNote(note); }}
                    style={{
                      flex: 1, borderRadius: "0 0 8px 8px", cursor: "pointer", border: "1px solid rgba(232,226,217,0.08)",
                      background: isActive ? `${config.color}60` : inScale ? "#E8E2D9" : "#A09888",
                      display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", paddingBottom: 8,
                      transition: "background 0.08s",
                    }}
                  >
                    <span style={{ fontFamily: "var(--fm)", fontSize: 8, color: inScale ? "#141311" : "#5E584E", opacity: 0.7 }}>
                      {note.replace(/\d/, "")}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Black keys */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%", display: "flex", pointerEvents: "none" }}>
              {whiteKeys.map(({ note }, i) => {
                const noteName = note.replace(/\d/, "");
                const oct = note.match(/\d+/)?.[0];
                const hasSharp = !["E", "B"].includes(noteName);
                if (!hasSharp || i === whiteKeys.length - 1) return <div key={note} style={{ flex: 1 }} />;
                const blackNote = `${noteName}#${oct}`;
                const inScale = scaleNotes.has(blackNote);
                const isActive = activeNotes.has(blackNote);
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
                        background: isActive ? `${config.color}80` : inScale ? "#28261F" : "#1E1C19",
                        zIndex: 2, transition: "background 0.08s",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Loop cycle timeline */}
      {inputType === "microphone" && (recordState === "idle" || recordState === "recording") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
          {/* Beat markers */}
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: totalBeats }).map((_, i) => {
              const beatProgress = recordState === "recording" ? recordProgress * totalBeats : 0;
              const isFilled = i < beatProgress;
              const isCurrent = Math.floor(beatProgress) === i && recordState === "recording";
              const isDownbeat = i % 4 === 0;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: "100%", height: isDownbeat ? 28 : 20, borderRadius: 4,
                    background: isFilled
                      ? `${config.color}${isCurrent ? "90" : "50"}`
                      : "rgba(232,226,217,0.06)",
                    border: isCurrent ? `2px solid ${config.color}` : "1px solid rgba(232,226,217,0.04)",
                    transition: "background 0.1s",
                    boxShadow: isCurrent ? `0 0 8px ${config.color}40` : "none",
                  }} />
                  {isDownbeat && (
                    <span style={{ fontSize: 9, fontFamily: "var(--fm)", color: isFilled ? config.color : "#5E584E" }}>
                      {i / 4 + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div style={{
            height: 4, borderRadius: 2, background: "rgba(232,226,217,0.06)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${recordProgress * 100}%`,
              background: `linear-gradient(90deg, ${config.color}, ${config.color}80)`,
              transition: recordState === "recording" ? "none" : "width 0.2s",
            }} />
          </div>

          {/* Info */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontFamily: "var(--fm)", color: "#5E584E" }}>
              {recordState === "recording"
                ? `Bar ${Math.floor(currentBeat / 4) + 1} of ${settings.barCount}`
                : `${settings.barCount} bars · ${totalBeats} beats · ${loopDuration.toFixed(1)}s`}
            </span>
            <span style={{ fontSize: 11, fontFamily: "var(--fm)", color: recordState === "recording" ? config.color : "#5E584E" }}>
              {recordState === "recording"
                ? `${(recordProgress * loopDuration).toFixed(1)}s / ${loopDuration.toFixed(1)}s`
                : `${settings.bpm} BPM`}
            </span>
          </div>
        </div>
      )}

      {/* Preview waveform */}
      {recordState === "preview" && recordedUrl && (
        <WaveformPreview audioUrl={recordedUrl} color={config.color} height={80} />
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

      <CommitBar
        settings={settings}
        hasContent={recordState === "preview" && !!recordedBlob}
        isCommitting={isCommitting}
        onClear={clear}
        onCommit={commit}
      />
    </div>
  );
}
