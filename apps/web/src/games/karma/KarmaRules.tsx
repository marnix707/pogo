import { karma } from '@pogo/shared';
import { Button, Sheet } from '../../components/ui';
import { TUTORIAL_EVENT } from './KarmaTutorial';

/** A short rules reminder, opened from the table. */
export function KarmaRules({
  open,
  onClose,
  rules = [],
}: {
  open: boolean;
  onClose: () => void;
  /** Extra rules in force in this game (party / epic mode). */
  rules?: string[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Karma">
      <Button
        data-testid="rules-tutorial"
        variant="secondary"
        className="mb-3 w-full"
        onClick={() => {
          onClose();
          window.dispatchEvent(new Event(TUTORIAL_EVENT));
        }}
      >
        Watch the tutorial
      </Button>
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        {rules.length > 0 && (
          <li data-testid="rules-extra">
            <b className="text-neon">Extra rules in this game:</b>
            <ul className="mt-1 flex flex-col gap-1">
              {rules.map((id) => {
                const r = karma.ruleById(id);
                return r ? (
                  <li key={id}>
                    {r.emoji} <b>{r.name}</b>: {r.description}
                  </li>
                ) : null;
              })}
            </ul>
          </li>
        )}
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
          <b className="text-neon">Your turn:</b> tap a card to select it, then tap it again to play
          it. If you hold several cards of the same rank, tapping one selects them all (tap one
          again to drop just that card); press <b>Play</b> to throw them together. The card must be
          equal to or higher than the top card of the pile. Can&apos;t play anything? Tap the{' '}
          <b>pile</b> to pick it up. Want to pick it up anyway? Tap the pile twice.
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
