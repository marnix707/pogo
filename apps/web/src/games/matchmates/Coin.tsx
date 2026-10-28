import { matchmates } from '@pogo/shared';
import { Avatar } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';
import { arenaUrl } from './art';

/**
 * The toss after the draft: a coin with the two players' pictures lands on the winner, whose arena
 * is used; the winner then goes second and starts with extra hit points.
 */
export function Coin({
  meAvatar,
  oppAvatar,
  oppName,
  iWon,
  stage,
}: {
  meAvatar: string;
  oppAvatar: string;
  oppName: string;
  iWon: boolean;
  stage: matchmates.StageId;
}) {
  // An even number of half turns lands on the front (me), an odd number on the back.
  const turns = iWon ? '1440deg' : '1260deg';
  const spec = matchmates.STAGE_SPECS[stage];
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-black/70"
      data-testid="mates-coin"
      data-winner={iWon ? 'me' : 'opponent'}
      role="status"
    >
      <p className="label text-onbg">Whose arena?</p>
      <div style={{ perspective: '800px' }}>
        <div className="coin-toss relative h-32 w-32" style={{ ['--turns' as string]: turns }}>
          {[
            { avatar: meAvatar, back: false },
            { avatar: oppAvatar, back: true },
          ].map((face) => (
            <div
              key={face.back ? 'back' : 'front'}
              className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-neon bg-panel shadow-[0_6px_0_#101628,inset_0_0_0_3px_#101628]"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: face.back ? 'rotateY(180deg)' : undefined,
              }}
            >
              <Avatar avatar={face.avatar} size="lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="coin-name flex flex-col items-center gap-2 px-6 text-center">
        <p className="label text-lg text-neon">
          {iWon ? (
            'You won the toss!'
          ) : (
            <>
              <PlayerName name={oppName} /> won the toss!
            </>
          )}
        </p>
        <img
          src={arenaUrl(stage, matchmates.STAGE_SPECS)}
          alt={spec.name}
          className="w-48 rounded border-2 border-edge"
          style={{ imageRendering: 'pixelated' }}
        />
        <p className="text-sm font-bold text-onbg">{spec.name}</p>
        <p className="text-xs text-muted">
          {iWon ? 'You' : 'They'} go second, with {matchmates.SECOND_PLAYER_HP} extra HP.
        </p>
      </div>
    </div>
  );
}
