import { matchmates } from '@pogo/shared';
import type { MatchHistoryEntry, RoomView } from '@pogo/shared';

import { arenaUrl, monsterUrl } from './art';

const { STAGE_SPECS } = matchmates;
const px = { imageRendering: 'pixelated' } as const;

const viewOf = (room: RoomView) => room.game?.view as matchmates.MatesView | null | undefined;

/** The arena that was played, above the standings. */
export function ResultsArena({ room }: { room: RoomView }) {
  const stage = viewOf(room)?.stage;
  if (!stage) return null;
  return (
    <div className="res-row flex flex-col items-center gap-1" data-testid="results-arena">
      <img
        src={arenaUrl(stage, STAGE_SPECS)}
        alt={STAGE_SPECS[stage].name}
        draggable={false}
        style={px}
        className="h-20 rounded-md border-2 border-edge/60"
      />
      <span className="label text-xs text-onbg">{STAGE_SPECS[stage].name}</span>
    </div>
  );
}

/** The pets a player chose, in the form they ended in, under their row. */
export function ResultsPets({ room, playerId }: { room: RoomView; playerId: string }) {
  const player = viewOf(room)?.players.find((p) => p.id === playerId);
  if (!player || player.monsters.length === 0) return null;
  return (
    <div className="mt-1 flex items-end gap-2" data-testid={`results-pets-${playerId}`}>
      {player.monsters.map((m, n) => (
        <img
          key={n}
          src={monsterUrl(m.element, m.evolved)}
          alt={matchmates.MONSTERS[m.element].names[m.evolved ? 1 : 0]}
          draggable={false}
          style={px}
          className={m.evolved ? 'h-10' : 'h-8'}
        />
      ))}
    </div>
  );
}

/** The match history of a Pet Match game: the arena and the pets each player ended with. */
export function MatesHistoryDetail({ entry }: { entry: MatchHistoryEntry }) {
  const d = entry.detail as {
    stage?: matchmates.StageId;
    players?: { id: string; pets: { element: matchmates.Element; evolved: boolean }[] }[];
  } | null;
  if (!d?.stage) return null;
  return (
    <div
      className="mt-2 flex items-center gap-3 border-t border-edge/30 pt-2"
      data-testid="history-detail"
    >
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <img
          src={arenaUrl(d.stage, STAGE_SPECS)}
          alt={STAGE_SPECS[d.stage].name}
          draggable={false}
          style={px}
          className="h-12 rounded border-2 border-edge/60"
        />
        <span className="label text-[9px] text-muted">{STAGE_SPECS[d.stage].name}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {entry.players.map((p) => (
          <div key={p.id} className="flex items-end gap-1.5">
            {d.players
              ?.find((x) => x.id === p.id)
              ?.pets.map((m, n) => (
                <img
                  key={n}
                  src={monsterUrl(m.element, m.evolved)}
                  alt={matchmates.MONSTERS[m.element].names[m.evolved ? 1 : 0]}
                  draggable={false}
                  style={px}
                  className={m.evolved ? 'h-8' : 'h-6'}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
