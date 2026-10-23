/**
 * Cut the World Labs horizon ring for the skinned procedural map.
 *
 *   bun tools/worldlabs-horizon.mjs [--channel=chromium]
 *
 * Decodes assets/worldlabs/culdesac_pano.jpg in a headless browser, crops the
 * mesa band (HORIZON_RECIPE.rows), paints out the near objects standing in it
 * (worldlabs-horizon.ts cleanStrip), cuts the sky out into alpha (ridgeAlpha)
 * so the live sky shows above the ridge, and writes
 * assets/worldlabs/skins/horizon.png plus horizon.json. The strip keeps the
 * panorama's angular scale; its bottom edge sits half a degree below the
 * horizon so the haze base tucks behind the map's ground.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";

import { exampleRoot, launchBrowser } from "./browser.mjs";
import {
  HORIZON_RECIPE,
  PANO_SIZE,
  cleanStrip,
  parseHorizon,
  topLuminance,
} from "../src/world/worldlabs-horizon.ts";

const { values } = parseArgs({
  options: { channel: { type: "string", default: "chromium" } },
});

const outDir = resolve(exampleRoot, "assets/worldlabs/skins");
const BOTTOM_ELEVATION = (-0.5 * Math.PI) / 180;
/** Panorama u of the sun (column 930 of 4608, measured on the panorama). */
const SUN_U = 930 / PANO_SIZE[0];

const pano = await readFile(resolve(exampleRoot, "assets/worldlabs/culdesac_pano.jpg"));
const browser = await launchBrowser(values.channel, false);
try {
  const page = await browser.newPage();
  const [y0, y1] = HORIZON_RECIPE.rows;
  const raw = await page.evaluate(
    async ({ b64, y0, y1 }) => {
      const bytes = Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new globalThis.Blob([bytes], { type: "image/jpeg" }));
      const c = new OffscreenCanvas(bitmap.width, y1 - y0);
      const g = c.getContext("2d");
      g.drawImage(bitmap, 0, -y0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let s = "";
      for (let i = 0; i < px.length; i += 0x8000)
        s += String.fromCharCode(...px.subarray(i, i + 0x8000));
      return { w: c.width, h: c.height, b64: globalThis.btoa(s) };
    },
    { b64: pano.toString("base64"), y0, y1 },
  );
  const strip = {
    width: raw.w,
    height: raw.h,
    data: new Uint8ClampedArray(Buffer.from(raw.b64, "base64")),
  };
  // The panorama's own sky luminance at the strip top, before the sky is cut out.
  const skyLuminance = topLuminance(strip, HORIZON_RECIPE.skyRows[1]);
  const clean = cleanStrip(strip);
  const png = new PNG({ width: clean.width, height: clean.height });
  png.data = Buffer.from(clean.data);
  await writeFile(resolve(outDir, "horizon.png"), PNG.sync.write(png, { colorType: 6 }));
  const meta = parseHorizon({
    version: 1,
    url: "/assets/worldlabs/skins/horizon.png",
    size: [clean.width, clean.height],
    elevation: [
      Number(BOTTOM_ELEVATION.toFixed(6)),
      Number((BOTTOM_ELEVATION + (clean.height / PANO_SIZE[1]) * Math.PI).toFixed(6)),
    ],
    sunU: Number(SUN_U.toFixed(5)),
    skyLuminance: Number(skyLuminance.toFixed(5)),
  });
  await writeFile(resolve(outDir, "horizon.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(meta);
} finally {
  await browser.close();
}
