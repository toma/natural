import { expect, test, type Page } from "@playwright/test";

test.use({
  channel: "chromium",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  launchOptions: {
    args: [
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      "--ignore-gpu-blocklist",
      "--force-color-profile=srgb",
      "--mute-audio",
    ],
  },
});
// The lockstep fixtures pump 90 frames before the shutter. On a GPU host that is
// about a second; on a software-GL host (headless CI without a GPU) each frame
// costs seconds, so allow a generous ceiling. Fast hosts still finish quickly.
test.setTimeout(Number(process.env.NATURAL_FPS_TIMEOUT_MS ?? 1_200_000));

const url = process.env.NATURAL_FPS_TEST_URL ?? "http://127.0.0.1:43400";
const state = (page: Page) =>
  page.evaluate<{
    frame: number;
    tick: number;
    yaw: number;
    position: number[];
    eye: number[];
    camera: number[];
    ammo: number;
    ads: number;
    stance: string;
    grounded: boolean;
    scale: number;
    disposed: boolean;
    running: boolean;
  }>(`(() => {
  const e = window.__ENGINE__, p = e.ctx.get('player'), w = e.ctx.get('weapons');
  return { frame:e.time.frame, tick:e.game.tick, yaw:p.yaw, position:p.feetPosition.toArray(),
    eye:p.eyePosition.toArray(), camera:e.camera.position.toArray(), ammo:w.ammo.mag,
    ads:w.adsProgress, stance:p.stance, grounded:p.grounded, scale:e.time.scale,
    disposed:e.game.disposed, running:e.game.running };
})()`);

async function ready(page: Page, query: string) {
  await page.goto(`${url}/${query}`);
  await page.waitForFunction("window.__READY__ === true && !!window.__ENGINE__", null, {
    timeout: 120_000,
  });
}

test("NaturalFPS retains all subsystems and its deterministic first-person scene", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, "?capture=1&lockstep=1");
  await expect(page).toHaveTitle("NaturalFPS");
  expect(
    await page.evaluate<string[]>("window.__ENGINE__.registry.ordered.map(s=>s.constructor.id)"),
  ).toEqual([
    "render",
    "materials",
    "sky",
    "physics",
    "world",
    "player",
    "weapons",
    "fx",
    "ai",
    "ui",
    "audio",
  ]);
  expect(
    await page.evaluate<boolean>(
      "window.__ENGINE__.naturalRenderer.renderer === window.__ENGINE__.ctx.get('render').renderer",
    ),
  ).toBe(true);
  expect(await page.evaluate<number>("Object.keys(window.__SHOTS__).length")).toBe(11);
  await page.evaluate("window.__APPLY_SHOT__('hero', {grabFrame:90})");
  await page.evaluate("window.__PUMP__(90)");
  await page.evaluate("window.__PRESENT__(2)");
  expect((await state(page)).frame).toBe(93);
  expect((await state(page)).tick).toBe(186);
  await expect(page).toHaveScreenshot("natural-fps-hero.png", {
    timeout: 30_000,
    maxDiffPixelRatio: 0.01,
    threshold: 0.15,
  });
  expect(errors).toEqual([]);
  const audio = await page.evaluate<{ ok: boolean; cases: number; failures: unknown[] }>(
    "window.__AUDIO_SELFTEST__({verbose:false})",
  );
  expect(audio.failures).toEqual([]);
  expect(audio.ok).toBe(true);
  expect(audio.cases).toBeGreaterThan(20);
  expect(
    await page.evaluate<string[]>(`(() => {
    const r=window.__ENGINE__.naturalRenderer, events=[];
    const p={ render:()=>events.push('render'), resize:(w,h)=>events.push(w+'x'+h), dispose:()=>events.push('dispose') };
    r.setPipeline(p);
    r.setPipeline(p);
    r.render();
    r.resize(640,480);
    r.setPipeline(null);
    return events;
  })()`),
  ).toEqual(["render", "640x480", "dispose"]);
  await page.evaluate("window.__ENGINE__.dispose()");
  expect(await page.evaluate<boolean>("window.__ENGINE__.game.disposed")).toBe(true);
});

