import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { seabattle } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Avatar, Button, TimerDrain } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useCountdown } from '../../lib/useCountdown';
import { useTimeWarning } from '../../lib/useTimeWarning';
import { BOMB_FRAMES, BOMB_FRAME_MS, bombMs, shipUrl } from './art';
import { Board } from './Board';
import type { DrawnShip, ShotFxState } from './Board';
import { CoinFlip } from './CoinFlip';
import { PlacementBoard, deviceRng } from './Placement';

const { FLEET, isSunk } = seabattle;

/** The radar sweep that reveals the ships nobody found, and when it starts after the last bomb. */
export const RADAR_MS = 1700;
/** The radar starts this long after the last bomb and the last ship's sinking have really finished. */
export const RADAR_START_MS = 200;
/**
 * When the standings take over after the last shot: the same for both players, so they arrive together.
 * The winner watches the last ship go down (bomb + sinking) and "You won!" pops up in the middle of the
 * standings; the loser skips the sinking and goes straight from the bomb to the radar.
 */
export const END_MS = 2600;

const nameOfShip = (kind: seabattle.ShipKind) => FLEET.find((f) => f.kind === kind)?.name ?? kind;

/** The enemy fleet as five small ships: the ones you have sunk show as wrecks, the rest are still afloat. */
function EnemyFleet({ sunk }: { sunk: Set<string> }) {
  return (
    <div
      className="flex items-center justify-center gap-3"
      data-testid="sb-enemy-fleet"
      aria-label="Enemy ships still afloat"
    >
      {FLEET.map((f) => {
        const down = sunk.has(f.kind);
        return (
          <img
            key={f.kind}
            src={shipUrl(f.kind, false, down)}
            alt={`${f.name}${down ? ' (sunk)' : ''}`}
            title={f.name}
            data-sunk={down}
            draggable={false}
            style={{
              imageRendering: 'pixelated',
              width: f.length * 10,
              height: 10,
              maxWidth: 'none',
              opacity: down ? 0.55 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

function useBoxSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 360, h: 560 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function SeaBattleGame({ room, me, sendMove }: GameUiProps) {
  const game = room.game!;
  const view = game.view as seabattle.SeaBattleView;
  const finished = room.status === 'finished' || view.phase === 'over';
  const myTurn = view.phase === 'play' && !finished && view.turn === me;
  const memberOf = (id: string) => room.members.find((m) => m.id === id);
  const meMember = memberOf(me);
  const oppMember = memberOf(view.opponent);
  const nameOf = (id: string) => (id === me ? 'You' : (memberOf(id)?.nickname ?? 'Opponent'));
  const secondsLeft = useCountdown(game.deadline, room.serverTime);
  useTimeWarning(secondsLeft, myTurn);

  const area = useRef<HTMLDivElement>(null);
  const { w, h } = useBoxSize(area);

  // ---- placing ------------------------------------------------------------------------------------
  const [fleet, setFleet] = useState<seabattle.Ship[]>(() => seabattle.randomFleet(deviceRng));
  const [busy, setBusy] = useState(false);
  const iAmReady = !!view.ready[me];
  const shownFleet = iAmReady && view.myShips.length ? view.myShips : fleet;

  // ---- the coin flip that decides who starts, shots and the radar ----------------------------------
  const [coin, setCoin] = useState(view.phase === 'play' && view.shotCount === 0);
  const lastPhase = useRef(view.phase);
  useEffect(() => {
    if (lastPhase.current === 'place' && view.phase === 'play') {
      setCoin(true);
      play('turn');
      const t = setTimeout(() => setCoin(false), seabattle.COIN_FLIP_MS);
      lastPhase.current = view.phase;
      return () => clearTimeout(t);
    }
    lastPhase.current = view.phase;
  }, [view.phase]);
  useEffect(() => {
    if (!coin || view.phase !== 'play' || view.shotCount > 0) return;
    // (Opened the game mid-flip, e.g. after a reload.)
    const t = setTimeout(() => setCoin(false), seabattle.COIN_FLIP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shots can be on their way at the same time (after a hit you may fire again before the bomb has landed).
  const [fxs, setFxs] = useState<{ board: 'enemy' | 'mine'; shot: ShotFxState }[]>([]);
  // A ship that was just sunk: its explosions, banner and wreck play after the bomb has landed.
  const [sink, setSink] = useState<{ board: 'enemy' | 'mine'; ship: seabattle.Ship } | null>(null);
  const pendingSinks = useRef(new Map<number, { board: 'enemy' | 'mine'; ship: seabattle.Ship }>());
  const sinkTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(sinkTimer.current), []);
  const seenSeq = useRef(view.lastEvent?.seq ?? 0);
  const startedOver = useRef(view.phase === 'over');
  // The last shot ended the game: the radar follows once its bomb and its sinking are done.
  const winSeq = useRef<number | null>(null);
  const iWon = useRef(false);
  const ev = view.lastEvent;
  useEffect(() => {
    if (!ev || ev.seq === seenSeq.current) return;
    seenSeq.current = ev.seq;
    if (ev.win) winSeq.current = ev.seq;
    iWon.current = ev.win && ev.by === me;
    const hit = ev.result !== 'miss';
    const entry = {
      board: (ev.by === me ? 'enemy' : 'mine') as 'enemy' | 'mine',
      shot: { seq: ev.seq, x: ev.x, y: ev.y, hit },
    };
    setFxs((list) => [...list, entry]);
    play('whistle');
    // (The loser does not get the sinking of their last ship: the radar follows the bomb at once.)
    if (ev.result === 'sunk' && ev.sunk && !(ev.win && ev.by !== me)) {
      const mine = ev.by === me;
      const ship = (mine ? view.sunk : view.myShips).find((s) => s.kind === ev.sunk);
      if (ship) pendingSinks.current.set(ev.seq, { board: mine ? 'enemy' : 'mine', ship });
    }
    const land = setTimeout(() => {
      play(hit ? 'boom' : 'splash');
      if (ev.by !== me && hit) haptic('error');
      else haptic('tap');
    }, BOMB_FRAMES * BOMB_FRAME_MS);
    return () => clearTimeout(land);
    // (Only a new event counts; the ships are read from the view that came with it.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev, me]);
  // The radar sweeps the sea when the game ends while we watch, and only once everything before it
  // (the last bomb, the last ship going down) has finished.
  const [radarOn, setRadarOn] = useState(false);
  const startRadar = useCallback((seq: number) => {
    if (winSeq.current !== seq) return;
    winSeq.current = null;
    if (iWon.current) return; // the winner goes straight to the standings: nothing was left to find
    setRadarOn(true);
    setTimeout(() => play('ping'), RADAR_START_MS);
  }, []);
  const fxDone = useCallback(
    (seq: number) => {
      setFxs((list) => list.filter((f) => f.shot.seq !== seq));
      const next = pendingSinks.current.get(seq);
      pendingSinks.current.delete(seq);
      if (!next) {
        startRadar(seq);
        return;
      }
      setSink(next);
      play('sink');
      haptic('error');
      clearTimeout(sinkTimer.current);
      sinkTimer.current = setTimeout(() => {
        setSink(null);
        startRadar(seq);
      }, seabattle.SINK_MS);
    },
    [startRadar],
  );

  // ---- aiming --------------------------------------------------------------------------------------
  // One tap fires. The board only stays shut for the moment the server needs to answer (so a miss cannot be
  // followed by a second tap that is out of turn); after a hit you can fire again while the bomb is still falling.
  const [inflight, setInflight] = useState(false);
  useEffect(() => setInflight(false), [view.shotCount]);
  const locked = coin || finished || inflight;
  const send = async (move: unknown) => {
    if (busy) return;
    setBusy(true);
    const res = await sendMove(move);
    setBusy(false);
    return res;
  };
  const tapCell = (x: number, y: number) => {
    if (!myTurn || locked) return;
    if (view.outgoing.some((s) => s.x === x && s.y === y)) return;
    setInflight(true);
    void sendMove({ type: 'fire', x, y }).then((res) => {
      if (!res.ok) setInflight(false);
    });
  };

  // ---- sizes ----------------------------------------------------------------------------------------
  const placing = view.phase === 'place';
  const cell = useMemo(() => {
    const byWidth = Math.floor((w - 24) / 10);
    const chrome = placing ? 250 : 275;
    const byHeight = placing ? Math.floor((h - chrome) / 10) : Math.floor((h - chrome) / 15);
    const c = Math.max(16, Math.min(32, byWidth, byHeight));
    return placing ? c : c - (c % 2);
  }, [w, h, placing]);
  const mini = Math.max(8, Math.floor(cell / 2));

  // ---- what to draw ----------------------------------------------------------------------------------
  const going = (board: 'enemy' | 'mine', ship: seabattle.Ship) =>
    sink?.board === board && sink.ship.kind === ship.kind;
  const enemyShips: DrawnShip[] = view.sunk.map((ship) => ({
    ship,
    sunk: !going('enemy', ship),
    sinking: going('enemy', ship),
  }));
  const revealedShips: seabattle.Ship[] = view.revealed;
  const radar =
    finished && radarOn
      ? { ships: revealedShips, delayMs: RADAR_START_MS, durationMs: RADAR_MS }
      : null;
  // (A game opened already finished shows the survivors at once; one that ends live waits for the radar.)
  if (finished && !radarOn && startedOver.current)
    for (const ship of revealedShips) enemyShips.push({ ship });
  const myShipsDrawn: DrawnShip[] = view.myShips.map((ship) => ({
    ship,
    sunk: isSunk(ship, view.incoming) && !going('mine', ship),
    sinking: going('mine', ship),
  }));

  const eventText = (() => {
    if (fxs.length > 0) return 'Bomb away…';
    if (!ev) return '';
    const mine = ev.by === me;
    if (ev.result === 'miss') return mine ? 'You missed: only water.' : `${nameOf(ev.by)} missed.`;
    if (ev.result === 'hit')
      return mine ? 'Direct hit! Fire again.' : `${nameOf(ev.by)} hit your ship and fires again!`;
    const ship = ev.sunk ? nameOfShip(ev.sunk) : 'ship';
    return mine
      ? `You sunk their ${ship}! Fire again.`
      : `${nameOf(ev.by)} sunk your ${ship} and fires again!`;
  })();

  const status = (() => {
    if (placing) return iAmReady ? `Waiting for ${nameOf(view.opponent)}…` : 'Place your fleet';
    if (finished) {
      if (radar)
        return view.winner === me ? 'All enemy ships destroyed!' : 'Radar: the hidden ships';
      return view.winner === me ? 'You sank the whole fleet!' : 'Your fleet is lost.';
    }
    if (coin) return 'Who starts?';
    if (myTurn) return 'Your turn: tap a square to fire';
    return `${nameOf(view.turn)} is aiming…`;
  })();

  const timerTotal = room.turnTimeSec;
  const contender = (id: string, mine: boolean) => {
    const m = memberOf(id);
    const active = !finished && (placing ? !view.ready[id] : view.turn === id);
    return (
      <div
        className="flex min-w-0 flex-1 flex-col items-center gap-1"
        data-testid={`sb-player-${mine ? 'me' : 'opponent'}`}
        data-active={active}
      >
        {/* The turn clock of whoever is up, as a small draining bar (like the reference game). */}
        <div
          className={`relative h-2 w-20 overflow-hidden rounded-full ${timerTotal > 0 ? 'bg-black/35' : ''}`}
        >
          {active && timerTotal > 0 && (
            <TimerDrain
              deadline={game.deadline}
              serverTime={room.serverTime}
              totalSec={timerTotal}
              urgent={secondsLeft !== null && secondsLeft <= 10}
              active
            />
          )}
        </div>
        <span
          className={
            active ? 'rounded-[8px] ring-2 ring-neon ring-offset-2 ring-offset-transparent' : ''
          }
        >
          <Avatar avatar={m?.avatar ?? 'fox'} size="md" />
        </span>
        <span className="max-w-full truncate text-sm font-bold text-onbg">
          <PlayerName name={m?.nickname ?? (mine ? 'You' : 'Opponent')} />
        </span>
        {placing && view.ready[id] && (
          <span
            className="label text-[10px] text-neon"
            data-testid={`sb-ready-${mine ? 'me' : 'opponent'}`}
          >
            ✓ Ready
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      data-testid="seabattle-game"
      data-phase={view.phase}
    >
      <div ref={area} className="flex min-h-0 flex-1 flex-col items-center gap-2 px-3 pb-2">
        {/* Who plays whom: me, VS, the opponent. The one who is up has the gold ring and the clock. */}
        <div className="flex w-full max-w-sm items-start justify-center gap-2 pt-1">
          {contender(me, true)}
          {/* Between the players: an arrow to whoever is up and, with a turn timer, the seconds left. */}
          <div
            className="flex w-16 shrink-0 items-center justify-center gap-1 self-center pt-3"
            data-testid="sb-turn-arrow"
            data-turn={placing ? 'both' : finished ? 'none' : view.turn === me ? 'me' : 'opponent'}
          >
            {placing || finished ? (
              <span className="label text-xl text-onbg">VS</span>
            ) : (
              <>
                {/* The arrow points at whoever is up and sits right next to the seconds: "< 23" / "23 >". */}
                {timerTotal > 0 && view.turn === me && (
                  <span
                    className="turn-arrow text-base font-bold leading-none text-neon"
                    style={{ ['--nudge' as string]: '-2px' }}
                  >
                    ◀
                  </span>
                )}
                {timerTotal > 0 && secondsLeft !== null && (
                  <span
                    className={`label text-lg leading-none ${secondsLeft <= 10 ? 'text-dangertext' : 'text-onbg'}`}
                    data-testid="sb-countdown"
                  >
                    {secondsLeft}
                  </span>
                )}
                {timerTotal > 0 && view.turn !== me && (
                  <span
                    className="turn-arrow text-base font-bold leading-none text-neon"
                    style={{ ['--nudge' as string]: '2px' }}
                  >
                    ▶
                  </span>
                )}
              </>
            )}
          </div>
          {contender(view.opponent, false)}
        </div>

        {placing ? (
          <>
            <PlacementBoard
              cell={cell}
              fleet={shownFleet}
              onChange={setFleet}
              locked={iAmReady || busy}
            />
            <p className="label text-center text-sm text-onbg" data-testid="sb-status">
              {status}
            </p>
            <p className="max-w-[20rem] text-center text-xs text-onbg/80">
              {iAmReady
                ? 'Your fleet is in position.'
                : 'Drag a ship to move it. Tap a ship to turn it.'}
            </p>
            <div className="mt-auto flex w-full max-w-sm gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Button
                variant="secondary"
                className="min-h-14 shrink-0 !px-4"
                disabled={iAmReady || busy}
                onClick={() => {
                  haptic('tap');
                  setFleet(seabattle.randomFleet(deviceRng));
                }}
                data-testid="sb-random"
              >
                🎲 Random
              </Button>
              <Button
                className="relative min-h-14 flex-1 overflow-hidden"
                disabled={iAmReady || busy}
                data-testid="sb-ready"
                onClick={async () => {
                  const res = await send({ type: 'ready', ships: fleet });
                  if (res?.ok) haptic('success');
                }}
              >
                <TimerDrain
                  deadline={game.deadline}
                  serverTime={room.serverTime}
                  totalSec={room.turnTimeSec}
                  urgent={secondsLeft !== null && secondsLeft <= 10}
                  active={!iAmReady}
                />
                <span className="relative">{iAmReady ? 'Waiting…' : 'Play'}</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <Board
              cell={cell}
              testId="sb-enemy-board"
              ships={enemyShips}
              shots={view.outgoing}
              hideShots={fxs.filter((f) => f.board === 'enemy').map((f) => f.shot)}
              fxs={fxs.filter((f) => f.board === 'enemy').map((f) => f.shot)}
              onFxDone={fxDone}
              sinking={sink?.board === 'enemy' ? sink.ship : null}
              radar={radar}
              onCell={myTurn && !locked ? tapCell : undefined}
            />
            <div className="min-h-[2.75rem] text-center" aria-live="polite">
              <p
                className="text-sm font-bold text-onbg"
                data-testid="sb-event"
                data-seq={view.shotCount}
              >
                {eventText}
              </p>
              <p className="label text-[11px] text-onbg/80" data-testid="sb-status">
                {status}
              </p>
            </div>
            <EnemyFleet sunk={new Set(view.sunk.map((s) => s.kind))} />
            <Board
              cell={mini}
              testId="sb-my-board"
              ships={myShipsDrawn}
              shots={view.incoming}
              hideShots={fxs.filter((f) => f.board === 'mine').map((f) => f.shot)}
              fxs={fxs.filter((f) => f.board === 'mine').map((f) => f.shot)}
              onFxDone={fxDone}
              sinking={sink?.board === 'mine' ? sink.ship : null}
            />
          </>
        )}
      </div>

      {coin && view.phase === 'play' && (
        <CoinFlip
          meAvatar={meMember?.avatar ?? 'fox'}
          oppAvatar={oppMember?.avatar ?? 'fox'}
          oppName={oppMember?.nickname ?? 'Opponent'}
          iStart={view.first === me}
        />
      )}
    </div>
  );
}

// Re-exported so the plug-in can time the end of the game.
export { bombMs };
