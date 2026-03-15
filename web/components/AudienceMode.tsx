"use client";
import { useEffect, useRef } from "react";
import { RoomUser, StemType, Track } from "@/lib/types";

// ─── Test data ───────────────────────────────────────────────────────────────
export const FAKE_AUDIENCE_USERS: (RoomUser & { stemType: StemType })[] = [
  { id: "fake-1", name: "Alex",  joinedAt: 0, stemType: "drums"  },
  { id: "fake-2", name: "Sam",   joinedAt: 0, stemType: "chords" },
  { id: "fake-3", name: "Maya",  joinedAt: 0, stemType: "vocals" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Musician {
  id: string;
  name: string;
  stemType: StemType;
  hairColor: string;
  clothesColor: string;
  cx: number;   // virtual-pixel center x
  fake: boolean;
}

interface Props {
  users: RoomUser[];
  tracks: Track[];
  bpm: number;
  useFakeUsers?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const S   = 4;           // 1 virtual pixel = 4 real pixels
const VW  = 220;
const VH  = 140;
const GY  = 88;          // stage floor top (virtual)

const HAIR_COLORS    = ["#1A0E08", "#8B4513", "#D4A020", "#4B7FBF", "#C46B5A", "#267326"];
const CLOTHES_COLORS = ["#7B9E84", "#C46B5A", "#CFA24B", "#4B7FCF", "#A855F7", "#EF4444"];

// ─── Pixel helper ─────────────────────────────────────────────────────────────
function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x * S, y * S, w * S, h * S);
}

// ─── Background ───────────────────────────────────────────────────────────────
function drawScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  stars: [number, number][],
) {
  // Sky
  px(ctx, 0, 0, VW, GY, "#0A0908");

  // Stars
  for (const [sx, sy] of stars) {
    const on = Math.sin(frame * 0.04 + sx * 0.7 + sy) > 0.6;
    px(ctx, sx, sy, 1, 1, on ? "#E8E2D9" : "#3A3530");
  }

  // Hanging stage lights (top bar)
  px(ctx, 0, 8, VW, 2, "#2A2420");
  for (let lx = 20; lx < VW; lx += 20) {
    px(ctx, lx, 8, 2, 5, "#3A3530");
    px(ctx, lx, 13, 4, 3, "#CFA24B");
  }

  // Left curtain
  for (let i = 0; i < 5; i++) {
    px(ctx, i * 2, 10, 2, GY - 10, i % 2 === 0 ? "#3D1515" : "#2A0E0E");
  }
  // Right curtain
  for (let i = 0; i < 5; i++) {
    px(ctx, VW - (i + 1) * 2, 10, 2, GY - 10, i % 2 === 0 ? "#3D1515" : "#2A0E0E");
  }

  // Stage floor planks
  for (let p = 0; p < 8; p++) {
    px(ctx, 0, GY + p * 2, VW, 2, p % 2 === 0 ? "#2A1E14" : "#221A12");
  }
  px(ctx, 0, GY, VW, 2, "#7A4A22"); // front edge highlight
  px(ctx, 0, GY + 1, VW, 1, "#5C3A1E");

  // Audience silhouettes
  const headXs = [12, 22, 34, 45, 57, 66, 78, 90, 100, 112, 122, 133, 145, 156, 167, 178, 190, 200, 210];
  for (let i = 0; i < headXs.length; i++) {
    const hx = headXs[i];
    const hy = 106 + (i % 3) * 4;
    const bob = Math.sin(frame * 0.03 + i) > 0.8 ? -1 : 0;
    px(ctx, hx,     hy + bob,     4, 4, "#141210");
    px(ctx, hx - 1, hy + 3 + bob, 6, 6, "#0F0E0C");
  }
}

// ─── Spotlight ────────────────────────────────────────────────────────────────
function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx * S, 10 * S);
  ctx.lineTo((cx - 14) * S, GY * S);
  ctx.lineTo((cx + 14) * S, GY * S);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Shared head/body ────────────────────────────────────────────────────────
