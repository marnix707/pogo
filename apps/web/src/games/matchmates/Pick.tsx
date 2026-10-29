import { useRef, useState } from 'react';
import { matchmates } from '@pogo/shared';
import { Avatar, Button } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { arenaUrl, monsterUrl } from './art';
import { usePetInfo } from './PetInfo';

const { ELEMENTS, MONSTERS, STAGES, STAGE_SPECS } = matchmates;

/** The roster grid is 5 wide and 4 high. */
const ROSTER_SIZE = 20;

const px = { imageRendering: 'pixelated' } as const;

interface Person {
  id: string;
  name: string;
  avatar: string;
}

/**
 * The draft: the first player takes one pet, the second takes two, the first takes the last one.
 * Then everybody names an arena (or leaves it to the dice) and confirms; a coin decides whose arena is used.
 */
export function Pick({
  view,
  people,
  busy,
  onDraft,
  onConfirm,
}: {
  view: matchmates.MatesView;
  people: Person[];
  busy: boolean;
  onDraft: (element: matchmates.Element) => void;
  onConfirm: (stage: matchmates.StageId | 'random') => void;
}) {
  const [chosen, setChosen] = useState<matchmates.Element | null>(null);
  const petInfo = usePetInfo();
  const confirmRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<matchmates.StageId | 'random'>('random');
  const mine = view.players.find((p) => p.id === view.me)!;
  const theirs = view.players.find((p) => p.id !== view.me)!;
  const taken = new Map<matchmates.Element, string>();
  for (const p of view.players) for (const m of p.monsters) taken.set(m.element, p.id);
  const personOf = (id: string) => people.find((p) => p.id === id);
  const myPick = view.drafter === view.me;
  const draftOver = view.drafter === null;
  const confirmed = !!view.confirmed[view.me];
  // Picking an arena scrolls smoothly down to the Confirm button.
  const chooseStage = (s: matchmates.StageId | 'random') => {
    setStage(s);
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    confirmRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      data-testid="mates-pick"
    >
      {petInfo.bubble}
      {/* The content sits in the middle of the screen (my-auto), and scrolls when it is taller than the screen. */}
      <div className="my-auto flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {[mine, theirs].map((p, n) => {
            const who = personOf(p.id);
            const active = view.drafter === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-1 rounded-md border-2 p-1.5 ${
                  active ? 'border-neon bg-neon text-accentink' : 'border-edge/40'
                }`}
                data-testid={n === 0 ? 'mates-draft-me' : 'mates-draft-opp'}
              >
                <div className="flex items-center gap-1.5">
                  <Avatar avatar={who?.avatar ?? '🙂'} size="sm" />
                  <span className="truncate text-xs font-bold">
                    <PlayerName
                      name={n === 0 ? 'You' : (who?.name ?? 'Opponent')}
                      id={p.id}
                      me={view.me}
                    />
                  </span>
                  {view.confirmed[p.id] && <span className="ml-auto text-xs text-neon">Ready</span>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {[0, 1].map((slot) => {
                    const m = p.monsters[slot];
                    return (
                      <div
                        key={slot}
                        onClick={(e) => m && petInfo.open(e, m.element, false)}
                        className={`flex h-14 items-center justify-center rounded border border-edge/40 bg-black/30 ${
                          m ? 'cursor-pointer' : ''
                        }`}
                        data-testid={`mates-draft-slot-${n === 0 ? 'me' : 'opp'}-${slot}`}
                      >
                        {m ? (
                          <img
                            src={monsterUrl(m.element, false)}
                            alt={MONSTERS[m.element].names[0]}
                            className="h-12"
                            style={px}
                            draggable={false}
                          />
                        ) : (
                          <span className="text-xl text-muted">?</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!draftOver ? (
          <>
            <h2 className="text-center text-lg font-bold text-neon" data-testid="mates-draft-title">
              {myPick ? 'Pick a pet' : `${personOf(view.drafter!)?.name ?? 'Opponent'} is picking…`}
            </h2>
            {/* The roster: 5 x 4 tiles. Pets that are not in the game yet are dark shapes with a ?. */}
            <ul className="grid grid-cols-5 gap-1.5" aria-label="Pets" data-testid="mates-roster">
              {Array.from({ length: ROSTER_SIZE }, (_, n) => {
                const e = ELEMENTS[n];
                if (!e) {
                  const shape = ELEMENTS[n % ELEMENTS.length] as matchmates.Element;
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        disabled
                        data-testid={`mates-soon-${n}`}
                        aria-label="Coming soon"
                        className="relative flex aspect-square w-full items-center justify-center rounded-md border-2 border-edge/20 bg-black/40"
                      >
                        <img
                          src={monsterUrl(shape, false)}
                          alt=""
                          draggable={false}
                          style={{ ...px, filter: 'brightness(0)', opacity: 0.55 }}
                          className="h-[70%]"
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-white/80 [text-shadow:0_1px_0_#101628]">
                          ?
                        </span>
                      </button>
                    </li>
                  );
                }
                const owner = taken.get(e);
                const on = chosen === e && !owner;
                return (
                  <li key={n}>
                    <button
                      type="button"
                      data-testid={`mates-pick-${e}`}
                      aria-pressed={on}
                      aria-label={MONSTERS[e].names[0]}
                      disabled={!!owner}
                      onClick={() => setChosen(e)}
                      className={`relative flex aspect-square w-full items-center justify-center rounded-md border-2 bg-black/30 ${
                        owner
                          ? 'border-edge/20 opacity-30'
                          : on
                            ? 'border-neon bg-neon/20'
                            : myPick
                              ? 'border-accent'
                              : 'border-edge/40'
                      }`}
                    >
                      <img
                        src={monsterUrl(e, false)}
                        alt=""
                        draggable={false}
                        style={px}
                        className="h-[75%]"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* The chosen pet, larger, with its stats and what it does. */}
            <div
              className="hud flex min-h-36 items-center gap-3 p-3"
              data-testid="mates-pet-detail"
              data-pet={chosen ?? ''}
            >
              {chosen ? (
                <>
                  <span className="flex w-16 shrink-0 flex-col items-center gap-1">
                    <img
                      src={monsterUrl(chosen, false)}
                      alt={MONSTERS[chosen].names[0]}
                      draggable={false}
                      style={px}
                      className="h-12"
                    />
                    <img
                      src={monsterUrl(chosen, true)}
                      alt={MONSTERS[chosen].names[1]}
                      draggable={false}
                      style={px}
                      className="h-14"
                    />
                  </span>
                  <span className="min-w-0 flex-1 text-xs">
                    <b className="block text-base">
                      {MONSTERS[chosen].names[0]} <span className="text-muted">→</span>{' '}
                      {MONSTERS[chosen].names[1]}
                    </b>
                    <span className="block capitalize text-muted">
                      {chosen} · special at {MONSTERS[chosen].cost} mana
                    </span>
                    <span className="mt-1 block">{MONSTERS[chosen].ability}</span>
                    <span className="mt-1 block text-muted">
                      Damage {MONSTERS[chosen].damage[0]}, evolved {MONSTERS[chosen].damage[1]}
                      {MONSTERS[chosen].heal[0] > 0
                        ? ` · heal ${MONSTERS[chosen].heal[0]}, evolved ${MONSTERS[chosen].heal[1]}`
                        : ''}
                    </span>
                  </span>
                </>
              ) : (
                <p className="w-full text-center text-sm text-muted">
                  Tap a pet to see what it can do.{' '}
                  <span className="block text-xs">More pets are coming soon.</span>
                </p>
              )}
            </div>
            {myPick && (
              <Button
                data-testid="mates-draft-confirm"
                disabled={busy || !chosen || !!taken.get(chosen)}
                onClick={() => {
                  if (!chosen) return;
                  onDraft(chosen);
                  setChosen(null);
                }}
                className="sticky bottom-0 min-h-16 w-full text-lg"
              >
                {chosen && !taken.get(chosen)
                  ? `Pick ${MONSTERS[chosen].names[0]}`
                  : 'Tap a pet to pick it'}
              </Button>
            )}
          </>
        ) : (
          <>
            <h2 className="text-center text-lg font-bold text-neon">Pick an arena</h2>
            <p className="text-center text-xs text-muted">
              A coin decides whose arena is used. The winner goes second and starts with 5 extra HP.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                data-testid="mates-stage-random"
                aria-pressed={stage === 'random'}
                disabled={confirmed}
                onClick={() => chooseStage('random')}
                className={`flex min-h-20 flex-col items-center justify-center rounded-md border-2 text-sm font-bold ${
                  stage === 'random' ? 'border-accent' : 'border-edge/40'
                }`}
              >
                <span className="text-2xl">🎲</span>
                Random
              </button>
              {STAGES.map((s) => (
                <button
                  key={s}
                  data-testid={`mates-stage-${s}`}
                  aria-pressed={stage === s}
                  disabled={confirmed}
                  onClick={() => chooseStage(s)}
                  className={`overflow-hidden rounded-md border-2 text-left text-xs ${
                    stage === s ? 'border-accent' : 'border-edge/40'
                  }`}
                >
                  <img
                    src={arenaUrl(s, STAGE_SPECS)}
                    alt=""
                    draggable={false}
                    style={px}
                    className="w-full"
                  />
                  <span className="block px-1.5 py-1">
                    <b>{STAGE_SPECS[s].name}</b>
                    <span className="block text-muted">{STAGE_SPECS[s].rule}</span>
                  </span>
                </button>
              ))}
            </div>
            <div ref={confirmRef}>
              {confirmed ? (
                <p className="text-center text-muted" data-testid="mates-waiting">
                  Waiting for your opponent…
                </p>
              ) : (
                <Button
                  data-testid="mates-ready"
                  disabled={busy}
                  className="min-h-16 w-full text-lg"
                  onClick={() => onConfirm(stage)}
                >
                  Confirm
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
