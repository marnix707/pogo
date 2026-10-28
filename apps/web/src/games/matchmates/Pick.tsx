import { useState } from 'react';
import { matchmates } from '@pogo/shared';
import { Button } from '../../components/ui';
import { arenaUrl, monsterUrl } from './art';

const { ELEMENTS, MONSTERS, STAGES, STAGE_SPECS } = matchmates;

const px = { imageRendering: 'pixelated' } as const;

/** All Pick: two monsters (one per element) and the stage you would like to fight on. */
export function Pick({
  waiting,
  onPick,
  busy,
}: {
  waiting: boolean;
  busy: boolean;
  onPick: (elements: [matchmates.Element, matchmates.Element], stage: matchmates.StageId) => void;
}) {
  const [chosen, setChosen] = useState<matchmates.Element[]>([]);
  const [stage, setStage] = useState<matchmates.StageId>('stadium');
  const toggle = (e: matchmates.Element) =>
    setChosen((c) =>
      c.includes(e) ? c.filter((x) => x !== e) : c.length >= 2 ? [c[1]!, e] : [...c, e],
    );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      data-testid="mates-pick"
    >
      <h2 className="text-center text-lg font-bold text-neon">Pick two monsters</h2>
      <div className="grid grid-cols-5 gap-1.5">
        {ELEMENTS.map((e) => (
          <button
            key={e}
            data-testid={`mates-pick-${e}`}
            aria-pressed={chosen.includes(e)}
            disabled={waiting}
            onClick={() => toggle(e)}
            className={`flex flex-col items-center rounded-md border-2 p-1 text-[10px] font-bold ${
              chosen.includes(e) ? 'border-accent bg-accent/20' : 'border-edge/40'
            }`}
          >
            <img src={monsterUrl(e, false)} alt="" draggable={false} style={px} className="h-14" />
            {MONSTERS[e].names[0]}
            <span className="font-normal text-muted">{e}</span>
          </button>
        ))}
      </div>
      <h2 className="text-center text-lg font-bold text-neon">Pick a stage</h2>
      <div className="grid grid-cols-2 gap-2">
        {STAGES.map((s) => (
          <button
            key={s}
            data-testid={`mates-stage-${s}`}
            aria-pressed={stage === s}
            disabled={waiting}
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
      {waiting ? (
        <p className="text-center text-muted" data-testid="mates-waiting">
          Waiting for your opponent to pick…
        </p>
      ) : (
        <Button
          data-testid="mates-ready"
          disabled={chosen.length !== 2 || busy}
          onClick={() => onPick([chosen[0]!, chosen[1]!], stage)}
        >
          Ready
        </Button>
      )}
    </div>
  );
}
