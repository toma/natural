# Architecture

Natural scenes are trees with stable UUIDs. Loading a scene compiles its nodes and components into a
sparse-set ECS world. Systems execute in named stages, while renderer, physics, audio, and transport
backends attach through explicit interfaces. This keeps project data approachable without coupling
gameplay code to an implementation library.

The browser runtime owns input and presentation. Simulation may move to workers when cross-origin
isolation is available, with a single-thread fallback. Headless Bun servers run the same fixed-tick
simulation without DOM or GPU dependencies.

Project source is authoritative. Imported assets are content-addressed and reproducible; `.natural/`
is always disposable.