function drawHead(
  ctx: CanvasRenderingContext2D,
  cx: number, headTop: number,
  hairC: string, bobY: number,
) {
  // Hair
  px(ctx, cx - 3, headTop + bobY - 1, 6, 2, hairC);
  px(ctx, cx - 3, headTop + bobY,     1, 4, hairC);
  px(ctx, cx + 2, headTop + bobY,     1, 4, hairC);
  // Face
  px(ctx, cx - 2, headTop + bobY,     4, 4, "#E8C49A");
  // Eyes
  px(ctx, cx - 1, headTop + bobY + 1, 1, 1, "#1A1612");
  px(ctx, cx + 1, headTop + bobY + 1, 1, 1, "#1A1612");
}

// ─── Drummer ──────────────────────────────────────────────────────────────────
function drawDrummer(
  ctx: CanvasRenderingContext2D,
  cx: number, frame: number,
  hairC: string, clothesC: string,
) {
  const beat   = Math.floor(frame / 7) % 2;
  const hihat  = Math.floor(frame / 4) % 2;
  const by     = GY - 1;

  // Drum kit
  px(ctx, cx - 5, by - 5, 8, 5, "#5C3A1E");  // bass drum body
  px(ctx, cx - 4, by - 4, 6, 3, "#7A4A22");
  px(ctx, cx - 3, by - 3, 4, 2, "#6B3B18");  // drum head
  px(ctx, cx + 2, by - 9, 5, 3, "#8A6A40");  // snare
  px(ctx, cx + 2, by - 10, 5, 1, "#A08050");
  // hi-hat cymbal
  px(ctx, cx - 9, by - 14 + hihat, 5, 1, "#CFA24B");
  px(ctx, cx - 7, by - 13, 1, 5, "#8A8070"); // stand
  // crash cymbal
  px(ctx, cx + 7, by - 17, 5, 1, "#CFA24B");
  px(ctx, cx + 9, by - 16, 1, 5, "#8A8070");

  // Stool
  px(ctx, cx - 2, by - 6, 4, 1, "#4A3828");
  px(ctx, cx - 1, by - 5, 2, 3, "#3A2A1E");

  // Sitting legs
  px(ctx, cx - 4, by - 7, 3, 3, clothesC);
  px(ctx, cx + 1, by - 7, 3, 3, clothesC);
  px(ctx, cx - 4, by - 4, 2, 3, "#E8C49A");
  px(ctx, cx + 2, by - 4, 2, 3, "#E8C49A");

  // Body
  px(ctx, cx - 2, by - 14, 4, 7, clothesC);

  // Left arm (hi-hat) - subtle movement
  px(ctx, cx - 5, by - 13, 3, 2, "#E8C49A");
  px(ctx, cx - 8, by - 14 + hihat, 2, 2, "#E8C49A");
  px(ctx, cx - 9, by - 13 + hihat, 1, 3, "#5C3010"); // stick

  // Right arm (snare) - main beat
  const raY = beat === 0 ? by - 12 : by - 9;
  px(ctx, cx + 2, raY, 3, 2, "#E8C49A");
  px(ctx, cx + 4, raY + 2, 1, 4, "#5C3010"); // stick

  // Head (bob on beat)
  const bobY = beat === 0 ? 0 : 1;
  drawHead(ctx, cx, by - 20, hairC, bobY);

  // Mouth open on beat
  if (beat === 1) px(ctx, cx - 1, by - 16, 2, 1, "#5C2010");
}

