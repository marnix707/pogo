import { Sheet } from '../../components/ui';

export function BankruptRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play Bankrupt">
      <ul className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1 text-sm leading-relaxed">
        <li>
          <b className="text-neon">Goal:</b> reach the net worth the host picked (or be the richest
          when the rounds run out). Your <b className="text-[#7ee08c]">green number</b> is your net
          worth: cash plus what your spaces and buildings sell for.
        </li>
        <li>
          <b className="text-neon">Your turn:</b> roll the die and walk your token round the board.
          A six lets you roll again (no penalty). Passing or landing on <b>Start</b> pays your
          salary.
        </li>
        <li>
          <b className="text-neon">Free space:</b> buy it, or put it up for <b>auction</b>:
          everybody can bid, the highest bid wins. <b>Rent:</b> landing on someone's space means
          paying them. The more spaces of one colour you own, the more each one asks: 2 spaces pay
          double, 3 pay triple. Own the whole colour and you can build up to three buildings on each
          space (house, shop, hotel) for much higher rent.
        </li>
        <li>
          <b className="text-neon">Jail:</b> pay the fee to get out, or wait three turns. With{' '}
          <b>Free Froggo</b> on, everybody else is asked to pay $50 bail when a jailed frog's turn
          comes: only if ALL say yes does everybody pay and the frog goes free. One no and nothing
          happens.
        </li>
        <li>
          <b className="text-neon">The wheel:</b> the wheel in the middle is the die. Roll three 6s
          in a row and the 4th roll is the <b>special wheel</b> (also $50 and JAIL). A luck card can
          give you one too.
        </li>
        <li>
          <b className="text-neon">Luck:</b> the <b>?</b> space draws a card. The <b>Auction</b>{' '}
          corner lets you auction one of your own spaces (you can cancel it).
        </li>
        <li>
          <b className="text-neon">Money:</b> your cash can go below zero, but below -$500 you are{' '}
          <b>bankrupt</b> and out of the game: your spaces go back to the bank. Tap a space to sell
          it or its buildings before that happens.
        </li>
      </ul>
    </Sheet>
  );
}
