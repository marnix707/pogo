import { useEffect, useState } from 'react';
import { yatzy } from '@pogo/shared';
import type { AuthResponse, RoomView } from '@pogo/shared';
import { useRealtime } from './lib/socket';

const btn =
  'rounded-2xl bg-violet-600 px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-40';
const ghost =
  'rounded-2xl bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm active:scale-95 dark:bg-slate-900 dark:text-slate-100';

/** Temporary development UI for exercising rooms + a Yatzy game (replaced by the real UI in M4). */
export function Playground({
  session,
  onSignOut,
}: {
  session: AuthResponse;
  onSignOut: () => void;
}) {
  const { connection, room, leftReason, request } = useRealtime(session.token);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();

  // Share links look like /?join=ABCDE: join once connected, then tidy the URL.
  useEffect(() => {
    const joinCode = new URLSearchParams(window.location.search).get('join');
    if (!joinCode || connection !== 'online') return;
    window.history.replaceState(null, '', window.location.pathname);
    void request('room:join', { code: joinCode }).then((res) => {
      if (!res.ok) setError(res.error);
    });
  }, [connection, request]);

  async function act(promise: Promise<{ ok: boolean } & { error?: string }>) {
    const res = await promise;
    setError(res.ok ? undefined : res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900">
        <div>
          <div className="font-semibold">
            {session.user.nickname} <span className="text-slate-500">({session.user.avatar})</span>
          </div>
          <div className="text-sm text-slate-500">
            <span
              className={`mr-1 inline-block h-2 w-2 rounded-full ${
                connection === 'online'
                  ? 'bg-emerald-500'
                  : connection === 'connecting'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
              }`}
            />
            {connection === 'online'
              ? 'Connected'
              : connection === 'connecting'
                ? 'Connecting…'
                : 'Reconnecting…'}
          </div>
        </div>
        <button onClick={onSignOut} className="text-sm text-slate-500 underline">
          Switch player
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-700">{error}</p>}
      {!room && leftReason && (
        <p className="text-slate-500">
          {leftReason === 'kicked' ? 'You were removed from the room.' : 'The room is gone.'}
        </p>
      )}

      {!room ? (
        <div className="flex flex-col gap-3">
          <button
            className={btn}
            onClick={() => act(request('room:create', { gameId: 'yatzy', visibility: 'private' }))}
          >
            New Yatzy room
          </button>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={8}
              className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg uppercase tracking-widest dark:border-slate-700 dark:bg-slate-900"
            />
            <button className={btn} onClick={() => act(request('room:join', { code }))}>
              Join
            </button>
          </div>
        </div>
      ) : (
        <RoomPanel room={room} me={session.user.id} request={request} act={act} />
      )}
    </div>
  );
}

type Request = ReturnType<typeof useRealtime>['request'];

function RoomPanel({
  room,
  me,
  request,
  act,
}: {
  room: RoomView;
  me: string;
  request: Request;
  act: (p: Promise<{ ok: boolean } & { error?: string }>) => Promise<void>;
}) {
  const isHost = room.hostId === me;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="text-sm text-slate-500">
          {room.gameName} · {room.status} · {room.members.length}/{room.maxPlayers}
        </div>
        <div className="text-3xl font-black tracking-[0.3em]">{room.code}</div>
        <div className="text-sm text-slate-500">
          Share: {window.location.origin}/?join={room.code}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {room.members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${m.connected ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
            <span className="flex-1">
              {m.nickname} {m.id === room.hostId && '👑'} {m.id === me && '(you)'}{' '}
              {m.left && '(left)'}
            </span>
            {isHost && m.id !== me && room.status === 'lobby' && (
              <button
                className="text-sm text-rose-600 underline"
                onClick={() => act(request('room:kick', { userId: m.id }))}
              >
                Kick
              </button>
            )}
          </li>
        ))}
      </ul>

      {room.status === 'lobby' && isHost && (
        <button className={btn} onClick={() => act(request('room:start', {}))}>
          Start game
        </button>
      )}
      {room.status === 'lobby' && !isHost && (
        <p className="text-slate-500">Waiting for the host…</p>
      )}
      {room.status === 'finished' && isHost && (
        <button className={btn} onClick={() => act(request('room:rematch', {}))}>
          Rematch
        </button>
      )}

      {room.game && <YatzyBoard room={room} me={me} request={request} act={act} />}

      <button className={ghost} onClick={() => act(request('room:leave', {}))}>
        Leave room
      </button>
    </div>
  );
}

function YatzyBoard({
  room,
  me,
  request,
  act,
}: {
  room: RoomView;
  me: string;
  request: Request;
  act: (p: Promise<{ ok: boolean } & { error?: string }>) => Promise<void>;
}) {
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const state = room.game!.view as yatzy.YatzyState;
  const myTurn = room.game!.currentPlayers.includes(me);
  const player = state.players.find((p) => p.id === me);
  const preview =
    myTurn && state.dice.length ? yatzy.getPreviewScores(state.dice, player!.scorecard) : {};
  const nameOf = (id: string) => room.members.find((m) => m.id === id)?.nickname ?? id;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center font-semibold">
        {room.status === 'finished'
          ? 'Game over'
          : myTurn
            ? `Your turn · round ${state.round}/13 · ${state.rollsLeft} rolls left`
            : `${nameOf(room.game!.currentPlayers[0] ?? '')}'s turn`}
      </div>

      <div className="flex justify-center gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <button
            key={i}
            disabled={!myTurn || state.dice.length === 0}
            onClick={() => setHeld((h) => h.map((v, j) => (j === i ? !v : v)))}
            className={`h-14 w-14 rounded-2xl text-2xl font-black shadow-sm ${
              myTurn && held[i] && state.dice.length
                ? 'bg-amber-300 text-slate-900'
                : 'bg-white text-slate-900'
            }`}
          >
            {state.dice[i] ?? '·'}
          </button>
        ))}
      </div>

      {myTurn && (
        <button
          className={btn}
          disabled={state.rollsLeft === 0}
          onClick={() =>
            act(request('game:move', { move: { type: 'roll', held } })).then(() => undefined)
          }
        >
          Roll
        </button>
      )}

      <div className="grid grid-cols-1 gap-1">
        {yatzy.CATEGORIES.map((c) => (
          <div
            key={c}
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"
          >
            <span className="flex-1">{c}</span>
            {state.players.map((p) => (
              <span key={p.id} className="w-10 text-right tabular-nums text-slate-500">
                {p.scorecard[c] ?? ''}
              </span>
            ))}
            {c in preview && (
              <button
                className="rounded-lg bg-violet-600 px-2 py-1 text-white"
                onClick={() => {
                  setHeld([false, false, false, false, false]);
                  void act(request('game:move', { move: { type: 'score', category: c } }));
                }}
              >
                +{preview[c]}
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl bg-violet-100 px-3 py-2 font-bold dark:bg-violet-950">
          <span className="flex-1">Total</span>
          {state.players.map((p) => (
            <span key={p.id} className="w-10 text-right tabular-nums">
              {yatzy.getTotals(p.scorecard, p.yatzyBonuses).grandTotal}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
