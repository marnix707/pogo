import { useEffect, useState } from 'react';
import { BLAST_FRAMES, BLAST_FRAME_MS, blastUrl } from './art';

const px = { imageRendering: 'pixelated' } as const;

/** One explosion (Sea Battle's blast): waits `delay` ms, plays its 10 frames, then is gone. */
export function Blast({ delay, style }: { delay: number; style: React.CSSProperties }) {
  const [frame, setFrame] = useState(-1);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let f = 0; f < BLAST_FRAMES; f++)
      timers.push(setTimeout(() => setFrame(f), delay + f * BLAST_FRAME_MS));
    timers.push(setTimeout(() => setFrame(-1), delay + BLAST_FRAMES * BLAST_FRAME_MS));
    return () => timers.forEach(clearTimeout);
  }, [delay]);
  if (frame < 0) return null;
  return (
    <img
      src={blastUrl(frame)}
      alt=""
      draggable={false}
      className="absolute max-w-none"
      style={{ ...px, ...style }}
    />
  );
}
