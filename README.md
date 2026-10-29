# RaceX: Vancouver Night Loop
Play: https://scottycarstensen77.github.io/racex-loop/ (classic version: /classic/)

Real OpenStreetMap geometry of SR-500 W → I-5 S → SR-14 E → I-205 N (16.53 mi).

## Plug in Google Photorealistic 3D Tiles
1. Google Cloud console: enable **Map Tiles API**, create an API key, restrict it to HTTP referrer `https://scottycarstensen77.github.io/*`.
2. Either open `https://scottycarstensen77.github.io/racex-loop/?key=YOUR_KEY` (saved on that device; `?key=` with empty value clears it),
   or set `googleTilesKey` in `config.js`.
3. Alignment tweaks: `?h=40` (road height, meters) and `?rot=0` (degrees), or in `config.js`.
Add `?low` for weaker phones. See CREDITS.md.
