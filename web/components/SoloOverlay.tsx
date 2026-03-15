"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { getAudioEngine } from "@/lib/audio-engine";
import { SoloRequest, RoomUser } from "@/lib/types";
import * as Tone from "tone";

// ─── X Buzzer — synthesized "ERRR" sound ──────────────────────────────────────
function playBuzzer() {
  const now = Tone.now();
  // Massive low square wave
  const osc = new Tone.Oscillator({ type: "square", frequency: 65 }).toDestination();
  osc.volume.value = -2;
  osc.start(now).stop(now + 0.9);
  // Detuned sawtooth for nasty beating
  const osc2 = new Tone.Oscillator({ type: "sawtooth", frequency: 69 }).toDestination();
  osc2.volume.value = -4;
  osc2.start(now).stop(now + 0.9);
  // Third osc — high distorted overtone
  const osc3 = new Tone.Oscillator({ type: "square", frequency: 131 }).toDestination();
  osc3.volume.value = -6;
  osc3.start(now).stop(now + 0.7);
  // Fourth — dissonant tritone
  const osc4 = new Tone.Oscillator({ type: "sawtooth", frequency: 92 }).toDestination();
  osc4.volume.value = -6;
  osc4.start(now).stop(now + 0.8);
  // Fat noise blast
  const noise = new Tone.Noise("white").toDestination();
  noise.volume.value = -6;
  noise.start(now).stop(now + 0.25);
  // Brown noise sustain
  const noise2 = new Tone.Noise("brown").toDestination();
  noise2.volume.value = -4;
  noise2.start(now).stop(now + 0.7);
  // Cleanup
  setTimeout(() => {
    osc.dispose();
    osc2.dispose();
    osc3.dispose();
    osc4.dispose();
    noise.dispose();
    noise2.dispose();
  }, 1500);
}

// ─── Pixel art constants — larger canvas ─────────────────────────────────────
const S = 4;
const VW = 280;
const VH = 200;
const GY = 150;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, w * S, h * S);
}

// ─── QWERTY mapping (same as LiveMode) ────────────────────────────────────────
function keyToNote(key: string, octave: number): string | null {
  const lower: Record<string, string> = {
    z: "C", s: "C#", x: "D", d: "D#", c: "E", v: "F",
    g: "F#", b: "G", h: "G#", n: "A", j: "A#", m: "B",
  };
  const upper: Record<string, string> = {
    q: "C", "2": "C#", w: "D", "3": "D#", e: "E", r: "F",
    "5": "F#", t: "G", "6": "G#", y: "A", "7": "A#", u: "B",
  };
  const k = key.toLowerCase();
  if (lower[k]) return `${lower[k]}${octave}`;
  if (upper[k]) return `${upper[k]}${octave + 1}`;
  return null;
}

// ─── Note particles ───────────────────────────────────────────────────────────
interface NoteParticle {
  x: number;
  y: number;
  life: number;
  symbol: string;
}

