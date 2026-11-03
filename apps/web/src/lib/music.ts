import { getSettings, subscribeSettings } from './settings';
import { getAudioContext } from './sound';

/**
 * Songs made of an intro and a loop. Drop `intro.<ext>` and `loop.<ext>` (ogg/mp3/wav) into
 * `assets/music/<id>/` and `playMusic('<id>')` plays the intro, then starts the loop at the exact
 * sample the intro ends (Web Audio scheduling, no gap). A track without files is just silent.
 */
const FILES = import.meta.glob('../assets/music/*/{intro,loop}.{mp3,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const VOLUME = 0.4;

interface Loaded {
  intro: AudioBuffer;
  loop: AudioBuffer;
}

const loaded = new Map<string, Promise<Loaded | undefined>>();
let playing: { id: string; nodes: AudioBufferSourceNode[] } | undefined;
let master: GainNode | undefined;

function urlOf(id: string, part: 'intro' | 'loop'): string | undefined {
  const key = Object.keys(FILES).find((k) => new RegExp(`/music/${id}/${part}\\.`).test(k));
  return key ? FILES[key] : undefined;
}

async function decode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function load(id: string): Promise<Loaded | undefined> {
  const ctx = getAudioContext();
  const introUrl = urlOf(id, 'intro');
  const loopUrl = urlOf(id, 'loop');
  if (!ctx || !introUrl || !loopUrl) return Promise.resolve(undefined);
  let p = loaded.get(id);
  if (!p) {
    p = Promise.all([decode(ctx, introUrl), decode(ctx, loopUrl)])
      .then(([intro, loop]) => ({ intro, loop }))
      .catch(() => {
        loaded.delete(id);
        return undefined;
      });
    loaded.set(id, p);
  }
  return p;
}

/** Fetches and decodes a song ahead of time so `playMusic` starts without delay. Returns a no-op cleanup. */
export function preloadMusic(id: string): () => void {
  void load(id);
  return () => undefined;
}

function applyMute() {
  if (master) master.gain.value = (VOLUME * getSettings().music) / 100;
}
subscribeSettings(applyMute);

/** Starts a song (intro then loop). Calling it again for the song that is already playing does nothing. */
export async function playMusic(id: string): Promise<void> {
  if (playing?.id === id) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  playing = { id, nodes: [] };
  const mine = playing;
  const song = await load(id);
  if (!song || playing !== mine) {
    if (playing === mine) playing = undefined;
    return;
  }
  if (!master) {
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  applyMute();
  const intro = ctx.createBufferSource();
  intro.buffer = song.intro;
  intro.connect(master);
  const loop = ctx.createBufferSource();
  loop.buffer = song.loop;
  loop.loop = true;
  loop.connect(master);
  const t = ctx.currentTime + 0.05;
  intro.start(t);
  loop.start(t + song.intro.duration);
  mine.nodes = [intro, loop];
}

export function stopMusic() {
  playing?.nodes.forEach((n) => {
    try {
      n.stop();
    } catch {
      /* not started */
    }
  });
  playing = undefined;
}

let leftMenu = false;

/** The player left the main menu (entered a game, Play or Join): the song keeps playing, and starts if it had not. */
export function musicLeftMenu() {
  leftMenu = true;
  void playMusic('menu');
}

/** The player is on the main menu: restarts the song if they were away, otherwise just makes sure it plays. */
export function musicEnteredMenu() {
  if (getAudioContext()?.state !== 'running') return;
  if (leftMenu) {
    leftMenu = false;
    stopMusic();
  }
  void playMusic('menu');
}
