let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  audioContext = new Ctx();
  return audioContext;
}

export async function resumeAudio(): Promise<AudioContext> {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') await ctx.resume();
  return ctx;
}

export function makeNoiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export interface Stoppable {
  stop: () => void;
}

export function startOrganDrone(ctx: AudioContext, destination: AudioNode): Stoppable {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 1.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  filter.Q.value = 0.6;
  const freqs = [55, 82.41, 110, 164.81];
  const nodes = freqs.map((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = index < 2 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = 0.18 / (1 + index * 0.45);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05 + index * 0.02;
    lfoGain.gain.value = freq * 0.006;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    return { osc, lfo };
  });
  filter.connect(master);
  master.connect(destination);
  return {
    stop() {
      const when = ctx.currentTime;
      master.gain.cancelScheduledValues(when);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), when);
      master.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
      window.setTimeout(() => {
        nodes.forEach(({ osc, lfo }) => {
          osc.stop();
          lfo.stop();
        });
        master.disconnect();
      }, 520);
    },
  };
}

export function pluck(ctx: AudioContext, destination: AudioNode, freq: number, time: number, velocity = 0.35): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(velocity, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.15);
  const overtone = ctx.createOscillator();
  overtone.type = 'triangle';
  overtone.frequency.setValueAtTime(freq * 2.003, time);
  const overtoneGain = ctx.createGain();
  overtoneGain.gain.setValueAtTime(velocity * 0.22, time);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
  osc.connect(gain);
  gain.connect(destination);
  overtone.connect(overtoneGain);
  overtoneGain.connect(destination);
  osc.start(time);
  osc.stop(time + 1.25);
  overtone.start(time);
  overtone.stop(time + 0.4);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Public-domain Jingle Bells chorus (1857), eighth-note MIDI. */
export const JINGLE_BELLS: number[] = [
  76, 76, 76, 76, 76, 76, 76, 79, 72, 74, 76, 76, 76, 76,
  77, 77, 77, 77, 77, 76, 76, 76, 76, 74, 74, 72, 74, 79, 76, 0,
];

/** Public-domain Silent Night opening (1818), simplified eighth notes. */
export const SILENT_NIGHT: number[] = [
  67, 69, 67, 64, 67, 69, 67, 64,
  72, 72, 69, 69, 67, 67, 64, 64,
  67, 69, 67, 64, 65, 67, 60, 62, 55, 55, 0, 0,
];

export function startMusicBox(ctx: AudioContext, destination: AudioNode, pattern: number[], bpm = 96): Stoppable {
  const master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(destination);
  const step = 60 / bpm / 2;
  let next = ctx.currentTime + 0.06;
  let index = 0;
  let stopped = false;
  const timer = window.setInterval(() => {
    if (stopped) return;
    const horizon = ctx.currentTime + 0.28;
    while (next < horizon) {
      const midi = pattern[index % pattern.length] ?? 0;
      if (midi > 0) pluck(ctx, master, midiToHz(midi), next, 0.28);
      next += step;
      index += 1;
    }
  }, 90);
  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
      master.disconnect();
    },
  };
}

export function playChime(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  [72, 76, 79, 84].forEach((midi, index) => {
    pluck(ctx, destination, midiToHz(midi), now + index * 0.07, 0.32);
  });
}

export function playLaunchWhistle(ctx: AudioContext, destination: AudioNode): void {
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, 0.6);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 8;
  filter.frequency.setValueAtTime(280, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.45);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.48);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  noise.start();
  noise.stop(ctx.currentTime + 0.5);
}

export function playBoom(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, 0.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + 0.35);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(140, now);
  body.frequency.exponentialRampToValueAtTime(48, now + 0.28);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.45, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  body.connect(bodyGain);
  bodyGain.connect(destination);
  noise.start(now);
  noise.stop(now + 0.5);
  body.start(now);
  body.stop(now + 0.42);
}

export interface BeatHandle extends Stoppable {
  analyser: AnalyserNode;
}

export function startSynthBeat(ctx: AudioContext): BeatHandle {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.75;
  const master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(analyser);
  analyser.connect(ctx.destination);
  const noise = makeNoiseBuffer(ctx, 0.4);
  let next = ctx.currentTime + 0.05;
  let stepIndex = 0;
  const bpm = 108;
  const step = 60 / bpm / 2;
  const bass = [36, 36, 43, 36, 41, 36, 43, 39];
  let stopped = false;
  const timer = window.setInterval(() => {
    if (stopped) return;
    const horizon = ctx.currentTime + 0.25;
    while (next < horizon) {
      if (stepIndex % 4 === 0) kick(ctx, master, next);
      if (stepIndex % 4 === 2) hat(ctx, master, noise, next, 0.12);
      else if (stepIndex % 2 === 1) hat(ctx, master, noise, next, 0.05);
      if (stepIndex % 2 === 0) {
        const midi = bass[(stepIndex / 2) % bass.length] ?? 36;
        bassNote(ctx, master, midiToHz(midi), next);
      }
      next += step;
      stepIndex += 1;
    }
  }, 70);
  return {
    analyser,
    stop() {
      stopped = true;
      window.clearInterval(timer);
      master.disconnect();
      analyser.disconnect();
    },
  };
}

function kick(ctx: AudioContext, destination: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.16);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(time);
  osc.stop(time + 0.3);
}

function hat(ctx: AudioContext, destination: AudioNode, noise: AudioBuffer, time: number, level: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(time);
  source.stop(time + 0.06);
}

function bassNote(ctx: AudioContext, destination: AudioNode, freq: number, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(420, time);
  filter.frequency.exponentialRampToValueAtTime(140, time + 0.2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  osc.start(time);
  osc.stop(time + 0.24);
}

export function bandEnergy(analyser: AnalyserNode, bins: Uint8Array, sampleRate: number): { bass: number; mid: number; treble: number } {
  analyser.getByteFrequencyData(bins as Uint8Array<ArrayBuffer>);
  const hzPerBin = sampleRate / 2 / bins.length;
  const energy = (low: number, high: number) => {
    const start = Math.max(0, Math.floor(low / hzPerBin));
    const end = Math.min(bins.length - 1, Math.ceil(high / hzPerBin));
    let sum = 0;
    for (let i = start; i <= end; i += 1) sum += bins[i] ?? 0;
    return sum / Math.max(1, end - start + 1) / 255;
  };
  return {
    bass: energy(20, 140),
    mid: energy(140, 1800),
    treble: energy(1800, 8000),
  };
}
