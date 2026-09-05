# Godot 4.7.2 capability matrix

This matrix is a scope ledger, not a marketing equivalence claim. `complete` means the listed
Natural 0.1 release contract has public documentation and an automated acceptance test. `partial`
means useful production code exists but the broader Godot-class subsystem is not yet equivalent.
`planned` means no supported public implementation exists.

| Area                     | 0.1 status | Shipped contract                                                                                                                   | Remaining parity work                                                                       |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Runtime and ECS          | complete   | Generation-safe entities, hierarchy, transforms, deterministic stages, lifecycle, resources, signals, profiler                     | Job system, worker simulation, C#/native scripting                                          |
| Scenes and serialization | complete   | Stable UUID JSONC trees, ECS instantiation, canonical JSON, version migrations, validation limits                                  | Packed-scene inheritance UI, binary resources, live scene diffing                           |
| 2D rendering             | partial    | Sprites, cameras, tilemap instancing, layers, particles, lighting                                                                  | Atlases, skeletal 2D, canvas shaders, occlusion, editor gizmos                              |
| 3D rendering             | partial    | Three.js WebGPU/WebGL, PBR primitives, cameras, lights, shadows, terrain, particles, cached instancing                             | Model/material importer binding, GI bake/probes, post stack, LOD/occlusion                  |
| Physics                  | partial    | Rapier 2D/3D bodies and colliders, sensors, events, ray casts, impulses, CCD                                                       | Joints API, character controller, shape queries, debug overlay, deterministic backend       |
| Animation                | partial    | Validated transform clips, looping, interpolation, normalized rotations                                                            | Blend trees, state machine, tracks, IK, retargeting, editor timeline                        |
| Navigation               | partial    | Deterministic 2D A* grid with dynamic blocking                                                                                     | Navmesh baking, 3D agents, avoidance, links, dynamic obstacles                              |
| Audio                    | partial    | Cached Web Audio buffers, gain, looping, spatial panners, ECS lifecycle                                                            | Mixer buses, effects, streaming, listener controls, occlusion                               |
| UI and localization      | partial    | Accessible DOM panels/labels/buttons, flex styles, actions, locale fallback and plurals                                            | Focus/navigation, themes, richer controls, ICU messages, visual UI editor                   |
| Assets                   | partial    | Extensible import registry, SHA-256 content addressing, common format routing                                                      | glTF/texture processing, dependency graph, hot reimport, compression pipeline               |
| Scripting and plugins    | partial    | TypeScript systems, runtime plugins, manifest/permission declarations, hot dev server                                              | Sandboxed permissions, plugin registry, native extensions, editor extension host            |
| Networking               | partial    | Authoritative Bun server, binary packets/schemas, snapshots, auth hooks, limits, reconnect, interest grid, prediction, replay data | Delta snapshot integration, RPC API, relay/NAT, encryption policy, replay player UI         |
| Editor                   | partial    | Browser/Tauri project and scene editing, hierarchy, inspector JSON, undo/redo, atomic saves, live preview                          | Viewport gizmos, asset browser, debugger, animation/visual shader tools, multi-window       |
| Export and deployment    | partial    | Browser bundle, headless server, Tauri desktop project/bundle flow                                                                 | Android/iOS, PWA templates, signing/notarization automation, dedicated-server orchestration |
| XR and consoles          | planned    | None                                                                                                                               | WebXR/OpenXR; consoles require platform-holder agreements and licensed SDKs                 |

The acceptance evidence for the complete 0.1 areas is described in [testing.md](testing.md).
