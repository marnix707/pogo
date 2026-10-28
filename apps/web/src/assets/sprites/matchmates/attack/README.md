# PET MATCH – attack effects

Each element folder (fire, water, earth, electric, psychic, gold) has:
- `spirit-00..03`: 15×15, loops at 70 ms. The pet's element spirit that flies out and circles the matched tiles.
- `spirit-charged-00..03`: 21×21. Swap to this once it has absorbed the burst candies.
- `trail-0/1/2`: sparks for the trail (3×3, 2×2, 1px). Draw the spirit's past positions, smaller as they age.
- `impact-00..05`: 30×30, centred on the target pet. Frame times 40, 50, 60, 60, 70, 80 ms.
- `*-animated.svg`: self-playing previews.

`damage-digits/`: chunky red damage digits (and green heal digits) 0–9, plus minus and plus.

`attack-demo-template.html` is the reference timeline (ms):
- glow 0–2250
- fly in 250–800
- circle twice 800–2200
- gather 2200–2400
- burst 2250–2690 (hide candies from burst frame 2)
- shoot 2550–2850
- hit, shake and flash 2850–3250
- damage number 2850–3750
- refill 3000–3500

The `__DATA__` placeholder is the sprite data; the published demo has it filled in.
