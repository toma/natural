# Atomic Cul-de-sac plan

Status: approved by the owner. Implementation is in progress.

Atomic Cul-de-sac is the demo map for NaturalFPS, the first-person example that ships with
Natural, a desktop-quality game engine in the class of Unity and Unreal Engine that runs in
the browser. The map is an original recreation of a familiar first-person-shooter archetype:
a small, symmetrical 1950s desert nuclear-test-site suburb built around a short residential
cul-de-sac. It evokes that genre without copying any specific commercial map. All geometry
and textures are engine-generated and all signage copy is original. The repository is public,
so the demo must not contain third-party names, logos, textures, ripped assets, or copied
in-game text.

The main acceptance criterion is the experience at player eye height: a readable, symmetrical
suburban layout, convincing weapon handling, and a complete play loop. A successful build or a
newly recorded screenshot alone cannot establish that.

1. **Build the level.** Author two facing two-story pastel houses, each with a distinct roof
   shape, trim, chimney, attached garage, furnished ground floor, upstairs rooms, a rear deck,
   and stairs. Build the central street with the parked school bus and open moving truck and
   the gap and passage between them, parked vintage cars, sidewalks, front picket fences, and
   both backyards. Add the welcome sign, mannequins, garden props, perimeter fencing,
   surrounding model houses, utility poles, a clock tower, and a desert-mountain horizon. Keep
   the layout symmetrical and the three lanes (two house-side lanes and the central vehicle
   lane) tight and legible.

2. **Finish the scene as an environment.** Build geometry and materials for this demo:
   siding, roofing, masonry, vehicle panels, chrome, glass, turf, and period interiors. Use
   detailed silhouettes and surface variation at walking distance. Tune bright desert
   daylight, sky, exposure, shadow contact, window lighting, and restrained postprocessing
   together. Review matching exterior and interior views during iteration. Keep the NaturalFPS
   identity and the existing upstream MIT notice. Reference images may inform proportions, but
   the shipped scene uses only authored assets and synthesized audio.

3. **Build one menu for starting, pausing, and choosing weapons.** Use the existing menu entry
   point with a restrained style: dark translucent panels, condensed typography, a clear
   selected row, and a large weapon preview. Provide Play/Resume, Change Loadout, Options, and
   Restart Match. The loadout panel shows primary choices, a secondary slot, concise handling
   information, and an explicit Deploy action. Options retain graphics quality, sensitivity,
   FOV, and invert look, with persistent preferences. Support mouse and keyboard navigation,
   visible focus, Escape/back, and correct pointer capture. Menu clicks must never fire a
   weapon or capture the cursor prematurely.

4. **Create a small, distinct arsenal.** Five primary weapons and a pistol secondary, all
   available immediately: a balanced automatic carbine, a hard-hitting automatic rifle, a
   close-range submachine gun, a semi-automatic shotgun, a bolt-action sniper rifle, and a
   semi-automatic sidearm. Each weapon needs its own recognizable geometry, appropriate
   sights, firing behavior, reload and draw animations, recoil, sound, and handling. The
   shotgun needs pellet behavior and shell loading; the sniper needs bolt cycling, scoped
   aiming, and hold breath. Maintain the corrected hand and arm connections across every
   animation. Verify the final tuning through playtesting.

5. **Classic control conventions.** WASD and mouse, Shift sprint, C crouch, Ctrl prone, sprint
   plus Ctrl dive, Space jump, R reload, Q/E lean, V melee, G/middle mouse frag, 4 tactical
   grenade, F interact, 1/wheel weapon swap, Tab scoreboard, and Escape menu. Add the basic
   melee, frag, and flash interactions behind those bindings. Replace the current tactical
   sprint and slide movement with sprint and dive. Tune acceleration, stopping, stance
   transitions, aim speed, sprint duration, recoil recovery, and time to kill as one system.
   Preserve mouse sensitivity options.

6. **A compact offline combat loop.** Provide a bot skirmish with real score, timer, death,
   respawn, and round restart. Bots use the streets, flank routes, interiors, and stairs, with
   collision and line-of-sight checks. Choose spawns using clearance, opponent visibility, and
   distance. Adapt the existing HUD to a compact minimap, match information, ammo, hit
   confirmation, and damage feedback. The scoreboard reflects actual gameplay. Keep offline
   pause behavior so users can browse the demo's options.

