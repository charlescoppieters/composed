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
  private _isPlaying = false;
  private _initialized = false;

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
    return this._isPlaying;
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
  }

  setBarCount(barCount: number) {
    Tone.getTransport().loopEnd = `${barCount}m`;
    Tone.getTransport().loop = true;
  }

  start() {
    Tone.getTransport().start();
    this._isPlaying = true;
  }

  stop() {
    Tone.getTransport().stop();
    this._isPlaying = false;
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
    this.stop();
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
