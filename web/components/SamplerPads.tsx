"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

const KIT = [
  { name: "Kick", color: "#C46B5A" },
  { name: "Snare", color: "#B8805A" },
  { name: "CH", color: "#6B8FC4" },
  { name: "OH", color: "#7BAF6B" },
  { name: "Clap", color: "#C49B6B" },
  { name: "Rim", color: "#CFA24B" },
  { name: "Lo Tom", color: "#7B9E84" },
  { name: "Hi Tom", color: "#9B8EC4" },
] as const;

const STEPS = 16;
const PAD_COUNT = KIT.length;

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

function triggerSynth(synth: Tone.ToneAudioNode, index: number, time?: number) {
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

export default function SamplerPads({ settings, roomCode, localDestination, onPush }: Props) {
  const [grid, setGrid] = useState<boolean[][]>(Array(PAD_COUNT).fill(null).map(() => Array(STEPS).fill(false)));
  const [isRendering, setIsRendering] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const synthsRef = useRef<Tone.ToneAudioNode[]>([]);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    const synths = KIT.map((_, i) => createDrumSynth(i, localDestination));
    synthsRef.current = synths;
    const seq = new Tone.Sequence(
      (time, step) => {
        const g = gridRef.current;
        for (let pad = 0; pad < PAD_COUNT; pad++) {
          if (g[pad][step % STEPS]) triggerSynth(synths[pad], pad, time);
        }
        Tone.getDraw().schedule(() => setCurrentStep(step % STEPS), time);
      },
      Array.from({ length: STEPS }, (_, i) => i), "16n"
    );
    seq.loop = true;
    seq.start(0);
    return () => { seq.stop(); seq.dispose(); synths.forEach((s) => s.dispose()); };
  }, [localDestination]);

  const toggleStep = (pi: number, si: number) => {
    setGrid(prev => { const n = prev.map(r => [...r]); n[pi][si] = !n[pi][si]; return n; });
  };
  const tapPad = async (pi: number) => { await Tone.start(); triggerSynth(synthsRef.current[pi], pi); };
  const clearGrid = () => setGrid(Array(PAD_COUNT).fill(null).map(() => Array(STEPS).fill(false)));

  const renderAndPush = useCallback(async () => {
    setIsRendering(true);
    try {
      const dur = (settings.barCount * 4 * 60) / settings.bpm;
      const buffer = await Tone.Offline(({ transport }) => {
        transport.bpm.value = settings.bpm;
        const os = KIT.map((_, i) => createDrumSynth(i, Tone.getDestination()));
        const seq = new Tone.Sequence((time, step) => {
          for (let p = 0; p < PAD_COUNT; p++) { if (grid[p][step % STEPS]) triggerSynth(os[p], p, time); }
        }, Array.from({ length: STEPS }, (_, i) => i), "16n");
        seq.loop = true; seq.start(0); transport.start();
      }, dur, 1, 22050);
      const wav = bufferToWav(buffer);
      const fd = new FormData();
      fd.append("file", wav, "groove.wav");
      fd.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      onPush(url, "909 Groove", "drums");
      clearGrid();
    } catch (err) { console.error("Render failed:", err); }
    finally { setIsRendering(false); }
  }, [grid, settings, roomCode, onPush]);

  const hasSteps = grid.some(r => r.some(Boolean));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>

      {/* ─── PADS 4x2 ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {KIT.map((drum, i) => (
          <button key={i} onClick={() => tapPad(i)}
            style={{
              height: 64, borderRadius: 12, fontWeight: 600, fontSize: 12, cursor: "pointer",
              background: `${drum.color}15`, border: `1px solid ${drum.color}30`, color: drum.color,
              transition: "transform 0.1s, opacity 0.1s",
            }}
            onMouseDown={e => { (e.target as HTMLElement).style.transform = "scale(0.94)"; (e.target as HTMLElement).style.opacity = "0.7"; }}
            onMouseUp={e => { (e.target as HTMLElement).style.transform = ""; (e.target as HTMLElement).style.opacity = ""; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.transform = ""; (e.target as HTMLElement).style.opacity = ""; }}
          >
            {drum.name}
          </button>
        ))}
      </div>

      {/* ─── STEP SEQUENCER ─── */}
      <div style={{ width: "100%" }}>
        {/* Beat markers */}
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(16, 1fr)", gap: 2, marginBottom: 4 }}>
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

        {/* Grid */}
        {KIT.map((drum, pi) => (
          <div key={pi} style={{ display: "grid", gridTemplateColumns: "56px repeat(16, 1fr)", gap: 2, marginBottom: 2 }}>
            <span style={{
              fontSize: 10, textAlign: "right", paddingRight: 8, fontFamily: "var(--fm)", color: drum.color,
              lineHeight: "32px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {drum.name}
            </span>
            {Array.from({ length: STEPS }).map((_, si) => {
              const on = grid[pi][si];
              const cur = currentStep === si;
              return (
                <button key={si} onClick={() => toggleStep(pi, si)} style={{
                  height: 32, borderRadius: 4, cursor: "pointer", border: "none", width: "100%",
                  transition: "background 0.08s",
                  outline: cur ? "2px solid rgba(207,162,75,0.4)" : "none", outlineOffset: -2,
                  background: on ? `${drum.color}50` : cur ? "rgba(232,226,217,0.06)" : "#28261F",
                  boxShadow: on ? `inset 0 0 0 1px ${drum.color}70` : "none",
                }} />
              );
            })}
          </div>
        ))}
      </div>

      {/* ─── BOTTOM: commit bar ─── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        borderTop: "1px solid rgba(232,226,217,0.06)", paddingTop: 12,
      }}>
        <span style={{ color: "#5E584E", fontSize: 11, fontFamily: "var(--fm)" }}>
          {settings.bpm} BPM · {settings.barCount} bars
        </span>
        <div style={{ flex: 1 }} />
        {hasSteps && (
          <button onClick={clearGrid} style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "transparent", border: "1px solid rgba(232,226,217,0.06)", color: "#5E584E",
          }}>
            Clear
          </button>
        )}
        <button onClick={renderAndPush} disabled={isRendering || !hasSteps} style={{
          padding: "8px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700,
          cursor: hasSteps ? "pointer" : "default", border: "none",
          opacity: hasSteps ? 1 : 0.3, background: "#7B9E84", color: "#0D0C0A",
        }}>
          {isRendering ? "Committing..." : "⬆ Commit"}
        </button>
      </div>
    </div>
  );
}

function bufferToWav(buffer: Tone.ToneAudioBuffer): Blob {
  const nc = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const wb = new ArrayBuffer(44 + len * nc * 2), v = new DataView(wb);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + len * nc * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true);
  v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, len * nc * 2, true);
  const ch: Float32Array[] = []; for (let c = 0; c < nc; c++) ch.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) {
    const s = Math.max(-1, Math.min(1, ch[c][i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
  }
  return new Blob([wb], { type: "audio/wav" });
}
