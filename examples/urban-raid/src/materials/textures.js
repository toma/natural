import * as THREE from "three";

/**
 * Loader for the optional CC0 photoscanned PBR sets (see assets/ASSETS.md).
 *
 * The sets are fetched, not committed, so this is a progressive enhancement:
 * loadPbrSet resolves to null when a set is absent and the caller keeps the
 * procedural material for that surface. When a set is present the maps are
 * packed into the exact layout the material library's shader expects, so the
 * same world projection, parallax, macro variation, and vertex weathering that
 * blend the procedural surfaces also blend these, hiding the tiling:
 *
 *   map         albedo in rgb (sRGB), height in alpha (linear)
 *   orm         occlusion in r, roughness in g, metalness in b (linear)
 *   normal      OpenGL tangent normal (linear)
 */

async function loadBitmap(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

function pixels(bitmap, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function dataTexture(data, w, h, colorSpace) {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Load and pack one surface set from `${base}/${name}/`. Returns
 * { albedo, orm, normal } or null if the albedo is missing (set not fetched).
 */
export async function loadPbrSet(name, base = "/assets/pbr") {
  const albedo = await loadBitmap(`${base}/${name}/albedo.jpg`);
  if (!albedo) return null;
  const w = albedo.width;
  const h = albedo.height;
  const [normal, rough, ao, height] = await Promise.all([
    loadBitmap(`${base}/${name}/normal.jpg`),
    loadBitmap(`${base}/${name}/roughness.jpg`),
    loadBitmap(`${base}/${name}/ao.jpg`),
    loadBitmap(`${base}/${name}/height.jpg`),
  ]);

  const albedoPx = pixels(albedo, w, h);
  if (height) {
    const hp = pixels(height, w, h);
    for (let i = 0; i < albedoPx.length; i += 4) albedoPx[i + 3] = hp[i];
  }
  const mapTex = dataTexture(albedoPx, w, h, THREE.SRGBColorSpace);

  const rp = rough ? pixels(rough, w, h) : null;
  const ap = ao ? pixels(ao, w, h) : null;
  const orm = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < orm.length; i += 4) {
    orm[i] = ap ? ap[i] : 255;
    orm[i + 1] = rp ? rp[i] : 205;
    orm[i + 2] = 0;
    orm[i + 3] = 255;
  }
  const ormTex = dataTexture(orm, w, h, THREE.NoColorSpace);

  let normalTex = null;
  if (normal) normalTex = dataTexture(pixels(normal, w, h), w, h, THREE.NoColorSpace);

  return { albedo: mapTex, orm: ormTex, normal: normalTex };
}
