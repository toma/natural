import { chromium } from "@playwright/test";
import { file, serve } from "bun";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";

export const exampleRoot = resolve(import.meta.dirname, "..");
export const shots = [
  "hero",
  "interior",
  "detail",
  "sunset",
  "night",
  "weapon",
  "ads",
  "muzzle",
  "combat",
  "impacts",
  "hud",
];

const ownedBuilds = new Set();
process.once("exit", () => {
  for (const directory of ownedBuilds) disposeBuild(directory);
});

export function productionBuild() {
  // A different session may rebuild dist while a long benchmark is serving it.
  // Build directly into an owned directory that remains immutable for this run.
  const directory = mkdtempSync(resolve(tmpdir(), "natural-fps-build-"));
  ownedBuilds.add(directory);
  try {
    execFileSync("bun", ["build.ts", `--outdir=${directory}`], {
      cwd: exampleRoot,
      stdio: "pipe",
    });
    return directory;
  } catch (error) {
    disposeBuild(directory);
    throw error;
  }
}

export function disposeBuild(directory) {
  if (ownedBuilds.delete(directory)) rmSync(directory, { recursive: true, force: true });
}

export async function buildFingerprint(directory) {
  const hash = createHash("sha256");
  const files = (await readdir(directory)).filter((name) => /\.(html|js)$/.test(name)).sort();
  for (const name of files) {
    hash.update(name);
    hash.update(await readFile(resolve(directory, name)));
  }
  if (files.length === 0) throw new Error(`No production HTML or JavaScript in ${directory}`);
  return { sha256: hash.digest("hex"), files };
}

export function serveBuild(directory) {
  const root = resolve(directory);
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const pathname = new globalThis.URL(request.url).pathname;
      if (pathname === "/favicon.ico") return new globalThis.Response(null, { status: 204 });
      const path = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
      if (relative(root, path).startsWith(".."))
        return new globalThis.Response("Not found", { status: 404 });
      const asset = file(path);
      return (await asset.exists())
        ? new globalThis.Response(asset)
        : new globalThis.Response("Not found", { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, close: () => server.stop(true) };
}

export function launchBrowser(channel = "chrome", headed = false) {
  return chromium.launch({
    channel,
    headless: !headed,
    args: [
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      "--ignore-gpu-blocklist",
      "--force-color-profile=srgb",
      "--mute-audio",
    ],
  });
}

export async function ready(page, url, shot) {
  await page.goto(`${url}/?capture=1&lockstep=1&q=ultra`);
  await page.waitForFunction("window.__READY__ === true && !!window.__ENGINE__", null, {
    timeout: 180000,
  });
  const applied = await page.evaluate(
    (name) => window.__APPLY_SHOT__(name, { grabFrame: 90 }),
    shot,
  );
  if (applied.error) throw new Error(applied.error);
}

export function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

export function percentiles(samples) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}

/** Installed before boot, diagnostic counters never wait for GPU completion. */
export function instrumentGl() {
  const stats = {
    compileCalls: 0,
    compileSubmissionMs: 0,
    programInfoLogCalls: 0,
    programInfoLogMs: 0,
    resources: {},
  };
  window.__BENCH_GL__ = stats;
  const proto = globalThis.WebGL2RenderingContext.prototype;
  const compile = proto.compileShader;
  proto.compileShader = function (...args) {
    const start = performance.now();
    try {
      return compile.apply(this, args);
    } finally {
      stats.compileCalls++;
      stats.compileSubmissionMs += performance.now() - start;
    }
  };
  // Three can defer program readiness checks until first draw after compilation.
  // Observe its existing query; never introduce a synchronization query ourselves.
  const infoLog = proto.getProgramInfoLog;
  proto.getProgramInfoLog = function (...args) {
    const start = performance.now();
    try {
      return infoLog.apply(this, args);
    } finally {
      stats.programInfoLogCalls++;
      stats.programInfoLogMs += performance.now() - start;
    }
  };
  for (const name of [
    "Buffer",
    "Texture",
    "Framebuffer",
    "Renderbuffer",
    "Program",
    "Shader",
    "VertexArray",
  ]) {
    const live = new WeakSet();
    const counts = (stats.resources[name] = { created: 0, deleted: 0, live: 0 });
    const create = proto[`create${name}`],
      remove = proto[`delete${name}`];
    proto[`create${name}`] = function (...args) {
      const resource = create.apply(this, args);
      if (resource) {
        live.add(resource);
        counts.created++;
        counts.live++;
      }
      return resource;
    };
    proto[`delete${name}`] = function (resource) {
      if (resource && live.has(resource)) {
        live.delete(resource);
        counts.deleted++;
        counts.live--;
      }
      return remove.call(this, resource);
    };
  }
}

