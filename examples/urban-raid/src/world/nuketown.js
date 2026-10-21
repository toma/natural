import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { newTrs, rockGeometry } from "./util.js";
import { HOUSES, FLOOR_HEIGHT, MAP_BOUNDS, housePoint, wallSpans } from "./nuketown-layout.ts";

/** Geometry and artwork authored for NaturalFPS. Coordinates share the collision kit. */
function texture(paint, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  paint(g, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

function materials(A, rng) {
  const surface = (key, color, kind, roughness = 0.8, metalness = 0) => {
    const map = texture((g, n) => {
      g.fillStyle = color; g.fillRect(0, 0, n, n);
      // Broad stains and fine aggregate are authored at separate scales.
      for (let i = 0; i < 130; i++) {
        const x=rng.float()*n,y=rng.float()*n,r=rng.range(8,75);
        const grad=g.createRadialGradient(x,y,0,x,y,r);
        grad.addColorStop(0,`rgba(${rng.float()>.5?"206,193,142":"23,32,22"},${kind==="grass"?0.18:0.045})`);
        grad.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);
      }
      for (let i = 0; i < 22000; i++) {
        g.fillStyle = `rgba(${rng.float() > 0.5 ? "255,255,230" : "0,0,0"},${rng.range(0.015, kind === "grass" ? 0.28 : kind === "metal" ? 0.035 : 0.12)})`;
        const x = rng.float() * n, y = rng.float() * n;
        if (kind === "wood") g.fillRect(x, y, rng.range(10, 130), 1);
        else if (kind === "grass") g.fillRect(x, y, 1, rng.range(2, 10));
        else g.fillRect(x, y, rng.range(1, 3), rng.range(1, 3));
      }
      if (kind === "stone") {
        g.strokeStyle = "#494c43"; g.lineWidth = 8;
        for (let y = 0; y < n; y += 48) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke();
          for (let x = ((y / 48) % 2) * 70; x < n; x += 140) {
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 48); g.stroke();
          }
        }
      }
      if (kind === "roof") {
        g.strokeStyle = "#272c2b"; g.lineWidth = 3;
        for (let y = 0; y < n; y += 32) {
          g.beginPath(); g.moveTo(0,y); g.lineTo(n,y); g.stroke();
          for (let x = ((y / 32) % 2) * 25; x < n; x += 70) g.fillRect(x,y,2,32);
        }
      }
    });
    const scale=kind==="grass"?.3:kind==="roof"?.8:kind==="stone"?.7:1;
    map.repeat.setScalar(scale);
    const bump=map.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;
    return A.registerMaterial(key, new THREE.MeshStandardMaterial({map, bumpMap:bump,
      bumpScale:kind==="stone"?.045:kind==="grass"?.018:kind==="wood"?.009:kind==="metal"?.001:.015,
      roughness, metalness}),
      kind === "grass" ? "foliage" : kind === "wood" ? "wood" : metalness ? "metal" : "concrete");
  };
  surface("nt-green", "#80a874", "wood"); surface("nt-yellow", "#ceb85e", "wood");
  surface("nt-white", "#e9e4d2", "wood"); surface("nt-blue", "#327c8b", "wood");
  surface("nt-wood", "#8e6b47", "wood"); surface("nt-fence", "#b6a17a", "wood");
  surface("nt-roof", "#606560", "roof"); surface("nt-stone", "#817461", "stone");
  surface("nt-road", "#414744", "road"); surface("nt-concrete", "#bdb9aa", "concrete");
  surface("nt-grass", "#526a38", "grass"); surface("nt-hedge", "#435a29", "grass");
  surface("nt-sand", "#bfa780", "sand"); surface("nt-cream", "#ded3b7", "wood");
  surface("nt-rust", "#914e3e", "metal", 0.53, 0.35); surface("nt-bus", "#dfb337", "metal", 0.4, 0.35);
  surface("nt-red", "#a73e35", "metal", 0.4, 0.35); surface("nt-car", "#90a64d", "metal", 0.35, 0.4);
  surface("nt-metal", "#777e79", "metal", 0.42, 0.65); surface("nt-chrome", "#b5bab5", "metal", 0.22, 0.85);
  surface("nt-dark", "#242826", "concrete"); surface("nt-rubber", "#202420", "concrete");
  surface("nt-skin", "#cbb89f", "skin", 0.46); surface("nt-dress", "#576e65", "fabric");
  surface("nt-hair", "#483628", "wood",.78);surface("nt-shirt", "#d4bc82", "fabric");
  surface("nt-lips", "#8f5142", "skin",.55);surface("nt-trousers", "#665e4f", "fabric");
  surface("nt-soil", "#635944", "sand");surface("nt-curtain", "#397887", "fabric");
  surface("nt-plaster", "#d7d1bc", "plaster");surface("nt-enamel", "#ebe7d4", "metal",.28,.05);
  surface("nt-orange", "#b5733f", "fabric"); surface("nt-sofa", "#809263", "fabric");
  const glass = new THREE.MeshStandardMaterial({color: 0x263538, roughness: 0.09, metalness: 0.8});
  A.registerMaterial("nt-glass", glass, "glass");
  A.registerMaterial("nt-bulb", new THREE.MeshStandardMaterial({color:0xffefd2, emissive:0xffce80, emissiveIntensity:1.5, roughness:0.3}), "glass");
  const art = (id, paint) => A.registerMaterial(id, new THREE.MeshStandardMaterial({map:texture(paint,1024),roughness:0.8,side:THREE.DoubleSide}),"wood");
  art("nt-welcome", (g,n) => {
    g.fillStyle="#d4cbb3";g.fillRect(0,0,n,n);g.fillStyle="#a34c3e";g.fillRect(30,30,n-60,n-60);
    g.strokeStyle="#efe2bc";g.lineWidth=5;g.strokeRect(47,47,n-94,n-94);
    g.fillStyle="#eee5cb";g.textAlign="center";g.font="italic 95px Georgia";g.fillText("Welcome to",n/2,235);
    g.font="italic bold 154px Georgia";g.fillText("NUKETOWN",n/2,455);
    g.font="italic 80px Georgia";g.fillText("Population",n/2-60,640);
    g.fillStyle="#273a31";g.fillRect(710,560,170,130);g.fillStyle="#d3d0ad";g.font="90px monospace";g.fillText("07",795,658);
    g.fillStyle="#cdc5a5";g.fillRect(50,765,924,205);g.fillStyle="#443f31";g.font="35px sans-serif";g.fillText("NEVADA TEST SITE  •  AUTHORIZED PERSONNEL",512,886);
  });
  art("nt-moving", (g,n) => {
    g.fillStyle="#ece8d8";g.fillRect(0,0,n,n);g.fillStyle="#9c3d34";g.fillRect(0,680,n,344);
    g.fillStyle="#913c31";g.textAlign="center";g.font="bold 125px Georgia";g.fillText("WESTWARD",512,285);
    g.fillStyle="#303a34";g.font="62px Georgia";g.fillText("MOVING & STORAGE",512,405);g.font="38px sans-serif";g.fillText("DENVER  •  LAS VEGAS",512,500);
    g.fillStyle="#ddd6b7";g.font="italic 52px Georgia";g.fillText("Your home. Wherever you go.",512,838);
  });
  art("nt-bus-sign", (g,n) => {g.fillStyle="#22241c";g.fillRect(0,0,n,n);g.fillStyle="#f2db8c";g.textAlign="center";g.font="bold 130px sans-serif";g.fillText("SCHOOL BUS",512,565);});
  art("nt-art", (g,n) => {g.fillStyle="#e3bc64";g.fillRect(0,0,n,n);for(let i=0;i<12;i++){g.strokeStyle=i%2?"#ab493c":"#dd7844";g.lineWidth=35;g.beginPath();g.ellipse(n/2+i*25,n/2,90+i*40,50+i*50,0,0,7);g.stroke();}});
  art("nt-wallpaper", (g,n) => {g.fillStyle="#ddd2ad";g.fillRect(0,0,n,n);for(let x=0;x<n;x+=64){g.fillStyle="#b6a57d";g.fillRect(x,0,3,n);for(let y=20;y<n;y+=120){g.strokeStyle="#8d9672";g.lineWidth=2;g.beginPath();g.ellipse(x+30,y,12,27,-0.4,0,7);g.stroke();}}});
  art("nt-tiles", (g,n) => {for(let y=0;y<8;y++)for(let x=0;x<8;x++){g.fillStyle=(x+y)%2?"#474b43":"#e8e1c7";g.fillRect(x*128,y*128,128,128);g.strokeStyle="#a69f87";g.lineWidth=3;g.strokeRect(x*128,y*128,128,128);}});
  A.mat("nt-tiles").map.repeat.setScalar(0.25);
  art("nt-clock",(g,n)=>{g.fillStyle="#d5cbb2";g.fillRect(0,0,n,n);g.strokeStyle="#383d38";g.lineWidth=16;g.beginPath();g.arc(512,512,450,0,7);g.stroke();for(let i=0;i<12;i++){const a=i*Math.PI/6;g.beginPath();g.moveTo(512+Math.sin(a)*380,512-Math.cos(a)*380);g.lineTo(512+Math.sin(a)*425,512-Math.cos(a)*425);g.stroke();}g.lineWidth=25;g.beginPath();g.moveTo(512,512);g.lineTo(470,210);g.moveTo(512,512);g.lineTo(512,100);g.stroke();g.fillStyle="#434c41";g.textAlign="center";g.font="38px sans-serif";g.fillText("TEST SITE",512,690);});
}

