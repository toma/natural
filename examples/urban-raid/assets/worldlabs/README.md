# World Labs world

Photoreal Gaussian-splat world for the Atomic Cul-de-sac map, generated with
[World Labs Marble](https://marble.worldlabs.ai) from an original image prompt
created for this project. Output is owned by the project author.

- `culdesac_500k.spz` / `culdesac_150k.spz`: splats (high / low quality), render with Spark
- `culdesac_collider.glb`: coarse collider mesh, the physics and navigation geometry of the World Labs map
- `culdesac_pano.jpg`: equirectangular panorama fallback
- `world.json`: metadata (`metric_scale_factor`, `ground_plane_offset`)

## The World Labs map (opt-in)

Append `?map=worldlabs` to load this world as the playable map. The splat is the visible level
(500k on high quality, 150k with `?q=low`) and the collider mesh, with the same
placement, is invisible static collision that the bots also navigate on. Spawns
are raycast onto the collider within 32 m of the capture origin. Without the
parameter, play and capture use the procedural map. The code is in
`src/world/worldlabs-map-config.ts` and `src/world/worldlabs-map.js`.

Limits: the capture was taken from about 6 m up, so close detail at eye height
is soft; the splat writes no depth, so volumetric fog is off on this map and
other depth effects see the splat as sky; the navigation grid samples only the
top surface at each point.

## Pointing the backdrop at a world

The backdrop system is content-neutral and ships disabled: it renders whatever
world you configure and points at nothing by default. To enable it:

1. Install Spark, the open-source three.js Gaussian splat renderer:

   ```
   bun add @sparkjsdev/spark
   ```

2. Open `examples/urban-raid/src/world/backdrop-config.ts` and set the single
   `BACKDROP_WORLD` entry to your own world's URLs (the `.spz` files for high and
   low quality, the `.jpg` panorama, and the `world.json`). It is `null` in the
   repo, which keeps the backdrop off and ships no world.

3. Choose the quality in the pause menu under Options, "Distance backdrop"
   (`splat`, `pano`, or `off`), or append `?backdrop=splat` to the URL. The
   setting is stored and applied on the next load. Capture and deterministic
   runs always use the procedural sky so parity baselines are unaffected.

Scaling comes from `metric_scale_factor`, the ground is lifted to y=0 with
`ground_plane_offset`, and Y-down (OpenCV) captures are flipped to three.js
Y-up. Verify the orientation on screen and fine-tune with the optional
`transform` (position / rotation / scale) in the same config entry. Splats that
fall inside the playable map bounds are hidden so the backdrop only fills the
distance; the procedural and glTF map remains the sole source of gameplay
geometry and collision. If the splats or Spark cannot load, the backdrop falls
back to the panorama, and then to the procedural sky.
