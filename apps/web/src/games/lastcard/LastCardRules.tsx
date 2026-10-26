import { Sheet } from '../../components/ui';

export function LastCardRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Last Card">
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
          <b>Draw Two</b> makes the next player take two cards and lose their turn, unless they
          answer with another <b>Draw Two</b> or a <b>Wild Draw Four</b>: the penalties then add up
          and the next player faces the total (and the other way round).
        </li>
        <li>
          <b className="text-neon">Wild</b> plays on anything and you choose the colour.{' '}
          <b>Wild Draw Four</b> does that too and the next player takes four cards (it can be played
          at any time).
        </li>
        <li>
          <b className="text-neon">Special cards:</b> the <b>Shield</b> can only be played against a
          waiting draw penalty: the whole penalty goes <b>back</b> to the player who played the last
          draw card. The <b>Blue Ghost</b> (play it on blue or another ghost) makes everybody who
          holds fewer cards than you do draw two. The <b>Red Skull</b> (on red or another skull)
          makes everybody without a red card draw two.
        </li>
        <li>
          <b className="text-neon">Last Card!</b> Down to one card? A pulsing <b>Last Card!</b>{' '}
          button appears for <b>everybody</b>. It is a race: if you press it first you are safe (and
          everybody sees the announcement). If somebody else is faster with <b>Call out!</b> you
          draw <b>four</b> cards. Once the next player plays, draws or passes, it is too late.
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
