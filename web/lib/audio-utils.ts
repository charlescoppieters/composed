import * as Tone from "tone";

/**
 * Time-stretch audio to fit exactly into the target loop duration.
 * Uses playback rate adjustment via Tone.Offline — simple and artifact-free
 * for moderate stretch ratios (0.5x–2x).
 *
 * Returns a new ToneAudioBuffer at the target duration, ready for WAV export.
 */
export async function timeStretchToLoop(
  sourceUrl: string,
  targetDurationSec: number,
): Promise<{ buffer: Tone.ToneAudioBuffer; stretchRatio: number }> {
  await Tone.start();

  // Load the source into a buffer
  const srcBuffer = new Tone.ToneAudioBuffer();
  await srcBuffer.load(sourceUrl);

  const srcDuration = srcBuffer.duration;
  if (srcDuration === 0) throw new Error("Source audio has zero duration");

  // playbackRate > 1 = speed up (source is longer than target)
  // playbackRate < 1 = slow down (source is shorter than target)
  const playbackRate = srcDuration / targetDurationSec;

  const stretched = await Tone.Offline(({ transport }) => {
    const player = new Tone.Player(srcBuffer).toDestination();
    player.playbackRate = playbackRate;
    player.start(0);
    transport.start(0);
  }, targetDurationSec, 2, 44100);

  return { buffer: stretched, stretchRatio: playbackRate };
}

export function bufferToWav(buffer: Tone.ToneAudioBuffer): Blob {
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
