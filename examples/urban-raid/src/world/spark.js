/**
 * Shared Spark (@sparkjsdev/spark) loading for the World Labs map and the
 * optional splat backdrop.
 *
 * The specifier is a string literal on purpose: Bun's browser bundler only
 * bundles dynamic imports it can resolve at build time, and a specifier held in
 * a variable was left as a bare runtime import the browser cannot load.
 */
export async function loadSpark() {
  try {
    return await import("@sparkjsdev/spark");
  } catch (err) {
    console.warn("[spark] Spark failed to load", err?.message ?? err);
    return null;
  }
}

/**
 * Resolve once a SplatMesh has loaded (or failed, or timed out), so a slow or
 * silent load cannot wedge boot. Returns true when the mesh reported success.
 */
export function waitForSplat(mesh, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    if (mesh.initialized?.then)
      mesh.initialized.then(
        () => {
          done(true);
        },
        (err) => {
          console.warn("[spark] splat failed to load", err?.message ?? err);
          done(false);
        },
      );
    else done(true);
    setTimeout(() => {
      done(false);
    }, timeoutMs);
  });
}
