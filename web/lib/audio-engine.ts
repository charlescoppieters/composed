import * as Tone from "tone";

export type ListenMode = "solo" | "master" | "overlay";

interface TrackPlayer {
  player: Tone.Player;
  gain: Tone.Gain;
}

class AudioEngine {
  private masterPlayers: Map<string, TrackPlayer> = new Map();
  private localPlayer: TrackPlayer | null = null;
  private listenMode: ListenMode = "overlay";
  private masterGain: Tone.Gain | null = null;
  private localGain: Tone.Gain | null = null;
  private _initialized = false;
  private clockStartTime = 0;
  private clockOffset = 0;

  private ensureGains() {
    if (!this.masterGain) {
      this.masterGain = new Tone.Gain(1).toDestination();
    }
    if (!this.localGain) {
      this.localGain = new Tone.Gain(1).toDestination();
    }
  }

  async init() {
    await Tone.start();
    this.ensureGains();
    this._initialized = true;
  }

  get isPlaying() {
    return Tone.getTransport().state === "started";
  }

  play() {
    if (!this._initialized) return;
    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      transport.start();
    }
  }

  pause() {
    const transport = Tone.getTransport();
    if (transport.state === "started") {
      transport.pause();
    }
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
  }

  setBarCount(barCount: number) {
    Tone.getTransport().loopEnd = `${barCount}m`;
    Tone.getTransport().loop = true;
  }

  syncToClock(clockStartTime: number, clockOffset: number, bpm: number, barCount: number) {
    this.clockStartTime = clockStartTime;
    this.clockOffset = clockOffset;

    const transport = Tone.getTransport();
    transport.bpm.value = bpm;
    transport.loopEnd = `${barCount}m`;
    transport.loop = true;

    const loopDurationSec = (barCount * 4 * 60) / bpm;

    // serverNow = Date.now() + clockOffset (offset = server - client)
    const serverNowMs = Date.now() + clockOffset;
    const elapsedSec = (serverNowMs - clockStartTime) / 1000;
    const positionSec = Math.max(0, ((elapsedSec % loopDurationSec) + loopDurationSec) % loopDurationSec);

    console.log("[CLOCK SYNC]", {
      clockOffset: Math.round(clockOffset * 100) / 100,
      serverNowMs,
      clockStartTime,
      elapsedSec: Math.round(elapsedSec * 1000) / 1000,
      positionSec: Math.round(positionSec * 1000) / 1000,
      loopDurationSec,
    });

    if (transport.state === "started") {
      transport.stop();
    }
    // Set position directly then start — simplest possible approach
    transport.seconds = positionSec;
    transport.start();
  }

  recalibrate(clockOffset: number, bpm: number, barCount: number) {
    const transport = Tone.getTransport();
    const loopDurationSec = (barCount * 4 * 60) / bpm;

    const serverNowMs = Date.now() + clockOffset;
    const elapsedSec = (serverNowMs - this.clockStartTime) / 1000;
    const expectedSec = ((elapsedSec % loopDurationSec) + loopDurationSec) % loopDurationSec;
    const currentSec = ((transport.seconds % loopDurationSec) + loopDurationSec) % loopDurationSec;

    const driftMs = Math.abs(expectedSec - currentSec) * 1000;
    console.log("[CLOCK DRIFT]", { driftMs: Math.round(driftMs), expectedSec: Math.round(expectedSec * 1000) / 1000, currentSec: Math.round(currentSec * 1000) / 1000 });
    if (driftMs > 20) {
      this.syncToClock(this.clockStartTime, clockOffset, bpm, barCount);
    }
  }

  setListenMode(mode: ListenMode) {
    this.listenMode = mode;
    this.ensureGains();
    switch (mode) {
      case "solo":
        this.masterGain!.gain.value = 0;
        this.localGain!.gain.value = 1;
        break;
      case "master":
        this.masterGain!.gain.value = 1;
        this.localGain!.gain.value = 0;
        break;
      case "overlay":
        this.masterGain!.gain.value = 1;
        this.localGain!.gain.value = 1;
        break;
    }
  }

  async addMasterTrack(trackId: string, audioUrl: string, volume: number = 1) {
    this.removeMasterTrack(trackId);
    this.ensureGains();

    const player = new Tone.Player({
      url: audioUrl,
      loop: true,
      fadeIn: 0.01,
      fadeOut: 0.01,
    });

    const gain = new Tone.Gain(volume);
    player.connect(gain);
    gain.connect(this.masterGain!);

    await Tone.loaded();

    player.sync().start(0);

    this.masterPlayers.set(trackId, { player, gain });
  }

  removeMasterTrack(trackId: string) {
    const tp = this.masterPlayers.get(trackId);
    if (tp) {
      tp.player.unsync().stop().dispose();
      tp.gain.dispose();
      this.masterPlayers.delete(trackId);
    }
  }

  setMasterTrackVolume(trackId: string, volume: number) {
    const tp = this.masterPlayers.get(trackId);
    if (tp) tp.gain.gain.value = volume;
  }

  setMasterTrackMuted(trackId: string, muted: boolean) {
    const tp = this.masterPlayers.get(trackId);
    if (tp) tp.gain.gain.value = muted ? 0 : 1;
  }

  getTimeUntilNextBoundaryMs(): number {
    const transport = Tone.getTransport();
    if (transport.state !== "started") return 0;
    const loopEnd = transport.toSeconds(transport.loopEnd);
    if (!loopEnd || loopEnd <= 0) return 0;
    const pos = transport.seconds % loopEnd;
    return Math.max(0, (loopEnd - pos) * 1000);
  }

  getLocalDestination(): Tone.Gain {
    this.ensureGains();
    return this.localGain!;
  }

  async setLocalTrack(audioUrl: string) {
    this.clearLocalTrack();
    this.ensureGains();

    const player = new Tone.Player({
      url: audioUrl,
      loop: true,
      fadeIn: 0.01,
      fadeOut: 0.01,
    });

    const gain = new Tone.Gain(1);
    player.connect(gain);
    gain.connect(this.localGain!);

    await Tone.loaded();
    player.sync().start(0);

    this.localPlayer = { player, gain };
  }

  clearLocalTrack() {
    if (this.localPlayer) {
      this.localPlayer.player.unsync().stop().dispose();
      this.localPlayer.gain.dispose();
      this.localPlayer = null;
    }
  }

  dispose() {
    Tone.getTransport().stop();
    this.masterPlayers.forEach((tp) => {
      tp.player.unsync().stop().dispose();
      tp.gain.dispose();
    });
    this.masterPlayers.clear();
    this.clearLocalTrack();
    this.masterGain?.dispose();
    this.localGain?.dispose();
  }
}

let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) {
    engine = new AudioEngine();
  }
  return engine;
}
