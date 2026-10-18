import { Sheet } from '../../components/ui';

/** A short rules reminder, opened from the table. */
export function KarmaRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Karma">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> get rid of all your cards. The last player still
          holding cards loses.
        </li>
        <li>
          <b className="text-neon">Swap first:</b> before play starts, swap cards from your hand
          with your face-up cards (tap one of each) to build a strong table. When you are happy,
          press <b>Ready</b>.
        </li>
        <li>
          <b className="text-neon">Your turn:</b> tap a card to select it (tap it again to
          deselect), then press <b>Play</b>, or double-tap a card to play it quickly. If you hold
          several cards of the same rank, tapping one selects them all (tap one again to drop just
          that card); press Play. Two or three of a kind: no double-tap. Four of a kind: double-tap
          plays all four at once (an instant burn). The card must be equal to or higher than the top
          card of the pile. Can&apos;t play anything? The pile is picked up for you automatically.
          Want to pick it up anyway? Tap the <b>pile</b> twice.
        </li>
        <li>
          <b className="text-neon">2</b> goes on anything, and anything goes on a 2.{' '}
          <b className="text-neon">10</b> can be played any time, on anything: it burns the whole
          pile and you go again. Four of a kind on top of the pile also burns it.
        </li>
        <li>
          <b className="text-neon">7:</b> after a 7 the next card must be 7 or <b>lower</b> (3 to 7,
          so 7s can stack), or a 2, or a 10. Anything higher can&apos;t be played, so you pick up.
        </li>
        <li>
          <b className="text-neon">3:</b> is invisible. You can play it any time, and the card
          underneath still counts: after 7, 3 the next player must still play 7 or lower.
        </li>
        <li>
          <b className="text-neon">8:</b> skips the next player. With two players that means you
          simply go again. Each 8 you play together skips one more player.
        </li>
        <li>
          <b className="text-neon">Draw:</b> after playing, draw back up to three cards while the
          deck lasts.
        </li>
        <li>
          <b className="text-neon">Table cards:</b> once the deck and your hand are empty, play your
          face-up cards. When those are gone, play your face-down cards blind, one at a time. If a
          blind card is too low, you pick up the pile.
        </li>
        <li>
          <b className="text-neon">Starting:</b> whoever has the lowest card showing (a face-up 3
          counts before a 3 in hand) goes first.
        </li>
      </ul>
    </Sheet>
  );
}