test("NaturalFPS anatomical support arm stays connected during idle, aiming, and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, "?capture=1&lockstep=1");
  await page.evaluate("window.__APPLY_SHOT__('hero', {grabFrame:90})");
  await page.evaluate("window.__PUMP__(90)");
  for (const pose of ["idle", "ads", "reload"] as const) {
    await page.evaluate(`(() => {
      const w = window.__ENGINE__.ctx.get('weapons');
      w.debugPose('${pose === "ads" ? "ads" : "idle"}');
    })()`);
    if (pose === "reload") {
      // Start from settled hipfire so the wrist is visible as the hand releases.
      await page.evaluate("window.__PUMP__(30)");
      await page.evaluate("window.__ENGINE__.ctx.get('weapons').viewmodel.play('reloadTac')");
    }
    await page.evaluate(`window.__PUMP__(${pose === "reload" ? 3 : 30})`);
    await page.evaluate("window.__PRESENT__(2)");
    const wrist = await page.evaluate<{
      alignment: number;
      sleeveGap: number;
      gripError: number;
      cuffScale: number[];
      screen: number[];
      bend: number;
      wristBend: number;
      palmUp: number;
      fingertipGaps: number[];
      skin: string;
      rolledSleeve: boolean;
    }>(`(() => {
      const vm = window.__ENGINE__.ctx.get('weapons').viewmodel, a = vm.armL;
      a.root.updateWorldMatrix(true, true);
      const foreRotation = a.forePivot.getWorldQuaternion(a.hand.quaternion.clone());
      const cuffRotation = a.wrist.getWorldQuaternion(a.hand.quaternion.clone());
      const axis = a.hand.position.clone().set(0, 0, 1);
      const alignment = axis.clone().applyQuaternion(foreRotation).dot(axis.applyQuaternion(cuffRotation));
      const end = a.hand.position.clone().set(0, 0, -a.l2)
        .applyQuaternion(a.forePivot.quaternion).add(a.forePivot.position);
      const target = vm.clipResult.active && vm.clipResult.lhand.weight > 0.5
        ? vm.clipResult.lhand.pos : vm.active.gripL.pos;
      const upper = a.forePivot.position.clone().sub(a.shoulder).normalize();
      const fore = a.hand.position.clone().sub(a.forePivot.position).normalize();
      const finger = fore.clone().set(0, 0, -1).applyQuaternion(a.hand.quaternion);
      const palm = fore.clone().set(0, -1, 0).applyQuaternion(a.hand.quaternion);
      const hg = vm.active.model.nodes.handguard;
      const hgAxis = fore.clone().fromArray(hg.axis);
      const hgDir = fore.clone().fromArray(hg.dir).normalize();
      const inverse = a.root.matrixWorld.clone().invert();
      const fingertipGaps = a.fingers.map((f, i) => {
        const tip = fore.clone().set(0, -a._segRadius[i][3] * 1.05, -a._segLength[i][2] * 0.5)
          .applyMatrix4(f.joints[2].matrixWorld).applyMatrix4(inverse).sub(hgAxis);
        return tip.addScaledVector(hgDir, -tip.dot(hgDir)).length() - hg.r;
      });
      return {alignment, sleeveGap:end.distanceTo(a.hand.position),
        gripError:a.hand.position.distanceTo(end.fromArray(target)), cuffScale:a.wrist.scale.toArray(),
        screen:a.hand.getWorldPosition(end).project(window.__ENGINE__.viewCamera).toArray(),
        bend:Math.acos(upper.dot(fore))*180/Math.PI, skin:a.fore.material.name,
        wristBend:Math.acos(Math.max(-1, Math.min(1, fore.dot(finger))))*180/Math.PI,
        palmUp:palm.y, fingertipGaps,
        rolledSleeve:!!a.forePivot.getObjectByName('rolled-sleeve')};
    })()`);
    expect(wrist.alignment).toBeCloseTo(1, 6);
    expect(wrist.sleeveGap).toBeLessThan(0.00001);
    expect(wrist.gripError).toBeLessThan(0.00001);
    expect(wrist.cuffScale).toEqual([0.75, 0.75 / 0.82, 1]);
    expect(Math.abs(wrist.screen[0]!)).toBeLessThan(0.9);
    // Aiming raises the rifle to the eye; its supporting wrist stays near the
    // lower edge of the viewport. Idle and reload retain the framing margin.
    expect(Math.abs(wrist.screen[1]!)).toBeLessThan(pose === "ads" ? 1 : 0.9);
    expect(wrist.bend).toBeGreaterThan(50);
    expect(wrist.skin).toBe("ow-forearm-skin");
    expect(wrist.rolledSleeve).toBe(true);
    if (pose !== "reload") {
      // The palm supports the rifle from below while the hand continues the
      // forearm's direction. Contact alone also passed with the wrist inverted.
      expect(wrist.wristBend).toBeLessThan(pose === "idle" ? 15 : 40);
      expect(wrist.palmUp).toBeGreaterThan(0.7);
      for (const gap of wrist.fingertipGaps) expect(Math.abs(gap)).toBeLessThan(0.0015);
    }
    await expect(page).toHaveScreenshot(`natural-fps-wrist-${pose}.png`, {
      timeout: 30_000,
      maxDiffPixelRatio: 0.01,
      threshold: 0.15,
    });
  }
  // Sweep complete clips, including the off-screen magazine reach. A few
  // screenshots alone miss hand separation in the middle of a reload.
  const reaches = await page.evaluate<Array<{ id: string; name: string; gap: number }>>(`(() => {
    const vm = window.__ENGINE__.ctx.get('weapons').viewmodel;
    vm.onClipEvent = null;
    const state = {ads:false,sprint:false,lowReady:false,speed:0,crouch:false,
      airborne:false,trigger:false,empty:false};
    const results = [];
    for (const id of vm.weapons.keys()) {
      vm.setActive(id);
      for (const name of ['idle','ads','sprint','reloadTac','reloadEmpty','inspect','draw','holster']) {
        vm.stopClip();
        vm.adsT = vm.sprintT = vm.lowReadyT = 0;
        state.ads = name === 'ads';
        state.sprint = name === 'sprint';
        state.speed = state.sprint ? 5 : 0;
        const duration = vm.play(name) || 1;
        let gap = 0;
        for (let i = 0; i < Math.ceil(duration * 120); i++) {
          vm.update(1 / 120, state);
          const a = vm.armL;
          gap = Math.max(gap, Math.abs(a.hand.position.distanceTo(a.forePivot.position) - a.l2));
        }
        results.push({id, name, gap});
      }
    }
    return results;
  })()`);
  expect(reaches).toHaveLength(24);
  for (const reach of reaches) {
    expect(reach.gap, `${reach.id} ${reach.name} wrist connection`).toBeLessThan(0.00001);
  }
  expect(errors).toEqual([]);
  await page.evaluate("window.__ENGINE__.dispose()");
});

