# NaturalFPS Nuketown rebuild plan

Status: approved by the owner. Implementation is in progress. The workspace contains
substantial earlier work, including the FPS
example, renderer optimizations, arm corrections, and release changes.

Rebuild NaturalFPS around the original 2010 Black Ops Nuketown, with close visual and
spatial correspondence, a usable weapon selection menu, and the original movement and
combat conventions. The result is a playable browser demonstration of Natural, a
desktop-quality game engine in the class of Unity and Unreal Engine that runs in the
browser.

The main acceptance criterion is the experience at player eye height: recognizable
architecture, faithful routes and sightlines, convincing weapon handling, and a complete
play loop. A successful build or a newly recorded screenshot alone cannot establish that.

1. **Reconstruct the level.** Author the green and yellow houses with their distinct roof
   shapes, trim, chimneys, garages, furnished ground floors, upstairs rooms, rear balconies,
   and stairs. Reconstruct the central street with the school bus and moving truck, their
   gaps and passage, parked cars, sidewalks, front fences, and both backyards. Add the
   welcome sign, mannequins, garden props, perimeter fencing, surrounding model houses,
   towers, and desert horizon. Check relative placement against the original map gallery;
   the official remaster overview is a secondary reference for readable architectural
   details. [Original map gallery](<https://callofduty.fandom.com/wiki/Nuketown_(map)>),
   [official overview](https://www.callofduty.com/au/en/blog/2024/10/call-of-duty-black-ops-6-pre-season-maps-modes-announcement).

2. **Finish the scene as an environment.** Build geometry and materials for this demo,
   including siding, roofing, masonry, vehicle panels, chrome, glass, turf, and period
   interiors. Use detailed silhouettes and surface variation at walking distance. Tune
   bright desert daylight, sky, exposure, shadow contact, window lighting, and restrained
   postprocessing together. Review matching exterior and interior views during iteration.
   Keep the NaturalFPS identity and existing MIT notice. Reference images inform the
   reconstruction; the shipped scene uses authored assets and synthesized audio.

3. **Build one menu for starting, pausing, and choosing weapons.** Use the existing menu
   entry point with a restrained Black Ops style: dark translucent panels, condensed
   typography, a clear selected row, and a large weapon preview. Provide Play/Resume,
   Change Loadout, Options, and Restart Match. The loadout panel shows primary choices,
   a secondary slot, concise handling information, and an explicit Deploy action. Options
   retain graphics quality, sensitivity, FOV, and invert look, with persistent preferences.
   Support mouse and keyboard navigation, visible focus, Escape/back, and correct pointer
   capture. Menu clicks must never fire a weapon or capture the cursor prematurely.

4. **Create a small, distinct arsenal.** Proposed weapons: Commando, AK-47, MP5K, SPAS-12,
   L96A1, and M1911. Use five primary choices and the pistol secondary, with everything
   available immediately. Each weapon needs its own recognizable geometry, appropriate
   sights, firing behavior, reload and draw animations, recoil, sound, and handling. The
   shotgun needs pellet behavior and shell loading; the sniper needs bolt cycling, scoped
   aiming, and hold breath. Maintain the corrected hand and arm connections across every
   animation. Verify the final tuning against game references and playtesting before
   describing it as faithful. [Contemporary weapon overview](https://www.gamespot.com/articles/call-of-duty-black-ops-walkthrough/1100-6284076/).

5. **Match the original control conventions.** Use WASD and mouse, Shift sprint, C crouch,
   Ctrl prone, sprint plus Ctrl dive, Space jump, R reload, Q/E lean, V melee, G/middle
   mouse frag, 4 tactical grenade, F interact, 1/wheel weapon swap, Tab scoreboard, and
   Escape menu. Add the basic melee, frag, and flash interactions behind those bindings.
   Replace the current tactical sprint and slide movement with the original sprint and
   dive behavior. Tune acceleration, stopping, stance transitions, aim speed, sprint
   duration, recoil recovery, and time to kill as one system. Preserve mouse sensitivity
   options. [Original PC manual](https://support.activision.com/servlet/servlet.FileDownload?file=00PU0000004cE8cMAE&retURL=/apex/manuals).

6. **Complete a compact offline combat loop.** Provide a bot skirmish with real score,
   timer, death, respawn, and round restart. Bots use the streets, flank routes, interiors,
   and stairs, with collision and line-of-sight checks. Choose spawns using clearance,
   opponent visibility, and distance. Adapt the existing HUD to a compact minimap, match
   information, ammo, hit confirmation, and damage feedback. The scoreboard reflects
   actual gameplay. Keep offline pause behavior so users can browse the demo's options.

The menu behavior is explicit: first deployment equips the selected loadout. During play,
Escape freezes the offline match. A loadout selection is staged until the user chooses
Deploy, which respawns with that loadout. Resume preserves the current weapon, ammunition,
and match state. Death respawns with the active loadout. Restart clears the match and
transient effects. This adaptation makes weapon changes easy to try in the demo. The
original multiplayer applies class changes on the next spawn and keeps the match running
under its menu. [Original PC manual](https://support.activision.com/servlet/servlet.FileDownload?file=00PU0000004cE8cMAE&retURL=/apex/manuals).

The implementation will follow these repository integration points:

| Area                | Implementation and reason                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level               | Add a typed map specification and dedicated suburban builders under `examples/urban-raid/src/world/`. Use the existing assembler and physics registration, with stable landmark, spawn, and route IDs.               |
| Navigation          | Extend or replace the example's single-surface grid with explicit floor layers and stair connections. Its current downward sample sees roofs and cannot represent rooms beneath them. Keep this work in the example. |
| Minimap             | Generate map bounds, footprints, and playable paths from the same level data used by geometry and navigation. Remove market-specific scan ranges and labels.                                                         |
| Weapons             | Update definitions, model builders, clips, viewmodel registration, ballistics, and sound together. Add a typed loadout model for selection, inventory validation, and respawn behavior.                              |
| Controls            | Update `core/input.js`, player movement/tuning, and weapon input together. Menu navigation must not be swallowed by the gameplay key handler.                                                                        |
| Match               | Add an example-local match controller connected to existing damage, death, UI, and spawn APIs. Match time and respawn delays use simulation time.                                                                    |
| Presentation        | Extend `ui/menu.js`, HUD modules, and `ui/style.js`; keep menu animation on unscaled time. Generate weapon previews through the existing graphics device and dispose preview resources.                              |
| Natural integration | Keep Natural's scheduler, 120 Hz simulation, renderer ownership, and disposal contract. Preserve the existing package name and port 43400.                                                                           |
| Captures            | Re-author scene camera positions and combat staging, benchmark routes, and the affected fixtures. Keep the historical upstream parity report labeled as historical.                                                  |

Implementation order is level layout and traversability, detailed environment, weapon and
loadout systems, classic movement and combat loop, then integrated visual and performance
verification. Each phase includes its behavioral coverage. Visual review accompanies the
environment and weapon phases so proportion problems are corrected before final captures.

Verification will cover the following outcomes:

| Check            | Evidence required                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spatial fidelity | Original-reference comparisons at both house fronts, the bus/truck lanes, the sign, both backyards, kitchens, and upstairs windows. Record estimated dimensions as estimates.                                                                                     |
| Traversability   | Automated player routes through each doorway, garage, stairway, balcony, central passage, and flank; collision probes for cover and map boundaries; connected bot routes across floor layers.                                                                     |
| Controls         | Real Chromium pointer-lock input for movement, aiming, firing, reload, crouch, prone, dive, swap, scoreboard, melee, grenades, pause, and resume.                                                                                                                 |
| Loadouts         | Select every weapon, deploy, fire, reload, swap, die, respawn, and restart. Confirm expected ammunition and selection state, including paused selection and interrupted reloads.                                                                                  |
| Menu             | Delayed mouse clicks, keyboard navigation, focus handling, settings persistence, resize, and repeated open/close without firing or losing input.                                                                                                                  |
| Rendering        | Deterministic fresh-page fixtures for the level, menus, combat, and every weapon in hipfire, ADS, firing, and reload. Review full animation sweeps for arm contact.                                                                                               |
| Performance      | Saved production builds, sequential browser runs, browser error collection, shader warmup coverage, frame pacing, draw counts, and lifecycle resource checks. Measure the available M4 Pro at 1280x720 and Retina sizes; state host workload and hardware limits. |
| Repository       | Run relevant unit and browser coverage and the full `bun run check` gate. Rehearse the required prerelease bump in a scratch copy, then update all version sites, changelog, and generated docs once.                                                             |

The rebuild does not include killstreaks, progression, unlocks, an attachment economy,
online matchmaking, campaign content, or replay killcams. The requested focus is the map,
weapons, controls, and demo presentation. Network play would require a separate scope.

Exact original mesh dimensions, animation curves, and source assets are not available in
the current workspace. Layout and feel will be reconstructed from references, tested in
play, and documented honestly. New screenshot baselines establish future regression
coverage; they do not prove pixel equivalence to Black Ops.