/** One fixed simulation step per presented frame, with a route indexed by frame. */
export async function measureRoute({ frames, warmup, gpu, route }) {
  const engine = window.__ENGINE__;
  const render = engine.ctx.get("render");
  const renderer = render.renderer;
  const gl = renderer.getContext();
  const ext = gpu ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : null;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const device = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const base = engine.camera.position.clone();
  const yaw = engine.camera.rotation.y;
  const samples = {
    frameMs: [],
    cpuSubmissionMs: [],
    stepMs: [],
    calls: [],
    triangles: [],
    gpuMs: [],
  };
  const next = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const queries = [];
  let cpu = 0,
    previous = null,
    disjoint = false;
  const originalRender = render.render;
  const probeExposure = render._probeExposure;
  // Capture mode's diagnostic readbacks are absent during normal gameplay.
  render._probeExposure = false;
  render.render = function (...args) {
    const start = performance.now();
    try {
      return originalRender.apply(this, args);
    } finally {
      cpu = performance.now() - start;
    }
  };
  let before, compileBefore, programsBefore;
  try {
    for (let frame = 0; frame < warmup + frames; frame++) {
      const timestamp = await next();
      // Camera travel exercises visibility and temporal passes on an identical route.
      const t = frame / 60;
      engine.camera.position.copy(base);
      engine.camera.position.x += Math.sin(t * 0.7) * (route === "interior" ? 0.4 : 2);
      engine.camera.position.z -= Math.sin(t * 0.4) * (route === "interior" ? 0.3 : 3);
      engine.camera.rotation.y = yaw + Math.sin(t * 0.5) * 0.12;
      if (frame === warmup) {
        before = globalThis.structuredClone(window.__BENCH_GL__.resources);
        compileBefore = {
          calls: window.__BENCH_GL__.compileCalls,
          ms: window.__BENCH_GL__.compileSubmissionMs,
          infoLogCalls: window.__BENCH_GL__.programInfoLogCalls,
          infoLogMs: window.__BENCH_GL__.programInfoLogMs,
        };
        programsBefore = renderer.info.programs.length;
      }
      const query = ext && frame >= warmup ? gl.createQuery() : null;
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      const start = performance.now();
      try {
        await engine.step();
      } finally {
        if (query) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          queries.push(query);
        }
      }
      if (frame >= warmup) {
        if (!gpu && previous !== null) samples.frameMs.push(timestamp - previous);
        samples.cpuSubmissionMs.push(cpu);
        samples.stepMs.push(performance.now() - start);
        samples.calls.push(renderer.info.render.calls);
        samples.triangles.push(renderer.info.render.triangles);
      }
      previous = timestamp;
    }
    if (ext) {
      const deadline = performance.now() + 30000;
      while (queries.some((query) => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
        if (performance.now() > deadline) throw new Error("GPU queries did not complete");
        disjoint ||= gl.getParameter(ext.GPU_DISJOINT_EXT);
        await next();
      }
      disjoint ||= gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (!disjoint)
        for (const query of queries)
          samples.gpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    }
    return {
      samples,
      device,
      pixelRatio: renderer.getPixelRatio(),
      screenSize: render.screenSize,
      quality: engine.config.quality,
      shadowMapSize: render.csm.mapSize,
      tick: engine.game.tick,
      frame: engine.time.frame,
      gpuStatus: !gpu
        ? "not requested"
        : !ext
          ? "unavailable"
          : disjoint
            ? "disjoint, discarded"
            : "valid",
      shaderCompilation: {
        boot: window.__PREWARM__,
        measuredCalls: window.__BENCH_GL__.compileCalls - compileBefore.calls,
        measuredSubmissionMs: window.__BENCH_GL__.compileSubmissionMs - compileBefore.ms,
        programsBefore,
        programsAfter: renderer.info.programs.length,
      },
      programDiagnostics: {
        measuredInfoLogCalls: window.__BENCH_GL__.programInfoLogCalls - compileBefore.infoLogCalls,
        measuredInfoLogMs: window.__BENCH_GL__.programInfoLogMs - compileBefore.infoLogMs,
      },
      resources: {
        before,
        after: globalThis.structuredClone(window.__BENCH_GL__.resources),
        three: { ...renderer.info.memory },
      },
      instanceVisibility: render.instances ? Object.fromEntries(render.instances.counts) : null,
    };
  } finally {
    render.render = originalRender;
    render._probeExposure = probeExposure;
    for (const query of queries) gl.deleteQuery(query);
  }
}
