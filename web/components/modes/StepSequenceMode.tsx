"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";
import { InstrumentConfig, INSTRUMENT_CONFIGS } from "@/lib/instrument-config";
import { bufferToWav } from "@/lib/audio-utils";
import { NOTES_IN_OCTAVE, buildScale, getDiatonicChords, getChordVoicing } from "@/lib/music-utils";
import CommitBar from "@/components/CommitBar";

interface Props {
  settings: RoomSettings;
  stemType: StemType;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (audioUrl: string, name: string, stemType: StemType, creationLevel: 1 | 2 | 3 | 4) => void;
}

const STEPS = 16;

// ── Drum synth factories ──

function createDrumSynth(index: number, destination: Tone.ToneAudioNode): Tone.ToneAudioNode {
  switch (index) {
    case 0: return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 } }).connect(destination);
    case 1: return new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } }).connect(destination);
    case 2: return new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(destination);
    case 3: return new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.3, release: 0.1 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(destination);
    case 4: return new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 } }).connect(destination);
    case 5: return new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 } }).connect(destination);
    case 6: return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 4, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 } }).connect(destination);
    case 7: return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 3, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.2 } }).connect(destination);
    default: return new Tone.MembraneSynth().connect(destination);
  }
}

function triggerDrumSynth(synth: Tone.ToneAudioNode, index: number, time?: number) {
  const t = time ?? Tone.now();
  if (synth instanceof Tone.MembraneSynth) {
    const notes: Record<number, string> = { 0: "C1", 5: "G3", 6: "G1", 7: "D2" };
    synth.triggerAttackRelease(notes[index] || "C2", "8n", t);
  } else if (synth instanceof Tone.NoiseSynth) {
    synth.triggerAttackRelease("16n", t);
  } else if (synth instanceof Tone.MetalSynth) {
    synth.triggerAttackRelease("32n", t);
  }
}

// ── Chromatic/Chord row builders ──

function buildChromaticRows(octaveStart: number, octaveEnd: number) {
  const rows: { label: string; note: string }[] = [];
  // Build from high to low for visual display (high notes at top)
  for (let oct = octaveEnd; oct >= octaveStart; oct--) {
    for (let i = NOTES_IN_OCTAVE.length - 1; i >= 0; i--) {
      rows.push({ label: `${NOTES_IN_OCTAVE[i]}${oct}`, note: `${NOTES_IN_OCTAVE[i]}${oct}` });
    }
  }
  return rows;
}

// ── Main Component ──

