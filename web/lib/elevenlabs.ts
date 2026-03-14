import { RoomSettings, StemType } from "../../shared/types";

export function buildLoopPrompt(
  userQuery: string,
  settings: RoomSettings,
  stemType: StemType
): string {
  const durationSeconds = (settings.barCount * 4 * 60) / settings.bpm;

  return [
    `Create a ${stemType} loop.`,
    `Musical style/description: ${userQuery}.`,
    `Key: ${settings.key} ${settings.scale}.`,
    `Tempo: ${settings.bpm} BPM.`,
    `Duration: exactly ${durationSeconds.toFixed(1)} seconds (${settings.barCount} bars of 4/4).`,
    `The loop must seamlessly repeat. No fade out.`,
    stemType === "drums" ? "Purely percussive, no melodic content." : "",
    stemType === "bass" ? "Low frequency bass line only." : "",
    stemType === "vocals" ? "Vocal chop or vocal hook only." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSamplePrompt(
  userQuery: string,
  settings: RoomSettings
): string {
  return [
    `Create a single-shot musical sample/sound.`,
    `Description: ${userQuery}.`,
    `Key: ${settings.key} ${settings.scale}.`,
    `Duration: 1-3 seconds. Clean, no reverb tail.`,
    `This will be used as a one-shot sample to play on pads.`,
  ].join(" ");
}