function kit(A, ox=0, oz=0, yaw=0) {
  const base = newTrs(ox,0,oz,yaw);
  const matrix = (x,y,z,rx=0,ry=0,rz=0) => new THREE.Matrix4().multiplyMatrices(base,newTrs(x,y,z,ry,1,1,1,rx,rz));
  const box = (key,x,y,z,w,h,d,collide=true,rx=0,ry=0,rz=0) => {
    const geo = A.cache(`nt-box:${w}:${h}:${d}`,()=>{
      const g = new THREE.BoxGeometry(w,h,d);
      const uv=g.attributes.uv, normals=g.attributes.normal;
      for(let i=0;i<uv.count;i++) {const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i));uv.setXY(i,uv.getX(i)*(nx>0.5?d:w),uv.getY(i)*(ny>0.5?d:h));}
      return g;
    });
    const m=matrix(x,y,z,rx,ry,rz); if (key) A.add(key,geo,m);
    if(collide) A.collideGeo(key ? A.surfaceOf(key) : "concrete",geo,m);
  };
  const geo = (key,g,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,collide=false) => {
    const m=matrix(x,y,z,rx,ry,rz).scale(new THREE.Vector3(sx,sy,sz));
    A.add(key,g,m); if(collide)A.collideGeo(A.surfaceOf(key),g,m);
    if (![...A._geoCache.values()].includes(g)) g.dispose();
  };
  const round=(key,x,y,z,w,h,d,r=.06,collide=true,rx=0,ry=0,rz=0)=>{
    const g=A.cache(`nt-round:${w}:${h}:${d}:${r}`,()=>new RoundedBoxGeometry(w,h,d,3,r));
    const m=matrix(x,y,z,rx,ry,rz);A.add(key,g,m);
    if(collide)box(null,x,y,z,w,h,d,true,rx,ry,rz);
  };
  const cylinder=(key,x,y,z,r,h,rx=0,rz=0)=>geo(key,A.cache(`nt-cyl:${r}:${h}`,()=>new THREE.CylinderGeometry(r,r,h,24)),x,y,z,1,1,1,rx,0,rz);
  const sphere=(key,x,y,z,sx,sy,sz)=>geo(key,A.cache("nt-sphere",()=>new THREE.SphereGeometry(1,24,16)),x,y,z,sx,sy,sz);
  const line=(key,a,b,r=0.03)=>{
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),v=q.clone().sub(p);
    const g=A.cache("nt-rod",()=>new THREE.CylinderGeometry(1,1,1,8));
    const m=new THREE.Matrix4().compose(p.add(q).multiplyScalar(0.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize()),new THREE.Vector3(r,v.length(),r));
    A.add(key,g,base.clone().multiply(m));
  };
  const art=(key,x,y,z,w,h,ry=0)=>geo(key,A.cache(`nt-plane:${w}:${h}`,()=>new THREE.PlaneGeometry(w,h)),x,y,z,1,1,1,0,ry);
  return {box,round,geo,cylinder,sphere,line,art,matrix};
}