export default function StepSequenceMode({ settings, stemType, roomCode, localDestination, onPush }: Props) {
  const config = INSTRUMENT_CONFIGS[stemType];
  const seqType = config.sequencer.type;

  // Octave state for chromatic
  const [octave, setOctave] = useState(config.sequencer.defaultOctave ?? 3);
  const octaveRange = config.sequencer.octaveRange ?? [2, 5];

  // Build rows based on sequencer type
  const rows = (() => {
    if (seqType === "drum") {
      return config.sequencer.rows.map(r => ({ label: r.label, note: r.label, color: r.color }));
    }
    if (seqType === "chromatic") {
      // Show 2 octaves at a time
      return buildChromaticRows(octave, octave + 1).map(r => ({ label: r.label, note: r.note, color: config.color }));
    }
    if (seqType === "chord") {
      const chords = getDiatonicChords(settings.key, settings.scale);
      return chords.map(c => ({ label: `${c.numeral}`, note: c.root, color: config.color, quality: c.quality }));
    }
    // sample-slot: start with 4 empty rows
    return Array.from({ length: 4 }, (_, i) => ({ label: `Slot ${i + 1}`, note: "", color: config.color }));
  })();

  const rowCount = rows.length;
  const [grid, setGrid] = useState<boolean[][]>(() => Array(rowCount).fill(null).map(() => Array(STEPS).fill(false)));
  const [isRendering, setIsRendering] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const synthsRef = useRef<Tone.ToneAudioNode[]>([]);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  // Sample slots state (for sample-slot type)
  const [sampleSlots, setSampleSlots] = useState<{ name: string; url: string; player?: Tone.Player }[]>([]);

  // Reset grid when rows change
  useEffect(() => {
    setGrid(Array(rowCount).fill(null).map(() => Array(STEPS).fill(false)));
  }, [rowCount, stemType]);

  // Scale highlighting for chromatic
  const scaleNotes = buildScale(settings.key, settings.scale, octaveRange[0], octaveRange[1] - octaveRange[0] + 1);

  // Create synths and sequencer
  useEffect(() => {
    let synths: Tone.ToneAudioNode[] = [];

    if (seqType === "drum") {
      synths = rows.map((_, i) => createDrumSynth(i, localDestination));
    } else if (seqType === "chromatic") {
      synths = rows.map(() => {
        return new Tone.Synth({
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.3 },
        }).connect(localDestination);
      });
    } else if (seqType === "chord") {
      synths = rows.map(() => {
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5 },
        }).connect(localDestination);
      });
    }
    // sample-slot synths are managed separately via sampleSlots

    synthsRef.current = synths;

    const chords = seqType === "chord" ? getDiatonicChords(settings.key, settings.scale) : [];

    const seq = new Tone.Sequence(
      (time, step) => {
        const g = gridRef.current;
        for (let row = 0; row < g.length; row++) {
          if (!g[row][step % STEPS]) continue;

          if (seqType === "drum") {
            triggerDrumSynth(synths[row], row, time);
          } else if (seqType === "chromatic") {
            const s = synths[row];
            if (s instanceof Tone.Synth) {
              const note = rows[row]?.note;
              if (note) s.triggerAttackRelease(note, "16n", time);
            }
          } else if (seqType === "chord") {
            const s = synths[row];
            if (s instanceof Tone.PolySynth && chords[row]) {
              const voicing = getChordVoicing(chords[row].root, chords[row].quality, config.sequencer.defaultOctave ?? 3);
              s.triggerAttackRelease(voicing, "8n", time);
            }
          } else if (seqType === "sample-slot") {
            sampleSlots[row]?.player?.start(time);
          }
        }
        Tone.getDraw().schedule(() => setCurrentStep(step % STEPS), time);
      },
      Array.from({ length: STEPS }, (_, i) => i), "16n"
    );
    seq.loop = true;
    seq.start(0);

    return () => { seq.stop(); seq.dispose(); synths.forEach(s => s.dispose()); };
  }, [localDestination, seqType, stemType, octave, settings.key, settings.scale]);

  const toggleStep = (ri: number, si: number) => {
    setGrid(prev => { const n = prev.map(r => [...r]); n[ri][si] = !n[ri][si]; return n; });
  };

  const clearGrid = () => setGrid(Array(rowCount).fill(null).map(() => Array(STEPS).fill(false)));
  const hasSteps = grid.some(r => r.some(Boolean));

  // Tap-trigger for drum pads
  const tapRow = async (ri: number) => {
    await Tone.start();
    if (seqType === "drum") {
      triggerDrumSynth(synthsRef.current[ri], ri);
    } else if (seqType === "chromatic") {
      const s = synthsRef.current[ri];
      if (s instanceof Tone.Synth) s.triggerAttackRelease(rows[ri].note, "8n");
    } else if (seqType === "chord") {
      const s = synthsRef.current[ri];
      const chords = getDiatonicChords(settings.key, settings.scale);
      if (s instanceof Tone.PolySynth && chords[ri]) {
        const voicing = getChordVoicing(chords[ri].root, chords[ri].quality, config.sequencer.defaultOctave ?? 3);
        s.triggerAttackRelease(voicing, "8n");
      }
    }
  };

  // Render & Push
  const renderAndPush = useCallback(async () => {
    setIsRendering(true);
    try {
      const dur = (settings.barCount * 4 * 60) / settings.bpm;
      const chords = seqType === "chord" ? getDiatonicChords(settings.key, settings.scale) : [];

      const buffer = await Tone.Offline(({ transport }) => {
        transport.bpm.value = settings.bpm;
        let offlineSynths: Tone.ToneAudioNode[] = [];

        if (seqType === "drum") {
          offlineSynths = rows.map((_, i) => createDrumSynth(i, Tone.getDestination()));
        } else if (seqType === "chromatic") {
          offlineSynths = rows.map(() => new Tone.Synth({
            oscillator: { type: "sawtooth" },
            envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.3 },
          }).connect(Tone.getDestination()));
        } else if (seqType === "chord") {
          offlineSynths = rows.map(() => new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5 },
          }).connect(Tone.getDestination()));
        }

        const seq = new Tone.Sequence((time, step) => {
          for (let row = 0; row < grid.length; row++) {
            if (!grid[row][step % STEPS]) continue;
            if (seqType === "drum") {
              triggerDrumSynth(offlineSynths[row], row, time);
            } else if (seqType === "chromatic") {
              const s = offlineSynths[row];
              if (s instanceof Tone.Synth) s.triggerAttackRelease(rows[row].note, "16n", time);
            } else if (seqType === "chord" && chords[row]) {
              const s = offlineSynths[row];
              if (s instanceof Tone.PolySynth) {
                const voicing = getChordVoicing(chords[row].root, chords[row].quality, config.sequencer.defaultOctave ?? 3);
                s.triggerAttackRelease(voicing, "8n", time);
              }
            }
          }
        }, Array.from({ length: STEPS }, (_, i) => i), "16n");
        seq.loop = true; seq.start(0); transport.start();
      }, dur, 1, 22050);

      const wav = bufferToWav(buffer);
      const fd = new FormData();
      fd.append("file", wav, `${stemType}-seq.wav`);
      fd.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      const name = `${config.label} Sequence`;
      onPush(url, name, stemType, 3);
      clearGrid();
    } catch (err) { console.error("Render failed:", err); }
    finally { setIsRendering(false); }
  }, [grid, settings, roomCode, stemType, seqType, rows, config, onPush]);

  // Visible rows (limit for chromatic to viewport with scroll)
  const maxVisibleRows = seqType === "chromatic" ? 24 : rows.length;
  const visibleRows = rows.slice(0, maxVisibleRows);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>

      {/* Drum pads (only for drum type) */}
      {seqType === "drum" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {rows.map((row, i) => (
            <button key={i} onClick={() => tapRow(i)}
              style={{
                height: 56, borderRadius: 12, fontWeight: 600, fontSize: 11, cursor: "pointer",
                background: `${row.color}15`, border: `1px solid ${row.color}30`, color: row.color,
                transition: "transform 0.1s, opacity 0.1s",
              }}
              onMouseDown={e => { (e.target as HTMLElement).style.transform = "scale(0.94)"; }}
              onMouseUp={e => { (e.target as HTMLElement).style.transform = ""; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.transform = ""; }}
            >
              {row.label}
            </button>
          ))}
        </div>
      )}

      {/* Octave selector for chromatic */}
      {seqType === "chromatic" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>Octave</span>
          {Array.from({ length: octaveRange[1] - octaveRange[0] + 1 }, (_, i) => octaveRange[0] + i).map(o => (
            <button key={o} onClick={() => setOctave(o)} style={{
              padding: "4px 10px", borderRadius: 6, fontFamily: "var(--fm)", fontSize: 11, cursor: "pointer",
              background: octave === o ? `${config.color}25` : "transparent",
              border: `1px solid ${octave === o ? `${config.color}50` : "rgba(232,226,217,0.06)"}`,
              color: octave === o ? config.color : "#5E584E",
            }}>
              {o}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E" }}>
            {settings.key} {settings.scale}
          </span>
        </div>
      )}

      {/* Step Sequencer Grid */}
      <div style={{ width: "100%", overflowY: seqType === "chromatic" ? "auto" : "visible", maxHeight: seqType === "chromatic" ? 400 : "none" }}>
        {/* Beat markers */}
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(16, 1fr)", gap: 2, marginBottom: 4, position: "sticky", top: 0, background: "#141311", zIndex: 1 }}>
          <span />
          {Array.from({ length: STEPS }).map((_, si) => (
            <div key={si} style={{
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--fm)", height: 16,
              fontSize: si % 4 === 0 ? 10 : 7, fontWeight: si % 4 === 0 ? 700 : 400,
              color: si % 4 === 0 ? "#A09888" : "#5E584E",
            }}>
              {si % 4 === 0 ? si / 4 + 1 : "·"}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {visibleRows.map((row, ri) => {
          const rowColor = row.color || config.color;
          const isInScale = seqType === "chromatic" ? scaleNotes.has(row.note) : true;
          const labelOpacity = isInScale ? 1 : 0.4;

          return (
            <div key={`${row.label}-${ri}`} style={{ display: "grid", gridTemplateColumns: "56px repeat(16, 1fr)", gap: 2, marginBottom: 2 }}>
              <span
                onClick={() => tapRow(ri)}
                style={{
                  fontSize: 9, textAlign: "right", paddingRight: 8, fontFamily: "var(--fm)", color: rowColor,
                  lineHeight: seqType === "chromatic" ? "24px" : "32px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  cursor: "pointer", opacity: labelOpacity,
                }}
              >
                {row.label}
              </span>
              {Array.from({ length: STEPS }).map((_, si) => {
                const on = grid[ri]?.[si];
                const cur = currentStep === si;
                const cellH = seqType === "chromatic" ? 24 : 32;
                return (
                  <button key={si} onClick={() => toggleStep(ri, si)} style={{
                    height: cellH, borderRadius: 3, cursor: "pointer", border: "none", width: "100%",
                    transition: "background 0.08s",
                    outline: cur ? "2px solid rgba(207,162,75,0.4)" : "none", outlineOffset: -2,
                    background: on
                      ? `${rowColor}50`
                      : !isInScale
                        ? "#1E1C19"
                        : cur
                          ? "rgba(232,226,217,0.06)"
                          : "#28261F",
                    boxShadow: on ? `inset 0 0 0 1px ${rowColor}70` : "none",
                    opacity: isInScale ? 1 : 0.6,
                  }} />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Sample slot add button */}
      {seqType === "sample-slot" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ color: "#5E584E", fontSize: 13, fontFamily: "var(--fm)", marginBottom: 12 }}>
            Use Generate mode to create sounds, then sequence them here
          </p>
          <p style={{ color: "#5E584E", fontSize: 11, fontFamily: "var(--fm)" }}>
            Sample slot sequencer — coming soon
          </p>
        </div>
      )}

      <CommitBar
        settings={settings}
        hasContent={hasSteps}
        isCommitting={isRendering}
        onClear={clearGrid}
        onCommit={renderAndPush}
      />
    </div>
  );
}
