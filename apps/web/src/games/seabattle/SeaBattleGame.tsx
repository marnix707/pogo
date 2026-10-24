import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { seabattle } from '@pogo/shared';
import type { GameUiProps } from '../types';
import { Button, TimerDrain } from '../../components/ui';
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
export const RADAR_MS = 3200;
export const RADAR_DELAY_MS = seabattle.SHOT_FX_MS;

const nameOfShip = (kind: seabattle.ShipKind) => FLEET.find((f) => f.kind === kind)?.name ?? kind;

/** The five ships as small icons: a wreck once it is sunk. */
function FleetStrip({ label, sunk, testId }: { label: string; sunk: Set<string>; testId: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="label text-[10px] text-onbg/80">{label}</span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {FLEET.map((f) => (
          <img
            key={f.kind}
            src={shipUrl(f.kind, false, sunk.has(f.kind))}
            alt={f.name}
            title={f.name}
            data-sunk={sunk.has(f.kind)}
            draggable={false}
            style={{
              imageRendering: 'pixelated',
              width: f.length * 8,
              height: 8,
              maxWidth: 'none',
              opacity: sunk.has(f.kind) ? 0.7 : 1,
            }}
          />
        ))}
      </div>
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

  const [fx, setFx] = useState<{ board: 'enemy' | 'mine'; shot: ShotFxState } | null>(null);
  const seenSeq = useRef(view.lastEvent?.seq ?? 0);
  const startedOver = useRef(view.phase === 'over');
  const ev = view.lastEvent;
  useEffect(() => {
    if (!ev || ev.seq === seenSeq.current) return;
    seenSeq.current = ev.seq;
    setAim(null);
    const hit = ev.result !== 'miss';
    setFx({ board: ev.by === me ? 'enemy' : 'mine', shot: { seq: ev.seq, x: ev.x, y: ev.y, hit } });
    play('whistle');
    const land = setTimeout(() => {
      play(hit ? 'boom' : 'splash');
      if (ev.by !== me && hit) haptic('error');
      else haptic('tap');
    }, BOMB_FRAMES * BOMB_FRAME_MS);
    return () => clearTimeout(land);
  }, [ev, me]);
  const fxDone = useCallback(() => setFx(null), []);

  // The radar sweeps the sea when the game ends while we watch.
  const [radarOn, setRadarOn] = useState(false);
  useEffect(() => {
    if (view.phase !== 'over' || startedOver.current) return;
    setRadarOn(true);
    const ping = setTimeout(() => play('ping'), RADAR_DELAY_MS);
    return () => clearTimeout(ping);
  }, [view.phase]);

  // ---- aiming --------------------------------------------------------------------------------------
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const locked = coin || fx !== null || finished;
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
    if (aim && aim.x === x && aim.y === y) {
      void fire(x, y);
      return;
    }
    haptic('tap');
    play('tap');
    setAim({ x, y });
  };
  const fire = async (x: number, y: number) => {
    const res = await send({ type: 'fire', x, y });
    if (res?.ok) setAim(null);
  };

  // ---- sizes ----------------------------------------------------------------------------------------
  const placing = view.phase === 'place';
  const cell = useMemo(() => {
    const byWidth = Math.floor((w - 24) / 10);
    const chrome = placing ? 190 : 250;
    const byHeight = placing ? Math.floor((h - chrome) / 10) : Math.floor((h - chrome) / 15);
    const c = Math.max(16, Math.min(32, byWidth, byHeight));
    return placing ? c : c - (c % 2);
  }, [w, h, placing]);
  const mini = Math.max(8, Math.floor(cell / 2));

  // ---- what to draw ----------------------------------------------------------------------------------
  const enemySunk = new Set(view.sunk.map((s) => s.kind));
  const mySunk = new Set(view.myShips.filter((s) => isSunk(s, view.incoming)).map((s) => s.kind));
  const enemyShips: DrawnShip[] = view.sunk.map((ship) => ({ ship, sunk: true }));
  const revealedShips: seabattle.Ship[] = view.revealed;
  const radar =
    finished && radarOn
      ? { ships: revealedShips, delayMs: RADAR_DELAY_MS, durationMs: RADAR_MS }
      : null;
  if (finished && !radarOn) for (const ship of revealedShips) enemyShips.push({ ship });
  const myShipsDrawn: DrawnShip[] = view.myShips.map((ship) => ({
    ship,
    sunk: isSunk(ship, view.incoming),
  }));

  const eventText = (() => {
    if (fx) return 'Bomb away…';
    if (!ev) return '';
    const mine = ev.by === me;
    if (ev.result === 'miss') return mine ? 'You missed: only water.' : `${nameOf(ev.by)} missed.`;
    if (ev.result === 'hit') return mine ? 'Direct hit!' : `${nameOf(ev.by)} hit your ship!`;
    const ship = ev.sunk ? nameOfShip(ev.sunk) : 'ship';
    return mine ? `You sunk their ${ship}!` : `${nameOf(ev.by)} sunk your ${ship}!`;
  })();

  const status = (() => {
    if (placing) return iAmReady ? `Waiting for ${nameOf(view.opponent)}…` : 'Place your fleet';
    if (finished) {
      if (radar)
        return view.winner === me ? 'All enemy ships destroyed!' : 'Radar: the hidden ships';
      return view.winner === me ? 'You sank the whole fleet!' : 'Your fleet is lost.';
    }
    if (coin) return 'Who starts?';
    if (myTurn) return aim ? 'Tap again (or Fire!) to launch' : 'Your turn: pick a square';
    return `${nameOf(view.turn)} is aiming…`;
  })();

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      data-testid="seabattle-game"
      data-phase={view.phase}
    >
      <div ref={area} className="flex min-h-0 flex-1 flex-col items-center gap-2 px-3 pb-2">
        <p
          className="label min-h-[1.25rem] pt-1 text-center text-sm text-onbg"
          data-testid="sb-status"
        >
          {status}
        </p>

        {placing ? (
          <>
            <PlacementBoard
              cell={cell}
              fleet={shownFleet}
              onChange={setFleet}
              locked={iAmReady || busy}
            />
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
            <div className="relative">
              <Board
                cell={cell}
                testId="sb-enemy-board"
                ships={enemyShips}
                shots={view.outgoing}
                hideShot={fx?.board === 'enemy' ? fx.shot : null}
                fx={fx?.board === 'enemy' ? fx.shot : null}
                onFxDone={fxDone}
                target={myTurn && !locked ? aim : null}
                radar={radar}
                onCell={myTurn && !locked ? tapCell : undefined}
              />
            </div>
            <p
              className="min-h-[1.25rem] text-center text-sm text-onbg"
              data-testid="sb-event"
              data-seq={view.shotCount}
            >
              {eventText}
            </p>
            <div className="flex w-full max-w-sm items-start gap-3">
              <Board
                cell={mini}
                testId="sb-my-board"
                ships={myShipsDrawn}
                shots={view.incoming}
                hideShot={fx?.board === 'mine' ? fx.shot : null}
                fx={fx?.board === 'mine' ? fx.shot : null}
                onFxDone={fxDone}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <FleetStrip label="Enemy fleet" sunk={enemySunk} testId="sb-enemy-fleet" />
                <FleetStrip label="Your fleet" sunk={mySunk} testId="sb-my-fleet" />
              </div>
            </div>
            <div className="mt-auto w-full max-w-sm pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Button
                className="relative min-h-14 w-full overflow-hidden"
                variant={myTurn ? 'primary' : 'secondary'}
                disabled={!myTurn || locked || !aim || busy}
                onClick={() => aim && void fire(aim.x, aim.y)}
                data-testid="sb-fire"
              >
                <TimerDrain
                  deadline={game.deadline}
                  serverTime={room.serverTime}
                  totalSec={room.turnTimeSec}
                  urgent={secondsLeft !== null && secondsLeft <= 10}
                  active={myTurn}
                />
                <span className="relative">
                  {finished
                    ? 'Game over'
                    : myTurn
                      ? aim
                        ? 'Fire!'
                        : 'Pick a square'
                      : `${nameOf(view.turn)}…`}
                </span>
              </Button>
            </div>
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