function wall(K,key,x,z,width,height,holes=[],ry=0,y0=0.16) {
  const cuts=[-width/2,width/2,...holes.flatMap(h=>[h.x-h.w/2,h.x+h.w/2])].sort((a,b)=>a-b);
  const pos=(u,y)=>[x+Math.cos(ry)*u,y,z-Math.sin(ry)*u];
  for(let i=0;i<cuts.length-1;i++) {
    const a=cuts[i],b=cuts[i+1],m=(a+b)/2;
    const openings=holes.filter(h=>m>h.x-h.w/2&&m<h.x+h.w/2);
    const ranges=wallSpans(y0,y0+height,openings);
    for(const [lo,hi] of ranges)if(hi-lo>0.015) K.box(key,...pos(m,(lo+hi)/2),b-a,hi-lo,0.24,true,0,ry);
  }
  for(const h of holes) {
    for(const u of [h.x-h.w/2-0.06,h.x+h.w/2+0.06])K.box("nt-white",...pos(u,h.y+h.h/2),0.1,h.h+0.2,0.33,false,0,ry);
    for(const y of [h.y,h.y+h.h])K.box("nt-white",...pos(h.x,y),h.w+0.24,0.11,0.36,false,0,ry);
  }
}

function fence(K,x0,z0,x1,z1,height=1.35,key="nt-white",picket=true) {
  const length=Math.hypot(x1-x0,z1-z0),yaw=-Math.atan2(z1-z0,x1-x0);
  K.box(null,(x0+x1)/2,height/2+0.15,(z0+z1)/2,length,height,0.08,true,0,yaw);
  // Collision panel is continuous; individual boards give the visible fence depth.
  for(let i=0;i<=length/0.24;i++) {
    const t=i/Math.floor(length/0.24),x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;
    K.box(key,x,height/2+0.15,z,0.18,height,0.12,false,0,yaw);
    if(picket)K.box(key,x,height+0.16,z,0.127,0.127,0.12,false,0,yaw,Math.PI/4);
  }
  for(let i=0;i<=length/2.4;i++) {const t=i/Math.max(1,Math.floor(length/2.4));K.box(key,x0+(x1-x0)*t,height/2+0.12,z0+(z1-z0)*t,0.17,height+0.24,0.17,false);}
}

function stairs(K,x,z,width,count=16,run=0.29,rise=FLOOR_HEIGHT/16,ry=0,base=0.16) {
  for(let i=0;i<count;i++) {
    const d=(i+0.5)*run,cy=base+(i+1)*rise/2;
    K.box("nt-wood",x+Math.sin(ry)*d,cy,z+Math.cos(ry)*d,width,(i+1)*rise,run,true,0,ry);
    K.box("nt-white",x+Math.sin(ry)*d,base+(i+1)*rise,z+Math.cos(ry)*d,width+0.04,0.035,run+0.035,false,0,ry);
  }
  for(const s of [-1,1]){
    const dx=Math.cos(ry)*width*s/2,dz=-Math.sin(ry)*width*s/2;
    K.line("nt-white",[x+dx,base+0.9,z+dz],[x+dx+Math.sin(ry)*count*run,base+count*rise+0.9,z+dz+Math.cos(ry)*count*run],0.045);
    for(let i=0;i<=count;i+=2){const d=i*run;K.box("nt-white",x+dx+Math.sin(ry)*d,base+i*rise+0.45,z+dz+Math.cos(ry)*d,0.06,0.9,0.06,false);}
  }
}

