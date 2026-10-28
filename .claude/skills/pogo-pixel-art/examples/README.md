These are the real scripts that made the POGO / Pet Match assets. Read them for technique and copy their patterns.
They import `mm_common` (the same code as `scripts/pixel.py`). Run them from this folder.
- mm_tiles.py: candy tiles drawn as char grids (the core technique)
- mm_monsters.py: pets built procedurally on a shared body, base + evolved forms
- mm_arenas.py: lo-fi backgrounds (bands, ridges, speckle, ellipses)
- pm_screen.py: portrait battle screen, HUD, see-through board, match glow (pulse + burst)
- pm_attack.py: attack spirit, trail sparks, impact, damage digits
- build_petmatch_logo.py: chunky wordmark with per-letter colours + composition
- build_fire_lofi.py: lo-fi fire with seamless looping noise
- attack-demo-template.html: canvas player for the attack timeline (path maths, trail, shake, flash, refill)
