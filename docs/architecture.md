# Architecture

Natural scenes are trees with stable UUIDs. Loading a scene compiles its nodes and components into a
sparse-set ECS world. Systems execute in named stages, while renderer, physics, audio, and transport
backends attach through explicit interfaces. This keeps project data approachable without coupling
gameplay code to an implementation library.

The browser runtime owns input and presentation. Pointer movement is frame-snapshotted after pointer
lock so update systems receive each accumulated delta exactly once. Rapier maps collider handles back
to generation-safe ECS entities for gameplay raycasts, while its kinematic character controller owns
grounding, slopes, steps, and collision sliding.

NaturalRenderer defaults to WebGPU and also exposes a classic WebGL2 backend for GLSL rendering
pipelines. A RenderPipeline supplies render, resize, and dispose callbacks; replacing or disposing
the pipeline releases its owned resources, while Natural retains ownership of the graphics device.
The NaturalFPS example uses this interface for its HDR passes and separate weapon view.
Game.stop suspends frame scheduling without disposing the project. Projects may cap fixed steps
per frame with maxFixedSteps, and systems receive unscaledDelta for presentation while time is paused.

Simulation may move to workers when cross-origin
isolation is available, with a single-thread fallback. Headless Bun servers run the same fixed-tick
simulation without DOM or GPU dependencies.

Project source is authoritative. Imported assets are content-addressed and reproducible; `.natural/`
is always disposable.