function mannequin(K,x,z,y=0.16,ry=0,female=false) {
  // Painted showroom mannequins: defined faces, fitted period clothes and joint seams.
  const c=Math.cos(ry),s=Math.sin(ry),point=(px,py,pz)=>[x+c*px+s*pz,y+py,z-s*px+c*pz];
  const ball=(key,px,py,pz,sx,sy,sz)=>K.geo(key,new THREE.SphereGeometry(1,24,16),...point(px,py,pz),sx,sy,sz,0,ry);
  const line=(key,a,b,r)=>K.line(key,point(...a),point(...b),r);
  const block=(key,px,py,pz,w,h,d,r=.02)=>K.round(key,...point(px,py,pz),w,h,d,r,false,0,ry);
  const shirt=female?"nt-orange":"nt-shirt";
  ball("nt-skin",0,1.64,0,.112,.15,.105);
  ball("nt-skin",0,1.56,.038,.087,.073,.075);
  ball("nt-hair",0,1.7,-.032,.119,.105,.097);
  if(female){ball("nt-hair",0,1.59,-.075,.13,.14,.075);for(const side of [-1,1])ball("nt-hair",side*.09,1.62,-.02,.055,.095,.071);}
  else {block("nt-hair",.063,1.685,.07,.08,.065,.055,.02);ball("nt-hair",-.024,1.73,.025,.107,.053,.085);}
  ball("nt-skin",0,1.62,.112,.022,.047,.03);
  for(const side of [-1,1]){
    ball("nt-skin",side*.112,1.63,0,.022,.034,.02);
    ball("nt-enamel",side*.042,1.659,.09,.026,.011,.015);
    ball("nt-dark",side*.042,1.659,.103,.01,.009,.003);
    block("nt-hair",side*.044,1.677,.103,.043,.008,.004,.002);
  }
  ball(female?"nt-lips":"nt-skin",0,1.571,.105,.035,.009,.007);
  line("nt-dark",[-.025,1.565,.109],[.025,1.565,.109],.002);
  line("nt-skin",[0,1.42,0],[0,1.53,0],.049);
  ball(shirt,0,1.204,0,female?.185:.221,.249,.128);
  ball(shirt,0,1.356,0,female?.194:.25,.101,.132);
  block(shirt,0,1.01,0,female?.28:.35,.18,.226,.05);
  if(female){
    K.geo(shirt,new THREE.CylinderGeometry(.143,.29,.55,32,6),...point(0,.765,0),1,1,.85,0,ry);
    for(let i=0;i<18;i++){const a=i*Math.PI/9;line("nt-rust",[Math.sin(a)*.152,1.02,Math.cos(a)*.131],[Math.sin(a)*.285,.505,Math.cos(a)*.24],.004);}
    block("nt-dark",0,1.03,0,.295,.025,.24,.015);
  }else {
    block("nt-trousers",0,.9,0,.35,.22,.235,.07);
    block("nt-dark",0,1.02,.005,.36,.04,.25,.015);
    block("nt-chrome",0,1.02,.14,.05,.038,.012,.005);
    for(const side of [-1,1]){
      line("nt-trousers",[side*.097,.89,0],[side*.12,.48,.017],.086);
      line("nt-trousers",[side*.12,.48,.017],[side*.127,.13,.018],.068);
      line("nt-dark",[side*.12,.83,.084],[side*.13,.15,.08],.003);
    }
  }
  for(const side of [-1,1]) {
    if(female){line("nt-skin",[side*.105,.58,0],[side*.11,.13,.022],.05);ball("nt-skin",side*.11,.48,.01,.055,.065,.052);}
    block("nt-dark",side*.12,.076,.065,.15,.1,.29,.045);
    const shoulder=[side*(female?.183:.228),1.34,0],elbow=[side*.255,1.055,.007],wrist=[side*.27,.86,.072];
    line(shirt,shoulder,[side*.246,1.16,.005],female?.058:.071);
    line("nt-skin",[side*.247,1.16,.005],elbow,.052);
    ball("nt-skin",...elbow,.051,.059,.052);
    line("nt-skin",elbow,wrist,.045);
    ball("nt-skin",side*.27,.819,.072,.041,.069,.021);
    for(let finger=0;finger<4;finger++)line("nt-skin",[side*.27+(finger-1.5)*.016,.806,.082],[side*.27+(finger-1.5)*.016,.765,.096],.008);
    line("nt-dark",[side*.22,1.345,.01],[side*.235,1.305,.05],.0025);
    // Shirt collar and front placket.
    line("nt-enamel",[side*.05,1.421,.085],[side*.084,1.363,.125],.023);
  }
  for(let h=1.08;h<1.35;h+=.075)ball("nt-dark",0,h,.128,.005,.005,.003);
  K.box(null,x,y+.9,z,.38,1.8,.26,true);
}

function furnish(K, house) {
  K.box("nt-tiles",2.4,0.18,-2.7,6.3,0.03,4.15,false);
  wall(K,"nt-wallpaper",0,-4.78,11.5,2.8,[{x:0.8,y:0.16,w:1.6,h:2.35},{x:-3,y:1.3,w:2.2,h:1.25}]);
  // Kitchen cabinets, sink, oven and chrome stools.
  for(let x=2.15;x<5.2;x+=0.85) {
    K.round("nt-rust",x,.61,-4.3,.8,.85,.65,.025,true);
    K.round("nt-rust",x,.69,-3.95,.7,.6,.055,.018,false);
    K.box("nt-dark",x,.23,-4,.77,.09,.08,false);
    K.box("nt-cream",x,1.08,-4.3,0.87,0.08,0.78,false);
    K.round("nt-rust",x,2.25,-4.45,.8,.8,.4,.018,false);
    K.box("nt-chrome",x+0.24,0.85,-3.94,0.16,0.026,0.04,false);
    K.box("nt-chrome",x+0.24,2.11,-4.21,0.025,0.18,0.04,false);
  }
  K.box("nt-dark",3,1.125,-4.3,0.55,0.025,0.44,false);
  K.line("nt-chrome",[3,1.1,-4.55],[3,1.42,-4.55],0.025);K.line("nt-chrome",[3,1.42,-4.55],[3,1.42,-4.3],0.025);
  K.round("nt-enamel",5.2,1.22,-3.1,.88,2.08,.9,.12,true);
  K.round("nt-enamel",5.2,1.04,-2.62,.8,1.52,.12,.055,false);K.round("nt-enamel",5.2,2.04,-2.62,.8,.4,.12,.05,false);
  K.box("nt-chrome",4.92,1.45,-2.53,.055,.39,.065,false);K.box("nt-chrome",4.92,2.02,-2.53,.055,.15,.065,false);
  K.round("nt-enamel",2.15,.63,-4.25,.78,.87,.8,.04,true);K.round("nt-dark",2.15,.64,-3.81,.56,.44,.025,.025,false);
  K.line("nt-chrome",[1.86,.92,-3.76],[2.43,.92,-3.76],.024);
  for(const x of [1.91,2.08,2.25,2.42])K.sphere("nt-dark",x,1.06,-3.8,.038,.038,.025);
  for(let x=1.94;x<2.54;x+=0.35)for(let z=-4.45;z<-3.9;z+=0.35)K.cylinder("nt-dark",x,1.085,z,0.115,0.014);
  K.round("nt-orange",2.3,0.98,-1.8,1.8,0.1,0.95,.045,true);for(const x of [1.65,2.95])for(const z of [-2.1,-1.5])K.cylinder("nt-chrome",x,0.58,z,0.035,0.8);
  for(const x of [1.6,2.9]){K.box("nt-yellow",x,0.63,-0.75,0.53,0.13,0.53,true);K.box("nt-yellow",x,1,-0.53,0.53,0.65,0.09,false);for(const dx of [-0.2,0.2])for(const dz of [-0.2,0.2])K.cylinder("nt-chrome",x+dx,0.39,-0.75+dz,0.027,0.4);}
  // Living room couch, rug, coffee table and period television.
  K.box("nt-orange",1.4,0.2,2.45,4.4,0.035,3,false);
  K.round("nt-sofa",3.8,0.55,2.1,1.15,0.7,2.8,.13,true);K.round("nt-sofa",4.3,1.02,2.1,0.25,0.85,2.9,.1,false);
  for(const z of [0.65,3.55])K.round("nt-sofa",3.8,0.87,z,1.15,0.55,0.2,.07,false);
  for(let z=1;z<3.5;z+=0.85)K.box("nt-cream",3.7,0.88,z,0.9,0.16,0.77,false);
  K.box("nt-wood",1.6,0.65,2.1,1.45,0.1,1.75,true);for(const x of [1.05,2.15])for(const z of [1.4,2.8])K.cylinder("nt-wood",x,0.39,z,0.045,0.5);
  K.box("nt-wood",-0.4,0.88,4.3,1.3,1.05,0.55,true);K.box("nt-dark",-0.5,0.99,3.99,0.91,0.65,0.045,false);K.sphere("nt-glass",-0.5,0.99,3.96,0.42,0.28,0.06);
  for(const x of [-0.7,-0.3])K.line("nt-chrome",[-0.5,1.4,4.2],[x,1.95,4.2],0.01);
  K.art("nt-art",0,1.92,-0.57,1.5,1.25);
  K.box("nt-plaster",1.1,FLOOR_HEIGHT-.075,0,9.6,.015,9.75,false);
  // Upper room, bed, writing desk, curtains, lamp.
  const y=FLOOR_HEIGHT;
  K.box("nt-wood",2.6,y+0.4,-2.1,2.6,0.4,3.6,true);K.box("nt-cream",2.6,y+0.72,-2.1,2.5,0.3,3.5,true);K.box("nt-blue",2.6,y+0.91,-1.45,2.52,0.12,2.1,false);
  for(const x of [1.95,3.22])K.sphere("nt-white",x,y+0.95,-3.2,0.55,0.14,0.34);
  K.box("nt-wood",-0.4,y+0.96,3.85,2.6,0.13,0.85,true);for(const x of [-1.5,0.7])for(const z of [3.55,4.1])K.box("nt-wood",x,y+0.55,z,0.08,0.8,0.08,false);
  for(const x of [-1.9,1.9])K.box("nt-blue",x,y+1.65,4.66,0.5,2.6,0.13,false);
  for(const z of [2,-2.5]){K.cylinder("nt-dark",1,2.88,z,0.012,0.45);K.geo("nt-yellow",A_lamp(),1,2.64,z);K.sphere("nt-bulb",1,2.57,z,0.1,0.07,0.1);}
  mannequin(K,4,-2,0.2,0,true);mannequin(K,-1.9,3.8,y+0.17,Math.PI);
}
const A_lamp=()=>new THREE.ConeGeometry(0.29,0.16,16,1,true);

