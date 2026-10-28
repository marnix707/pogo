import { useEffect, useMemo, useRef, useState } from 'react';
import { matchmates } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, Button, TimerDrain } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import { useTimeWarning } from '../../lib/useTimeWarning';
import { ARENA, arenaUrl, iceUrl, monsterSize, monsterUrl, tileUrl } from './art';
import { Pick } from './Pick';

const {
  COLS,
  CELLS,
  MONSTERS,
  STAGE_SPECS,
  evolveCost,
  BERRIES_TO_EVOLVE,
  STEP_MS,
  FIRE_MS,
  SWAP_MS,
} = matchmates;

const px = { imageRendering: 'pixelated' } as const;
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Anim {
  board: matchmates.MateCell[];
  flash: Set<number>;
}
interface Pop {
  id: number;
  owner: string;
  text: string;
}

/** Horizontal spot of a player's monsters on their battle pad (art pixels from the pad centre). */
const SLOT_DX = [-9, 10];
const SLOT_DY = [3, -2];

function Bar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded-sm border border-edge/60 bg-black/50"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function MatchMatesGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const view = game.view as matchmates.MatesView;
  const finished = room.status === 'finished' || view.phase === 'over';
  const myTurn = view.phase === 'play' && !finished && view.turn === me;
  const memberOf = (id: string) => room.members.find((m) => m.id === id);
  const secondsLeft = useCountdown(game.deadline, room.serverTime);
  useTimeWarning(secondsLeft, myTurn || view.phase === 'pick');

  const mine = view.players.find((p) => p.id === me) ?? view.players[0]!;
  const theirs = view.players.find((p) => p.id !== mine.id)!;

  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [lunge, setLunge] = useState<{ owner: string; slot: number } | null>(null);
  const seen = useRef(view.moveCount);

  const send = async (move: matchmates.MatesMove) => {
    setBusy(true);
    try {
      await sendMove(move);
    } finally {
      setBusy(false);
    }
  };

  // Replay the latest move: the swap, then every cascade (flash, fall) and every attack.
  useEffect(() => {
    if (view.moveCount <= seen.current) {
      seen.current = view.moveCount;
      return;
    }
    seen.current = view.moveCount;
    const ev = view.lastEvent;
    if (!ev || reducedMotion()) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    let t = 0;
    let board = ev.swapped ?? view.board;
    if (ev.swapped) setAnim({ board, flash: new Set() });
    t += SWAP_MS;
    let popId = 0;
    const fireAt = (k: number) => {
      for (const f of ev.fires.filter((x) => x.step === k)) {
        const target = f.owner === me ? theirs.id : me;
        at(t, () => {
          setLunge({ owner: f.owner, slot: f.slot });
          play('boom');
          setPops((p) => [
            ...p,
            { id: ++popId + ev.seq * 100, owner: target, text: `-${f.damage}` },
          ]);
        });
        at(t + FIRE_MS - 100, () => setLunge(null));
        t += FIRE_MS;
      }
    };
    ev.steps.forEach((step, i) => {
      fireAt(i);
      const before = board;
      at(t, () => {
        setAnim({ board: before, flash: new Set(step.cleared) });
        play('crunch');
      });
      at(t + STEP_MS * 0.45, () => setAnim({ board: step.board, flash: new Set() }));
      board = step.board;
      t += STEP_MS;
    });
    fireAt(ev.steps.length);
    at(t, () => {
      setAnim(null);
      setLunge(null);
    });
    at(t + 900, () => setPops([]));
    return () => {
      timers.forEach(clearTimeout);
      setAnim(null);
      setLunge(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.moveCount]);

  const animating = anim !== null;
  const board = anim?.board ?? view.board;
  const canAct = myTurn && !busy && !animating;

  const trySwap = (a: number, b: number) => {
    setSelected(null);
    if (!matchmates.adjacent(a, b)) return;
    haptic('tap');
    void send({ type: 'swap', a, b });
  };
  const tap = (i: number) => {
    if (!canAct) return;
    if (selected === null) setSelected(i);
    else if (selected === i) setSelected(null);
    else if (matchmates.adjacent(selected, i)) trySwap(selected, i);
    else setSelected(i);
  };
  const drag = useRef<{ i: number; x: number; y: number } | null>(null);
  const onDown = (i: number, e: React.PointerEvent) => {
    drag.current = { i, x: e.clientX, y: e.clientY };
  };
  const onUp = (i: number, e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !canAct) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) {
      if (d.i === i) tap(i);
      return;
    }
    const to =
      Math.abs(dx) > Math.abs(dy) ? d.i + (dx > 0 ? 1 : -1) : d.i + (dy > 0 ? COLS : -COLS);
    if (
      to < 0 ||
      to >= CELLS ||
      (Math.abs(dx) > Math.abs(dy) && Math.floor(to / COLS) !== Math.floor(d.i / COLS))
    )
      return;
    trySwap(d.i, to);
  };

  const stage = view.stage ?? 'stadium';
  const sides = [
    { p: mine, pad: ARENA.player, flip: false },
    { p: theirs, pad: ARENA.opponent, flip: true },
  ];
  const winnerName = useMemo(
    () => (view.winner ? (memberOf(view.winner)?.nickname ?? 'Opponent') : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.winner, room.members],
  );

  if (view.phase === 'pick') {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="mates-game" data-phase={view.phase}>
        <Pick
          waiting={!!view.picked[me]}
          busy={busy}
          onPick={(elements, stage) => void send({ type: 'pick', elements, stage })}
        />
      </div>
    );
  }

  const evolveBerries = evolveCost(stage);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2" data-testid="mates-game" data-phase={view.phase}>
      <style>{`
        @keyframes mates-lunge { 0%{transform:translateX(0)} 40%{transform:translateX(var(--lunge))} 100%{transform:translateX(0)} }
        @keyframes mates-pop { 0%{opacity:0;transform:translateY(0) scale(.6)} 20%{opacity:1;transform:translateY(-6px) scale(1.2)} 100%{opacity:0;transform:translateY(-28px) scale(1)} }
        @keyframes mates-flash { 0%,100%{filter:none} 50%{filter:brightness(2.4)} }
      `}</style>

      <div className="grid grid-cols-2 gap-2">
        {sides.map(({ p }, n) => {
          const member = memberOf(p.id);
          return (
            <div
              key={p.id}
              className={`flex flex-col gap-1 rounded-md border-2 p-1.5 ${
                view.turn === p.id && view.phase === 'play' ? 'border-accent' : 'border-edge/40'
              } ${n === 1 ? 'text-right' : ''}`}
              data-testid={n === 0 ? 'mates-me' : 'mates-opp'}
            >
              <div className={`flex items-center gap-1.5 ${n === 1 ? 'flex-row-reverse' : ''}`}>
                <Avatar avatar={member?.avatar ?? '🙂'} size="sm" />
                <span className="truncate text-xs font-bold">
                  <PlayerName name={p.id === me ? 'You' : (member?.nickname ?? 'Opponent')} />
                </span>
              </div>
              <Bar value={p.hp} max={p.maxHp} color="#e5484d" label="Hit points" />
              <div className="flex justify-between text-[11px] font-bold">
                <span data-testid={`mates-hp-${n === 0 ? 'me' : 'opp'}`}>
                  {p.hp}/{p.maxHp} HP
                </span>
                <span className="flex items-center gap-0.5" title="Berries">
                  <img src={tileUrl({ k: 'berry' })} alt="Berries" className="h-4 w-4" style={px} />
                  <span data-testid={`mates-berries-${n === 0 ? 'me' : 'opp'}`}>{p.berries}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="relative w-full shrink-0 overflow-hidden rounded-md border-2 border-edge/60"
        style={{ aspectRatio: `${ARENA.w} / ${ARENA.h}`, maxHeight: '28dvh' }}
        data-testid="mates-arena"
      >
        <img
          src={arenaUrl(stage, STAGE_SPECS)}
          alt={STAGE_SPECS[stage].name}
          draggable={false}
          style={px}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {sides.map(({ p, pad, flip }) =>
          p.monsters.map((m, slot) => {
            const [w, h] = monsterSize(m.evolved);
            const x = pad.x + (flip ? -(SLOT_DX[slot] ?? 0) : (SLOT_DX[slot] ?? 0));
            const y = pad.y + (SLOT_DY[slot] ?? 0);
            const spec = MONSTERS[m.element];
            const lunging = lunge?.owner === p.id && lunge.slot === slot;
            return (
              <div
                key={`${p.id}-${slot}`}
                className="absolute"
                style={{
                  left: `${((x - w / 2) / ARENA.w) * 100}%`,
                  top: `${((y - h) / ARENA.h) * 100}%`,
                  width: `${(w / ARENA.w) * 100}%`,
                }}
                data-testid={`mates-monster-${p.id === me ? 'me' : 'opp'}-${slot}`}
              >
                <img
                  src={monsterUrl(m.element, m.evolved)}
                  alt={spec.names[m.evolved ? 1 : 0]}
                  draggable={false}
                  className="w-full"
                  style={{
                    ...px,
                    transform: flip ? 'scaleX(-1)' : undefined,
                    ['--lunge' as string]: flip ? '-30%' : '30%',
                    animation: lunging ? `mates-lunge ${FIRE_MS - 100}ms ease-in-out` : undefined,
                  }}
                />
                <div
                  className="mx-auto mt-0.5 w-[120%] -translate-x-[8%]"
                  title={`${spec.names[m.evolved ? 1 : 0]}: ${m.mana}/${spec.cost} mana`}
                >
                  <Bar value={m.mana} max={spec.cost} color="#3aa6ff" label="Mana" />
                </div>
              </div>
            );
          }),
        )}
        {pops.map((p) => (
          <span
            key={p.id}
            className="pointer-events-none absolute text-2xl font-black text-white [text-shadow:0_2px_0_#101628]"
            style={{
              left: p.owner === me ? '22%' : '62%',
              top: p.owner === me ? '45%' : '25%',
              animation: 'mates-pop 900ms ease-out forwards',
            }}
          >
            {p.text}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span data-testid="mates-turn" className={myTurn ? 'text-neon' : 'text-muted'}>
          {finished
            ? `${winnerName === 'You' || view.winner === me ? 'You win' : `${winnerName ?? 'Opponent'} wins`}!`
            : myTurn
              ? 'Your turn'
              : `${memberOf(view.turn)?.nickname ?? 'Opponent'}'s turn`}
        </span>
        <span
          className="flex items-center gap-1"
          data-testid="mates-moves"
          aria-label={`${view.movesLeft} moves left`}
        >
          {Array.from({ length: Math.max(2, view.movesLeft) }, (_, i) => (
            <span
              key={i}
              className={`inline-block h-3 w-3 rotate-45 border-2 border-edge ${
                i < view.movesLeft && !finished ? 'bg-accent' : 'bg-black/40'
              }`}
            />
          ))}
        </span>
        <span className="flex gap-1">
          {mine.monsters.map((m, slot) => {
            const spec = MONSTERS[m.element];
            const can =
              canAct &&
              (m.evolved ? mine.berries >= BERRIES_TO_EVOLVE : mine.berries >= evolveBerries);
            return (
              <Button
                key={slot}
                variant="secondary"
                data-testid={`mates-${m.evolved ? 'boost' : 'evolve'}-${slot}`}
                disabled={!can}
                className="!min-h-0 !px-2 !py-1 text-[11px]"
                onClick={() => void send({ type: m.evolved ? 'boost' : 'evolve', slot })}
              >
                {m.evolved ? 'Boost' : 'Evolve'} {spec.names[m.evolved ? 1 : 0]} (
                {m.evolved ? BERRIES_TO_EVOLVE : evolveBerries})
              </Button>
            );
          })}
        </span>
      </div>
      <TimerDrain
        deadline={game.deadline}
        serverTime={room.serverTime}
        totalSec={room.turnTimeSec}
        urgent={secondsLeft !== null && secondsLeft <= 5}
        active={myTurn}
      />

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="grid aspect-square h-full max-w-full touch-none select-none gap-px rounded-md border-2 border-edge/60 p-0.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, background: '#233049' }}
          data-testid="mates-board"
        >
          {board.map((cell, i) => (
            <button
              key={i}
              type="button"
              data-testid={`mates-cell-${i}`}
              data-kind={cell.k}
              aria-label={`${cell.k}${cell.frozen ? ' (frozen)' : ''}`}
              onPointerDown={(e) => onDown(i, e)}
              onPointerUp={(e) => onUp(i, e)}
              onPointerCancel={() => (drag.current = null)}
              className={`relative aspect-square min-h-0 min-w-0 p-0 ${
                (Math.floor(i / COLS) + (i % COLS)) % 2 ? 'bg-[#2b3a58]' : 'bg-[#233049]'
              } ${selected === i ? 'outline outline-2 -outline-offset-2 outline-white' : ''}`}
              style={{
                animation: anim?.flash.has(i) ? 'mates-flash 300ms ease-in-out' : undefined,
              }}
            >
              <img
                src={tileUrl(cell)}
                alt=""
                draggable={false}
                className={`h-full w-full ${anim?.flash.has(i) ? 'opacity-60' : ''}`}
                style={px}
              />
              {cell.frozen && (
                <img
                  src={iceUrl()}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full"
                  style={px}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
