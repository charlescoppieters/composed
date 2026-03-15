"use client";
import { useEffect, useRef } from "react";

interface Props {
  audioUrl?: string;
  audioBuffer?: AudioBuffer | null;
  color?: string;
  height?: number;
}

export default function WaveformPreview({ audioUrl, audioBuffer, color = "#CFA24B", height = 60 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (buffer: AudioBuffer) => {
      const data = buffer.getChannelData(0);
      const w = canvas.width;
      const h = canvas.height;
      const step = Math.ceil(data.length / w);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(232,226,217,0.03)";
      ctx.fillRect(0, 0, w, h);

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;

      for (let i = 0; i < w; i++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
          const val = data[i * step + j] || 0;
          if (val < min) min = val;
          if (val > max) max = val;
        }
        const yMin = ((1 + min) / 2) * h;
        const yMax = ((1 + max) / 2) * h;
        ctx.moveTo(i, yMin);
        ctx.lineTo(i, yMax);
      }
      ctx.stroke();
    };

    if (audioBuffer) {
      draw(audioBuffer);
    } else if (audioUrl) {
      const ac = new AudioContext();
      fetch(audioUrl)
        .then(r => r.arrayBuffer())
        .then(ab => ac.decodeAudioData(ab))
        .then(draw)
        .catch(() => {})
        .finally(() => ac.close());
    }
  }, [audioUrl, audioBuffer, color, height]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={height}
      style={{
        width: "100%",
        height,
        borderRadius: 8,
        background: "rgba(232,226,217,0.03)",
        border: "1px solid rgba(232,226,217,0.06)",
      }}
    />
  );
}