// ─── Applause particle ───────────────────────────────────────────────────────
interface ApplauseParticle {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

// ─── Sax Player drawing (scaled up ~2.5x) ────────────────────────────────────
function drawSaxPlayer(
  ctx: CanvasRenderingContext2D,
  frame: number,
  notesActive: boolean,
  particles: NoteParticle[],
) {
  const cx = VW / 2;
  const sway = Math.sin(frame * 0.04) * 2.5;

  // ─── Stage platform (raised, with depth) ───
  const stageTop = GY - 2;
  const stageH = VH - GY + 2;

  // Stage front face (darker, gives depth)
  px(ctx, 0, GY + 3, VW, stageH - 3, "#12100D");
  // Stage top surface — wooden planks
  px(ctx, 0, stageTop, VW, 5, "#2A2218");
  // Plank lines
  for (let plankX = 0; plankX < VW; plankX += 18) {
    px(ctx, plankX, stageTop, 1, 5, "#1E1A14");
  }
  // Plank grain detail
  for (let plankX = 5; plankX < VW; plankX += 18) {
    px(ctx, plankX, stageTop + 1, 6, 1, "#322A1E");
    px(ctx, plankX + 8, stageTop + 3, 4, 1, "#322A1E");
  }
  // Stage edge highlight (front lip)
  px(ctx, 0, stageTop, VW, 1, "#3D3428");
  // Stage edge shadow
  px(ctx, 0, stageTop + 5, VW, 1, "#0A0908");

  // Stage front trim / molding
  px(ctx, 0, stageTop + 6, VW, 2, "#1A1610");
  px(ctx, 0, stageTop + 8, VW, 1, "#222");

  // ─── Floor lights along stage edge ───
  for (let i = 0; i < 9; i++) {
    const lx = 16 + i * 30;
    const pulse = Math.sin(frame * 0.06 + i * 0.8) * 0.5 + 0.5;
    const colors = ["#CFA24B", "#C46B5A", "#7B9E84", "#4B7FCF"];
    const c = colors[i % colors.length];
    // Glow
    const glowR = 4 + pulse * 2;
    for (let gr = glowR; gr > 0; gr -= 1) {
      const a = 0.04 * (1 - gr / glowR) * pulse;
      ctx.fillStyle = `${c}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
      ctx.beginPath();
      ctx.ellipse(lx * S, (stageTop + 6) * S, gr * S, (gr * 0.4) * S, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bulb
    px(ctx, lx - 1, stageTop + 5, 2, 1, c);
  }

  // ─── Curtains on sides ───
  // Left curtain
  for (let cy = 0; cy < GY + 10; cy++) {
    const fold = Math.sin(cy * 0.15 + frame * 0.01) * 2;
    const w = 18 + fold;
    const shade = cy < 20 ? 0.9 : 1;
    const r = Math.round(140 * shade), g = Math.round(30 * shade), b = Math.round(35 * shade);
    px(ctx, 0, cy, w, 1, `rgb(${r},${g},${b})`);
    // Fold highlight
    if (Math.sin(cy * 0.15 + frame * 0.01) > 0.5) {
      px(ctx, w - 2, cy, 1, 1, `rgb(${r + 30},${g + 10},${b + 10})`);
    }
    // Dark fold
    px(ctx, w, cy, 1, 1, `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 10)},${Math.max(0, b - 10)})`);
  }
  // Right curtain
  for (let cy = 0; cy < GY + 10; cy++) {
    const fold = Math.sin(cy * 0.15 + frame * 0.01 + 2) * 2;
    const w = 18 + fold;
    const shade = cy < 20 ? 0.9 : 1;
    const r = Math.round(140 * shade), g = Math.round(30 * shade), b = Math.round(35 * shade);
    px(ctx, VW - w, cy, w, 1, `rgb(${r},${g},${b})`);
    // Fold highlight
    if (Math.sin(cy * 0.15 + frame * 0.01 + 2) > 0.5) {
      px(ctx, VW - w + 1, cy, 1, 1, `rgb(${r + 30},${g + 10},${b + 10})`);
    }
    // Dark fold
    px(ctx, VW - w - 1, cy, 1, 1, `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 10)},${Math.max(0, b - 10)})`);
  }
  // Curtain valance (top drape)
  for (let vx = 18; vx < VW - 18; vx++) {
    const droop = Math.sin((vx - 18) / (VW - 36) * Math.PI) * 8;
    px(ctx, vx, 0, 1, 4 + droop, "#8C1E23");
    if (droop > 4) px(ctx, vx, 3 + droop, 1, 1, "#6B1518"); // shadow under drape
  }
  // Gold fringe along valance
  for (let vx = 20; vx < VW - 20; vx += 2) {
    const droop = Math.sin((vx - 18) / (VW - 36) * Math.PI) * 8;
    const fringeY = 4 + droop;
    px(ctx, vx, fringeY, 1, 2, "#CFA24B");
    if (Math.sin(frame * 0.05 + vx * 0.3) > 0.3) {
      px(ctx, vx, fringeY, 1, 1, "#E8C96E"); // shimmer
    }
  }

  // ─── Spotlight (on top of stage) ───
  const spotAlpha = 0.1 + Math.sin(frame * 0.03) * 0.03;
  for (let r = 90; r > 0; r -= 2) {
    const a = spotAlpha * (1 - r / 90);
    ctx.fillStyle = `rgba(207,162,75,${a})`;
    ctx.beginPath();
    ctx.ellipse((cx + sway) * S, (stageTop + 2) * S, r * S, (r * 0.5) * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Spotlight cone from above
  ctx.save();
  ctx.globalAlpha = 0.03 + Math.sin(frame * 0.02) * 0.01;
  ctx.fillStyle = "#CFA24B";
  ctx.beginPath();
  ctx.moveTo((cx + sway - 6) * S, 0);
  ctx.lineTo((cx + sway + 6) * S, 0);
  ctx.lineTo((cx + sway + 70) * S, stageTop * S);
  ctx.lineTo((cx + sway - 70) * S, stageTop * S);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ─── Audience silhouettes in front of stage ───
  const audienceY = stageTop + 12;
  for (let i = 0; i < 14; i++) {
    const ax = 10 + i * 20 + Math.sin(frame * 0.04 + i * 1.2) * 1.5;
    const headR = 3 + (i % 2);
    const bodyH = 6 + (i % 3);
    // Head
    px(ctx, ax - headR, audienceY, headR * 2, headR * 2, "#0D0B09");
    // Shoulders
    px(ctx, ax - headR - 2, audienceY + headR * 2, headR * 2 + 4, bodyH, "#0D0B09");
  }

  const bx = Math.round(cx + sway);
  const by = GY - 72;

  // Shadow on stage surface
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(bx * S, (stageTop + 3) * S, 20 * S, 3 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — thicker, longer
  px(ctx, bx - 5, by + 50, 4, 22, "#1A1714");
  px(ctx, bx + 2, by + 50, 4, 22, "#1A1714");
  // Shoes
  px(ctx, bx - 7, by + 70, 6, 2, "#0A0908");
  px(ctx, bx + 2, by + 70, 6, 2, "#0A0908");

  // Body — larger torso
  px(ctx, bx - 6, by + 22, 13, 28, "#2D4A6B");
  // Shirt highlight
  px(ctx, bx - 3, by + 26, 5, 8, "#3D5A7B");
  // Collar
  px(ctx, bx - 3, by + 21, 7, 2, "#1E3450");

  // Head — bigger
  px(ctx, bx - 5, by + 7, 11, 14, "#D4A070");
  // Chin shadow
  px(ctx, bx - 4, by + 18, 9, 2, "#C09060");
  // Hair
  px(ctx, bx - 5, by + 4, 11, 5, "#1A0E08");
  px(ctx, bx - 6, by + 5, 1, 6, "#1A0E08");
  px(ctx, bx + 6, by + 5, 1, 6, "#1A0E08");
  // Sunglasses
  px(ctx, bx - 4, by + 11, 4, 2, "#0A0908");
  px(ctx, bx + 1, by + 11, 4, 2, "#0A0908");
  px(ctx, bx, by + 11, 1, 1, "#1A1714"); // bridge
  // Sunglasses glint
  px(ctx, bx - 3, by + 11, 1, 1, "#333");
  px(ctx, bx + 2, by + 11, 1, 1, "#333");
  // Mouth at sax mouthpiece
  px(ctx, bx + 2, by + 16, 3, 1, "#8B6050");

  // Left arm (behind sax, holding body)
  px(ctx, bx - 9, by + 26, 4, 12, "#D4A070");
  px(ctx, bx - 9, by + 36, 4, 3, "#C09060");
  // Right arm (fingers on keys)
  px(ctx, bx + 8, by + 24, 4, 14, "#D4A070");
  px(ctx, bx + 8, by + 36, 4, 3, "#C09060");

  // ─── SAX — much larger S-curve ───
  const saxColor = "#CFA24B";
  const saxDark = "#A6832A";
  const saxLight = "#E0B85C";

  // Mouthpiece
  px(ctx, bx + 3, by + 14, 2, 4, saxDark);
  px(ctx, bx + 4, by + 13, 1, 2, "#8B6A30");

  // Neck (crook) — angled down
  px(ctx, bx + 4, by + 18, 3, 8, saxColor);
  px(ctx, bx + 5, by + 18, 1, 8, saxLight);

  // Body tube — wide
  px(ctx, bx + 5, by + 26, 5, 16, saxColor);
  px(ctx, bx + 6, by + 26, 2, 16, saxLight);
  px(ctx, bx + 4, by + 28, 1, 12, saxDark);

  // Bow (bottom curve)
  px(ctx, bx + 3, by + 42, 7, 4, saxColor);
  px(ctx, bx + 2, by + 44, 9, 3, saxColor);
  px(ctx, bx + 3, by + 44, 5, 2, saxLight);

  // Bell (flared opening)
  px(ctx, bx + 1, by + 47, 11, 4, saxColor);
  px(ctx, bx - 1, by + 50, 15, 3, saxColor);
  px(ctx, bx - 2, by + 52, 17, 3, saxColor);
  px(ctx, bx - 1, by + 51, 13, 2, saxLight);
  px(ctx, bx - 2, by + 54, 17, 1, saxDark);

  // Bell rim highlight
  px(ctx, bx, by + 53, 12, 1, "#E8C96E");

  // Sax keys (animated when playing)
  const fingerOffset = notesActive ? Math.floor(frame * 0.3) % 3 : 0;
  const keyYs = [28, 31, 34, 37, 40];
  for (let i = 0; i < keyYs.length; i++) {
    const pressed = notesActive && (fingerOffset + i) % 3 === 0;
    px(ctx, bx + 10, by + keyYs[i], 2, 2, pressed ? "#FFD700" : saxDark);
    if (pressed) px(ctx, bx + 10, by + keyYs[i], 2, 2, "#FFE44D");
  }
  // Side keys
  for (let i = 0; i < 3; i++) {
    const pressed = notesActive && (fingerOffset + i + 1) % 3 === 0;
    px(ctx, bx + 3, by + 28 + i * 4, 1, 2, pressed ? "#FFD700" : saxDark);
  }

  // Note particles
  for (const p of particles) {
    const alpha = p.life / 60;
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(207,162,75,${alpha})`;
    const noteSymbols = ["\u266A", "\u266B", "\u266C"];
    ctx.font = `${(14 + (1 - alpha) * 10) * S}px serif`;
    ctx.fillText(
      noteSymbols[Math.abs(Math.round(p.x)) % 3],
      p.x * S,
      p.y * S,
    );
  }

  // Stars in background
  const starSeed = [
    [30, 15], [70, 25], [110, 10], [180, 20], [220, 30], [250, 12],
    [45, 40], [130, 35], [200, 45], [160, 8], [90, 50], [240, 42],
  ];
  for (const [sx, sy] of starSeed) {
    const twinkle = Math.sin(frame * 0.05 + sx * 0.1) > 0.3;
    if (twinkle) px(ctx, sx, sy, 1, 1, "rgba(232,226,217,0.4)");
  }
}