test("NaturalFPS mouse and keyboard control the first-person camera and weapon", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, "?q=low");
  await page.locator("#game").click({ position: { x: 600, y: 340 } });
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("game");
  const start = await state(page);
  await page.mouse.move(740, 340);
  await expect
    .poll(async () => Math.abs((await state(page)).yaw - start.yaw))
    .toBeGreaterThan(0.01);
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => {
      const p = (await state(page)).position;
      return Math.hypot(p[0]! - start.position[0]!, p[2]! - start.position[2]!);
    })
    .toBeGreaterThan(0.15);
  await page.keyboard.up("KeyW");
  const moved = await state(page);
  expect(Math.hypot(...moved.camera.map((v, i) => v - moved.eye[i]!))).toBeLessThan(0.3);
  await page.mouse.down({ button: "right" });
  await expect.poll(async () => (await state(page)).ads).toBeGreaterThan(0.8);
  await page.mouse.up({ button: "right" });
  const ammo = (await state(page)).ammo;
  await page.mouse.down();
  await expect.poll(async () => (await state(page)).ammo).toBeLessThan(ammo);
  await page.mouse.up();
  await page.keyboard.press("KeyR");
  await expect
    .poll(async () => (await state(page)).ammo, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(30);
  await page.keyboard.down("ControlLeft");
  await expect.poll(async () => (await state(page)).stance).toBe("crouch");
  await page.keyboard.up("ControlLeft");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect(page.getByRole("dialog", { name: "NaturalFPS menu" })).toBeVisible();
  await expect(page.locator(".ow-menu .nf-brand")).toHaveText("NATURALFPS");
  await expect.poll(async () => (await state(page)).scale).toBe(0);
  const paused = await state(page);
  await page.waitForTimeout(150);
  expect((await state(page)).tick).toBe(paused.tick);
  await page
    .getByRole("button", { name: /resume game|play/i })
    .first()
    .click({ delay: 250 });
  await expect.poll(async () => (await state(page)).scale).toBe(1);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe("game");
  expect((await state(page)).ammo).toBe(paused.ammo);
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(paused.tick);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(() => page.evaluate<number>("window.__ENGINE__.camera.aspect"))
    .toBeCloseTo(4 / 3);
  await page.evaluate("window.__ENGINE__.dispose()");
  const disposedFrame = await page.evaluate<number>("window.__ENGINE__.time.frame");
  await page.waitForTimeout(100);
  expect(await page.evaluate<number>("window.__ENGINE__.time.frame")).toBe(disposedFrame);
  expect(errors).toEqual([]);
});

