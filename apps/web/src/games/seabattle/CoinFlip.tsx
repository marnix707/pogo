import { Avatar } from '../../components/ui';
import { PlayerName } from '../../components/PlayerName';

/**
 * Who starts? A coin flies up and spins, showing the players' pictures instead of heads and tails,
 * and lands on the one who begins. My picture is on the front, the opponent's on the back.
 */
export function CoinFlip({
  meAvatar,
  oppAvatar,
  oppName,
  iStart,
}: {
  meAvatar: string;
  oppAvatar: string;
  oppName: string;
  iStart: boolean;
}) {
  // An even number of half turns lands on the front (me), an odd number on the back.
  const turns = iStart ? '1800deg' : '1980deg';
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 bg-black/65"
      data-testid="sb-coin"
      data-start={iStart ? 'me' : 'opponent'}
      role="status"
    >
      <p className="label text-onbg">Who starts?</p>
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
      <p className="coin-name label text-lg text-neon" data-testid="sb-coin-name">
        {iStart ? (
          'You start!'
        ) : (
          <>
            <PlayerName name={oppName} /> starts!
          </>
        )}
      </p>
    </div>
  );
}
