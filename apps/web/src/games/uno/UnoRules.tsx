import { Sheet } from '../../components/ui';

export function UnoRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play UNO">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> be the first to get rid of all your cards.
        </li>
        <li>
          <b className="text-neon">Your turn:</b> play a card with the same <b>colour</b> or the
          same <b>number / symbol</b> as the top card. Nothing to play? Draw one card: if it fits
          you may play it, otherwise press <b>Pass</b>.
        </li>
        <li>
          <b className="text-neon">Action cards:</b> <b>Skip</b> skips the next player,{' '}
          <b>Reverse</b> turns the direction around (with two players you play again),{' '}
          <b>Draw Two</b> makes the next player take two cards and lose their turn.
        </li>
        <li>
          <b className="text-neon">Wild</b> plays on anything and you choose the colour.{' '}
          <b>Wild Draw Four</b> does that too and the next player takes four cards, but you may only
          play it when you have no card of the current colour.
        </li>
        <li>
          <b className="text-neon">UNO!</b> When you are down to <b>one card</b>, press the{' '}
          <b>UNO!</b> button before the next player throws a card. Forget it and you take a penalty
          card straight away, so you cannot go out yet. (You can also arm the button while you hold
          two cards: your next card is played together with UNO!.)
        </li>
        <li>
          <b className="text-neon">Going out:</b> you cannot finish with an action card or a wild:
          if your last card is one, draw a card instead.
        </li>
        <li>
          Everyone else is ranked by the points left in their hand: numbers count their value,
          action cards 20, wilds 50.
        </li>
      </ul>
    </Sheet>
  );
}