function house(A, spec) {
  const K=kit(A,spec.x,spec.z,spec.yaw), key=`nt-${spec.id}`, y=FLOOR_HEIGHT;
  const win=(x,base=1.15,w=2,h=1.5)=>({x,y:base,w,h});
  K.box("nt-concrete",0,0,0,12.4,0.32,10.4,true);
  wall(K,key,0,5,12,6.24,[{x:-3.1,y:0.16,w:1.6,h:2.35},win(1.6,1.05,3.2,1.65),win(0,y+0.85,3.4,1.85)]);
  wall(K,key,0,-5,12,6.24,[{x:-0.8,y:0.16,w:1.6,h:2.35},{x:-3.2,y:y+0.16,w:1.5,h:2.25},win(3,1.3,2.2,1.25)],Math.PI);
  wall(K,key,-6,0,10,6.24,[{x:-0.2,y:0.16,w:1.7,h:2.3},win(2.6,y+1.1,1.6,1.5)],Math.PI/2);
  wall(K,key,6,0,10,6.24,[win(-2,1.1,2,1.5),win(2,y+1.1,2,1.5)],Math.PI/2);
  // Lap siding is modeled, with holes preserved at doors and windows.
  for(let i=0;i<27;i++){
    const sy=0.33+i*0.225;
    const holes=[{x:-3.1,y:0.16,w:1.7,h:2.45},win(1.6,1.02,3.4,1.73),win(0,y+0.8,3.55,1.95)].filter(h=>sy>=h.y&&sy<=h.y+h.h);
    const cuts=[-6,6,...holes.flatMap(h=>[h.x-h.w/2,h.x+h.w/2])].sort((a,b)=>a-b);
    for(let j=0;j<cuts.length-1;j++){const a=cuts[j],b=cuts[j+1],m=(a+b)/2;if(!holes.some(h=>Math.abs(m-h.x)<h.w/2))K.box(key,m,sy,5.145,b-a,0.032,0.045,false);}
    
  }
  for(const x of [-6.1,6.1])for(const z of [-5.1,5.1])K.box("nt-white",x,3.25,z,0.15,6.3,0.15,false);
  K.box("nt-white",0,y,5.18,12.5,0.28,0.24,false);K.box("nt-white",0,6.33,5.15,12.6,0.24,0.3,false);
  for(const x of [-2.25,2.25]){K.box(spec.id==="green"?"nt-blue":"nt-orange",x,y+1.8,5.22,0.68,2.1,0.09,false);for(let i=0;i<14;i++)K.box("nt-wood",x,y+0.86+i*0.14,5.28,0.59,0.028,0.035,false);}
  // Floor leaves a real stair opening along the left wall.
  K.box("nt-wood",1.1,y+0.04,0,9.6,0.2,9.75,true);
  K.box("nt-wood",-4.75,y+0.04,3.1,2.1,0.2,3.6,true);
  K.box("nt-wood",-4.75,y+0.04,-4.2,2.1,0.2,1.35,true);
  stairs(K,-4.72,-3.3,1.65);
  wall(K,"nt-cream",1.1,-0.7,9.4,2.83,[{x:-1.9,y:0.16,w:1.6,h:2.4}],0);
  wall(K,"nt-cream",0,-0.2,11.6,2.83,[{x:-2.8,y:y+0.16,w:1.8,h:2.4}],0,y+0.16);
  // Roofs and chimney distinguish the two houses at a glance.
  if(spec.id==="green"){
    const rise=1.7, half=6.6, angle=Math.atan2(rise,half);
    for(const s of [-1,1])K.box("nt-roof",s*3.3,7.15,0,Math.hypot(half,rise),0.17,11.2,false,0,0,-s*angle);
    for(const z of [-5,5]){const shape=new THREE.Shape();shape.moveTo(-6,0);shape.lineTo(6,0);shape.lineTo(0,1.55);shape.closePath();K.geo(key,new THREE.ShapeGeometry(shape),0,6.4,z,1,1,1,0,z<0?Math.PI:0);}
  }else{
    K.box("nt-roof",0,6.77,0,13.2,0.18,11.2,false,0,0,-0.09);
    K.box("nt-white",0,6.76,5.6,13.2,0.32,0.14,false,0,0,-0.09);
  }
  K.box("nt-stone",-4.55,4.1,4.9,1.9,8.2,0.85,true);K.box("nt-dark",-4.55,8.29,4.9,2.18,0.18,1.06,false);
  for(const x of [-5.3,-3.8])K.box("nt-metal",x,8.52,4.9,0.045,0.45,0.85,false);K.box("nt-metal",-4.55,8.76,4.9,2.13,0.06,1,false);
  // Attached garage with front and rear access.
  K.box("nt-concrete",-9,0,1,6.2,0.32,8.2,true);
  wall(K,key,-9,5,6,2.9,[{x:0,y:0.16,w:4.65,h:2.55}]);
  wall(K,key,-12,1,8,2.9,[],Math.PI/2);
  wall(K,key,-9,-3,6,2.9,[{x:1.6,y:0.16,w:1.5,h:2.4}],Math.PI);
  for(const s of [-1,1])K.box("nt-roof",-9+s*1.7,3.6,1,3.65,0.15,8.7,false,0,0,-s*0.32);
  K.box("nt-blue",-9,2.77,4.8,4.6,0.25,0.9,false);
  K.box("nt-wood",-10.9,0.9,-1.6,1.4,1.5,0.8,true);K.box("nt-wood",-7.4,0.61,-1.9,1.2,0.9,1.1,true);
  // Rear deck and external staircase form the second route upstairs.
  K.box("nt-wood",-0.9,y+0.02,-6.4,9.8,0.24,2.5,true);
  for(const x of [-5.6,3.8])for(const z of [-5.5,-7.4])K.box("nt-white",x,1.6,z,0.15,3.25,0.15,true);

  // Deck rail needs the upper-floor elevation, distinct from garden fences.
  K.box("nt-white",-1.85,y+0.97,-7.63,7.5,0.08,0.08,false);
  for(let x=-5.5;x<2;x+=0.3)K.box("nt-white",x,y+0.58,-7.63,0.055,0.88,0.055,false);
  stairs(K,3.05,-12.2,1.55,16,0.29,y/16,0);
  furnish(K,spec);
  for(const z of [2,-2.5]){const p=housePoint(spec,1,z);A.interiorLights.push({x:p.x,y:2.6,z:p.z});}
  const p=housePoint(spec,0,0);A.interiorLights.push({x:p.x,y:5.7,z:p.z});
  return {spec};
}