// ─── Guitarist ────────────────────────────────────────────────────────────────
function drawGuitarist(
  ctx: CanvasRenderingContext2D,
  cx: number, frame: number,
  hairC: string, clothesC: string, guitarC: string,
) {
  const strum = Math.floor(frame / 6) % 4;
  const by    = GY - 1;

  // Guitar body
  px(ctx, cx + 1, by - 15, 5, 7, guitarC);
  px(ctx, cx,     by - 13, 2, 3, guitarC);  // lower bout
  px(ctx, cx + 6, by - 14, 2, 4, guitarC);  // upper bout
  px(ctx, cx + 2, by - 16, 3, 1, "#C8956C"); // binding
  // Guitar neck (goes up-left)
  px(ctx, cx - 1, by - 20, 2, 8, "#8B5A2B");
  px(ctx, cx - 1, by - 20, 2, 1, "#C8956C"); // nut
  // Strings
  for (let s = 0; s < 3; s++) {
    px(ctx, cx + 1 + s, by - 20, 1, 14, "#80807060");
  }
  // Sound hole
  px(ctx, cx + 3, by - 13, 2, 2, "#0A0908");

  // Body (standing)
  px(ctx, cx - 2, by - 20, 4, 10, clothesC);
  // Legs
  px(ctx, cx - 2, by - 10, 2, 10, clothesC);
  px(ctx, cx,     by - 10, 2, 10, clothesC);
  px(ctx, cx - 2, by - 2,  2, 2,  "#1A1612"); // shoes
  px(ctx, cx,     by - 2,  2, 2,  "#1A1612");

  // Strumming right arm
  const strumOffY = [0, -1, 1, -1][strum];
  px(ctx, cx + 4, by - 16 + strumOffY, 4, 2, "#E8C49A");
  px(ctx, cx + 7, by - 15 + strumOffY, 2, 2, "#E8C49A"); // pick hand

  // Fretting left arm
  px(ctx, cx - 4, by - 22, 3, 2, "#E8C49A");
  px(ctx, cx - 4, by - 23, 3, 1, "#E8C49A"); // fingers on neck

  // Head
  const bobY = strum === 0 || strum === 2 ? 0 : 1;
  drawHead(ctx, cx, by - 28, hairC, bobY);
}

// ─── Singer ───────────────────────────────────────────────────────────────────
function drawSinger(
  ctx: CanvasRenderingContext2D,
  cx: number, frame: number,
  hairC: string, clothesC: string,
) {
  const sway  = Math.sin(frame * 0.05);
  const swayI = Math.round(sway);
  const mouth = Math.sin(frame * 0.12) > 0 ? 1 : 0;
  const by    = GY - 1;

  // Mic stand
  px(ctx, cx + swayI + 2, by - 22, 1, 22, "#8A8070");
  px(ctx, cx + swayI + 1, by - 24, 3, 3, "#A09888"); // mic head
  px(ctx, cx + swayI,     by - 25, 5, 1, "#C0B8A8"); // mic top

  // Body
  px(ctx, cx - 2 + swayI, by - 20, 4, 10, clothesC);
  // Legs
  px(ctx, cx - 2 + swayI, by - 10, 2, 10, clothesC);
  px(ctx, cx +     swayI, by - 10, 2, 10, clothesC);
  px(ctx, cx - 2 + swayI, by - 2,  2, 2,  "#1A1612");
  px(ctx, cx +     swayI, by - 2,  2, 2,  "#1A1612");

  // Left arm (at side, swaying)
  px(ctx, cx - 5 + swayI, by - 18, 3, 2, "#E8C49A");
  px(ctx, cx - 5 + swayI, by - 16, 2, 4, "#E8C49A");

  // Right arm (holding mic)
  px(ctx, cx + 2 + swayI, by - 19, 4, 2, "#E8C49A");
  px(ctx, cx + 4 + swayI, by - 17, 2, 4, "#E8C49A"); // forearm up to mic

  // Head (sway)
  drawHead(ctx, cx + swayI, by - 28, hairC, 0);

  // Mouth
  if (mouth) {
    px(ctx, cx - 1 + swayI, by - 25, 2, 1, "#5C2010");
  } else {
    px(ctx, cx - 1 + swayI, by - 25, 2, 1, "#C8956C");
  }
}

