# Music

One folder per song: `assets/music/<id>/intro.mp3` and `assets/music/<id>/loop.mp3` (`.ogg` / `.wav` work too;
WAV/OGG loop most cleanly, mp3 encoders can add a tiny gap). Then call `playMusic('<id>')` from `lib/music.ts`.
The menu song is `menu/` (starts with the first frog croak in `PogoStage`).