function wheels(K, xs, z, radius=0.52) {
  for(const x of xs)for(const s of [-1,1]){
    K.cylinder("nt-rubber",x,radius+0.08,z+s*1.28,radius,0.3,Math.PI/2);
    K.cylinder("nt-chrome",x,radius+0.08,z+s*1.46,radius*0.52,0.035,Math.PI/2);
    K.cylinder("nt-dark",x,radius+0.08,z+s*1.485,radius*0.25,0.04,Math.PI/2);
  }
}
function bus(A) {
  const K=kit(A,-2.5,-3.1);
  K.box("nt-dark",0,0.77,0,11.3,0.5,2.5,true);
  K.box("nt-bus",0,1.35,0,11.1,0.95,2.62,true);
  K.box("nt-bus",0.7,2.86,0,9.7,0.22,2.72,true);
  K.box("nt-bus",-4.8,1.64,0,1.4,0.46,2.55,true);
  K.box("nt-glass",-3.94,2.26,0,0.04,0.98,2.42,true);
  K.box("nt-bus",5.47,2.22,0,0.17,1.2,2.62,true);
  for(const side of [-1,1]){
    for(let x=-3.5;x<5.4;x+=0.95){K.box("nt-glass",x,2.26,side*1.315,0.82,0.85,0.035,true);K.box("nt-bus",x-0.48,2.26,side*1.33,0.1,1.15,0.08,false);K.box("nt-chrome",x,2.25,side*1.36,0.79,0.025,0.025,false);}
    for(const y of [0.99,1.17,1.64])K.box("nt-dark",0,y,side*1.337,11,0.065,0.04,false);
    K.box("nt-bus",-3.65,1.56,side*1.55,0.16,0.23,0.48,false);
    K.line("nt-metal",[-3.95,2.36,side*1.3],[-4.25,2.4,side*1.72]);
    K.box("nt-dark",-4.25,2.42,side*1.74,0.12,0.36,0.18,false);
    for(let x=-4.8;x<5.5;x+=0.32)K.sphere("nt-metal",x,1.47,side*1.352,0.018,0.018,0.013);
  }
  K.box("nt-chrome",-5.67,0.88,0,0.15,0.25,2.9,false);
  K.box("nt-dark",-5.57,1.35,0,0.07,0.6,1.2,false);
  for(let z=-0.5;z<=0.5;z+=0.1)K.box("nt-chrome",-5.63,1.35,z,0.06,0.54,0.035,false);
  for(const z of [-1,1]){K.sphere("nt-bulb",-5.61,1.57,z,0.055,0.17,0.17);K.sphere("nt-red",5.59,1.5,z,0.04,0.12,0.12);}
  K.art("nt-bus-sign",-3.94,2.85,0,2.2,0.3,-Math.PI/2);
  wheels(K,[-3.7,3.7],0);
}