function drawScanlines(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0,0,0,0.03)";
  for (let y = 0; y < VH * S; y += 3) {
    ctx.fillRect(0, y, VW * S, 1);
  }
}

// ─── Piano keyboard constants ────────────────────────────────────────────────
const WHITE_KEYS = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_KEY_INFO: { name: string; whiteIndex: number }[] = [
  { name: "C#", whiteIndex: 0 },
  { name: "D#", whiteIndex: 1 },
  { name: "F#", whiteIndex: 3 },
  { name: "G#", whiteIndex: 4 },
  { name: "A#", whiteIndex: 5 },
];
const LOWER_MAP: Record<string, string> = { z: "C", x: "D", c: "E", v: "F", b: "G", n: "A", m: "B" };
const UPPER_MAP: Record<string, string> = { q: "C", w: "D", e: "E", r: "F", t: "G", y: "A", u: "B" };
const LOWER_BLACK: Record<string, string> = { s: "C#", d: "D#", g: "F#", h: "G#", j: "A#" };
const UPPER_BLACK: Record<string, string> = { "2": "C#", "3": "D#", "5": "F#", "6": "G#", "7": "A#" };

const OCTAVE_RANGE = [2, 3, 4, 5, 6]; // 5 octaves shown visually
const WHITE_KEY_W = 28;
const BLACK_KEY_W = 18;
const WHITE_KEY_H = 90;
const BLACK_KEY_H = 56;