The menu behavior is explicit: first deployment equips the selected loadout. During play,
Escape freezes the offline match. A loadout selection is staged until the user chooses Deploy,
which respawns with that loadout. Resume preserves the current weapon, ammunition, and match
state. Death respawns with the active loadout. Restart clears the match and transient effects.
This makes weapon changes easy to try in the demo.

The implementation follows these repository integration points:

| Area                | Implementation and reason                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Level               | A typed map specification and dedicated suburban builders under `examples/urban-raid/src/world/` (`atomic-culdesac-layout.ts`, `atomic-culdesac.js`). Use the existing assembler and physics registration, with stable landmark, spawn, and route IDs. |
| Navigation          | Extend or replace the example's single-surface grid with explicit floor layers and stair connections. Its current downward sample sees roofs and cannot represent rooms beneath them. Keep this work in the example.                                   |
| Minimap             | Generate map bounds, footprints, and playable paths from the same level data used by geometry and navigation.                                                                                                                                          |
| Weapons             | Update definitions, model builders, clips, viewmodel registration, ballistics, and sound together. Add a typed loadout model for selection, inventory validation, and respawn behavior.                                                                |
| Controls            | Update `core/input.js`, player movement/tuning, and weapon input together. Menu navigation must not be swallowed by the gameplay key handler.                                                                                                          |
| Match               | An example-local match controller connected to existing damage, death, UI, and spawn APIs. Match time and respawn delays use simulation time.                                                                                                          |
| Presentation        | Extend `ui/menu.js`, HUD modules, and `ui/style.js`; keep menu animation on unscaled time. Generate weapon previews through the existing graphics device and dispose preview resources.                                                                |
| Natural integration | Keep Natural's scheduler, 120 Hz simulation, renderer ownership, and disposal contract. Preserve the existing package name and port 43400.                                                                                                             |
| Captures            | Author scene camera positions and combat staging, benchmark routes, and the affected fixtures.                                                                                                                                                         |

Implementation order is level layout and traversability, detailed environment, weapon and
loadout systems, classic movement and combat loop, then integrated visual and performance
verification. Each phase includes its behavioral coverage. Visual review accompanies the
environment and weapon phases so proportion problems are corrected before final captures.

Verification covers the following outcomes:

| Check            | Evidence required                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spatial fidelity | Review at both house fronts, the bus/truck lanes, the sign, both backyards, kitchens, and upstairs windows. Record estimated dimensions as estimates.                                                  |
| Traversability   | Automated player routes through each doorway, garage, stairway, deck, central passage, and flank; collision probes for cover and map boundaries; connected bot routes across floor layers.             |
| Controls         | Real Chromium pointer-lock input for movement, aiming, firing, reload, crouch, prone, dive, swap, scoreboard, melee, grenades, pause, and resume.                                                      |
| Loadouts         | Select every weapon, deploy, fire, reload, swap, die, respawn, and restart. Confirm expected ammunition and selection state, including paused selection and interrupted reloads.                       |
| Menu             | Delayed mouse clicks, keyboard navigation, focus handling, settings persistence, resize, and repeated open/close without firing or losing input.                                                       |
| Rendering        | Deterministic fresh-page fixtures for the level, menus, combat, and every weapon in hipfire, ADS, firing, and reload. Review full animation sweeps for arm contact.                                    |
| Performance      | Saved production builds, sequential browser runs, browser error collection, shader warmup coverage, frame pacing, draw counts, and lifecycle resource checks. State host workload and hardware limits. |
| Repository       | Run the relevant unit and browser coverage and the full `bun run check` gate. Bump the version, update the changelog, and regenerate docs once.                                                        |

The demo does not include killstreaks, progression, unlocks, an attachment economy, online
matchmaking, campaign content, or replay killcams. The requested focus is the map, weapons,
controls, and demo presentation. Network play would require a separate scope.

Exact dimensions and animation curves are reconstructed from genre conventions, tested in play,
and documented honestly. Screenshot baselines establish regression coverage; they do not claim
equivalence to any commercial product.
