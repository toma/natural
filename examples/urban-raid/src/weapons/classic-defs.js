import { WEAPON_DEFS as BASE } from "./defs.js";
import { WEAPON_CATALOG } from "./loadout.ts";
export const WEAPON_DEFS = Object.fromEntries(WEAPON_CATALOG.map(w=>{
  const source=BASE[w.id]??BASE.rifle;
  const def={...source,...w,modes:[w.id==="shotgun"||w.id==="sniper"||w.id==="pistol"?"semi":"auto"],
    recoil:{...source.recoil},maxRange:w.range,dropoff:w.id==="shotgun"?0.88:0.48,
    drawTime:w.id==="pistol"?0.28:0.45,holsterTime:0.22,
    spreadAds:w.id==="shotgun"?2.5:w.id==="sniper"?0.005:0.08,
    spreadHip:w.id==="shotgun"?4:w.id==="sniper"?4.6:2.4,
    eyeRelief:w.id==="pistol"?0.34:w.id==="sniper"?0.14:0.25,
    adsFov:w.id==="sniper"?0.24:0.72,pellets:w.id==="shotgun"?8:1,
    shellReload:w.id==="shotgun",boltAction:w.id==="sniper",
  };
  if(w.id==="ak47")def.recoil.pitch*=1.35;
  if(w.id==="sniper"||w.id==="shotgun"){def.recoil.pitch*=3;def.recoil.kickBack*=2;}
  return [w.id,def];
}));