function truck(A) {
  const K=kit(A,2.2,3.2);
  K.box("nt-dark",0,0.85,0,13.5,0.35,2.4,true);
  K.box("nt-red",-5.5,1.43,0,2.3,1.2,2.55,true);
  K.box("nt-red",-5.1,2.49,0,2.2,0.95,2.5,true);
  K.box("nt-red",-5.1,3.03,0,2.4,0.15,2.65,false);
  K.box("nt-glass",-6.23,2.58,0,0.025,0.65,2.24,false);
  for(const z of [-1.28,1.28]){K.box("nt-glass",-5.45,2.56,z,1.22,0.65,0.025,false);K.box("nt-chrome",-5.1,1.89,z*1.04,0.24,0.045,0.05,false);K.cylinder("nt-chrome",-3.95,2.15,z,0.09,2.9);}
  K.box("nt-chrome",-6.7,1.37,0,0.16,1.05,1.15,false);for(let z=-0.52;z<0.58;z+=0.12)K.box("nt-dark",-6.8,1.4,z,0.035,0.85,0.05,false);
  K.box("nt-chrome",-6.91,0.75,0,0.18,0.29,2.82,false);
  for(const z of [-1,1])K.sphere("nt-bulb",-6.77,1.57,z,0.08,0.19,0.19);
  // Open moving trailer: the lateral gap is a playable passage.
  K.box("nt-wood",1.9,1.02,0,8.85,0.2,2.75,true);
  K.box("nt-white",1.9,3.73,0,9,0.15,2.95,true);
  K.box("nt-white",6.35,2.4,0,0.14,2.65,2.85,true);
  K.box("nt-white",-2.55,2.4,0,0.14,2.65,2.85,true);
  for(const s of [-1,1]) {
    K.box("nt-white",0.45,2.38,s*1.44,6,2.58,0.08,true);
    K.art("nt-moving",0.45,2.4,s*1.49,5.8,2.5,s<0?Math.PI:0);
    for(let x=-2.5;x<3.4;x+=0.25)K.box("nt-chrome",x,2.4,s*1.51,0.016,2.5,0.016,false);
    // Ramps at the open rear third of the trailer.
    K.box("nt-wood",4.85,0.6,s*2.1,2.35,0.12,1.7,true,s*0.5);
  }
  K.box("nt-wood",-1.7,1.75,0,1.3,1.3,1.7,true);K.round("nt-sofa",1.2,1.6,0,1.2,1,1.9,.1,true);
  wheels(K,[-5.2,-2.9,4.2,5.6],0,0.58);
}

function car(A,x,z,ry=0,color="nt-car") {
  const K=kit(A,x,z,ry);
  K.box(color,0,0.74,0,4.8,0.63,1.85,true);K.box(color,0,1.34,0,2.5,0.67,1.7,true);
  K.box("nt-glass",-1.23,1.4,0,0.03,0.5,1.54,false);K.box("nt-glass",1.23,1.4,0,0.03,0.5,1.54,false);
  for(const s of [-1,1]){K.box("nt-glass",0,1.44,s*0.862,2.2,0.43,0.025,false);K.box("nt-chrome",0,0.9,s*0.96,4.7,0.05,0.04,false);K.box("nt-chrome",0,1.4,s*0.88,0.05,0.58,0.03,false);}
  for(const xx of [-2.43,2.43])K.box("nt-chrome",xx,0.65,0,0.12,0.18,1.98,false);
  for(const xx of [-1.5,1.5])for(const zz of [-0.91,0.91]){K.cylinder("nt-rubber",xx,0.45,zz,0.39,0.2,Math.PI/2);K.cylinder("nt-chrome",xx,0.45,zz*1.13,0.24,0.035,Math.PI/2);}
  for(const s of [-1,1])K.sphere("nt-bulb",-2.46,0.95,s*0.69,0.045,0.15,0.15);
}

function garden(A,h,rng) {
  const K=kit(A,h.x,h.z,h.yaw);
  fence(K,-20,-18,20,-18,2.05,"nt-fence",false);
  fence(K,-20,-18,-20,10,1.8,"nt-fence",false);fence(K,20,-18,20,10,1.8,"nt-fence",false);
  fence(K,-18,9,-5.2,9);fence(K,0,9,12,9);
  // Garden shed and lattice, separated from the circulation around the house.
  K.box("nt-wood",-13,1.25,-14.5,4.5,2.3,3.5,true);K.box("nt-roof",-13,2.72,-14.5,5,0.15,4,false,0,0,0.13);
  K.box("nt-blue",-13,1.25,-12.72,1.35,2.05,0.06,false);
  K.box("nt-concrete",8,0.18,-11,6,0.08,6,true);
  K.cylinder("nt-white",8,1.02,-10.5,0.85,0.07);K.cylinder("nt-metal",8,0.57,-10.5,0.05,0.9);
  K.cylinder("nt-metal",8,1.9,-10.5,0.025,2.3);K.geo("nt-orange",new THREE.ConeGeometry(1.55,0.48,12),8,2.9,-10.5);
  for(const x of [6.7,9.3]){K.box("nt-white",x,0.67,-10.5,0.55,0.1,0.65,true);K.box("nt-white",x,1.06,-10.78,0.55,0.75,0.08,false);for(const dx of [-0.22,0.22])for(const dz of [-0.25,0.25])K.cylinder("nt-metal",x+dx,0.43,-10.5+dz,0.025,0.5);}
  K.cylinder("nt-dark",11,0.93,-13,0.42,0.24);K.sphere("nt-dark",11,1.1,-13,0.42,0.25,0.42);
  for(const dx of [-0.25,0.25])K.line("nt-metal",[11+dx,0.85,-13],[11+dx,0.2,-13],0.025);
  // Swing set, washing line, planted borders and topiary.
  for(const x of [-5,0]){K.line("nt-metal",[x,0.16,-16.8],[x,2.85,-15.3],0.055);K.line("nt-metal",[x,0.16,-13.8],[x,2.85,-15.3],0.055);}K.line("nt-metal",[-5,2.85,-15.3],[0,2.85,-15.3],0.055);
  for(const x of [-3.6,-1.4]){for(const dx of [-0.22,0.22])K.line("nt-dark",[x+dx,2.82,-15.3],[x+dx,0.72,-15.3],0.012);K.box("nt-wood",x,0.71,-15.3,0.62,0.06,0.32,false);}
  for(const x of [-17,16])for(let z=-16;z<6;z+=3.4){K.sphere("nt-hedge",x,0.75,z,0.75,0.6,0.8);K.box("nt-stone",x,0.28,z,1.7,0.3,1.7,true);}
  for(let i=0;i<85;i++){const x=rng.range(1,11),z=rng.range(6,8);K.sphere(i%3?"nt-hedge":"nt-orange",x,0.28,z,0.1,0.12,0.1);}
  mannequin(K,3,-15,0.18,0,true);mannequin(K,-3,8,0.18,0);
  // Drainpipe, porch light and mail box.
  K.cylinder("nt-white",5.9,3.2,5.25,0.055,6.2);K.box("nt-metal",4,0.78,10.2,0.06,1.2,0.06,true);K.box("nt-metal",4,1.42,10.2,0.38,0.34,0.62,false);
  K.sphere("nt-bulb",-2.03,2.2,5.22,0.09,0.16,0.1);
}

