export const SETTINGS_KEY = "natural-fps.settings.v1";
export const QUALITY_NAMES = ["low", "medium", "high", "ultra"] as const;
export interface MenuSettings {
  quality: (typeof QUALITY_NAMES)[number];
  sensitivity: number;
  fov: number;
  invertY: boolean;
}
export const MENU_DEFAULTS: MenuSettings = { quality: "ultra", sensitivity: 0.0022, fov: 80, invertY: false };

/** Stored preferences are untrusted input, including data written by older builds. */
export function readSettings(raw: string | null): MenuSettings | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const obj = value as Record<string, unknown>;
    const numeric = (key: string, min: number, max: number, fallback: number) => {
      const n = obj[key];
      return typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    return {
      quality: QUALITY_NAMES.find((name) => name === obj["quality"]) ?? MENU_DEFAULTS.quality,
      sensitivity: numeric("sensitivity", 0.00044, 0.0066, MENU_DEFAULTS.sensitivity),
      fov: numeric("fov", 65, 120, MENU_DEFAULTS.fov),
      invertY: obj["invertY"] === true,
    };
  } catch {
    return null;
  }
}

/** Arrow navigation wraps among visible enabled controls. */
export function focusIndex(current: number, direction: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return direction < 0 ? count - 1 : 0;
  return (current + direction + count) % count;
}
