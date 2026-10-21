import { Assembly,blob,box,rodZ,latheZ,extrude,tubeZ } from "../geometry.js";
import { buildRifle } from "./rifle.js";
import { buildPistol } from "./pistol.js";
import { buildMagazine,buildOptic,addFrontSight,addRearSight,addPistolGrip,addLowerReceiver,addPin,addScrew,addRollmark,triggerPart } from "../parts.js";

/** Authored period silhouettes, using the existing material and articulated hand system. */
export function buildClassic(id) {
  const m=id==="pistol"?buildPistol():buildRifle();
  const body=new Assembly(`${id}-body`);
  const add=(geo,key,pos={})=>{body.add(geo,key,pos);geo.dispose();};
  const b=(key,x,y,z,w,h,d,r=0.002,rx=0)=>add(blob(w,h,d,r,2),key,{x,y,z,rx});
  const rod=(key,y,z,r,len)=>add(rodZ(r,r,len,24),key,{y,z});
  const bore=0.075,ak=id==="ak47",smg=id==="smg",sg=id==="shotgun",sniper=id==="sniper";
  m.id=id;m.body=body;m.label=id;m.nodes.opticGlass=null;
  if(id==="pistol") {
    b("steel_black",0,0.018,0,0.029,0.025,0.16);
    b("walnut",0,-0.053,0.048,0.032,0.12,0.05,0.005,-0.22);
    for(const s of [-1,1]) {b("walnut",s*0.018,-0.05,0.046,0.006,0.094,0.038,0.003,-0.22);for(const y of [-0.015,-0.085])addScrew(body,"steel_bright",s*0.022,y,0.045,0.002,"x",0.001);}
    const slide=new Assembly("m1911-slide");
    const g=blob(0.029,0.034,0.185,0.005,3);slide.add(g,"steel_black",{z:-0.016});g.dispose();
    for(let z=0.025;z<0.065;z+=0.004){const serration=box(0.031,0.022,0.0014);slide.add(serration,"steel",{z});serration.dispose();}
    const front=box(0.003,0.006,0.012);slide.add(front,"steel_black",{y:0.02,z:-0.093});front.dispose();
    for(const x of [-0.009,0.009]){const rear=box(0.007,0.006,0.012);slide.add(rear,"steel_black",{x,y:0.02,z:0.055});rear.dispose();}
    m.moving.slide=slide;
    return m;
  }
  const front=smg?-0.32:sg?-0.65:sniper?-0.78:-0.53;
  // Receiver and its machined covers.
  b(ak?"steel_black":"alu",0,bore-0.012,-0.055,ak?0.052:0.048,0.067,sg?0.25:0.23,0.004);
  rod("steel_black",bore+0.025,smg?-0.08:-0.065,ak?0.026:0.023,0.23);
  if(!ak&&!sg&&!sniper) addLowerReceiver(body,"alu","steel",{bore,zRear:0.07,zFront:-0.1,w:0.025,magW:0.03,magD:0.065,magTop:0.05,magBottom:0.003,magZ:-0.058,magTilt:0.06,triggerZ:-0.01,gripAngle:0.38});
  addPistolGrip(body,sniper?"olive":ak?"walnut":"polymer","rubber",{x:0,y:0.007,z:0.033,angle:0.38});
  b("steel_black",0,-0.012,-0.029,0.029,0.011,0.075,0.003);
  for(const s of [-1,1]) b("steel_black",s*0.014,0.009,-0.061,0.006,0.052,0.007);
  b("cavity",0.026,bore,-0.04,0.003,0.028,0.072);
  for(const z of [-0.12,0.035])for(const s of [-1,1])addPin(body,"steel_bright",s*0.026,bore-0.025,z,0.0025,0.003,s);
  // Barrel, crown, and gas assembly have independent profiles.
  rod("steel",bore,(front-0.13)/2,sg?0.012:sniper?0.014:0.009,Math.abs(front+0.13));
  add(tubeZ(sg?0.014:0.013,sg?0.01:0.0055,0.035,24),"steel_soot",{y:bore,z:front});
  if(sg)rod("steel_black",bore-0.035,-0.36,0.012,0.46);
  if(ak)rod("steel_black",bore+0.034,-0.29,0.008,0.3);
  const hg0=smg?-0.13:-0.15,hg1=smg?-0.28:sg?-0.43:sniper?-0.4:-0.35;
  const handZ=(hg0+hg1)/2;
  if(ak){b("walnut",0,bore-0.019,handZ,0.055,0.051,0.2,0.01);b("walnut",0,bore+0.035,handZ,0.046,0.029,0.17,0.008);}
  else if(sniper){b("olive",0,bore-0.048,-0.18,0.063,0.069,0.49,0.009);b("olive",0,bore-0.043,0.26,0.072,0.135,0.29,0.012);b("rubber",0,bore-0.05,0.415,0.079,0.145,0.032,0.005);}
  else {
    add(latheZ([[hg1,0.019],[hg1+0.012,0.029],[hg0-0.012,0.029],[hg0,0.022]],32),"polymer",{y:bore});
    for(let z=hg1+0.01;z<hg0;z+=sg?0.014:0.01)add(latheZ([[z,0.029],[z+0.002,0.032],[z+0.005,0.032],[z+0.006,0.029]],24),"polymer",{y:bore});
    if(smg){b("polymer",0,bore-0.075,-0.22,0.036,0.14,0.048,0.009);}
    if(sg){b("steel_black",0,bore+0.028,-0.34,0.04,0.027,0.34);for(let z=-0.48;z<-0.19;z+=0.025)b("cavity",0,bore+0.043,z,0.027,0.002,0.014);}
  }
  // Stock profiles.
  if(ak){b("walnut",0,0.016,0.255,0.046,0.096,0.31,0.014,-0.1);b("rubber",0,0.0,0.414,0.055,0.116,0.018);}
  else if(smg){b("steel_black",0,bore,0.075,0.055,0.083,0.018,0.003);add(tubeZ(0.013,0.009,0.01,20),"steel_black",{y:bore+0.055,z:0.081,rx:Math.PI/2});}
  else if(sg){for(const x of [-0.031,0.031])b("steel_black",x,bore+0.02,0.23,0.008,0.025,0.34);b("steel_black",0,bore-0.026,0.4,0.083,0.13,0.022);}
  else if(!sniper){rod("steel_black",bore,0.19,0.013,0.26);b("polymer",0,bore-0.04,0.22,0.045,0.075,0.17);b("rubber",0,bore-0.06,0.312,0.054,0.14,0.023,0.005);}
  // Iron sights. The Commando uses a carry handle; the MP5K has a hooded front post.
  const sightY=sniper?0.154:smg?0.12:0.134;
  if(sniper){
    const optic=buildOptic(body,{x:0,y:0.154,z:-0.03,railTop:0.101,rTube:0.025,len:0.09});
    m.nodes.opticGlass=optic;
    add(tubeZ(0.024,0.021,0.24,36),"alu",{y:0.154,z:-0.13});
    add(tubeZ(0.033,0.028,0.085,36),"alu",{y:0.154,z:-0.27});
    for(const z of [-0.03,-0.17])b("alu",0,0.111,z,0.047,0.04,0.025);
    b("steel",0.039,bore+0.015,0.019,0.04,0.012,0.018);add(blob(0.025,0.025,0.025,0.012,3),"steel_black",{x:0.06,y:bore-0.006,z:0.025});
  }else {
    if(id==="rifle"){
      for(const x of [-0.013,0.013]) b("alu",x,0.119,-0.02,0.007,0.016,0.16);
      for(const z of [-0.088,0.055])b("alu",0,0.104,z,0.032,0.041,0.019);
      for(const x of [-0.01,0.01])b("alu",x,sightY,0.048,0.01,0.017,0.018);
    }else {add(tubeZ(smg?0.014:0.011,smg?0.01:0.007,0.012,24),"steel_black",{y:sightY,z:0.036});}
    const z=front+0.07;
    for(const x of [-0.013,0.013])b("steel_black",x,bore+0.028,z,0.007,0.07,0.016,0.001,x>0?0.05:-0.05);
    b("steel_black",0,sightY-0.008,z,0.003,0.023,0.007,0.0005);
    if(smg||ak)add(tubeZ(0.018,0.014,0.01,24),"steel_black",{y:sightY-0.009,z});
  }
  const mag=new Assembly(`${id}-magazine`);
  if(sg){const shell=rodZ(0.009,0.009,0.058,16);mag.add(shell,"shell_red",{});shell.dispose();}
  else buildMagazine(mag,null,{w:ak?0.028:0.026,d:smg?0.035:0.064,len:sniper?0.075:smg?0.19:0.205,curve:ak?0.09:smg?0.035:0.018,segs:12,witness:3,poly:ak?"steel_black":"polymer"});
  m.moving.magazine=mag;
  m.nodes.muzzle=[0,bore,front-0.016];m.nodes.sight=[0,sightY,0.04];m.nodes.ironSight=[0,sightY,0.04];
  m.nodes.gripL={pos:[-0.0602,0.0014,handZ+0.0275],finger:[0.8273,0.4777,-0.2955],back:[0.4777,-0.8273,0.2955]};
  m.nodes.handguard={axis:[0,bore,0],dir:[0,0,1],r:0.03,z0:hg0,z1:hg1};
  m.nodes.magSeat={pos:[0,sg?0.015:0.048,-0.058],rot:[ak?0.17:0.05,0,0]};
  m.shell={caseLen:sg?0.055:smg?0.019:0.0446,rimR:sg?0.009:0.00495};
  return m;
}
