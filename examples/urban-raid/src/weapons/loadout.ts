export const WEAPON_CATALOG = [
  {
    id: "rifle",
    label: "Commando",
    category: "ASSAULT RIFLE",
    description: "Balanced automatic rifle. Fast handling and controlled recoil.",
    magSize: 30,
    reserve: 180,
    rpm: 750,
    damage: 40,
    adsTime: 0.25,
    reloadTac: 2.05,
    reloadEmpty: 2.7,
    range: 160,
  },
  {
    id: "ak47",
    label: "AK-47",
    category: "ASSAULT RIFLE",
    description: "Hard-hitting automatic rifle with a deliberate recoil pattern.",
    magSize: 30,
    reserve: 180,
    rpm: 600,
    damage: 45,
    adsTime: 0.27,
    reloadTac: 2.45,
    reloadEmpty: 3.1,
    range: 150,
  },
  {
    id: "smg",
    label: "MP5K",
    category: "SUBMACHINE GUN",
    description: "Compact automatic weapon for the houses and close lanes.",
    magSize: 30,
    reserve: 180,
    rpm: 850,
    damage: 34,
    adsTime: 0.2,
    reloadTac: 2.15,
    reloadEmpty: 2.85,
    range: 90,
  },
  {
    id: "shotgun",
    label: "SPAS-12",
    category: "SHOTGUN",
    description: "Semi-automatic shotgun. Eight pellets and individual shell loading.",
    magSize: 8,
    reserve: 40,
    rpm: 220,
    damage: 22,
    adsTime: 0.25,
    reloadTac: 0.65,
    reloadEmpty: 0.85,
    range: 35,
  },
  {
    id: "sniper",
    label: "L96A1",
    category: "SNIPER RIFLE",
    description: "Bolt-action rifle with a telescopic sight. Hold Shift to steady aim.",
    magSize: 5,
    reserve: 30,
    rpm: 50,
    damage: 100,
    adsTime: 0.4,
    reloadTac: 2.65,
    reloadEmpty: 3.4,
    range: 300,
  },
  {
    id: "pistol",
    label: "M1911",
    category: "SIDEARM",
    description: "Semi-automatic sidearm. A quick backup when the primary runs dry.",
    magSize: 7,
    reserve: 49,
    rpm: 400,
    damage: 38,
    adsTime: 0.17,
    reloadTac: 1.6,
    reloadEmpty: 2.1,
    range: 65,
  },
] as const;
export type WeaponId = (typeof WEAPON_CATALOG)[number]["id"];
export type PrimaryId = Exclude<WeaponId, "pistol">;
export function isPrimary(value: unknown): value is PrimaryId {
  return WEAPON_CATALOG.some((w) => w.id === value && w.id !== "pistol");
}
export class Loadout {
  primary: PrimaryId = "rifle";
  pending: PrimaryId = "rifle";
  select(value: unknown) {
    if (!isPrimary(value)) return false;
    this.pending = value;
    return true;
  }
  deploy() {
    this.primary = this.pending;
    return this.primary;
  }
  get inventory(): readonly WeaponId[] {
    return [this.primary, "pistol"];
  }
  next(current: string): WeaponId {
    return current === this.primary ? "pistol" : this.primary;
  }
}