export function buildNuketown(A,rng) {
  materials(A,rng);
  const K=kit(A);
  // Sand extends to the atmospheric horizon; only the fenced map is playable.
  K.box("nt-sand",0,-0.3,0,1800,0.4,1800,false);
  K.box("nt-grass",0,0.045,0,46,0.15,78,true);
  K.box("nt-road",0,0.05,0,46,0.17,17,true);
  for(const z of [-9.1,9.1]){K.box("nt-concrete",0,0.17,z,46,0.24,1.25,true);for(let x=-23;x<23;x+=1.5)K.box("nt-dark",x,0.298,z,0.014,0.004,1.2,false);}
  for(const h of HOUSES){const d=kit(A,h.x,h.z,h.yaw);d.box("nt-concrete",-9,0.16,8.1,6,0.17,6.3,true);d.box("nt-concrete",-3,0.16,8,1.8,0.17,6,true);}
  const infos=HOUSES.map(h=>house(A,h));
  for(const h of HOUSES)garden(A,h,rng);
  bus(A);truck(A);car(A,-11.7,-10.8,Math.PI/2);car(A,12.4,12.4,-Math.PI/2,"nt-rust");
  // Welcome sign and test clock terminate the street vista.
  K.box("nt-white",14.5,1.7,-11.5,3.65,2.65,0.22,true);K.art("nt-welcome",14.5,1.74,-11.35,3.35,2.35);
  for(const x of [12.53,16.47]){K.box("nt-white",x,1.4,-11.5,0.28,2.85,0.32,true);K.sphere("nt-white",x,3,-11.5,0.23,0.23,0.23);}
  for(const x of [-20,20]){K.box("nt-metal",x,0.55,0,0.25,1.1,16,true);for(const z of [-6,-2,2,6])K.box("nt-wood",x,0.5,z,0.32,1,0.3,true);}
  for(const x of [-4,4])K.line("nt-metal",[x+28,0,-9],[28+x*0.34,18,-9],0.12);
  for(let y=1;y<17;y+=2){const w=4-y*0.15;K.line("nt-metal",[28-w,y,-9],[28+w,y+2,-9],0.065);K.line("nt-metal",[28+w,y,-9],[28-w,y+2,-9],0.065);}
  K.geo("nt-clock",new THREE.CircleGeometry(2.1,48),28,17.8,-8.9,1,1,1,0,-Math.PI/2);
  // Neighboring houses and utility poles give the playable suburb a larger setting.
  for(const s of [-1,1])for(const z of [-31,-5,26]) {
    const x=s*34;K.box(z<0?"nt-green":"nt-rust",x,2,z,12,4,9,false);
    for(const dx of [-3.3,3.3])K.box("nt-glass",x+dx,2.5,z+4.52,2.1,1.5,0.04,false);
    for(const side of [-1,1])K.box("nt-roof",x+side*3.2,4.8,z,6.7,0.18,10,false,0,0,-side*0.26);
  }
  for(const x of [-21,21])for(const z of [-18,16]){
    K.cylinder("nt-wood",x,6,z,0.14,12);K.box("nt-wood",x,11.3,z,3,0.14,0.14,false);
    for(const dx of [-1,0,1]){K.cylinder("nt-white",x+dx,11.5,z,0.075,0.25);for(let i=0;i<12;i++){const t0=i/12,t1=(i+1)/12;K.line("nt-dark",[x+dx,11.6-Math.sin(t0*Math.PI)*0.9,-18+t0*34],[x+dx,11.6-Math.sin(t1*Math.PI)*0.9,-18+t1*34],0.014);}}
  }
  for(let i=0;i<24;i++) {
    const a=i*Math.PI/12,r=150+rng.range(0,80);K.geo("nt-sand",rockGeometry(rng,1,3,0.5),Math.sin(a)*r,-3,Math.cos(a)*r,rng.range(30,65),rng.range(15,34),rng.range(24,50));
  }
  // Boundary collision is independent of dressing, including fence tops.
  for(const x of [MAP_BOUNDS.minX,MAP_BOUNDS.maxX])A.box("concrete",x,6,0,0.5,12,78);
  for(const z of [MAP_BOUNDS.minZ,MAP_BOUNDS.maxZ])A.box("concrete",0,6,z,46,12,0.5);
  return infos;
}