for (const shot of [
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
]) {
  test(`NaturalFPS optimized ${shot} rendering retains its deterministic fixture`, async ({
    page,
  }) => {
    await ready(page, "?capture=1&lockstep=1&q=ultra");
    await page.evaluate((name) => {
      // The shot API is installed by the example after initialization.
      Reflect.get(window, "__APPLY_SHOT__")(name, { grabFrame: 90 });
    }, shot);
    await page.evaluate("window.__PUMP__(90)");
    await page.evaluate("window.__PRESENT__(2)");
    await expect(page).toHaveScreenshot(`natural-fps-${shot}.png`, {
      timeout: 30_000,
      maxDiffPixelRatio: 0.0001,
      threshold: 0.01,
    });
    await page.evaluate("window.__ENGINE__.dispose()");
  });
}

test("NaturalFPS optimized passes preserve depth, recover after failures and release instance buffers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page, "?capture=1&lockstep=1&q=ultra");
  await page.evaluate("window.__APPLY_SHOT__('combat', {grabFrame:90})");
  await page.evaluate("window.__PUMP__(90)");
  const result = await page.evaluate<{
    calls: number;
    triangles: number;
    invalidDepth: number;
    surfaces: number;
    sky: number;
    restored: boolean[];
    samples: number;
    resolvesDepth: boolean;
    instancePasses: number;
    disposedPasses: number;
    deletedBuffers: number;
  }>(`(async () => {
    const e = window.__ENGINE__, r = e.ctx.get('render'), renderer = r.renderer;
    const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
    const {width, height} = r.screenSize;
    // Validate on the GPU and read portable RGBA8 instead of implementation-specific MRT formats.
    const target = new r.hdrRt.constructor(width, height, {depthBuffer:false});
    const probe = new r.composite.constructor('depth-contract', \`
      precision highp float;
      uniform sampler2D tDepth;
      uniform sampler2D tNormal;
      varying vec2 vUv;
      void main() {
        float d = texture2D(tDepth, vUv).r;
        bool covered = texture2D(tNormal, vUv).z > 0.5;
        bool valid = covered ? (d > 0.0 && d < 1e30) : d == 0.0;
        gl_FragColor = vec4(valid ? 0.0 : 1.0, covered ? 1.0 : 0.0, covered ? 0.0 : 1.0, 1.0);
      }
    \`, {tDepth:{value:r.depthTexture},tNormal:{value:r.normalTexture}});
    const pixels = new Uint8Array(width * height * 4), previousTarget = renderer.getRenderTarget();
    try {
      probe.render(renderer, target);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      renderer.setRenderTarget(previousTarget);
      target.dispose(); probe.dispose();
    }
    let invalidDepth = 0, surfaces = 0, sky = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]) invalidDepth++;
      if (pixels[i + 1]) surfaces++;
      if (pixels[i + 2]) sky++;
    }
    const source = [];
    e.scene.traverse(o => { if(o.isMesh) source.push([o, o.material, o.visible]); });
    const background = e.scene.background, projection = e.camera.projectionMatrix.clone();
    const raw = renderer.render, restored = [];
    for (const stage of ['shadow', 'prepass', 'view']) {
      renderer.render = function(scene, camera) {
        if ((stage === 'shadow' && scene.overrideMaterial === r.csm.depthMaterial) ||
            (stage === 'prepass' && scene.overrideMaterial === r.gbuffer.material) ||
            (stage === 'view' && scene === e.viewScene)) throw new Error('injected draw failure');
        return raw.call(this, scene, camera);
      };
      let threw = false;
      try { r.render(e.ctx); } catch (error) { threw = error.message === 'injected draw failure'; }
      restored.push(threw && e.scene.background === background && e.scene.overrideMaterial === null &&
        e.scene.matrixWorldAutoUpdate && e.viewScene.matrixWorldAutoUpdate &&
        e.camera.matrixWorldAutoUpdate && e.camera.projectionMatrix.equals(projection) &&
        source.every(([o, material, visible]) => o.material === material && o.visible === visible));
      renderer.render = raw;
    }
    renderer.render = function(scene, camera) {
      if (scene.overrideMaterial === r.csm.depthMaterial) throw new Error('injected warmup failure');
      return raw.call(this, scene, camera);
    };
    const warmup = await r.prewarmMaterials({shadow:true, post:false});
    renderer.render = raw;
    restored.push(!warmup.ok && e.scene.background === background && e.scene.overrideMaterial === null &&
      e.scene.matrixWorldAutoUpdate && source.every(([o, material, visible]) => o.material === material && o.visible === visible));
    await window.__PUMP__(3);
    const passMeshes = [...r.instances.entries.values()].flatMap(entry => [...entry.passes.values()].map(p => p.mesh));
    let disposedPasses = 0, deletedBuffers = 0;
    for (const mesh of passMeshes) mesh.addEventListener('dispose', () => disposedPasses++);
    const gl = renderer.getContext(), deleteBuffer = gl.deleteBuffer;
    gl.deleteBuffer = function(buffer) { deletedBuffers++; return deleteBuffer.call(this, buffer); };
    r.instances.dispose();
    gl.deleteBuffer = deleteBuffer;
    return { calls, triangles, invalidDepth, surfaces, sky, restored,
      samples:r.viewRt.samples, resolvesDepth:r.viewRt.resolveDepthBuffer,
      instancePasses:passMeshes.length, disposedPasses, deletedBuffers };
  })()`);
  expect(result.calls).toBeLessThan(1100);
  expect(result.triangles).toBeLessThan(10_000_000);
  expect(result.invalidDepth).toBe(0);
  expect(result.surfaces).toBeGreaterThan(0);
  expect(result.sky).toBeGreaterThan(0);
  expect(result.restored).toEqual([true, true, true, true]);
  expect(result.samples).toBe(4);
  expect(result.resolvesDepth).toBe(false);
  expect(result.instancePasses).toBeGreaterThan(0);
  expect(result.disposedPasses).toBe(result.instancePasses);
  expect(result.deletedBuffers).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate("window.__PUMP__(2)");
  await page.evaluate("window.__ENGINE__.dispose()");
  expect(errors).toEqual([]);
});