// ─── Keyboardist ─────────────────────────────────────────────────────────────
function drawKeyboardist(
  ctx: CanvasRenderingContext2D,
  cx: number, frame: number,
  hairC: string, clothesC: string,
) {
  const keys    = Math.floor(frame / 8) % 4;
  const bobY    = Math.floor(frame / 8) % 2;
  const by      = GY - 1;

  // Keyboard
  px(ctx, cx - 8, by - 8, 16, 4, "#E8E2D9");
  px(ctx, cx - 8, by - 8,  1, 4, "#3A3530");
  px(ctx, cx + 7, by - 8,  1, 4, "#3A3530");
  for (let k = 0; k < 5; k++) {
    px(ctx, cx - 6 + k * 3, by - 8, 1, 3, "#1A1612"); // black keys
  }
  // Keyboard stand
  px(ctx, cx - 6, by - 4, 2, 4, "#5A5048");
  px(ctx, cx + 4, by - 4, 2, 4, "#5A5048");

  // Stool
  px(ctx, cx - 2, by - 8, 4, 1, "#4A3828");
  px(ctx, cx - 1, by - 7, 2, 3, "#3A2A1E");

  // Sitting body
  px(ctx, cx - 2, by - 16, 4, 8, clothesC);
  // Sitting legs
  px(ctx, cx - 3, by - 8, 3, 4, clothesC);
  px(ctx, cx,     by - 8, 3, 4, clothesC);
  px(ctx, cx - 3, by - 4, 2, 3, "#E8C49A");
  px(ctx, cx + 1, by - 4, 2, 3, "#E8C49A");

  // Playing arms (hands shift across keyboard)
  const lHandX = cx - 6 + keys;
  const rHandX = cx + keys;
  px(ctx, lHandX, by - 10, 3, 2, "#E8C49A");
  px(ctx, rHandX, by - 10, 3, 2, "#E8C49A");
  px(ctx, cx - 5, by - 13, 3, 3, "#E8C49A"); // upper left arm
  px(ctx, cx + 2, by - 13, 3, 3, "#E8C49A"); // upper right arm

  // Head with bob
  drawHead(ctx, cx, by - 22, hairC, bobY);
}

