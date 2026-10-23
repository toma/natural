# World Labs skin

Colours for the procedural Atomic Cul-de-sac, derived from the World Labs capture of the same
neighbourhood (`../culdesac_pano.jpg`, cross-checked against the splat).

- `palette.json`: for each `ac-*` material key, the panorama sample (`targets`, with the
  rectangles it came from), the calibrated linear tint (`tints`), the colour the game rendered
  with that tint (`achieved`), keys painted over a plaster base (`painted`), the sky haze
  (`sky`) and the exposure factor between the panorama and the game.
- `swatches.png`: one row per key: panorama sample, calibration goal, rendered result.
- Style fields in `palette.json`: `goals` records the goal each key was calibrated to. Keys in
  `clean` get a fresh-paint finish (a trace of dust and cavity grime, no fading blotches or repair patches) so white siding, pickets and
  concrete stay crisp, and `finish` overrides metalness and the roughness remap per key (the bus
  and the truck lose most of their metal). The goals for the style keys come from the `STYLE`
  table in the tool; the bus goal is darker than school-bus yellow because the measured colour
  sits in shade and a brighter goal clips red and turns the hue green.
- `horizon.png` and `horizon.json`: the mesa band of the panorama with the near houses, poles
  and trees painted out, the sky cut to alpha and lower hazed copies of the ridge (`ghost` in
  `HORIZON_RECIPE`) laid behind open sky to layer the ranges. The sky dome draws it as a ring;
  `horizon.json` holds the elevation span, the sun column and the sky luminance used to match
  its brightness to the live sky. Regenerate with `bun tools/worldlabs-horizon.mjs`; the recipe
  and the pure image passes live in `src/world/worldlabs-horizon.ts`.

Regenerate with `bun tools/worldlabs-skins.mjs` from `examples/urban-raid` (about a minute with
`--skip-sky`, three with the sky grid). It starts its own dev server and headless Chromium,
renders the map from fixed viewpoints and steps each tint until the rendered material matches
its goal. `?skin=classic` loads the original colours; the skin is on by default and switches the
lighting to the `worldlabs` preset (hazy low afternoon sun, a pale dust veil over the sky via
`skyVeil`, its own grade).