interface SoloOverlayProps {
  solo: SoloRequest;
  isSoloist: boolean;
  users: RoomUser[];
  userId: string;
  onApplause: () => void;
  onX: () => void;
}

export default function SoloOverlay({ solo, isSoloist, users, userId, onApplause, onX }: SoloOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [octave] = useState(4);
  const particlesRef = useRef<NoteParticle[]>([]);
  const applauseParticlesRef = useRef<ApplauseParticle[]>([]);
  const notesActiveRef = useRef(false);
  const activeNotesRef = useRef<Set<string>>(new Set());
  const prevApplauseCountRef = useRef(solo.applause.length);
  const prevXCountRef = useRef(solo.xVotes.length);

  // Play buzzer for everyone when X count increases
  useEffect(() => {
    const newCount = solo.xVotes.length;
    if (newCount > prevXCountRef.current) {
      playBuzzer();
    }
    prevXCountRef.current = newCount;
  }, [solo.xVotes.length]);

  // Spawn applause particles for everyone when applause count changes
  useEffect(() => {
    const newCount = solo.applause.length;
    const diff = newCount - prevApplauseCountRef.current;
    if (diff > 0) {
      for (let i = 0; i < diff * 3; i++) {
        applauseParticlesRef.current.push({
          x: Math.random() * 100 - 50,
          y: 0,
          life: 70 + Math.random() * 30,
          maxLife: 100,
        });
      }
    }
    prevApplauseCountRef.current = newCount;
  }, [solo.applause.length]);

  // Listen for remote notes (for audience visualization)
  useEffect(() => {
    if (isSoloist) return;
    const socket = getSocket();
    const onNoteOn = (note: string) => {
      setActiveNotes((prev) => new Set(prev).add(note));
      notesActiveRef.current = true;
      particlesRef.current.push({
        x: VW / 2 + (Math.random() - 0.5) * 60,
        y: GY - 30,
        life: 60,
        symbol: "\u266A",
      });
    };
    const onNoteOff = (note: string) => {
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        if (next.size === 0) notesActiveRef.current = false;
        return next;
      });
    };
    socket.on("solo:remote-note-on", onNoteOn);
    socket.on("solo:remote-note-off", onNoteOff);
    return () => {
      socket.off("solo:remote-note-on", onNoteOn);
      socket.off("solo:remote-note-off", onNoteOff);
    };
  }, [isSoloist]);

  // Soloist keyboard handler
  useEffect(() => {
    if (!isSoloist) return;
    const engine = getAudioEngine();
    const synth = engine.getSoloSynth();
    const socket = getSocket();

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const note = keyToNote(e.key, octave);
      if (!note || activeNotesRef.current.has(note)) return;
      activeNotesRef.current.add(note);
      setActiveNotes(new Set(activeNotesRef.current));
      notesActiveRef.current = true;
      synth.triggerAttack(note);
      socket.emit("solo:note-on", note);
      particlesRef.current.push({
        x: VW / 2 + (Math.random() - 0.5) * 60,
        y: GY - 30,
        life: 60,
        symbol: "\u266A",
      });
    };
    const onUp = (e: KeyboardEvent) => {
      const note = keyToNote(e.key, octave);
      if (!note || !activeNotesRef.current.has(note)) return;
      activeNotesRef.current.delete(note);
      setActiveNotes(new Set(activeNotesRef.current));
      if (activeNotesRef.current.size === 0) notesActiveRef.current = false;
      synth.triggerRelease();
      socket.emit("solo:note-off", note);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [isSoloist, octave]);

  // Engage/disengage solo mode audio
  useEffect(() => {
    const engine = getAudioEngine();
    if (solo.status === "active" || solo.status === "ending") {
      engine.engageSoloMode();
    }
    return () => {
      engine.disengageSoloMode();
      engine.disposeSoloSynth();
    };
  }, [solo.status]);

  // Pixel art animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      px(ctx, 0, 0, VW, VH, "#0A0908");
      drawSaxPlayer(ctx, frame, notesActiveRef.current, particlesRef.current);
      drawScanlines(ctx);

      // Update particles
      particlesRef.current = particlesRef.current
        .map((p) => ({ ...p, y: p.y - 0.5, x: p.x + Math.sin(frame * 0.1 + p.x) * 0.4, life: p.life - 1 }))
        .filter((p) => p.life > 0);

      frame++;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Applause animation — runs for everyone
  const [applauseParticles, setApplauseParticles] = useState<ApplauseParticle[]>([]);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      applauseParticlesRef.current = applauseParticlesRef.current
        .map((p) => ({ ...p, y: p.y - 2, life: p.life - 1 }))
        .filter((p) => p.life > 0);
      setApplauseParticles([...applauseParticlesRef.current]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const isApplauding = solo.applause.includes(userId);
  const hasXd = solo.xVotes.includes(userId);

  // The two playable octaves from QWERTY
  const playableOctaveLower = octave;
  const playableOctaveUpper = octave + 1;

  const totalWhiteKeys = OCTAVE_RANGE.length * 7;
  const keyboardW = totalWhiteKeys * (WHITE_KEY_W + 1);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(10,9,8,0.95)", backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column", alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Status bar */}
      {solo.status === "ending" && (
        <div style={{
          position: "absolute", top: 16, zIndex: 10,
          fontFamily: "var(--fm)", fontSize: 14, color: "#C46B5A",
          letterSpacing: 2, textTransform: "uppercase", fontWeight: 600,
          padding: "6px 20px", borderRadius: 8,
          background: "rgba(196,107,90,0.1)", border: "1px solid rgba(196,107,90,0.2)",
        }}>
          Solo ending...
        </div>
      )}

      {/* Top section: title + reactions info */}
      <div style={{
        paddingTop: 20, paddingBottom: 8,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0,
      }}>
        <div style={{
          fontFamily: "var(--fd)", fontSize: 22, fontStyle: "italic",
          color: "#CFA24B", letterSpacing: -0.5,
        }}>
          {solo.soloistName}&apos;s Solo
        </div>
        {/* Vote/applause counts */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", minHeight: 20 }}>
          {solo.applause.length > 0 && (
            <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#7B9E84" }}>
              👏 {solo.applause.length}
            </span>
          )}
          {solo.xVotes.length > 0 && (
            <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#C46B5A" }}>
              ✕ {solo.xVotes.length}
            </span>
          )}
        </div>
      </div>

      {/* Canvas + overlays — fills middle area */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", minHeight: 0, padding: "0 40px", position: "relative",
      }}>
        <canvas
          ref={canvasRef}
          width={VW * S}
          height={VH * S}
          style={{
            imageRendering: "pixelated",
            width: "100%",
            maxWidth: VW * S,
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 8,
            border: "1px solid rgba(207,162,75,0.15)",
          }}
        />

        {/* ─── X votes overlay — centered on canvas ─── */}
        {solo.xVotes.length > 0 && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            padding: "12px 24px", borderRadius: 12, zIndex: 5,
            background: "rgba(196,107,90,0.15)", border: "1px solid rgba(196,107,90,0.35)",
            backdropFilter: "blur(6px)",
          }}>
            <div style={{
              fontFamily: "var(--fm)", fontSize: 18, fontWeight: 700,
              color: "#C46B5A", letterSpacing: 1,
            }}>
              ✕ {solo.xVotes.length} / {users.length - 1}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {solo.xVotes.map((uid) => {
                const u = users.find((u) => u.id === uid);
                return (
                  <span key={uid} style={{
                    width: 30, height: 30, borderRadius: "50%",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(196,107,90,0.3)", border: "2px solid rgba(196,107,90,0.6)",
                    fontSize: 12, fontWeight: 700, color: "#E8E2D9", position: "relative",
                  }}>
                    {u?.name?.charAt(0) || "?"}
                    <span style={{
                      position: "absolute", inset: -2, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 22, color: "rgba(196,107,90,0.8)", fontWeight: 900,
                    }}>✕</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Floating applause emojis — over canvas for everyone ─── */}
        {applauseParticles.map((p, i) => (
          <span key={`ap-${i}`} style={{
            position: "absolute",
            left: `calc(50% + ${p.x}px)`,
            bottom: `${20 + (p.maxLife - p.life) * 4}px`,
            fontSize: 24,
            opacity: p.life / p.maxLife,
            pointerEvents: "none",
          }}>
            👏
          </span>
        ))}

        {/* ─── Applause count — bottom of canvas ─── */}
        {solo.applause.length > 0 && (
          <div style={{
            position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            fontFamily: "var(--fm)", fontSize: 13, color: "#7B9E84", fontWeight: 600,
            padding: "4px 14px", borderRadius: 8,
            background: "rgba(123,158,132,0.12)", border: "1px solid rgba(123,158,132,0.25)",
          }}>
            👏 {solo.applause.length} applauding
          </div>
        )}
      </div>

      {/* Audience reaction buttons — below canvas */}
      {!isSoloist && (
        <div style={{
          display: "flex", gap: 12, padding: "8px 0 12px", flexShrink: 0,
        }}>
          <button onClick={onApplause} style={{
            width: 56, height: 56, borderRadius: 14, fontSize: 24, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isApplauding ? "rgba(123,158,132,0.25)" : "rgba(232,226,217,0.06)",
            border: `2px solid ${isApplauding ? "rgba(123,158,132,0.5)" : "rgba(232,226,217,0.1)"}`,
            transition: "all 0.15s",
          }}>👏</button>
          <button onClick={onX} disabled={hasXd} style={{
            width: 56, height: 56, borderRadius: 14, fontSize: 24,
            cursor: hasXd ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: hasXd ? "rgba(196,107,90,0.25)" : "rgba(232,226,217,0.06)",
            border: `2px solid ${hasXd ? "rgba(196,107,90,0.5)" : "rgba(232,226,217,0.1)"}`,
            opacity: hasXd ? 0.6 : 1, transition: "all 0.15s",
          }}>❌</button>
        </div>
      )}

      {/* ─── Multi-octave keyboard (soloist) ─── */}
      {isSoloist && (
        <div style={{
          flexShrink: 0, paddingBottom: 16, paddingTop: 8,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{
            fontFamily: "var(--fm)", fontSize: 10, color: "#5E584E",
            textAlign: "center", marginBottom: 6, letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            Z-M lower octave · Q-U upper octave
          </div>
          <div style={{
            overflowX: "auto", maxWidth: "100vw", padding: "0 16px",
          }}>
            <div style={{ display: "flex", position: "relative", height: WHITE_KEY_H }}>
              {OCTAVE_RANGE.map((oct, octIdx) => (
                WHITE_KEYS.map((noteName, keyIdx) => {
                  const fullNote = `${noteName}${oct}`;
                  const isActive = activeNotes.has(fullNote);
                  const isPlayable = oct === playableOctaveLower || oct === playableOctaveUpper;
                  const globalIdx = octIdx * 7 + keyIdx;

                  // Key labels for playable octaves
                  let label = "";
                  if (oct === playableOctaveLower) {
                    const entry = Object.entries(LOWER_MAP).find(([, n]) => n === noteName);
                    if (entry) label = entry[0].toUpperCase();
                  } else if (oct === playableOctaveUpper) {
                    const entry = Object.entries(UPPER_MAP).find(([, n]) => n === noteName);
                    if (entry) label = entry[0].toUpperCase();
                  }

                  return (
                    <div key={`${oct}-${noteName}`} style={{
                      width: WHITE_KEY_W, height: WHITE_KEY_H,
                      borderRadius: "0 0 4px 4px",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "flex-end",
                      paddingBottom: 4,
                      background: isActive
                        ? "rgba(207,162,75,0.5)"
                        : isPlayable
                          ? "#E8E2D9"
                          : "#B8B2A9",
                      border: "1px solid rgba(0,0,0,0.12)",
                      marginRight: 1,
                      transition: "background 0.05s",
                      opacity: isPlayable ? 1 : 0.5,
                    }}>
                      {label && (
                        <span style={{ fontSize: 9, color: "#7A7060", fontFamily: "var(--fm)", fontWeight: 600 }}>{label}</span>
                      )}
                      {keyIdx === 0 && (
                        <span style={{ fontSize: 8, color: "#999", fontFamily: "var(--fm)" }}>C{oct}</span>
                      )}
                    </div>
                  );
                })
              ))}
              {/* Black keys across all octaves */}
              {OCTAVE_RANGE.map((oct, octIdx) => (
                BLACK_KEY_INFO.map(({ name, whiteIndex }) => {
                  const fullNote = `${name}${oct}`;
                  const isActive = activeNotes.has(fullNote);
                  const isPlayable = oct === playableOctaveLower || oct === playableOctaveUpper;
                  const xPos = octIdx * 7 * (WHITE_KEY_W + 1) + whiteIndex * (WHITE_KEY_W + 1) + WHITE_KEY_W - BLACK_KEY_W / 2 + 1;

                  let label = "";
                  if (oct === playableOctaveLower) {
                    const entry = Object.entries(LOWER_BLACK).find(([, n]) => n === name);
                    if (entry) label = entry[0].toUpperCase();
                  } else if (oct === playableOctaveUpper) {
                    const entry = Object.entries(UPPER_BLACK).find(([, n]) => n === name);
                    if (entry) label = entry[0].toUpperCase();
                  }

                  return (
                    <div key={`${oct}-${name}`} style={{
                      position: "absolute",
                      left: xPos,
                      top: 0,
                      width: BLACK_KEY_W, height: BLACK_KEY_H,
                      borderRadius: "0 0 3px 3px",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "flex-end",
                      paddingBottom: 4,
                      background: isActive
                        ? "rgba(207,162,75,0.7)"
                        : isPlayable
                          ? "#1A1714"
                          : "#2A2520",
                      border: "1px solid rgba(0,0,0,0.3)",
                      zIndex: 1,
                      transition: "background 0.05s",
                      opacity: isPlayable ? 1 : 0.4,
                    }}>
                      {label && (
                        <span style={{ fontSize: 7, color: "#888", fontFamily: "var(--fm)" }}>{label}</span>
                      )}
                    </div>
                  );
                })
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