// ─── DJ / FX ─────────────────────────────────────────────────────────────────
function drawDJ(
  ctx: CanvasRenderingContext2D,
  cx: number, frame: number,
  hairC: string, clothesC: string,
) {
  const spin  = Math.floor(frame / 4) % 8;
  const bobY  = Math.floor(frame / 8) % 2;
  const by    = GY - 1;

  // Turntable
  px(ctx, cx - 7, by - 7, 14, 7, "#1E1C19");
  // Record (spinning)
  px(ctx, cx - 4, by - 7, 8, 6, "#2A2820");
  const grooveColor = spin % 2 === 0 ? "#3A3830" : "#2A2820";
  px(ctx, cx - 3, by - 6, 6, 4, grooveColor);
  px(ctx, cx - 1, by - 6, 2, 4, "#1A1818"); // label
  px(ctx, cx,     by - 5, 1, 2, "#E8E2D9"); // spindle

  // Stand
  px(ctx, cx - 5, by - 1, 3, 1, "#3A3530");
  px(ctx, cx + 2, by - 1, 3, 1, "#3A3530");

  // Body (leaning over)
  px(ctx, cx - 2, by - 18, 4, 11, clothesC);
  // Legs
  px(ctx, cx - 2, by - 7, 2, 7, clothesC);
  px(ctx, cx,     by - 7, 2, 7, clothesC);
  px(ctx, cx - 2, by - 1, 2, 1, "#1A1612");
  px(ctx, cx,     by - 1, 2, 1, "#1A1612");

  // Arms (over deck)
  px(ctx, cx - 5, by - 14, 3, 2, "#E8C49A");
  px(ctx, cx - 5, by - 12, 2, 5, "#E8C49A");
  px(ctx, cx + 2, by - 14, 3, 2, "#E8C49A");
  px(ctx, cx + 4, by - 12, 2, 5, "#E8C49A");

  // Head (leaning forward, bobbing)
  drawHead(ctx, cx, by - 24, hairC, bobY);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
function drawMusician(
  ctx: CanvasRenderingContext2D,
  m: Musician,
  frame: number,
) {
  switch (m.stemType) {
    case "drums":
      drawDrummer(ctx, m.cx, frame, m.hairColor, m.clothesColor);
      break;
    case "bass":
      drawGuitarist(ctx, m.cx, frame, m.hairColor, m.clothesColor, "#8B2020");
      break;
    case "fx":
      drawDJ(ctx, m.cx, frame, m.hairColor, m.clothesColor);
      break;
    case "melody":
      drawKeyboardist(ctx, m.cx, frame, m.hairColor, m.clothesColor);
      break;
    case "vocals":
      drawSinger(ctx, m.cx, frame, m.hairColor, m.clothesColor);
      break;
    default: // chords, unknown
      drawGuitarist(ctx, m.cx, frame, m.hairColor, m.clothesColor, "#1E3A6E");
  }

  // Name plate (real users only)
  if (!m.fake) {
    ctx.font = `bold ${S * 3}px "Courier New", monospace`;
    ctx.fillStyle = "#E8E2D9";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(m.name, m.cx * S, (GY + 18) * S);
  }
}

// ─── Scanlines overlay ────────────────────────────────────────────────────────
function drawScanlines(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#000000";
  for (let y = 0; y < VH * S; y += 2) {
    ctx.fillRect(0, y, VW * S, 1);
  }
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AudienceMode({ users, tracks, bpm, useFakeUsers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Generate stars once
    const stars: [number, number][] = Array.from({ length: 40 }, () => [
      Math.floor(Math.random() * (VW - 20)) + 10,
      Math.floor(Math.random() * 18) + 2,
    ]);

    // Build musician list
    const source = useFakeUsers ? FAKE_AUDIENCE_USERS : users.map((u, i) => {
      const lastTrack = [...tracks].reverse().find(t => t.userId === u.id);
      return { ...u, stemType: (lastTrack?.stemType ?? (["drums","chords","vocals","bass","melody","fx"] as StemType[])[i % 6]) };
    });

    const spotColors = ["#CFA24B", "#4B7FCF", "#7B9E84", "#C46B5A", "#A855F7", "#22C55E"];
    const musicians: Musician[] = source.map((u, i) => ({
      id: u.id,
      name: u.name,
      stemType: u.stemType as StemType,
      hairColor: HAIR_COLORS[i % HAIR_COLORS.length],
      clothesColor: CLOTHES_COLORS[i % CLOTHES_COLORS.length],
      cx: Math.round(VW * (i + 1) / (source.length + 1)),
      fake: useFakeUsers ?? false,
    }));

    let frame = 0;
    let raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawScene(ctx, frame, stars);

      // Spotlights
      for (let i = 0; i < musicians.length; i++) {
        const pulse = 0.06 + Math.sin(frame * 0.03 + i) * 0.02;
        drawSpotlight(ctx, musicians[i].cx, spotColors[i % spotColors.length], pulse);
      }

      // Musicians
      for (const m of musicians) drawMusician(ctx, m, frame);

      drawScanlines(ctx);

      frame++;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [users, tracks, bpm, useFakeUsers]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0" }}>
      <canvas
        ref={canvasRef}
        width={VW * S}
        height={VH * S}
        style={{
          imageRendering: "pixelated",
          width: "100%",
          maxWidth: VW * S,
          borderRadius: 4,
          border: "1px solid rgba(232,226,217,0.06)",
        }}
      />
      <p style={{ fontFamily: "var(--fm)", fontSize: 11, color: "#5E584E", letterSpacing: 1.5, textTransform: "uppercase" }}>
        Audience Mode — {bpm} BPM
      </p>
    </div>
  );
}
