# World Labs skin

Colours for the procedural Atomic Cul-de-sac, derived from the World Labs capture of the same
neighbourhood (`../culdesac_pano.jpg`, cross-checked against the splat).

- `palette.json`: for each `ac-*` material key, the panorama sample (`targets`, with the
  rectangles it came from), the calibrated linear tint (`tints`), the colour the game rendered
  with that tint (`achieved`), keys painted over a plaster base (`painted`), the sky haze
  (`sky`) and the exposure factor between the panorama and the game.
- `swatches.png`: one row per key: panorama sample, calibration goal, rendered result.

Regenerate with `bun tools/worldlabs-skins.mjs` from `examples/urban-raid` (about a minute with
`--skip-sky`, three with the sky grid). It starts its own dev server and headless Chromium,
renders the map from fixed viewpoints and steps each tint until the rendered material matches
its goal. `?skin=classic` loads the original colours; the skin is on by default.
