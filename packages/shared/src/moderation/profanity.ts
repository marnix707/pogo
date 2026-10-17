/**
 * A deliberately basic profanity filter (English + a few Dutch words). It catches common
 * obfuscation (leetspeak, repeated letters, dots/spaces between letters) and respects word
 * boundaries, so innocent words such as "class", "assume" or "cockpit" are left alone.
 * It is a speed bump, not moderation: reports and a real moderation system come later.
 */
const WORDS = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'dickhead',
  'cunt',
  'slut',
  'whore',
  'piss',
  'wanker',
  'twat',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  // Dutch
  'kut',
  'klootzak',
  'hoer',
  'lul',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Lowercase and de-leet, keeping the exact length so indices line up with the original. */
function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const c = lower.length === ch.length ? lower : ch;
    out += LEET[c] ?? c;
  }
  return out;
}

const SUFFIX = '(?:s|es|ed|ing|er|ers|y)?';
const PATTERNS = WORDS.map(
  (word) =>
    new RegExp(
      `(?<![a-z])${[...word].map((letter) => `${letter}+`).join('[^a-z]{0,2}')}${SUFFIX}(?![a-z])`,
      'g',
    ),
);

function matches(text: string): [number, number][] {
  const normalized = normalize(text);
  const spans: [number, number][] = [];
  for (const pattern of PATTERNS) {
    for (const m of normalized.matchAll(pattern)) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

export function containsProfanity(text: string): boolean {
  return matches(text).length > 0;
}

/** Replace every profane word with asterisks of the same length. */
export function maskProfanity(text: string): string {
  const spans = matches(text);
  if (spans.length === 0) return text;
  const chars = text.split('');
  for (const [start, end] of spans) {
    for (let i = start; i < end; i++) chars[i] = '*';
  }
  return chars.join('');
}