test("NaturalFPS prewarms culled world variants at the active light count", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The wider 1280x720 fixture already sees this prop in its initial view.
  await page.setViewportSize({ width: 1512, height: 982 });
  await ready(page, "?capture=1&lockstep=1&q=ultra");
  await page.evaluate("window.__APPLY_SHOT__('combat')");
  await page.evaluate("window.__PUMP__(3)");
  const prepared = await page.evaluate<{ compiled: number; reflected: number }>(`(async () => {
    const e = window.__ENGINE__, r = e.ctx.get('render'), gl = r.renderer.getContext();
    const rawCompile = gl.compileShader, rawLog = gl.getProgramInfoLog;
    let compiled = 0, reflected = 0;
    gl.compileShader = function(shader) { compiled++; return rawCompile.call(this, shader); };
    gl.getProgramInfoLog = function(program) { reflected++; return rawLog.call(this, program); };
    try {
      // This camera exposes an instanced cloth variant absent from the initial view.
      // A longer combat route first reached it at frame 622, after short benchmarks ended.
      const t = 618 / 60;
      e.camera.position.x += Math.sin(t * 0.7) * 2;
      e.camera.position.z -= Math.sin(t * 0.4) * 3;
      e.camera.rotation.y += Math.sin(t * 0.5) * 0.12;
      await window.__PUMP__(2);
      return { compiled, reflected };
    } finally { gl.compileShader = rawCompile; gl.getProgramInfoLog = rawLog; }
  })()`);
  expect(prepared).toEqual({ compiled: 0, reflected: 0 });
  expect(errors).toEqual([]);
  await page.evaluate("window.__ENGINE__.dispose()");
});
