# Police car (city board): "Go to jail" animation

When a frog must go to jail, don't let it hop there. Instead the police car fetches it. Jail is only reached from the top row ("?" or the cities next to it), so the car only drives **horizontally** along the top row, in both directions.

All sizes are in art px, at the same scale as the board. **`police-demo.html` is the working reference**: open it and copy its logic. `police-car.json` has every timing.

## Files
- `car/right/` and `car/left/` (41×29, centred on the car):
  - `empty-off`: siren off.
  - `empty-siren-a` (red lit) and `empty-siren-b` (blue lit).
  - `<colour>-siren-a/b`: the arrested frog visible in the barred back window. Colours: green, yellow, blue, red, purple and orange.
- `car/turn-up-siren-a/b.svg`: the middle frame of the U-turn (29×41).
- `fx/speed-lines-0/1.svg`: drawn behind the car while it drives; mirror them when it faces left. `fx/dust-0/1.svg`: puffs for the U-turn.
- `jail/jail-with-<colour>.svg`: the Jail tile with that frog behind the bars. Draw it over the Jail corner while the frog is jailed.

## Sequence (car centre on the top-row centre line, board y = 16)
1. **Siren on** (swap a/b every 120 ms). The car appears on the Jail tile, facing **left**.
2. **Drive left** to the frog's tile centre + 28 px (ease in/out, 3.2 ms per px, at least 450 ms). Show speed lines behind it.
3. **U-turn** in place: left, then turn-up, then right (90 ms each), with dust puffs.
4. **Arrest**: the frog does one normal hop right into the cage (car centre − 6 px). On landing, switch the car to `<colour>-siren-*` and bump it 1 px down for 120 ms.
5. **Drive right** back to the Jail tile, with the frog visible in the cage.
6. **Deliver**: pause 250 ms, then draw `jail/jail-with-<colour>.svg` on the Jail corner and switch the car to `empty-siren-*`.
7. **Leave**: the car drives right off the board (clip it to the board) and the siren stops.

## Sound (optional)
A square-wave siren alternating 960 Hz and 770 Hz together with the a/b lights, at a low volume. Start it only after a user action (browsers block autoplay), and offer a mute toggle.
