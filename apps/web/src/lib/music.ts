import { getSettings, subscribeSettings } from './settings';
import { getAudioContext, onAudioReset } from './sound';

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

/** Every file of a part, ogg first (smallest), then mp3, then wav: the first one the browser can decode is used. */
function urlsOf(id: string, part: 'intro' | 'loop'): string[] {
  const re = new RegExp(`/music/${id}/${part}\\.(ogg|mp3|wav)$`);
  return Object.keys(FILES)
    .filter((k) => re.test(k))
    .sort(
      (a, b) =>
        ['ogg', 'mp3', 'wav'].indexOf(a.slice(-3)) - ['ogg', 'mp3', 'wav'].indexOf(b.slice(-3)),
    )
    .map((k) => FILES[k]!);
}

async function decode(ctx: AudioContext, urls: string[]): Promise<AudioBuffer> {
  let error: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      error = e; // e.g. Safari without Ogg Vorbis: try the next format
    }
  }
  throw error ?? new Error('no music file');
}

function load(id: string): Promise<Loaded | undefined> {
  const ctx = getAudioContext();
  const introUrl = urlsOf(id, 'intro');
  const loopUrl = urlsOf(id, 'loop');
  if (!ctx || !introUrl.length || !loopUrl.length) return Promise.resolve(undefined);
  let p = loaded.get(id);
  if (!p) {
    p = Promise.all([decode(ctx, introUrl), decode(ctx, loopUrl)])
      .then(([intro, loop]) => ({ intro, loop }))
      .catch((e) => {
        console.warn(`Music "${id}" could not be loaded`, e);
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

// The audio engine was rebuilt (iOS killed it in the background): the old nodes are gone, play the song again.
onAudioReset(() => {
  const id = playing?.id;
  playing = undefined;
  master = undefined;
  if (id) void playMusic(id);
});

let want: string | undefined; // the song that should be playing (it is not while the music is at 0)
function applyMute() {
  if (getSettings().music === 0) {
    // Music off: nothing plays and no audio engine is held (see `sound.ts`); turning it up again starts the song.
    const keep = want;
    if (playing) stopMusic();
    want = keep;
    master = undefined;
    return;
  }
  if (master) master.gain.value = (VOLUME * getSettings().music) / 100;
  if (want && !playing) void playMusic(want);
}
subscribeSettings(applyMute);

/** Starts a song (intro then loop). Calling it again for the song that is already playing does nothing. */
export async function playMusic(id: string): Promise<void> {
  want = id;
  if (getSettings().music === 0 || playing?.id === id) return;
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
  want = undefined;
  playing?.nodes.forEach((n) => {
    try {
      n.stop();
    } catch {
      /* not started */
    }
  });
  playing = undefined;
}

/** The player left the main menu (entered a game, Play or Join): the song keeps playing, and starts if it had not. */
export function musicLeftMenu() {
  void playMusic('menu');
}

/** The player is on the main menu: makes sure the song plays, but never restarts it (only an app restart does). */
export function musicEnteredMenu() {
  if (getSettings().music === 0) {
    want ??= 'menu';
    return;
  }
  if (getAudioContext()?.state !== 'running') return;
  void playMusic('menu');
}
