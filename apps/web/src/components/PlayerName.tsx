import { splitDevTag } from '@pogo/shared';

/**
 * A player's name for display. Developers come through the server as "Name (dev)": the tag is drawn
 * as a small animated rainbow "dev" instead of plain text.
 */
export function PlayerName({ name }: { name: string }) {
  const { name: base, dev } = splitDevTag(name);
  return (
    <>
      {base}
      {dev && (
        <span className="dev-tag" data-testid="dev-tag" title="Developer">
          dev
        </span>
      )}
    </>
  );
}
