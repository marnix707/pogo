import { useState } from 'react';
import { matchmates } from '@pogo/shared';
import { Avatar, Button } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { arenaUrl, monsterUrl } from './art';

const { ELEMENTS, MONSTERS, STAGES, STAGE_SPECS } = matchmates;

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
  const [stage, setStage] = useState<matchmates.StageId | 'random'>('random');
  const mine = view.players.find((p) => p.id === view.me)!;
  const theirs = view.players.find((p) => p.id !== view.me)!;
  const taken = new Map<matchmates.Element, string>();
  for (const p of view.players) for (const m of p.monsters) taken.set(m.element, p.id);
  const personOf = (id: string) => people.find((p) => p.id === id);
  const myPick = view.drafter === view.me;
  const draftOver = view.drafter === null;
  const confirmed = !!view.confirmed[view.me];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      data-testid="mates-pick"
    >
      <div className="grid grid-cols-2 gap-2">
        {[mine, theirs].map((p, n) => {
          const who = personOf(p.id);
          const active = view.drafter === p.id;
          return (
            <div
              key={p.id}
              className={`flex flex-col gap-1 rounded-md border-2 p-1.5 ${
                active ? 'border-accent' : 'border-edge/40'
              }`}
              data-testid={n === 0 ? 'mates-draft-me' : 'mates-draft-opp'}
            >
              <div className="flex items-center gap-1.5">
                <Avatar avatar={who?.avatar ?? '🙂'} size="sm" />
                <span className="truncate text-xs font-bold">
                  <PlayerName name={n === 0 ? 'You' : (who?.name ?? 'Opponent')} />
                </span>
                {view.confirmed[p.id] && <span className="ml-auto text-xs text-neon">Ready</span>}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[0, 1].map((slot) => {
                  const m = p.monsters[slot];
                  return (
                    <div
                      key={slot}
                      className="flex h-14 items-center justify-center rounded border border-edge/40 bg-black/30"
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
          <div className="grid grid-cols-5 gap-1.5">
            {ELEMENTS.map((e) => {
              const owner = taken.get(e);
              return (
                <button
                  key={e}
                  data-testid={`mates-pick-${e}`}
                  disabled={!myPick || busy || !!owner}
                  onClick={() => onDraft(e)}
                  className={`flex flex-col items-center rounded-md border-2 p-1 text-[10px] font-bold ${
                    owner
                      ? 'border-edge/20 opacity-30'
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
                    className="h-14"
                  />
                  {MONSTERS[e].names[0]}
                  <span className="font-normal text-muted">{e}</span>
                </button>
              );
            })}
          </div>
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
              onClick={() => setStage('random')}
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
                onClick={() => setStage(s)}
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
          {confirmed ? (
            <p className="text-center text-muted" data-testid="mates-waiting">
              Waiting for your opponent…
            </p>
          ) : (
            <Button data-testid="mates-ready" disabled={busy} onClick={() => onConfirm(stage)}>
              Confirm
            </Button>
          )}
        </>
      )}
    </div>
  );
}
