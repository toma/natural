/**
 * Viewmodel shading switches the renderer applies around the weapon pass.
 * Kept free of three so the rules can be tested without a GL context.
 */

export interface ViewShadingSettings {
  /** False stops the viewmodel sampling the world's screen-space AO buffer. */
  viewWorldAo?: boolean;
  /** IBL diffuse for the viewmodel pass; null or omitted keeps the world's value. */
  viewIblDiffuse?: number | null;
}

/**
 * The AO feature flag for the viewmodel pass. The world's AO buffer describes
 * the street behind the gun, so when a look turns it off the weapon pass reads
 * no AO at all; otherwise it keeps the world's flag.
 */
export function viewAoFeature(s: ViewShadingSettings, worldAo: number): number {
  return s.viewWorldAo === false ? 0 : worldAo;
}

/** The viewmodel's IBL diffuse as a partial owIndirect update. */
export function viewIndirectOverride(s: ViewShadingSettings, worldIbl: number): { x: number } {
  return { x: typeof s.viewIblDiffuse === "number" ? s.viewIblDiffuse : worldIbl };
}
