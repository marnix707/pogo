import { Fragment } from 'react';

/**
 * Text where every ":" is nudged up. In capitals the font's colon sits at lower-case height, so
 * "PO:GO" looks like the dots hang low; raising them centres them between the letters.
 */
export function RaisedColon({ text }: { text: string }) {
  return (
    <>
      {text.split(':').map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="relative -top-[0.1em]">:</span>}
          {part}
        </Fragment>
      ))}
    </>
  );
}
