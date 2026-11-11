// Atlas 3D — visionneuse d'anatomie (modèles Z-Anatomy, CC BY-SA 4.0 ; noms : Terminologia Anatomica 2)
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const VER=new URL(import.meta.url).searchParams.get('v')||'0';
const CDN='https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';
const EXPORT=/\/atlas\/(index\.html)?$/.test(location.pathname)?'../export/':'export/';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const LS={get(k,d){try{const v=localStorage.getItem('atlas.'+k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem('atlas.'+k,JSON.stringify(v))}catch{}}};

// ------------------------------------------------------------------ réglages
const MOBILE=matchMedia('(pointer:coarse)').matches||Math.min(innerWidth,innerHeight)<600;
const DEF={shadows:!MOBILE,shadowStrength:.65,ground:true,detail:MOBILE?0:1,exposure:1.05,quality:'auto',fov:30,zoom:1,rotate:1,invertZoom:false,inertia:true,
 pin:1,halo:1,labels:!MOBILE,ghost:.07,tips:true,sex:'m'};
const CFG=Object.assign({},DEF,LS.get('cfg',{}));
// ------------------------------------------------------------------ morphologie féminine (déformation du modèle de base)
const SEX='m',SCL=1;
const sm=(a,b,x)=>{x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x)};
function warpF(v){const y=v.y,ax=Math.abs(v.x);let fx=1;
  fx+=.075*sm(.68,.84,y)*(1-sm(1.0,1.1,y))*(1-sm(.16,.20,ax));   // bassin plus large
  fx-=.07*sm(1.08,1.2,y)*(1-sm(1.46,1.52,y));                    // thorax et épaules plus étroits
  fx+=.22*sm(.775,.80,y)*(1-sm(.83,.875,y))*(1-sm(.05,.10,ax));  // angle sous-pubien plus ouvert
  v.x*=fx;return v.multiplyScalar(.93)}
const MALE=/penis|testi|scrot|prostat|epididym|seminal|deferens|ejaculat|^Urethra/i,FEMOLD=/uterus|^Vagina|Uterine tube|^Ovar|ligament of ovary/i;
const _wv=new THREE.Vector3();
function warpMesh(o,name){
  let g=o.geometry;if(g.userData.src){const src=g.userData.src;g=o.geometry=g.clone();g.setAttribute('position',src.clone())}else g.userData.src=g.attributes.position.clone();
  const P=g.attributes.position,M=o.matrixWorld,I=M.clone().invert(),bl=/^Urinary bladder/.test(name),sg=/^Sigmoid colon/.test(name),v=_wv;
  for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(M);
    if(bl){v.z=.042-(.042-v.z)*.6;v.y=.829+(v.y-.829)*.8}else if(sg)v.z=-.072+(v.z+.072)*(1-.25*(1-sm(.87,.93,v.y)));
    warpF(v).applyMatrix4(I);P.setXYZ(i,v.x,v.y,v.z)}
  P.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere()}
// ------------------------------------------------------------------ systèmes
const SYS=[
 {id:'squelette',label:'Squelette',files:['squelette.glb','sesamoides_main.glb'],color:0xe6d9bd,rough:.66},
 {id:'articulations',label:'Articulations et ligaments',files:['articulations.glb'],color:0xa9c2ab,rough:.6},
 {id:'muscles',label:'Muscles',files:['muscles_seuls.glb'],extra:{Fascia:'fascias.glb',Bursa:'bourses.glb'},color:0xa9463e,rough:.46},
 {id:'vaisseaux',label:'Cardiovasculaire',files:['vaisseaux.glb'],color:0xd9534f,rough:.36},
 {id:'nerfs',label:'Nerveux et organes des sens',files:['nerfs_seuls.glb'],extra:{Fascia:'nerfs_fascias.glb','White matter':'substance_blanche.glb'},color:0xead25c,rough:.5},
 {id:'visceres',label:'Viscères',files:['visceres_seuls.glb'],extra:{Fascia:'visceres_fascias.glb'},color:0xc98a7a,rough:.38},
 {id:'lymphatique',label:'Lymphatique',files:['lymphatique.glb','vaisseaux_lymphatiques.glb'],color:0x9ad68f,rough:.5},
 {id:'regions',label:'Peau et régions',files:['regions.glb'],color:0xd8a98b,rough:.6},
 {id:'insertions',label:'Insertions musculaires',files:['insertions.glb'],color:0xe0504a,rough:.6,internal:true},
];
SYS.forEach(s=>{s.on=false;s.state='';s.parts=[];s.promise=null});

const SYSID=Object.fromEntries(SYS.map(s=>[s.id,s]));
const SHORT={articulations:'Articulations',vaisseaux:'Vaisseaux',nerfs:'Nerfs',feminin:'Génital féminin',regions:'Peau et régions'};
const TYPE={Bone:'Os',Cartilage:'Cartilage',Teeth:'Dent','Teeth-roots':'Racine dentaire',Suture:'Suture',Tendon:'Tendon',Fascia:'Fascia',Ligament:'Ligament',
 'Articular capsule':'Capsule articulaire',Bursa:'Bourse synoviale',Fat:'Corps adipeux',Artery:'Artère',Vein:'Veine','Pulmonary artery':'Artère pulmonaire',
 'Pulmonary vein':'Veine pulmonaire',Gland:'Glande',Mucosa:'Muqueuse',Nerve:'Nerf',Nucleus:'Noyau','White matter':'Substance blanche'};
const FUNC={Abductor:'Abducteur',Adductor:'Adducteur',Extension:'Extenseur',Flexion:'Fléchisseur','External rotation':'Rotateur latéral','Internal rotator':'Rotateur médial',
 Levator:'Élévateur',Depressor:'Abaisseur','Orbicularis/Constrictor':'Orbiculaire / constricteur','Flexion fingers':'Fléchisseur des doigts','Extensor extremities':'Extenseur des doigts',
 'Extension hand/foot':'Extenseur main / pied','Flexion hand/foot':'Fléchisseur main / pied',Biarticular:'Bi-articulaire',Phonation:'Phonation',Ingestion:'Déglutition',Masticator:'Masticateur'};
const LOBE={'Frontal lobe':0xd99b9b,'Parietal lobe':0x9cc3dc,'Temporal lobe':0xa8d49e,'Occipital lobe':0xdcc998,'Limbic lobe':0xc6a4dc,Insula:0xdca8c8,'Interlobar sulci':0x8c7b70};
const GROUPS=[['all','Tout le squelette'],['crane','Crâne et face'],['rachis','Colonne vertébrale'],['thorax','Thorax'],['msup','Membre supérieur'],['minf','Membre inférieur']];
function boneGroup(en){const s=en.toLowerCase();
 if(/hip bone|femur|patella|tibia|fibula|talus|calcaneus|navicular|cuboid|cuneiform|metatarsal|of foot/.test(s))return'minf';
 if(/clavicle|scapula|humerus|radius|ulna|carpal|scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate|of hand|sesamoid/.test(s))return'msup';
 if(/vertebra|atlas|axis|sacrum|coccyx|intervertebral/.test(s))return'rachis';
 if(/rib|stern|xiphoid|costal|manubrium/.test(s))return'thorax';
 return'crane'}

// ------------------------------------------------------------------ scène
const canvas=$('#c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setClearColor(0x000000,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();
scene.environment=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;
const camera=new THREE.PerspectiveCamera(30,1,.01,60);camera.position.set(0,1,4.6);scene.add(camera);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const sun=new THREE.DirectionalLight(0xfff3e2,1),sun2=new THREE.DirectionalLight(0xfff3e2,1);scene.add(sun,sun.target,sun2,sun2.target);
sun.shadow.mapSize.setScalar(MOBILE?1024:2048);
const ground=new THREE.Mesh(new THREE.CircleGeometry(1.3,48),new THREE.ShadowMaterial({opacity:.28}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.visible=false;scene.add(ground);
const _l=new THREE.Vector3();
function updateLight(still){
  const t=controls.target,d=camera.position.distanceTo(t);_l.set(-.5,.72,.62).applyQuaternion(camera.quaternion).normalize();
  for(const L of[sun,sun2]){L.position.copy(t).addScaledVector(_l,3);L.target.position.copy(t);L.target.updateMatrixWorld()}
  if(!sun.castShadow||!still)return;
  const r=THREE.MathUtils.clamp(d*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.8,.03,1.4),c=sun.shadow.camera;
  c.left=-r;c.right=r;c.top=r;c.bottom=-r;c.near=.4;c.far=5.6;c.updateProjectionMatrix();sun.shadow.normalBias=r*.0035;sun.shadow.bias=-r*.0005}
scene.add(new THREE.HemisphereLight(0xdfeeff,0x5a4a3a,.45));
const world=new THREE.Group();scene.add(world);world.matrixWorldAutoUpdate=false;renderer.shadowMap.autoUpdate=false;
const pinG=new THREE.Group();scene.add(pinG);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.14;controls.minDistance=.03;controls.maxDistance=12;controls.target.set(0,.9,0);controls.rotateSpeed=.9;
let dirty=true;const invalidate=()=>{dirty=true};
controls.addEventListener('change',invalidate);
const dprFor=()=>CFG.quality==='eco'?1:Math.min(devicePixelRatio||1,CFG.quality==='max'?3:MOBILE?1.5:2);
let fullDpr=dprFor(),curDpr=fullDpr,moving=false,slow=0,lastT=0,restoreTimer=0;
let visN=0,visDirty=true,lastZoom=0;
function heavy(){if(visDirty){visN=0;for(const p of parts)if(p.sys.on&&!p.hidden)visN+=p.meshes.length;visDirty=false}return visN>900}
function lowRes(){if(heavy()&&curDpr>1.25){curDpr=1.25;renderer.setPixelRatio(curDpr);renderer.setSize(innerWidth,innerHeight,false)}}
controls.addEventListener('start',()=>{moving=true;clearTimeout(restoreTimer);hideTip();lowRes()});
controls.addEventListener('end',()=>{moving=false;restoreTimer=setTimeout(()=>{invalidate();if(curDpr!==fullDpr){curDpr=fullDpr;renderer.setPixelRatio(curDpr);resize()}},260)});
let booted=false;
function resize(){const w=innerWidth,h=innerHeight;if(!w||!h)return;renderer.setPixelRatio(curDpr);renderer.setSize(w,h,false);if(camera.view)camera.clearViewOffset();camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();if(booted)sheetOffset()}
addEventListener('resize',resize);resize();

// zoom molette / trackpad : proportionnel au geste, centré sur le curseur
const rcZ=new THREE.Raycaster(),zP=new THREE.Plane(),zA=new THREE.Vector3(),zB=new THREE.Vector3(),zN=new THREE.Vector2();
function zoomAt(x,y,f){
  const d=camera.position.distanceTo(controls.target),nd=THREE.MathUtils.clamp(d*f,controls.minDistance,controls.maxDistance);f=nd/d;if(Math.abs(f-1)<1e-5)return;tw=null;
  zN.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);rcZ.setFromCamera(zN,camera);camera.getWorldDirection(zA);zP.setFromNormalAndCoplanarPoint(zA,controls.target);
  if(!rcZ.ray.intersectPlane(zP,zB))zB.copy(controls.target);
  camera.position.sub(zB).multiplyScalar(f).add(zB);controls.target.sub(zB).multiplyScalar(f).add(zB);invalidate()}
addEventListener('wheel',e=>{if(e.target!==canvas)return;e.preventDefault();e.stopPropagation();
  let dy=e.deltaY;if(e.deltaMode===1)dy*=32;else if(e.deltaMode===2)dy*=600;
  lastZoom=performance.now();clearTimeout(restoreTimer);lowRes();restoreTimer=setTimeout(()=>{invalidate();if(curDpr!==fullDpr){curDpr=fullDpr;renderer.setPixelRatio(curDpr);resize()}},320);
  const k=(e.ctrlKey?.0085:.0015)*CFG.zoom*(CFG.invertZoom?-1:1);zoomAt(e.clientX,e.clientY,Math.exp(THREE.MathUtils.clamp(dy*k,-.45,.45)))},{capture:true,passive:false});
let tw=null;
function flyTo(center,radius,dir,ms=650){
  const d=Math.max(radius,.01)/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.18/Math.min(1,camera.aspect*1.15);
  const v=(dir?dir.clone():camera.position.clone().sub(controls.target)).normalize();
  tw={t0:performance.now(),ms,p0:camera.position.clone(),p1:center.clone().addScaledVector(v,d),q0:controls.target.clone(),q1:center.clone()};invalidate()}
function loop(t){
  requestAnimationFrame(loop);
  if(tw){const k=Math.min(1,(t-tw.t0)/tw.ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;camera.position.lerpVectors(tw.p0,tw.p1,e);controls.target.lerpVectors(tw.q0,tw.q1,e);if(k>=1)tw=null;dirty=true}
  if(EX.k!==EX.t){const d=EX.t-EX.k;EX.k=Math.abs(d)<.004?EX.t:EX.k+d*.22;exApply();if(!EX.on&&EX.k===0)exRestore();dirty=true}
  controls.update();
  if(!dirty){lastT=t;return}
  if(moving){if(t-lastT>34)slow++;else slow=Math.max(0,slow-1);if(slow>6){if(curDpr>1){curDpr=1;renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight,false)}slow=0}}
  lastT=t;dirty=false;const still=!moving&&!tw&&t-lastZoom>200;updateLight(still);if(still&&CFG.shadows)renderer.shadowMap.needsUpdate=true;updatePins();renderer.render(scene,camera);layoutLabels()}

// ------------------------------------------------------------------ données
let CAT={names:{},landmarks:{}};
const parts=[];const S={sel:null,hov:null,labels:CFG.labels,multi:new Set()};let MULTI=false;
let pickDirty=true,pickables=[];
const OPT=Object.assign({Fascia:false,Bursa:false,'White matter':false},LS.get('opt',{}));const LOADED=new Set();
const defHidden=p=>!!p.ins||!!p.defOff||(p.mat in OPT&&!OPT[p.mat]);
function splitName(n){n=n.replace(/\.\d{3}$/,'').trim();const m=n.match(/^(.*)\.([lr])$/);return m?[m[1].trim(),m[2]]:[n.replace(/\.$/,''),'']}
const ABDO=/abdominal oblique|^Rectus abdominis|^Transversus abdominis|^Pyramidalis/;
function tint(mn,orig,s,name){const c=tint0(mn,orig,s,name);if(s.id==='muscles'&&ABDO.test(name)){c.set(0xad4b3f);const h=(hash(name)%100)/100;c.offsetHSL(0,0,(h-.5)*.02)}return c}
function tint0(mn,orig,s,name){
  if(mn==='Black')return new THREE.Color(/lash|brow/i.test(name)?0x1d130d:0x33200f);
  if(s.id==='insertions')return new THREE.Color(/^(End|Muscular ending)/i.test(mn)?0x3f86e8:0xe0504a);
  if(/^Bone|^Os-/.test(mn))return new THREE.Color(0xe6d9bd);
  if(/^Suture/.test(mn))return new THREE.Color(0xb9ab8f);
  if(/^Nerve/.test(mn))return new THREE.Color(0xead25c);
  if(LOBE[mn])return new THREE.Color(LOBE[mn]);
  const w=orig.r>.97&&orig.g>.97&&orig.b>.97,k=orig.r<.02&&orig.g<.02&&orig.b<.02;
  if(!w&&!k)return orig.clone();
  const c=new THREE.Color(s.color);
  if(s.id==='muscles'||mn==='Trapezius'||mn==='Diaphragm'||FUNC[mn]){c.set(0xa9463e);const h=(hash(name)%100)/100;c.offsetHSL((h-.5)*.02,0,(h-.5)*.07)}
  return c}
const SURF={uDetail:{value:0}};
function kindOf(mn,s){if(mn==='Black')return 6;if(/^Bone|^Os-|Teeth|Suture|Dentine/.test(mn))return 1;if(/Tendon|Ligament|Fascia|capsule|Cartilage/i.test(mn))return 5;if(s.id==='muscles'||FUNC[mn])return 2;
  return{vaisseaux:3,nerfs:3,lymphatique:3,regions:4,squelette:1,insertions:3}[s.id]||0}
function surfKey(){return'surf'+(this.userData.kind|0)+(this.userData.halo?'h':'')+(CFG.detail>0?'d':'')}
const GLSL_NOISE=`
float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.55,s=0.;for(int i=0;i<3;i++){s+=a*vn(p);p=p*2.03+17.3;a*=.5;}return s;}
#define FADE(F) smoothstep(.7,.22,px*F)
float surfH(vec3 p,float px){float h=0.;
#if KIND==1
 float a=FADE(1100.),b=FADE(170.);if(a>0.)h+=a*(fbm(p*1100.)*.55-smoothstep(.62,.82,vn(p*2400.))*.3);if(b>0.)h+=b*fbm(p*170.)*.6;
#elif KIND==2
 float a=FADE(1300.),b=FADE(210.);if(a>0.)h+=a*fbm(p*1300.)*.5;if(b>0.)h+=b*fbm(p*210.)*.6;
#elif KIND==5
 float a=FADE(1700.),b=FADE(260.);if(a>0.)h+=a*fbm(p*1700.)*.6;if(b>0.)h+=b*fbm(p*260.)*.4;
#elif KIND==4
 float a=FADE(2600.),b=FADE(130.);if(a>0.)h+=a*fbm(p*2600.)*.6;if(b>0.)h+=b*fbm(p*130.)*.4;
#elif KIND==3
 float a=FADE(600.);if(a>0.)h+=a*fbm(p*600.)*.6;
#elif KIND==6
 float a=FADE(500.);if(a>0.)h+=a*fbm(vec3(p.x*1500.,p.y*70.,p.z*1500.))*1.2;
#else
 float a=FADE(800.),b=FADE(95.);if(a>0.)h+=a*fbm(p*800.)*.5;if(b>0.)h+=b*fbm(p*95.)*.6;
#endif
 return h;}
#if KIND==1
 #define BUMP .00022
 #define CAMP .22
#elif KIND==2
 #define BUMP .00014
 #define CAMP .16
#elif KIND==3
 #define BUMP .00007
 #define CAMP .08
#elif KIND==6
 #define BUMP .0005
 #define CAMP .7
#elif KIND==4
 #define BUMP .00006
 #define CAMP .1
#else
 #define BUMP .00013
 #define CAMP .14
#endif
`;
function surfCompile(sh){
  const u=this.userData,det=CFG.detail>0;Object.assign(sh.uniforms,LMU,SURF);
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHP;varying vec3 vHN;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvHP=(modelMatrix*vec4(transformed,1.)).xyz;vHN=normalize(mat3(modelMatrix)*objectNormal);');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vHP;varying vec3 vHN;uniform float uDetail;float gH=0.;\n#define KIND '+(u.kind|0)+'\n'+(det?'#define SURF_DETAIL\n':'')+(u.halo?'#define SURF_HALO\n':'')
      +'uniform int uLmCount;uniform int uLmSel;uniform float uLmK;uniform vec3 uLmP[64];uniform vec3 uLmN[64];uniform vec3 uLmC[64];uniform float uLmR[64];\n'+(det?GLSL_NOISE:''))
    .replace('#include <color_fragment>',`#include <color_fragment>
    #ifdef SURF_DETAIL
    {gH=surfH(vHP,length(fwidth(vHP)));diffuseColor.rgb*=1.+(gH-.45)*CAMP*uDetail;
     #if KIND==4
      diffuseColor.rgb*=mix(vec3(1.),vec3(1.07,.95,.92),clamp(fbm(vHP*34.)*1.3-.25,0.,1.)*min(1.,uDetail)*.6);
     #endif
     #if KIND==1
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.84,.72,.58),clamp((.42-gH)*1.6,0.,1.)*min(1.,uDetail)*.55);
     #endif
    }
    #endif
    #ifdef SURF_HALO
    {float bw=0.;vec3 bc=vec3(1.);vec3 hn=normalize(vHN);
     for(int i=0;i<64;i++){if(i>=uLmCount)break;float r=uLmR[i]*uLmK*(i==uLmSel?1.4:1.);float d=distance(vHP,uLmP[i]);if(d>r)continue;if(dot(hn,uLmN[i])<.0)continue;
       float w=1.-d/r;w=w*w*(3.-2.*w);w=min(1.,w*1.6)*(i==uLmSel?.95:(uLmSel>=0?.45:.8));if(w>bw){bw=w;bc=uLmC[i];}}
     diffuseColor.rgb=mix(diffuseColor.rgb,bc,bw);}
    #endif`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    #ifdef SURF_DETAIL
     roughnessFactor=clamp(roughnessFactor+(.45-gH)*.3*uDetail,.18,1.);
    #endif`)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    #ifdef SURF_DETAIL
    {vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);vec3 r1=cross(sy,normal),r2=cross(normal,sx);float dt=dot(sx,r1);
     vec3 g=sign(dt)*(dFdx(gH)*r1+dFdy(gH)*r2);normal=normalize(abs(dt)*normal-BUMP*uDetail*g);}
    #endif`)}
function ingest(gltf,s){
  const root=gltf.scene;root.updateMatrixWorld(true);const owners=new Map();
  root.traverse(o=>{
    if(!o.isMesh)return;
    const owner=o.userData.name!==undefined?o:o.parent,name=owner&&owner.userData.name;
    const mn=(o.material&&o.material.name)||'';
    if(!name||mn==='Text'||(SEX==='f'&&(MALE.test(name)||(s.id==='feminin'&&FEMOLD.test(name))))){o.visible=false;return}
    let p=owners.get(owner);
    if(!p){const [base,side]=splitName(name),nm=CAT.names[name];
      p={id:parts.length,name,base,side,sys:s,mat:mn.replace(/-\d+$/,''),meshes:[],fr:nm?nm[0]:'',la:nm?nm[1]:'',en:base,hidden:false,ghost:false,lmOn:false,flash:0,box:null};
      if(s.id==='insertions'){const m=name.match(/^(.*)\.([oe])(\d*)([lr])?$/);if(m){p.ins={muscle:m[1].replace(/^\(|\)$/g,''),type:m[2],side:m[4]||''};p.en=p.ins.muscle;p.side=p.ins.side}}
      p.hidden=defHidden(p);
      owners.set(owner,p);parts.push(p);s.parts.push(p);LOADED.add(name)}
    const base=tint(mn,o.material.color||new THREE.Color(1,1,1),s,p.base);
    const mat=new THREE.MeshStandardMaterial({color:base.clone(),roughness:s.rough,metalness:0,envMapIntensity:.7,side:o.material.side});
    mat.userData.kind=kindOf(mn,s);mat.onBeforeCompile=surfCompile;mat.customProgramCacheKey=surfKey;o.castShadow=o.receiveShadow=true;
    if(s.id==='insertions'){mat.polygonOffset=true;mat.polygonOffsetFactor=-3;mat.polygonOffsetUnits=-3}
    if(SEX==='f')warpMesh(o,name);
    mat.userData.base=base;o.material=mat;o.userData.part=p;p.meshes.push(o);o.matrixAutoUpdate=false});
  root.traverse(o=>{o.matrixAutoUpdate=false});world.add(root)}
const title=p=>p.ins?(p.ins.type==='o'?'Origine — ':'Terminaison — ')+(p.fr||p.en):(p.fr||p.en);
const sideFr=p=>p.side==='r'?'droite':p.side==='l'?'gauche':'';
function pbox(p){if(!p.box){p.box=new THREE.Box3();for(const m of p.meshes){if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();p.box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld))}p.center=p.box.getCenter(new THREE.Vector3());p.radius=p.box.getSize(new THREE.Vector3()).length()/2}return p.box}
const GOLD=new THREE.Color(0xffa41f),GREEN=new THREE.Color(0x4fd47f),RED=new THREE.Color(0xf0604e);
function apply(p){
  const vis=p.sys.on&&!p.hidden,sel=(p===S.sel||S.multi.has(p))&&!p.lmOn,hov=p===S.hov;
  for(const m of p.meshes){m.visible=vis;const mt=m.material;
    if(mt.transparent!==p.ghost){mt.transparent=p.ghost;mt.depthWrite=!p.ghost;mt.needsUpdate=true}
    mt.opacity=p.ghost?CFG.ghost:1;m.renderOrder=p.ghost?5:0;m.castShadow=!p.ghost;
    if(p.flash){mt.color.copy(p.flash>0?GREEN:RED);mt.emissive.copy(mt.color).multiplyScalar(.25)}
    else if(sel){mt.color.copy(mt.userData.base).lerp(GOLD,.82);mt.emissive.setRGB(.26,.13,.0)}
    else{mt.color.copy(mt.userData.base);if(hov)mt.emissive.setRGB(.06,.085,.08);else mt.emissive.setRGB(0,0,0)}}
  pickDirty=visDirty=true;invalidate()}
const WHITEISH=new THREE.Color(0xf1e9d8);
const applyAll=()=>parts.forEach(apply);

const dracoL=new DRACOLoader().setDecoderPath(CDN+'libs/draco/gltf/');
const gltfL=new GLTFLoader().setDRACOLoader(dracoL);
let loading=0;
function setLoader(f){const el=$('#loader');el.style.opacity=f>=1?0:1;el.style.width=(f>=1?100:Math.max(4,f*100))+'%';if(f>=1)setTimeout(()=>{if(!loading)el.style.width='0'},450)}
function loadSys(s){
  if(s.promise)return s.promise;
  s.state='loading';loading++;sysRow(s);
  s.promise=(async()=>{
    s.xl=s.xl||{};const files=s.files.concat(Object.keys(s.extra||{}).filter(k=>OPT[k]).map(k=>(s.xl[k]=1,s.extra[k])));
    const prog=files.map(()=>0);
    try{
      const gl=await Promise.all(files.map((f,i)=>new Promise((res,rej)=>gltfL.load(EXPORT+encodeURI(f),res,e=>{if(e.total){prog[i]=e.loaded/e.total;s.prog=prog.reduce((a,b)=>a+b,0)/prog.length;sysRow(s);setLoader(s.prog*.95)}},rej))));
      gl.forEach(g=>ingest(g,s));s.state='ready';s.parts.forEach(apply);indexSys(s);
    }catch(e){s.state='';s.promise=null;toast('Impossible de charger « '+s.label+' »');throw e}
    finally{loading--;setLoader(1);sysRow(s)}
  })();
  return s.promise}
async function setSys(s,on){
  if(on&&s.state!=='ready'){try{await loadSys(s)}catch{return}}
  s.on=on;s.parts.forEach(apply);sysRow(s);buildTree();if(!on&&S.sel&&S.sel.sys===s)select(null)}

// accélération du pointage (BVH), chargée en option
import('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.0/build/index.module.js').then(m=>{
  THREE.Mesh.prototype.raycast=function(rc,hits){const g=this.geometry;
    if(g&&!g.boundsTree&&!g.userData.noBvh&&g.attributes.position&&g.attributes.position.count>1200){try{g.boundsTree=new m.MeshBVH(g)}catch{g.userData.noBvh=true}}
    m.acceleratedRaycast.call(this,rc,hits)}}).catch(()=>{});

// ------------------------------------------------------------------ pointage
const rc=new THREE.Raycaster(),ndc=new THREE.Vector2();
const clip={on:false,axis:'x',flip:false,plane:new THREE.Plane(new THREE.Vector3(-1,0,0),0),box:null};
function pick(ev,pins=true){
  const r=canvas.getBoundingClientRect();ndc.set((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1);rc.setFromCamera(ndc,camera);
  if(pins&&LM.bone){const h=rc.intersectObjects(LM.pins.filter(s=>s.visible),false);if(h.length)return{lm:h[0].object.userData.i}}
  if(pickDirty){pickables=[];for(const p of parts)if(p.sys.on&&!p.hidden&&!p.ghost)for(const m of p.meshes)pickables.push(m);pickDirty=false}
  rc.firstHitOnly=!clip.on;
  const hits=rc.intersectObjects(pickables,false);
  for(const h of hits){if(clip.on&&clip.plane.distanceToPoint(h.point)<0)continue;return{part:h.object.userData.part,point:h.point}}
  return null}
let down=null,hovRaf=0,lastMove=null;
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,b:e.button};$('#results').classList.remove('on')});
canvas.addEventListener('pointerup',e=>{if(!down)return;const d=Math.hypot(e.clientX-down.x,e.clientY-down.y),b=down.b;down=null;if(d<5&&b===0)onClick(e)});
canvas.addEventListener('pointermove',e=>{lastMove=e;if(e.buttons||moving)return;if(!hovRaf)hovRaf=requestAnimationFrame(()=>{hovRaf=0;onHover(lastMove)})});
canvas.addEventListener('pointerleave',()=>{setHover(null);setLmHover(-1);hideTip()});
canvas.addEventListener('dblclick',e=>{const h=pick(e,false);if(h&&h.part&&!Q.on){select(h.part);focusSel()}});
function setHover(p){if(S.hov===p)return;const o=S.hov;S.hov=p;if(o)apply(o);if(p)apply(p)}
function onHover(e){
  const h=pick(e);canvas.style.cursor=h?(DIS?'crosshair':'pointer'):'';
  if(h&&h.lm!==undefined){setHover(null);setLmHover(h.lm);if(!Q.on||Q.answered){const L=LM.list[h.lm];showTip(e,L.fr||L.en,L.la)}else hideTip();return}
  setLmHover(-1);
  if(Q.on&&(Q.mode==='lmname'||Q.mode==='lmfind')){setHover(null);hideTip();return}
  setHover(h?h.part:null);
  if(h&&!Q.on&&CFG.tips)showTip(e,title(h.part)+(h.part.side?' · '+sideFr(h.part):''),h.part.la);else hideTip()}
function onClick(e){
  const h=pick(e);
  if(Q.on){quizClick(h);return}
  if(h&&h.lm!==undefined){selectLm(h.lm,true);return}
  if((e.shiftKey||e.metaKey||e.ctrlKey||MULTI)&&h&&h.part){toggleMulti(h.part);return}
  if((EX.on||EX.arm)&&h&&h.part&&h.point){exClick(h);select(h.part);return}
  if(DIS&&h&&h.part){pushUndo();const p=h.part;p.hidden=true;apply(p);if(S.sel===p)select(null);setHover(null);hideTip();buildTree();return}
  select(h?h.part:null)}
const tip=$('#tip');
function showTip(e,a,b){tip.innerHTML=esc(a)+(b?'<small>'+esc(b)+'</small>':'');tip.style.display='block';const w=tip.offsetWidth;tip.style.left=Math.min(innerWidth-w-8,e.clientX+14)+'px';tip.style.top=(e.clientY+16)+'px'}
function hideTip(){tip.style.display='none'}
let toastT=0;function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toastT);toastT=setTimeout(()=>t.style.display='none',3200)}

// ------------------------------------------------------------------ sélection, visibilité, annulation
const undoStack=[];
const snap=()=>({on:SYS.map(s=>s.on),st:parts.map(p=>(p.hidden?1:0)|(p.ghost?2:0))});
function restore(sn){SYS.forEach((s,i)=>{s.on=sn.on[i]&&s.state==='ready'});parts.forEach((p,i)=>{const v=sn.st[i];if(v===undefined){p.hidden=defHidden(p);p.ghost=false}else{p.hidden=!!(v&1);p.ghost=!!(v&2)}});applyAll();SYS.forEach(sysRow);buildTree()}
const redoStack=[];const pushUndo=()=>{undoStack.push(snap());if(undoStack.length>40)undoStack.shift();redoStack.length=0};
function redo(){if(Q.on)return;const s=redoStack.pop();if(!s){toast('Rien à rétablir');return}undoStack.push(snap());exOff();restore(s);card()}
function undo(){if(Q.on)return;const s=undoStack.pop();if(!s){toast('Rien à annuler');return}if(INS.owner)closeIns(true);redoStack.push(snap());restore(s);if(LM.bone&&(LM.bone.hidden||!LM.bone.sys.on))closeLm();card()}
function select(p,fly){
  if(S.multi.size){const a=[...S.multi];S.multi.clear();a.forEach(apply)}
  const o=S.sel;if(o===p){if(fly&&p)focusSel();card();return}
  if(LM.bone&&LM.bone!==p)closeLm();
  if(INS.owner&&INS.owner!==p&&!(p&&p.ins))closeIns();
  S.sel=p;if(o)apply(o);if(p)apply(p);card();markTree();if(fly&&p)focusSel()}
function focusSel(){const p=S.sel;if(!p)return;pbox(p);flyTo(p.exOff?p.center.clone().add(p.exOff):p.center,Math.max(p.radius*1.25,.035))}
function visibleBox(){const b=new THREE.Box3();for(const p of parts)if(p.sys.on&&!p.hidden&&!p.ghost)b.union(pbox(p));return b}
function fitAll(dir,ms){const b=visibleBox();if(b.isEmpty())return;flyTo(b.getCenter(new THREE.Vector3()),b.getSize(new THREE.Vector3()).length()/2,dir,ms)}
function isolate(p){pushUndo();for(const q of parts){q.ghost=false;q.hidden=q.ins?!(INS.owner===p&&INS.parts.includes(q)):q!==p}applyAll();buildTree();
  if(CAT.landmarks[p.name]&&LM.bone!==p)openLm(p);focusSel();card()}
function hideSel(){const p=S.sel;if(!p)return;pushUndo();p.hidden=true;apply(p);select(null);markTree()}
function ghostOthers(){const p=S.sel;if(!p)return;pushUndo();const any=parts.some(q=>q.ghost&&q!==p);for(const q of parts)if(q!==p&&!q.ins)q.ghost=!any;p.ghost=false;applyAll();card()}
function showAll(){if(Q.on)return;pushUndo();exOff();if(INS.owner)closeIns(true);for(const p of parts){p.hidden=defHidden(p);p.ghost=false}applyAll();buildTree();card()}

// ------------------------------------------------------------------ reliefs osseux
const LM={bone:null,list:[],pins:[],sel:-1,hov:-1,quiz:false};
function boneGeo(p){
  if(p.W)return;let n=0;for(const m of p.meshes)n+=m.geometry.attributes.position.count;
  const W=new Float32Array(n*3),N=new Float32Array(n*3),v=new THREE.Vector3();let o=0;p.off=[];
  for(const m of p.meshes){p.off.push(o);const P=m.geometry.attributes.position,Nn=m.geometry.attributes.normal;
    for(let i=0;i<P.count;i++,o++){v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);W[o*3]=v.x;W[o*3+1]=v.y;W[o*3+2]=v.z;
      if(Nn){v.fromBufferAttribute(Nn,i).transformDirection(m.matrixWorld);N[o*3]=v.x;N[o*3+1]=v.y;N[o*3+2]=v.z}}}
  p.W=W;p.N=N}
function pinTex(css,n){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  x.beginPath();x.arc(32,32,25,0,7);x.fillStyle=css;x.fill();x.lineWidth=5;x.strokeStyle='#fff';x.stroke();
  x.fillStyle='#10181b';x.font='700 '+(n>9?26:30)+'px -apple-system,Segoe UI,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(n,32,34);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function openLm(p,quiz=false){
  closeLm();exOff();const data=CAT.landmarks[p.name];if(!data||!data.length)return;
  boneGeo(p);const W=p.W,N=p.N,n=W.length/3;pbox(p);
  LM.bone=p;LM.quiz=quiz;LM.sel=LM.hov=-1;
  const tri=new THREE.Triangle(),A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),cp=new THREE.Vector3(),q=new THREE.Vector3(),fn=new THREE.Vector3();
  LM.list=data.map((d,i)=>{let bd=1e9;const s=new THREE.Vector3(),nn=new THREE.Vector3(0,0,1);q.set(d.p[0],d.p[1],d.p[2]);
    p.meshes.forEach((m,mi)=>{const o=p.off[mi],ix=m.geometry.index?m.geometry.index.array:null,nt=ix?ix.length:m.geometry.attributes.position.count;
      for(let t=0;t<nt;t+=3){const a=(o+(ix?ix[t]:t))*3,b=(o+(ix?ix[t+1]:t+1))*3,c=(o+(ix?ix[t+2]:t+2))*3;A.set(W[a],W[a+1],W[a+2]);
        if(Math.abs(A.x-q.x)>.06||Math.abs(A.y-q.y)>.06||Math.abs(A.z-q.z)>.06)continue;
        B.set(W[b],W[b+1],W[b+2]);C.set(W[c],W[c+1],W[c+2]);tri.set(A,B,C).closestPointToPoint(q,cp);const dd=cp.distanceToSquared(q);
        if(dd<bd){bd=dd;s.copy(cp);tri.getNormal(fn);if(fn.x*(N[a]+N[b]+N[c])+fn.y*(N[a+1]+N[b+1]+N[c+1])+fn.z*(N[a+2]+N[b+2]+N[c+2])<0)fn.negate();
          nn.set(N[a]+N[b]+N[c],N[a+1]+N[b+1]+N[c+1],N[a+2]+N[b+2]+N[c+2]).normalize();if(nn.lengthSq()<.5)nn.copy(fn)}}});
    if(bd>1e8){s.copy(q)}
    const col=new THREE.Color().setHSL(((i*137.508)%360)/360,.78,.6,THREE.SRGBColorSpace);
    return{...d,i,col,css:'#'+col.getHexString(),s,n:nn.clone(),snap:Math.sqrt(bd)}});
  // rayon de la zone locale : la moitié de la distance au repère voisin, bornée
  const rmax=Math.min(.02,Math.max(.007,p.radius*.13));
  for(const L of LM.list){let dn=1e9;for(const M of LM.list)if(M!==L)dn=Math.min(dn,M.s.distanceTo(L.s));L.r=Math.min(rmax,Math.max(.004,dn*.6))}
  for(const L of LM.list){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:pinTex(L.css,L.i+1),depthTest:false,depthWrite:false,sizeAttenuation:false,transparent:true}));
    sp.position.copy(L.s).addScaledVector(L.n,.0012);sp.renderOrder=20;sp.userData.i=L.i;sp.scale.setScalar(.02);pinG.add(sp);LM.pins.push(sp);
    const el=document.createElement('div');el.className='lab';el.style.setProperty('--c',L.css);el.textContent=L.fr||L.en;el.style.display='none';
    el.onclick=()=>{if(!Q.on)selectLm(L.i,true)};el.onmouseenter=()=>setLmHover(L.i);el.onmouseleave=()=>setLmHover(-1);$('#hud').appendChild(el);L.el=el;L.w=0;
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line');ln.setAttribute('stroke',L.css);ln.style.display='none';$('#hudSvg').appendChild(ln);L.ln=ln}
  LM.list.forEach((L,k)=>{if(k<64){LMU.uLmP.value[k].copy(L.s);LMU.uLmN.value[k].copy(L.n);LMU.uLmC.value[k].set(L.col.r,L.col.g,L.col.b);LMU.uLmR.value[k]=L.r}});LMU.uLmCount.value=Math.min(64,LM.list.length);
  for(const m of p.meshes){m.material.userData.halo=true;m.material.needsUpdate=true}
  p.lmOn=true;paintLm();apply(p)}
const V64=()=>Array.from({length:64},()=>new THREE.Vector3());
const LMU={uLmCount:{value:0},uLmSel:{value:-1},uLmK:{value:1},uLmP:{value:V64()},uLmN:{value:V64()},uLmC:{value:V64()},uLmR:{value:new Float32Array(64)}};
function paintLm(){LMU.uLmSel.value=LM.sel;LMU.uLmK.value=CFG.halo;invalidate()}
function closeLm(){
  const p=LM.bone;if(!p)return;
  for(const s of LM.pins){pinG.remove(s);s.material.map.dispose();s.material.dispose()}
  for(const L of LM.list){L.el.remove();L.ln.remove()}
  for(const m of p.meshes){m.material.userData.halo=false;m.material.needsUpdate=true}
  p.lmOn=false;LM.bone=null;LM.list=[];LM.pins=[];LM.sel=LM.hov=-1;apply(p)}
function selectLm(i,fly){
  if(!LM.bone)return;LM.sel=i===LM.sel&&!fly?-1:i;paintLm();
  $$('#cardBody .lm').forEach(b=>b.classList.toggle('sel',+b.dataset.lm===LM.sel));if(!Q.on)showDesc();
  if(fly&&LM.sel>=0){const L=LM.list[LM.sel];flyTo(L.s,Math.max(LM.bone.radius*.42,.028),L.n);const b=$('#cardBody .lm.sel');if(b)b.scrollIntoView({block:'nearest'})}
  invalidate()}
function setLmHover(i){if(LM.hov===i)return;LM.hov=i;invalidate()}
const _v=new THREE.Vector3(),_c=new THREE.Vector3(),occRc=new THREE.Raycaster();
function updatePins(){
  if(!LM.bone)return;const show=LM.bone.sys.on&&!LM.bone.hidden;
  for(const L of LM.list){const sp=LM.pins[L.i];let vis=show&&(!clip.on||clip.plane.distanceToPoint(L.s)>=0);
    if(vis){_v.copy(L.s).sub(camera.position);const d=_v.length();occRc.set(camera.position,_v.normalize());occRc.far=d-.0012;occRc.firstHitOnly=true;vis=occRc.intersectObjects(LM.bone.meshes,false).length===0}
    sp.visible=vis;
    const sel=L.i===LM.sel,hov=L.i===LM.hov;sp.scale.setScalar((sel?.031:hov?.025:.019)*CFG.pin*THREE.MathUtils.clamp(camera.aspect*1.1,.6,1));
    sp.material.opacity=(LM.sel>=0&&!sel&&!hov)?(LM.quiz&&Q.mode==='lmname'?.28:.6):1;sp.renderOrder=sel?22:hov?21:20}}
function layoutLabels(){
  if(!LM.bone)return;const w=innerWidth,h=innerHeight,p=LM.bone;
  const all=S.labels&&!Q.on,pts=[];
  for(const L of LM.list){const sp=LM.pins[L.i];let on=sp.visible&&(all||(L.i===LM.sel&&(!Q.on||Q.answered))||(L.i===LM.hov&&!Q.on));
    if(on){_v.copy(L.s).project(camera);if(_v.z>1||Math.abs(_v.x)>1.05||Math.abs(_v.y)>1.05)on=false;else pts.push({L,x:(_v.x+1)/2*w,y:(1-_v.y)/2*h})}
    if(!on){L.el.style.display='none';L.ln.style.display='none'}}
  if(!pts.length)return;
  // emprise de l'os à l'écran
  const b=pbox(p);let x0=1e9,x1=-1e9;
  for(let i=0;i<8;i++){_c.set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).project(camera);const x=(_c.x+1)/2*w;x0=Math.min(x0,x);x1=Math.max(x1,x)}
  const padL=$('#left').classList.contains('closed')?16:344,padR=$('#card').classList.contains('on')&&innerWidth>820?346:16,mid=(x0+x1)/2;
  const colL=Math.max(padL+150,Math.min(x0-26,w-padR-320)),colR=Math.min(w-padR-150,Math.max(x1+26,padL+320));
  for(const side of[0,1]){const arr=pts.filter(q=>(q.x>=mid?1:0)===side).sort((a,b)=>a.y-b.y);let y=62;
    for(const q of arr){q.ly=Math.max(q.y,y);y=q.ly+23}
    let over=y-23-(h-84);if(over>0)for(let i=arr.length-1;i>=0;i--){const lim=(i===arr.length-1?h-84:arr[i+1].ly-23);arr[i].ly=Math.min(arr[i].ly,lim)}
    for(const q of arr){const L=q.L,el=L.el;el.style.display='block';if(!L.w)L.w=el.offsetWidth;el.classList.toggle('sel',L.i===LM.sel||L.i===LM.hov);
      const lx=side?colR:colL-L.w;el.style.transform=`translate(${lx.toFixed(1)}px,${(q.ly-10).toFixed(1)}px)`;
      const ln=L.ln;ln.style.display='';ln.setAttribute('x1',side?lx:lx+L.w);ln.setAttribute('y1',q.ly);ln.setAttribute('x2',q.x);ln.setAttribute('y2',q.y)}}}

// ------------------------------------------------------------------ insertions musculaires
const INS={owner:null,parts:[]};
async function openIns(p){
  const s=SYSID.insertions;try{await loadSys(s)}catch{return}s.on=true;closeIns(true);exOff();
  let found=[];
  if(p.sys.id==='squelette'){
    boneGeo(p);if(!p.hashG){const c=.004,H=new Map(),W=p.W;for(let i=0;i<W.length;i+=3){const k=Math.floor(W[i]/c)+'_'+Math.floor(W[i+1]/c)+'_'+Math.floor(W[i+2]/c);let a=H.get(k);if(!a)H.set(k,a=[]);a.push(i)}p.hashG=H}
    const H=p.hashG,W=p.W,c=.004,bb=pbox(p).clone().expandByScalar(.006),v=new THREE.Vector3(),r2=.0032*.0032;
    for(const q of s.parts){if(!bb.intersectsBox(pbox(q)))continue;let near=0,tot=0;
      for(const m of q.meshes){const P=m.geometry.attributes.position,st=Math.max(1,Math.floor(P.count/40));
        for(let i=0;i<P.count;i+=st){v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);tot++;const cx=Math.floor(v.x/c),cy=Math.floor(v.y/c),cz=Math.floor(v.z/c);let hit=false;
          for(let a=-1;a<=1&&!hit;a++)for(let b=-1;b<=1&&!hit;b++)for(let d=-1;d<=1&&!hit;d++){const arr=H.get((cx+a)+'_'+(cy+b)+'_'+(cz+d));if(!arr)continue;
            for(const g of arr){const dx=W[g]-v.x,dy=W[g+1]-v.y,dz=W[g+2]-v.z;if(dx*dx+dy*dy+dz*dz<r2){hit=true;break}}}
          if(hit)near++}}
      if(tot&&near/tot>=.45)found.push(q)}
  }else{const nb=norm(p.base),sub=/\b(head|part) of\b/.test(nb);found=s.parts.filter(q=>{if(!q.ins||(q.ins.side&&p.side&&q.ins.side!==p.side))return false;const nm=norm(q.ins.muscle);return nm===nb||(sub&&nm.length>5&&(' '+nb+' ').includes(' '+nm.replace(/ muscle$/,'')+' '))});if(found.length){p.ghost=true;apply(p)}}
  if(!found.length){toast(p.sys.id==='squelette'?'Aucune insertion musculaire modélisée sur cet os':'Insertions non modélisées pour cette structure');card();return}
  INS.owner=p;INS.parts=found;for(const q of found){q.hidden=false;apply(q)}card()}
function closeIns(silent){const o=INS.owner;for(const q of INS.parts){q.hidden=true;apply(q)}if(o&&o.sys.id!=='squelette'){o.ghost=false;apply(o)}INS.owner=null;INS.parts=[];if(!silent)card()}

// ------------------------------------------------------------------ carte
const notes=LS.get('notes',{});
function sheetOffset(){const el=$('#card'),w=innerWidth,h=innerHeight,nar=w<=820,qz=$('#qz');document.body.classList.toggle('inquiz',Q.on);
  if(nar&&Q.on&&!Q.done)camera.setViewOffset(w,h,0,-Math.round(qz.offsetHeight*.45),w,h);else if(nar&&el.classList.contains('on'))camera.setViewOffset(w,h,0,Math.round(el.offsetHeight*.45),w,h);else if(camera.view)camera.clearViewOffset();invalidate()}
function toggleMulti(p){
  if(S.sel){const o=S.sel;if(LM.bone)closeLm();if(INS.owner)closeIns(true);S.sel=null;if(!o.ins)S.multi.add(o);apply(o)}
  if(p.ins)return;if(S.multi.has(p))S.multi.delete(p);else S.multi.add(p);apply(p);card();markTree()}
function multiCard(){const el=$('#card'),a=[...S.multi];el.classList.add('on');
  $('#cardHead').innerHTML=`<button class="x" data-m="clear" title="Tout désélectionner">×</button><h1>${a.length} structure${a.length>1?'s':''} sélectionnée${a.length>1?'s':''}</h1><div class="en">Maj + clic pour ajouter ou retirer une structure</div>`;
  $('#cardBody').innerHTML=`<div class="acts"><button data-m="iso">Isoler</button><button data-m="hide">Masquer</button><button data-m="ghost">Estomper le reste</button><button data-m="focus">Centrer</button><button class="wide" data-m="fav">Ajouter aux favoris</button></div>
   <h3>Sélection</h3>`+a.map(p=>`<button class="lm" data-mrm="${p.id}" style="--c:var(--gold)"><i>×</i><span>${esc(title(p))}${p.side?' · '+sideFr(p):''}<small>${esc(p.sys.label)}</small></span></button>`).join('');sheetOffset()}
function multiAct(b){const a=[...S.multi];
  if(b.dataset.mrm!==undefined){toggleMulti(parts[+b.dataset.mrm]);if(!S.multi.size)card();return}
  const m=b.dataset.m;if(!m)return;
  if(m==='clear'){S.multi.clear();a.forEach(apply);card()}
  else if(m==='iso'){pushUndo();for(const q of parts){q.ghost=false;q.hidden=!!q.ins||!S.multi.has(q)}applyAll();buildTree();fitAll()}
  else if(m==='hide'){pushUndo();S.multi.clear();for(const q of a){q.hidden=true;apply(q)}buildTree();card()}
  else if(m==='ghost'){pushUndo();const any=parts.some(q=>q.ghost);for(const q of parts)if(!q.ins)q.ghost=!any&&!S.multi.has(q);applyAll()}
  else if(m==='focus'){const bx=new THREE.Box3();a.forEach(q=>bx.union(pbox(q)));flyTo(bx.getCenter(new THREE.Vector3()),bx.getSize(new THREE.Vector3()).length()/2)}
  else if(m==='fav'){for(const q of a)FAV[pkey(q)]=title(q);LS.set('fav',FAV);buildTree();toast(a.length+' structures ajoutées aux favoris')}}
// ---- fiches muscles (données intégrées : data/muscles.json)
let MUS=[];const FLD=[['Origine',1],['Terminaison',2],['Innervation',3],['Action',4]];
function ficheOf(p){if(p.sys.id!=='muscles'||!MUS.length)return null;if(p._fi!==undefined)return p._fi;const nb=' '+norm(p.ins?p.ins.muscle:p.base)+' ';let best=null;for(const m of MUS)if(nb.includes(' '+m[0]+' ')&&(!best||m[0].length>best[0].length))best=m;return p._fi=best}
function card(){
  if(S.multi.size&&!Q.on){multiCard();return}
  const p=S.sel,el=$('#card');if(!p||Q.on){el.classList.remove('on');sheetOffset();return}
  el.classList.add('on');const lm=CAT.landmarks[p.name],bone=p.sys.id==='squelette',key=p.sys.id+'|'+p.base;
  const type=FUNC[p.mat]?'':TYPE[p.mat]||'';
  $('#cardHead').innerHTML=`<button class="x" data-a="close" title="Fermer (Échap)">×</button><button class="star ${FAV[key]?'on':''}" data-a="fav" title="Favori : à réviser (S)">★</button><h1>${esc(title(p))}</h1>${p.la?`<div class="la">${esc(p.la)}</div>`:''}<div class="en">${esc(p.en)}</div>
   <div class="chips">${p.sys.internal?'':`<button class="chip" data-chip="sys" title="Afficher uniquement ce système">${esc(p.sys.label)}</button>`}${p.side?`<button class="chip" data-chip="side" title="Afficher uniquement ce côté du corps">Côté <b>${p.side==='r'?'droit':'gauche'}</b></button>`:''}${type?`<button class="chip" data-chip="type" title="Afficher uniquement les structures de ce type">${esc(type)}</button>`:''}${FUNC[p.mat]?`<button class="chip" data-chip="type" title="Afficher uniquement ce groupe musculaire">Groupe <b>${esc(FUNC[p.mat])}</b></button>`:''}</div>`;
  const anyGhost=parts.some(q=>q.ghost&&q!==p);
  let h=`<div class="acts"><button data-a="iso">Isoler<kbd>I</kbd></button><button data-a="hide">Masquer<kbd>H</kbd></button>
    <button data-a="ghost" class="${anyGhost?'on':''}" title="Rendre les autres structures transparentes">Estomper<kbd>G</kbd></button><button data-a="focus">Centrer<kbd>F</kbd></button>
    ${lm?`<button class="wide ${LM.bone===p?'on':''}" data-a="lm">Reliefs osseux · ${lm.length}<kbd>R</kbd></button>`:''}
    ${bone&&!p.ins?`<button class="wide ${INS.owner===p?'on':''}" data-a="ins">Insertions musculaires sur cet os</button>`:''}
    ${p.sys.id==='muscles'&&FUNC[p.mat]?`<button class="wide ${INS.owner===p?'on':''}" data-a="ins">Origines et terminaisons</button>`:''}
    ${p.ins?'':`<button class="wide ${EX.on?'on':''}" data-a="explode" title="Écarter les structures voisines pour voir comment elles s'assemblent">Éclater cette zone<kbd>E</kbd></button>`}
    ${p.ins?'':`<button data-a="prev" title="Structure précédente de la liste">‹ Précédente<kbd>←</kbd></button><button data-a="next" title="Structure suivante de la liste">Suivante ›<kbd>→</kbd></button>`}</div>${(f=>f?`<h3>Fiche muscle</h3><dl class="facts">${FLD.map(x=>`<dt>${x[0]}</dt><dd>${esc(f[x[1]])}</dd>`).join('')}</dl><div class="src">Fiche intégrée à l'atlas (anatomie descriptive classique), disponible hors ligne.</div>`:'')(ficheOf(p))}<div id="desc"></div>`;
  if(LM.bone===p){h+=`<h3>Reliefs</h3>`+LM.list.map(L=>`<button class="lm ${L.i===LM.sel?'sel':''}" data-lm="${L.i}" style="--c:${L.css}"><i>${L.i+1}</i><span>${esc(L.fr||L.en)}${L.la?`<small>${esc(L.la)}</small>`:''}</span></button>`).join('')
    +`<div class="note">La pastille est placée au point exact du modèle Z-Anatomy. Le halo coloré autour indique seulement la zone voisine : son étendue est indicative.</div>`}
  else if(bone&&!lm&&!p.ins)h+=`<div class="note">Les reliefs ne sont pas détaillés pour cet os dans le modèle. Os détaillés : fémur, tibia, fibula, os coxal, humérus, radius, ulna, scapula, sacrum, sphénoïde, occipital, frontal, atlas, axis, vertèbres types (C4, T8, L3), 6ᵉ côte, sternum.</div>`;
  if(INS.owner===p){const o=INS.parts.filter(q=>q.ins&&q.ins.type==='o'),e=INS.parts.filter(q=>q.ins&&q.ins.type==='e');
    const row=q=>`<button class="lm" data-ins="${q.id}" style="--c:${q.ins.type==='o'?'#e0504a':'#3f86e8'}"><i></i><span>${esc(q.fr||q.en)}${q.la?`<small>${esc(q.la)}</small>`:''}</span></button>`;
    const uniq=a=>{const s=new Set();return a.filter(q=>{const k=q.ins.muscle+q.ins.side;if(s.has(k))return false;s.add(k);return true})};
    if(bone)h+=`<h3>Origines (rouge) · ${uniq(o).length}</h3>${uniq(o).map(row).join('')||'<div class="note">Aucune</div>'}<h3>Terminaisons (bleu) · ${uniq(e).length}</h3>${uniq(e).map(row).join('')||'<div class="note">Aucune</div>'}`;
    else h+=`<div class="note">Surfaces d'origine en <b style="color:#e0504a">rouge</b> (${o.length}), de terminaison en <b style="color:#3f86e8">bleu</b> (${e.length}). Le muscle est estompé pour les laisser voir.</div>`}
  h+=`<h3>Mes notes</h3><textarea id="notes" placeholder="Innervation, vascularisation, moyen mnémotechnique…">${esc(notes[key]||'')}</textarea>`;
  $('#cardBody').innerHTML=h;
  $('#notes').oninput=e=>{if(e.target.value.trim())notes[key]=e.target.value;else delete notes[key];LS.set('notes',notes)};
  showDesc();sheetOffset()}
// ---- favoris, filtres rapides, navigation
const FAV=LS.get('fav',{});const pkey=p=>p.sys.id+'|'+p.base;
function toggleFav(){const p=S.sel;if(!p||p.ins)return;const k=pkey(p);if(FAV[k])delete FAV[k];else FAV[k]=title(p);LS.set('fav',FAV);toast(FAV[k]?'Ajouté aux favoris':'Retiré des favoris');card();buildTree()}
function showOnly(pred,label,sys,forceDef){
  if(Q.on)return;pushUndo();if(INS.owner)closeIns(true);if(sys)SYS.forEach(s=>{if(!s.internal)s.on=s===sys});
  for(const q of parts){q.ghost=false;q.hidden=!!q.ins||(!forceDef&&defHidden(q))||!pred(q)}
  if(S.sel){S.sel.hidden=false}
  applyAll();SYS.forEach(sysRow);buildTree();if(LM.bone&&(LM.bone.hidden||!LM.bone.sys.on))closeLm();fitAll();card();toast(label+' — « Tout afficher » (A) pour revenir')}
function chipClick(kind){const p=S.sel;if(!p)return;
  if(kind==='sys')showOnly(q=>q.sys===p.sys,'Système : '+p.sys.label,p.sys);
  else if(kind==='side'){const opp=p.side==='r'?'l':'r';showOnly(q=>q.side!==opp,'Côté '+(p.side==='r'?'droit':'gauche')+' (et structures médianes)')}
  else{const lab=FUNC[p.mat]?'Groupe '+FUNC[p.mat].toLowerCase():(TYPE[p.mat]||p.mat);showOnly(q=>q.mat===p.mat,'Type : '+lab,null,true)}}
function step(d){
  if(LM.bone&&LM.sel>=0){selectLm((LM.sel+d+LM.list.length)%LM.list.length,true);return}
  const p=S.sel;if(!p||p.ins)return;const arr=p.sys.parts.filter(q=>!q.hidden&&!q.ins),i=arr.indexOf(p);if(i<0||arr.length<2)return;select(arr[(i+d+arr.length)%arr.length],true)}
// ---- descriptions (Wikipédia / Wikidata, retrouvées par identifiant TA2)
const DESC=LS.get('desc',{});let descTok=0;
const WD='https://www.wikidata.org/w/api.php?format=json&origin=*&',WP=l=>'https://'+l+'.wikipedia.org/w/api.php?format=json&origin=*&';
const jget=async u=>{const r=await fetch(u);if(!r.ok)throw new Error('net');return r.json()};
const ANAT=['P7173','P1323','P1402','P1554','P696','P3490','P3189'];
const FACTS=[['P3490','Origine'],['P3491','Terminaison'],['P3189','Innervation'],['P2286','Vascularisation artérielle'],['P2289','Drainage veineux'],['P2288','Drainage lymphatique'],
 ['P3190','Innerve'],['P3261','Branche de'],['P3262','Branches'],['P361','Partie de'],['P527','Comprend']];
async function wpPage(lang,t){const j=await jget(WP(lang)+'action=query&redirects=1&prop=extracts|pageprops&exintro=1&explaintext=1&ppprop=disambiguation|wikibase_item&titles='+encodeURIComponent(t));
  const pg=j.query&&Object.values(j.query.pages||{})[0];if(!pg||pg.missing!==undefined||pg.invalid!==undefined||(pg.pageprops&&pg.pageprops.disambiguation!==undefined))return null;
  return{title:pg.title,text:(pg.extract||'').trim(),q:pg.pageprops&&pg.pageprops.wikibase_item}}
async function wdEntity(q){const j=await jget(WD+'action=wbgetentities&ids='+q+'&props=claims|sitelinks|descriptions&sitefilter=frwiki|enwiki&languages=fr|en');return j.entities&&j.entities[q]}
async function fetchDesc(t){
  let ent=null,page=null,lang='fr';
  if(t.id){const j=await jget(WD+'action=query&list=search&srlimit=1&srsearch='+encodeURIComponent('haswbstatement:P7173='+t.id));const q=j.query&&j.query.search[0]&&j.query.search[0].title;if(q)ent=await wdEntity(q)}
  if(!ent)for(const [l,ti] of [['fr',t.fr],['en',t.en]]){if(!ti)continue;const pg=await wpPage(l,ti);if(!pg||!pg.q)continue;const e=await wdEntity(pg.q);
    if(e&&e.claims&&ANAT.some(a=>e.claims[a])){ent=e;if(pg.text){page=pg;lang=l}break}}
  if(!ent)return{none:1};
  if(!page)for(const l of['fr','en']){const sl=ent.sitelinks&&ent.sitelinks[l+'wiki'];if(!sl)continue;const pg=await wpPage(l,sl.title);if(pg&&pg.text){page=pg;lang=l;break}}
  const facts=[],ids=new Set();
  for(const [P,lab] of FACTS){const v=(ent.claims[P]||[]).map(c=>c.mainsnak&&c.mainsnak.datavalue&&c.mainsnak.datavalue.value&&c.mainsnak.datavalue.value.id).filter(Boolean).slice(0,10);if(v.length){facts.push([lab,v]);v.forEach(i=>ids.add(i))}}
  let L={};if(ids.size){const j=await jget(WD+'action=wbgetentities&props=labels&languages=fr|en&ids='+[...ids].slice(0,50).join('|'));L=j.entities||{}}
  const lab=i=>{const e=L[i]&&L[i].labels;return e?(e.fr||e.en||{}).value:''};
  const f=facts.map(([a,v])=>[a,v.map(lab).filter(Boolean)]).filter(x=>x[1].length);
  let text=page?page.text:'';if(text.length>1500){const c=text.slice(0,1500),k=c.lastIndexOf('. ');text=k>600?c.slice(0,k+1):c+'…'}
  if(!text){const d=ent.descriptions&&(ent.descriptions.fr||ent.descriptions.en);if(d)text=d.value.charAt(0).toUpperCase()+d.value.slice(1)+'.'}
  if(!text&&!f.length)return{none:1};
  return{t:text,l:page?lang:'fr',u:page?page.title:'',f}}
function descTarget(noLm){const p=S.sel;if(!p)return null;
  if(!noLm&&LM.bone===p&&LM.sel>=0){const L=LM.list[LM.sel];return{key:'lm|'+L.en,id:L.id,fr:L.fr,en:L.en,name:L.fr||L.en,lm:true}}
  const nm=CAT.names[p.name]||[];return{key:p.ins?p.ins.muscle:p.base,id:nm[2],fr:p.wiki||p.fr,en:p.ins?p.ins.muscle:p.base,name:p.fr||p.en,info:p.info}}
function paintDesc(t,d){const el=$('#desc');if(!el)return;const head=`<h3>${t.lm?'Relief : '+esc(t.name):'Description'}</h3>`;
  if(!d){el.innerHTML=head+'<div class="note">Description indisponible pour le moment : elle se charge depuis Internet. Elle reste ensuite enregistrée.</div>';return}
  if(d.none){el.innerHTML=t.lm?'':head+`<div class="note">Pas de fiche descriptive pour cette structure. <a target="_blank" rel="noopener" href="https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(t.name)}">Chercher sur Wikipédia</a></div>`;return}
  const long=d.t.length>340;
  el.innerHTML=head+(d.t?`<div class="desc ${long?'':'open'}"><p>${esc(d.t).replace(/\n+/g,'<br>')}</p>${long?'<button class="more ghost" data-a="more">Lire la suite</button>':''}</div>`:'')
   +(d.f&&d.f.length?`<dl class="facts">${d.f.map(([a,v])=>`<dt>${esc(a)}</dt><dd>${v.map(esc).join(', ')}</dd>`).join('')}</dl>`:'')
   +(d.own?'<div class="src">Fiche de l\'atlas : repères classiques d\'anatomie descriptive.</div>':'')+(d.own?'':`<div class="src">Source : ${d.u?`<a target="_blank" rel="noopener" href="https://${d.l}.wikipedia.org/wiki/${encodeURIComponent(d.u.replace(/ /g,'_'))}">Wikipédia${d.l==='en'?' (en anglais)':''}</a> · `:''}Wikidata — CC BY-SA</div>`)}
async function showDesc(noLm){
  const t=descTarget(noLm),el=$('#desc');if(!t||!el)return;const tok=++descTok,thin=d=>t.lm&&(!d||d.none||!d.t);
  if(t.info){paintDesc(t,{t:t.info,l:'fr',u:'',f:[],own:1});return}
  if(DESC[t.key]){if(thin(DESC[t.key]))return showDesc(true);paintDesc(t,DESC[t.key]);return}
  el.innerHTML=`<h3>${t.lm?'Relief : '+esc(t.name):'Description'}</h3><div class="note">Chargement…</div>`;
  let d=null;try{d=await fetchDesc(t)}catch{}
  if(d){DESC[t.key]=d;const ks=Object.keys(DESC);if(ks.length>450)ks.slice(0,120).forEach(k=>delete DESC[k]);LS.set('desc',DESC)}
  if(tok!==descTok)return;if(thin(d))return showDesc(true);paintDesc(t,d)}
$('#card').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;if(S.multi.size){multiAct(b);return}const p=S.sel;if(!p)return;
  if(b.dataset.lm!==undefined){selectLm(+b.dataset.lm,true);return}
  if(b.dataset.ins!==undefined){const q=parts[+b.dataset.ins];pbox(q);flyTo(q.center,Math.max(q.radius*2.2,.04));return}
  if(b.dataset.chip){chipClick(b.dataset.chip);return}
  const a=b.dataset.a;
  if(a==='explode'){if(EX.on)setExplode(false);else explodeAround()}else if(a==='fav')toggleFav();else if(a==='prev')step(-1);else if(a==='next')step(1);else if(a==='more')b.parentNode.classList.add('open');
  else if(a==='close')select(null);else if(a==='iso')isolate(p);else if(a==='hide')hideSel();else if(a==='ghost')ghostOthers();else if(a==='focus')focusSel();
  else if(a==='lm')toggleLm();else if(a==='ins'){if(INS.owner===p)closeIns();else openIns(p)}});
$('#card').addEventListener('mouseover',e=>{const b=e.target.closest('[data-lm]');setLmHover(b?+b.dataset.lm:-1)});
function toggleLm(){const p=S.sel;if(!p||!CAT.landmarks[p.name])return;if(LM.bone===p)closeLm();else{openLm(p);focusSel()}card()}

// ------------------------------------------------------------------ liste et recherche
const openGrp=new Set(['squelette']);let IDX=[],IDXC=[];
function indexCatalog(){IDXC=[];for(const n in CAT.names){const v=CAT.names[n],s=SYSID[v[3]];if(!s||s.internal)continue;const [b,sd]=splitName(n);IDXC.push({t:norm((v[0]||'')+' '+(v[1]||'')+' '+b),name:n,s,fr:v[0]||b,side:sd})}}
function sysRow(s){
  if(s.internal)return;let b=$('#sys-'+s.id);
  if(!b){b=document.createElement('button');b.id='sys-'+s.id;b.className='sys';b.style.setProperty('--c','#'+new THREE.Color(s.color).getHexString());
    b.innerHTML='<i></i><span></span><em></em><div class="bar"></div>';b.querySelector('span').textContent=SHORT[s.id]||s.label;b.title=s.label;b.onclick=()=>{if(s.state!=='loading'&&!Q.on)setSys(s,!s.on)};$('#sysList').appendChild(b)}
  b.classList.toggle('on',s.on);b.querySelector('em').textContent=s.state==='loading'?Math.round((s.prog||0)*100)+' %':s.state==='ready'?s.parts.length:'';
  b.querySelector('.bar').style.width=s.state==='loading'?(s.prog||0)*100+'%':'0'}
function indexSys(s){
  if(s.internal)return;
  for(const p of s.parts)IDX.push({t:norm(p.fr+' '+p.la+' '+p.en),p});
  if(s.id==='squelette')for(const p of s.parts){const l=CAT.landmarks[p.name];if(!l||p.side==='l')continue;l.forEach((L,i)=>IDX.push({t:norm(L.fr+' '+L.la+' '+L.en),p,lm:i,L}))}
  s.parts.sort((a,b)=>title(a).localeCompare(title(b),'fr')||a.side.localeCompare(b.side))}
function buildTree(){
  const t=$('#tree');let h='';const fk=Object.keys(FAV);
  if(fk.length){const op=openGrp.has('fav');let rows='';
    if(op){const m=new Map();for(const p of parts)if(!p.ins&&FAV[pkey(p)]){const k=pkey(p);if(!m.has(k))m.set(k,[]);m.get(k).push(p)}
      for(const k of fk){const a=m.get(k);rows+=a?a.map(itemRow).join(''):`<button class="it" data-fav="${esc(k)}"><span>${esc(FAV[k]===1?k.split('|')[1]:FAV[k])}</span><small>à charger</small></button>`}}
    h+=`<div class="grp ${op?'open':''}" data-g="fav"><button>★ Favoris<em>${fk.length}</em></button><div class="items">${rows}</div></div>`}
  for(const s of SYS){if(s.internal||!s.on)continue;const op=openGrp.has(s.id);
    h+=`<div class="grp ${op?'open':''}" data-g="${s.id}"><button>${esc(s.label)}<em>${s.parts.length}</em></button><div class="items">${op?items(s):''}</div></div>`}
  t.innerHTML=h||'<div class="note">Active un système ci-dessus.</div>';markTree()}
const itemRow=p=>`<button class="it ${p.hidden?'hid':''}" data-id="${p.id}"><span>${esc(title(p))}</span>${CAT.landmarks[p.name]?`<span class="badge">${CAT.landmarks[p.name].length}</span>`:''}${p.side?`<small>${p.side==='r'?'D':'G'}</small>`:''}</button>`;
const items=s=>s.parts.map(itemRow).join('');
function markTree(){$$('#tree .it.sel').forEach(b=>b.classList.remove('sel'));if(S.sel){const b=$(`#tree .it[data-id="${S.sel.id}"]`);if(b){b.classList.add('sel');const t=$('#tree'),r=b.getBoundingClientRect(),tr=t.getBoundingClientRect();if(r.top<tr.top||r.bottom>tr.bottom)t.scrollTop+=r.top-tr.top-tr.height/2}}}
$('#tree').addEventListener('click',e=>{
  const g=e.target.closest('.grp>button');if(g){const id=g.parentNode.dataset.g;if(openGrp.has(id))openGrp.delete(id);else openGrp.add(id);buildTree();return}
  const b=e.target.closest('.it');if(!b||Q.on)return;
  if(b.dataset.fav){const k=b.dataset.fav,sy=SYSID[k.split('|')[0]];if(sy)setSys(sy,true).then(()=>{const p=parts.find(x=>!x.ins&&pkey(x)===k);if(p){if(p.hidden){p.hidden=false;apply(p)}select(p,true)}});return}
  const p=parts[+b.dataset.id];if(!p.sys.on){p.sys.on=true;p.sys.parts.forEach(apply);sysRow(p.sys);buildTree()}if(p.hidden){pushUndo();p.hidden=false;apply(p);b.classList.remove('hid')}select(p,true)});
$('#tree').addEventListener('mouseover',e=>{const b=e.target.closest('.it[data-id]');setHover(b?parts[+b.dataset.id]:null)});
let resCur=0,resList=[];
function doSearch(){
  const q=norm($('#search').value),box=$('#results');if(q.length<2){box.classList.remove('on');return}
  const ws=q.split(' ');resList=IDX.concat(IDXC.filter(e=>!LOADED.has(e.name))).filter(e=>ws.every(w=>e.t.includes(w))).sort((a,b)=>(a.t.startsWith(q)?0:1)-(b.t.startsWith(q)?0:1)||(a.lm!==undefined?1:0)-(b.lm!==undefined?1:0)||a.t.length-b.t.length).slice(0,40);
  resCur=0;box.innerHTML=resList.map((e,i)=>`<button class="res ${i?'':'cur'}" data-i="${i}"><span>${esc(e.name?e.fr:e.lm!==undefined?(e.L.fr||e.L.en):title(e.p))}</span><small>${e.name?esc(e.s.label)+(e.side?' · '+(e.side==='r'?'D':'G'):''):e.lm!==undefined?'relief · '+esc(e.p.fr||e.p.en):esc(e.p.sys.label)+(e.p.side?' · '+(e.p.side==='r'?'D':'G'):'')}</small></button>`).join('')
    ||'<div class="note">Aucun résultat.</div>';box.classList.add('on')}
function goResult(i){const e=resList[i];if(!e)return;$('#results').classList.remove('on');$('#search').blur();if(Q.on)return;
  if(e.name){setSys(e.s,true).then(async()=>{let p=parts.find(x=>x.name===e.name);if(!p&&e.s.extra)for(const k in e.s.extra){if(OPT[k])continue;await enableOpt(k);p=parts.find(x=>x.name===e.name);if(p)break;disableOpt(k)}
    if(!p){toast('Cette structure n\'a pas de modèle 3D');return}if(p.hidden){p.hidden=false;apply(p)}select(p,true)});return}
  const p=e.p;if(!p.sys.on){p.sys.on=true;p.sys.parts.forEach(apply);sysRow(p.sys);buildTree()}
  if(p.hidden){pushUndo();p.hidden=false;apply(p)}
  select(p);if(e.lm!==undefined){if(LM.bone!==p)openLm(p);card();selectLm(e.lm,true)}else focusSel()}
$('#search').addEventListener('input',doSearch);$('#search').addEventListener('focus',doSearch);
$('#search').addEventListener('keydown',e=>{const n=resList.length;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();resCur=(resCur+(e.key==='ArrowDown'?1:n-1))%Math.max(n,1);$$('#results .res').forEach((b,i)=>{b.classList.toggle('cur',i===resCur);if(i===resCur)b.scrollIntoView({block:'nearest'})})}
  else if(e.key==='Enter')goResult(resCur);else if(e.key==='Escape'){e.target.value='';doSearch();e.target.blur()}e.stopPropagation()});
$('#results').addEventListener('click',e=>{const b=e.target.closest('.res');if(b)goResult(+b.dataset.i)});

// ------------------------------------------------------------------ barre d'outils
const DIRS={ant:[0,0,1],post:[0,0,-1],d:[-1,0,0],g:[1,0,0],sup:[0,1,.0001]};
function viewDir(v){const d=new THREE.Vector3(...DIRS[v]);if(S.sel&&!S.sel.hidden){pbox(S.sel);const iso=parts.filter(q=>q.sys.on&&!q.hidden&&!q.ghost).length<4;if(iso){flyTo(S.sel.center,S.sel.radius*1.2,d);return}}fitAll(d)}
$('#undo').onclick=undo;$('#redo').onclick=redo;$('#multiBtn').onclick=()=>{MULTI=!MULTI;$('#multiBtn').classList.toggle('on',MULTI);if(MULTI)toast('Sélection multiple : chaque clic ajoute ou retire une structure');else if(S.multi.size<2&&S.multi.size){const q=[...S.multi][0];select(q)}};$('#showAll').onclick=showAll;
$('#labBtn').onclick=()=>{setCfg('labels',!CFG.labels)};
function setClip(on){
  clip.on=on;$('#clipPop').classList.toggle('on',on);$('#clipBtn').classList.toggle('on',on);
  if(on){clip.box=visibleBox();if(clip.box.isEmpty())clip.box.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,1.8,1));updClip()}
  renderer.clippingPlanes=on?[clip.plane]:[];
  for(const p of parts)if(!p.gen)for(const m of p.meshes){const sd=on?THREE.DoubleSide:THREE.FrontSide;if(m.material.side!==sd){m.material.side=sd;m.material.needsUpdate=true}}
  pickDirty=true;invalidate()}
function updClip(){const a=clip.axis,k=+$('#clipPos').value/1000,v=clip.box.min[a]+(clip.box.max[a]-clip.box.min[a])*k,s=clip.flip?1:-1;
  clip.plane.normal.set(a==='x'?s:0,a==='y'?s:0,a==='z'?s:0);clip.plane.constant=-s*v;invalidate()}
$('#clipBtn').onclick=()=>setClip(!clip.on);$('#clipOff').onclick=()=>setClip(false);$('#clipPos').oninput=updClip;$('#clipFlip').onclick=()=>{clip.flip=!clip.flip;updClip()};
$$('#clipAxis button').forEach(b=>b.onclick=()=>{clip.axis=b.dataset.ax;$$('#clipAxis button').forEach(x=>x.classList.toggle('on',x===b));updClip()});
function shot(){const light=document.documentElement.dataset.theme==='light';scene.background=new THREE.Color(light?0xf3efe8:0x10191d);updatePins();renderer.render(scene,camera);
  canvas.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='atlas-'+(S.sel?norm(title(S.sel)).replace(/ /g,'-'):'vue')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)});scene.background=null;invalidate()};
function setTheme(t){document.documentElement.dataset.theme=t;LS.set('theme',t);invalidate()}
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');setTheme(LS.get('theme','dark'));
function leftOpen(o){$('#left').classList.toggle('closed',!o);document.body.classList.toggle('noleft',!o);invalidate()}
$('#closeLeft').onclick=()=>leftOpen(false);$('#menuBtn').onclick=()=>leftOpen(true);
function toggleHelp(f){const h=$('#help');h.classList.toggle('on',f===undefined?!h.classList.contains('on'):f);$('#helpBtn').classList.toggle('on',h.classList.contains('on'))}
$('#helpBtn').onclick=()=>toggleHelp();$('#helpClose').onclick=()=>toggleHelp(false);
$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button').forEach(x=>x.classList.toggle('on',x===b));$$('.pane').forEach(p=>p.classList.toggle('on',p.id==='pane-'+b.dataset.tab));if(b.dataset.tab==='quiz')quizPane()});
addEventListener('keydown',e=>{
  if((e.target.matches&&e.target.matches('input,textarea,select'))||e.metaKey||e.ctrlKey&&e.key!=='z')return;const k=e.key.toLowerCase();
  if(Q.on){quizKey(e,k);return}
  if(k==='/'){e.preventDefault();leftOpen(true);$('#search').focus()}
  else if(k==='?'){toggleHelp()}
  else if(k==='escape'){if($('#help').classList.contains('on'))toggleHelp(false);else if($('#settings').classList.contains('on'))$('#setClose').click();else if(EX.on||EX.arm)setExplode(false);else if(DIS)setDis(false);else if(clip.on)setClip(false);else if(LM.sel>=0)selectLm(-1);else select(null)}
  else if(k==='e'){if(EX.on||EX.arm)setExplode(false);else if(S.sel&&!S.sel.ins)explodeAround();else setExplode(true)}else if(k==='d')setDis(!DIS)
  else if(/^[1-5]$/.test(k)&&!e.altKey)viewDir(['ant','post','d','g','sup'][+k-1]);
  else if(k==='z'&&e.shiftKey||k==='y')redo();
  else if(k==='z')undo();else if(k==='a')showAll();else if(k==='l')$('#labBtn').click();
  else if(k==='arrowleft'||k==='arrowright'){if(S.sel){e.preventDefault();step(k==='arrowleft'?-1:1)}}
  else if(S.sel){if(k==='i')isolate(S.sel);else if(k==='h')hideSel();else if(k==='g')ghostOthers();else if(k==='f')focusSel();else if(k==='r')toggleLm();else if(k==='s')toggleFav()}});

// ------------------------------------------------------------------ vue éclatée (locale, progressive) et dissection
const EX={on:false,arm:false,k:0,t:0,R:.12,set:[],C:new THREE.Vector3()};let DIS=false;
const _eo=new THREE.Vector3();
function exCollect(keep){
  exRestore();
  for(const p of parts){if(!p.sys.on||p.hidden||p.ins||p.ghost)continue;pbox(p);if(p.box.distanceToPoint(EX.C)>EX.R)continue;
    const d=p.center.clone().sub(EX.C),l=d.length();if(l<1e-4)continue;p.exDir=d.multiplyScalar((.012+Math.min(l,.22)*.62)/l);EX.set.push(p)}
  if(keep){EX.k=EX.t;exApply()}}
function exApply(){
  for(const p of EX.set){_eo.copy(p.exDir).multiplyScalar(EX.k);
    for(const m of p.meshes){const u=m.userData;if(!u.w0){u.w0=m.matrixWorld.clone();u.l0=m.matrix.clone();u.pinv=m.parent.matrixWorld.clone().invert()}
      m.matrix.makeTranslation(_eo.x,_eo.y,_eo.z).multiply(u.w0).premultiply(u.pinv);m.updateMatrixWorld(true)}
    p.exOff=EX.k?_eo.clone():null}
  pickDirty=true;invalidate()}
function exRestore(){for(const p of EX.set){for(const m of p.meshes){const u=m.userData;if(u.l0){m.matrix.copy(u.l0);m.updateMatrixWorld(true)}}p.exOff=null}EX.set=[];EX.k=0;pickDirty=true}
function exUI(){const on=EX.on||EX.arm;$('#exPop').classList.toggle('on',on);$('#exBtn').classList.toggle('on',on);$('#exHint').textContent=EX.on?(EX.set.length+' structures dans la zone · clique ailleurs pour déplacer le centre'):'Clique sur la zone à éclater';
  const c=$('#cardBody [data-a=explode]');if(c)c.classList.toggle('on',EX.on)}
function exOff(){if(!EX.on&&!EX.arm&&!EX.set.length)return;EX.on=EX.arm=false;EX.t=0;exRestore();exUI();invalidate()}
function setExplode(on,point){
  if(!on){EX.on=EX.arm=false;EX.t=0;exUI();invalidate();return}
  if(Q.on)return;if(LM.bone){closeLm();card()}if(INS.owner)closeIns();
  if(!EX.on){$('#exPos').value=0;EX.t=0}
  if(point)EX.C.copy(point);else if(S.sel&&!S.sel.ins&&!S.sel.hidden){pbox(S.sel);EX.C.copy(S.sel.center)}else{EX.arm=true;exUI();return}
  EX.R=+$('#exRad').value/100;EX.arm=false;EX.on=true;exCollect(true);exUI();
  if(EX.t===0)toast('Glisse le curseur « Écartement » pour ouvrir la zone progressivement')}
function exClick(h){const c=h.point.clone();if(h.part.exOff)c.sub(h.part.exOff);setExplode(true,c)}
async function explodeAround(){const p=S.sel;if(!p||p.ins||Q.on)return;
  if(p.sys.id==='squelette'||p.sys.id==='articulations')for(const id of['squelette','articulations'])if(!SYSID[id].on)await setSys(SYSID[id],true);
  setExplode(true);flyTo(EX.C,Math.max(EX.R*1.9,.16))}
// ------------------------------------------------------------------ vues par région, articulation et appareil
const VIEWS=[['Articulations (côté droit)',[
  ['Épaule',{sph:['Humerus.r',1,.12]}],['Coude',{sph:['Humerus.r',0,.10]}],['Poignet et main',{sph:['Radius.r',0,.15,-.06]}],
  ['Hanche',{sph:['Femur.r',1,.13]}],['Genou',{sph:['Femur.r',0,.11]}],['Cheville et pied',{sph:['Tibia.r',0,.16,-.04,.05]}]]],
 ['Régions',[
  ['Tête et cou',{sys:['squelette','muscles'],box:[1.43,9]}],
  ['Rachis',{re:/vertebra|atlas|axis|sacrum|coccyx|intervertebral|longitudinal|flav|spin|nuch|zygapophys|costovertebral/i,dir:[-1,0,.25]}],
  ['Thorax',{sys:['squelette','visceres','vaisseaux'],box:[1.09,1.46],ax:.2}],['Abdomen',{sys:['squelette','visceres'],box:[.94,1.2],ax:.2}],
  ['Pelvis',{sys:SEX==='f'?['squelette','articulations','visceres','feminin']:['squelette','articulations','visceres'],box:[.74,.955],ax:.2}]]],
 ['Appareils',[
  ['Digestif',{sys:['visceres'],ctx:1,re:/stomach|intestin|colon|liver|gallbladder|pancrea|oesophag|duoden|jejun|ileum|appendix|pharynx|tongue|parotid|subling|submandib|bile|omentum|taenia|palate|gingiva/i}],
  ['Respiratoire',{sys:['visceres'],ctx:1,re:/lung|trachea|bronch|pleura|nasal|epiglott|laryng|nasophar/i}],
  ['Urinaire',{sys:['visceres'],ctx:1,re:/kidney|ureter|bladder|urethr|renal/i}],
  ['Cœur et gros vaisseaux',{sys:['vaisseaux'],ctx:1,re:/heart|atrium|ventricle|leaflet|papillary|coronary|interventricular|pulmonary trunk|ascending aorta|circumflex|arch of aorta|vena cava/i}],
  ['Glandes endocrines',{sys:['visceres'],ctx:1,re:/thyroid|hypophysis|pineal|suprarenal|pancreas/i}]].concat(SEX==='f'?[['Génital féminin',{sys:['feminin'],ctx:1,re:/./}]]:[])]];
const MYV=LS.get('myviews',[]);
function viewsPane(){$('#pane-views').innerHTML=`<h3>Mes vues</h3>${MYV.length?`<div class="vgrid">${MYV.map((v,i)=>`<span class="mv"><button data-mv="${i}">${esc(v.n)}</button><button data-mvdel="${i}" title="Supprimer cette vue">×</button></span>`).join('')}</div>`:''}<div class="field"><input id="mvName" placeholder="Nom de la vue" maxlength="40"><button id="mvSave" class="on">Enregistrer</button></div>`+VIEWS.map((g,i)=>`<h3>${g[0]}</h3><div class="vgrid">${g[1].map((v,j)=>`<button data-v="${i}.${j}">${v[0]}</button>`).join('')}</div>`).join('')
  +'<div class="note">Une vue charge les systèmes utiles et n\'affiche que la région choisie. Ajoute ensuite d\'autres systèmes depuis « Explorer », ou reviens avec « Tout afficher ».</div>'}
function saveView(){const n=$('#mvName').value.trim()||'Vue '+(MYV.length+1),on=SYS.filter(s=>s.on&&!s.internal).map(s=>s.id),vis=[],hid=[];
  for(const p of parts)if(p.sys.on&&!p.ins)(p.hidden?hid:vis).push(p.name);
  MYV.push(Object.assign({n,on,opt:Object.keys(OPT).filter(k=>OPT[k]),cam:[...camera.position.toArray(),...controls.target.toArray()].map(x=>+x.toFixed(4))},vis.length<=hid.length?{vis}:{hid}));LS.set('myviews',MYV);viewsPane();toast('Vue « '+n+' » enregistrée')}
async function loadView(v){if(Q.on)return;for(const k of v.opt||[])await enableOpt(k);for(const id of v.on)if(SYSID[id])try{await loadSys(SYSID[id])}catch{return}
  pushUndo();exOff();closeLm();if(INS.owner)closeIns(true);select(null);SYS.forEach(s=>{if(!s.internal)s.on=v.on.includes(s.id)});const set=new Set(v.vis||v.hid);
  for(const p of parts){p.ghost=false;p.hidden=!!p.ins||(v.vis?!set.has(p.name):set.has(p.name))}applyAll();SYS.forEach(sysRow);buildTree();
  tw={t0:performance.now(),ms:700,p0:camera.position.clone(),p1:new THREE.Vector3(...v.cam.slice(0,3)),q0:controls.target.clone(),q1:new THREE.Vector3(...v.cam.slice(3))};invalidate();if(innerWidth<=820)leftOpen(false)}
$('#pane-views').addEventListener('click',e=>{const m=e.target.closest('button');if(m&&m.id==='mvSave'){saveView();return}if(m&&m.dataset.mvdel!==undefined){MYV.splice(+m.dataset.mvdel,1);LS.set('myviews',MYV);viewsPane();return}if(m&&m.dataset.mv!==undefined){loadView(MYV[+m.dataset.mv]);return}
  const b=e.target.closest('[data-v]');if(!b)return;const [i,j]=b.dataset.v.split('.');applyView(VIEWS[i][1][j])});
async function applyView(V){
  if(Q.on)return;const v=V[1],ids=v.sys||['squelette','articulations'],all=v.ctx?ids.concat('squelette'):ids;
  toast('Chargement de la vue « '+V[0]+' »…');for(const id of all)try{await loadSys(SYSID[id])}catch{return}
  pushUndo();exOff();closeLm();if(INS.owner)closeIns(true);select(null);
  let c=null;if(v.sph){const b=parts.find(p=>p.name===v.sph[0]);pbox(b);c=new THREE.Vector3((b.box.min.x+b.box.max.x)/2,(v.sph[1]?b.box.max.y-.02:b.box.min.y)+(v.sph[3]||0),(b.box.min.z+b.box.max.z)/2+(v.sph[4]||0))}
  SYS.forEach(s=>{if(!s.internal)s.on=all.includes(s.id)});
  for(const p of parts){p.ghost=false;if(p.ins){p.hidden=true;continue}if(!p.sys.on)continue;pbox(p);
    if(v.ctx&&p.sys.id==='squelette'&&!ids.includes('squelette')){p.hidden=false;p.ghost=true;continue}
    const ok=c?(p.box.distanceToPoint(c)<v.sph[2]*.5||p.center.distanceTo(c)<v.sph[2]):v.box?(p.center.y>=v.box[0]*SCL&&p.center.y<=v.box[1]*SCL&&(!v.ax||Math.abs(p.center.x)<v.ax)):v.re.test(p.name);
    p.hidden=!ok||defHidden(p)}
  applyAll();SYS.forEach(sysRow);buildTree();
  const b=new THREE.Box3();for(const p of parts)if(p.sys.on&&!p.hidden&&!p.ghost)b.union(c?p.box.clone().intersect(new THREE.Box3().setFromCenterAndSize(c,new THREE.Vector3(1,1,1).multiplyScalar(v.sph[2]*2.4))):p.box);
  if(!b.isEmpty())flyTo(b.getCenter(new THREE.Vector3()),b.getSize(new THREE.Vector3()).length()/2,new THREE.Vector3(...(v.dir||[0,0,1])),700);
  if(innerWidth<=820)leftOpen(false);toast('Vue : '+V[0]+' — « Tout afficher » (A) pour revenir')}
function setDis(on,silent){DIS=on;$('#disBtn').classList.toggle('on',on);canvas.style.cursor='';if(on&&!silent)toast('Dissection : chaque clic retire une structure. Annuler (Z) la remet.')}
$('#exBtn').onclick=()=>{if(EX.on||EX.arm)setExplode(false);else if(S.sel&&!S.sel.ins)explodeAround();else setExplode(true)};$('#exClose').onclick=()=>setExplode(false);
$('#exPos').oninput=e=>{EX.t=+e.target.value/100;invalidate()};
$('#exRad').oninput=e=>{EX.R=+e.target.value/100;if(EX.on){exCollect(true);exUI()}};
$('#disBtn').onclick=()=>{if(!Q.on)setDis(!DIS)};

// ------------------------------------------------------------------ panneau de réglages
const ROWS=[['h','Affichage'],['tog','shadows','Ombres portées'],['rng','shadowStrength','Intensité des ombres',.2,.95,.05],['tog','ground','Ombre au sol'],
 ['seg','detail','Relief des surfaces',[[0,'Aucun'],[1,'Léger'],[2,'Marqué']]],['rng','exposure','Luminosité',.6,1.7,.05],['seg','quality','Netteté',[['eco','Éco'],['auto','Auto'],['max','Max']]],
 ['rng','fov','Perspective',14,60,1],
 ['h','Navigation'],['rng','zoom','Vitesse du zoom',.3,4,.1],['rng','rotate','Vitesse de rotation',.3,2.5,.1],['tog','invertZoom','Inverser le sens du zoom'],['tog','inertia','Inertie des mouvements'],
 ['h','Reliefs osseux'],['rng','pin','Taille des pastilles',.6,1.8,.1],['seg','halo','Halos colorés',[[0,'Aucun'],[1,'Normal'],[1.6,'Large']]],['tog','labels','Étiquettes autour de l\'os'],
 ['h','Divers'],['rng','ghost','Opacité des structures estompées',.02,.35,.01],['tog','tips','Nom au survol de la souris']];
function applyCfg(k){
  renderer.toneMappingExposure=CFG.exposure;
  const st=CFG.shadows?CFG.shadowStrength:0;sun.castShadow=CFG.shadows;sun.intensity=1.5*st;sun2.intensity=1.5*(1-st);ground.visible=CFG.shadows&&CFG.ground&&ground.userData.ready===true;
  controls.rotateSpeed=.9*CFG.rotate;controls.enableDamping=CFG.inertia;
  if(camera.fov!==CFG.fov){const d=camera.position.distanceTo(controls.target),f=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.tan(THREE.MathUtils.degToRad(CFG.fov/2));
    camera.position.sub(controls.target).multiplyScalar(f).add(controls.target);camera.fov=CFG.fov;camera.updateProjectionMatrix()}
  const d=dprFor();if(d!==fullDpr){fullDpr=curDpr=d;resize()}
  SURF.uDetail.value=[0,.7,1.5][CFG.detail]||0;
  if(k==='detail'||k==='shadows'||k==='*')for(const p of parts)for(const m of p.meshes)m.material.needsUpdate=true;
  if(k==='ghost'||k==='*')for(const p of parts)if(p.ghost)apply(p);
  S.labels=CFG.labels;$('#labBtn').classList.toggle('on',CFG.labels);LMU.uLmK.value=CFG.halo;invalidate()}
function setCfg(k,v){CFG[k]=v;LS.set('cfg',CFG);applyCfg(k);if($('#settings').classList.contains('on'))buildSettings()}
function buildSettings(){
  $('#setBody').innerHTML=ROWS.map(r=>r[0]==='h'?`<h3>${r[1]}</h3>`:r[0]==='tog'?`<label class="row"><span>${r[2]}</span><input type="checkbox" data-k="${r[1]}" ${CFG[r[1]]?'checked':''}></label>`
   :r[0]==='rng'?`<label class="row"><span>${r[2]}</span><input type="range" data-k="${r[1]}" min="${r[3]}" max="${r[4]}" step="${r[5]}" value="${CFG[r[1]]}"></label>`
   :`<div class="row"><span>${r[2]}</span><div class="seg">${r[3].map(o=>`<button data-k="${r[1]}" data-v="${o[0]}" class="${CFG[r[1]]==o[0]?'on':''}">${o[1]}</button>`).join('')}</div></div>`).join('')
   +'<button class="big" id="setShot">Enregistrer une image de la vue</button><button class="big" id="setReset">Rétablir les réglages par défaut</button>'}
$('#settings').addEventListener('input',e=>{const t=e.target,k=t.dataset.k;if(!k)return;CFG[k]=t.type==='checkbox'?t.checked:+t.value;LS.set('cfg',CFG);applyCfg(k)});
$('#settings').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='setClose'){$('#settings').classList.remove('on');$('#setBtn').classList.remove('on')}
  else if(b.id==='setShot')shot();
  else if(b.id==='setReset'){Object.assign(CFG,DEF,{sex:SEX});LS.set('cfg',CFG);applyCfg('*');buildSettings()}
  else if(b.dataset.k){const v=b.dataset.v;setCfg(b.dataset.k,isNaN(+v)?v:+v)}});
$('#setBtn').onclick=()=>{const on=!$('#settings').classList.contains('on');$('#settings').classList.toggle('on',on);$('#setBtn').classList.toggle('on',on);if(on)buildSettings()};
applyCfg('*');booted=true;
// ------------------------------------------------------------------ quiz
const Q={on:false,mode:'name',sys:'squelette',grp:'all',bone:'all',n:10,items:[],i:0,ok:0,streak:0,errs:[],cur:null,answered:false,pool:[],snap:null,t0:0,done:false};
const MODES=[['fiche','Fiches muscles','Origine, terminaison, innervation ou action : choisis la bonne réponse.'],['name','Nommer la structure','Une structure s\'allume : choisis son nom.'],['find','Trouver la structure','Un nom s\'affiche : clique sur la structure.'],
 ['lmname','Nommer le relief osseux','Une pastille est désignée sur un os : choisis son nom.'],['lmfind','Pointer le relief osseux','Un nom s\'affiche : clique sur la bonne pastille.']];
const srs=LS.get('srs',{}),stats=LS.get('stats',{n:0,ok:0});
const lmBones=()=>SYSID.squelette.parts.filter(p=>p.side!=='l'&&(CAT.landmarks[p.name]||[]).length>=4);
function quizPane(){
  const fm=Q.mode==='fiche',lmMode=Q.mode[0]==='l'||fm,due=Object.values(srs).filter(v=>v[1]<=Date.now()).length;
  $('#pane-quiz').innerHTML=`<h3>Mode</h3>${MODES.map(m=>`<button class="mode ${Q.mode===m[0]?'on':''}" data-m="${m[0]}"><b>${m[1]}</b><span>${m[2]}</span></button>`).join('')}
   <h3>Réglages</h3>
   ${fm?'<div class="note">Porte sur les '+MUS.length+' muscles qui ont une fiche intégrée.</div>':lmMode?`<div class="field"><label>Os</label><select id="qBone"><option value="all">Tous les os détaillés</option>${lmBones().map(p=>`<option value="${p.id}" ${Q.bone==p.id?'selected':''}>${esc(title(p))} (${CAT.landmarks[p.name].length})</option>`).join('')}</select></div>`
    :`<div class="field"><label>Système</label><select id="qSys">${SYS.filter(s=>!s.internal).map(s=>`<option value="${s.id}" ${Q.sys===s.id?'selected':''}>${esc(s.label)}</option>`).join('')}<option value="fav" ${Q.sys==='fav'?'selected':''}>★ Mes favoris (${Object.keys(FAV).length})</option></select></div>
      ${Q.sys==='squelette'?`<div class="field"><label>Région</label><select id="qGrp">${GROUPS.map(g=>`<option value="${g[0]}" ${Q.grp===g[0]?'selected':''}>${g[1]}</option>`).join('')}</select></div>`:''}`}
   <div class="field"><label>Questions</label><div class="seg" id="qN">${[10,20,40].map(n=>`<button data-n="${n}" class="${Q.n===n?'on':''}">${n}</button>`).join('')}</div></div>
   <button class="big on" id="qGo">${Q.on?'Recommencer avec ces réglages':'Commencer'}</button>
   <div class="note">Répétition espacée : les structures ratées reviennent en priorité, les acquises s'espacent (1, 3, 7 puis 21 jours).${due?` <b>${due}</b> à revoir maintenant.`:''}<br>
   Total : ${stats.n} réponses${stats.n?' · '+Math.round(stats.ok/stats.n*100)+' % justes':''} · ${Object.values(srs).filter(v=>v[0]>=2).length} éléments acquis.</div>`;
  $$('#pane-quiz .mode').forEach(b=>b.onclick=()=>{Q.mode=b.dataset.m;quizPane()});
  $$('#qN button').forEach(b=>b.onclick=()=>{Q.n=+b.dataset.n;quizPane()});
  if($('#qSys'))$('#qSys').onchange=e=>{Q.sys=e.target.value;quizPane()};if($('#qGrp'))$('#qGrp').onchange=e=>Q.grp=e.target.value;if($('#qBone'))$('#qBone').onchange=e=>Q.bone=e.target.value;
  $('#qGo').onclick=()=>quizStart()}
function order(pool){const now=Date.now();return shuffle(pool.slice()).map(it=>{const v=srs[it.key];return{it,pr:!v?1:v[1]<=now?0:2}}).sort((a,b)=>a.pr-b.pr).map(x=>x.it)}
async function quizStart(only){
  const fm=Q.mode==='fiche',lmMode=Q.mode[0]==='l',fav=!lmMode&&!fm&&Q.sys==='fav';
  if(fav&&Object.keys(FAV).length<4){toast('Ajoute au moins 4 favoris (★ sur une fiche) pour ce quiz');return}
  const sset=lmMode?[SYSID.squelette]:fm?[SYSID.muscles]:fav?[...new Set(Object.keys(FAV).map(k=>k.split('|')[0]))].map(i=>SYSID[i]).filter(Boolean):[SYSID[Q.sys]],s=sset[0],grpF=!lmMode&&!fav&&!fm&&Q.sys==='squelette'&&Q.grp!=='all';
  const go=$('#qGo');if(go){go.disabled=true;go.textContent='Chargement…'}
  try{for(const x of sset)await loadSys(x)}catch{quizPane();return}
  let pool=[];
  if(fm){const m=new Map();for(const p of s.parts){if(p.side==='l'||defHidden(p))continue;const f=ficheOf(p);if(!f)continue;if(!m.has(f))m.set(f,[]);m.get(f).push(p)}
    for(const [f,ps] of m){const fr=(ps.find(p=>norm(p.base).startsWith(f[0]))||ps[0]).fr||f[0];for(const x of FLD)pool.push({key:'fi|'+f[0]+'|'+x[1],parts:ps,fr:fr.replace(/^(Chef|Partie|Faisceau)[^,]* (du|de la|de l')\s*/i,'')+' : '+x[0].toLowerCase(),name:fr,field:x,lab:f[x[1]],la:''})}}
  else if(lmMode){const bones=Q.bone==='all'?lmBones():[parts[+Q.bone]];
    for(const b of bones)CAT.landmarks[b.name].forEach((L,i)=>pool.push({key:'lm|'+b.base+'|'+L.en,bone:b,idx:i,fr:L.fr||L.en,la:L.la}))}
  else{const m=new Map();for(const s of sset)for(const p of s.parts){if(grpF&&boneGroup(p.en)!==Q.grp)continue;if(defHidden(p)||p.ins)continue;const k=s.id+'|'+p.base;if(fav&&!FAV[k])continue;let e=m.get(k);if(!e)m.set(k,e={key:k,parts:[],fr:title(p),la:p.la});e.parts.push(p)}pool=[...m.values()]}
  if(pool.length<4){toast('Pas assez de structures pour ce quiz');quizPane();return}
  Q.pool=pool;Q.items=only?shuffle(only.slice()):order(pool).slice(0,Q.n);
  if(!Q.on){Q.snap=snap();Q.cam=[camera.position.clone(),controls.target.clone()]}
  closeLm();if(INS.owner)closeIns(true);if(clip.on)setClip(false);exOff();setDis(false,true);
  Q.on=true;select(null);Q.on=true;hideTip();
  SYS.forEach(x=>{x.on=sset.includes(x)});for(const p of parts){p.ghost=false;p.flash=0;p.hidden=!sset.includes(p.sys)||defHidden(p)||(grpF&&boneGroup(p.en)!==Q.grp)}
  applyAll();SYS.forEach(sysRow);
  Q.i=0;Q.ok=0;Q.streak=0;Q.errs=[];Q.done=false;Q.t0=Date.now();Q.lastBone=null;
  $('#qz').classList.add('on');$('#card').classList.remove('on');if(innerWidth<900)leftOpen(false);
  if(!lmMode)fitAll(new THREE.Vector3(0,0,1),500);
  if($('#pane-quiz').classList.contains('on'))quizPane();
  quizAsk()}
function qHead(){return`<div id="qzTop"><span>Question ${Q.i+1} / ${Q.items.length}</span><div id="qzProg"><i style="width:${Q.i/Q.items.length*100}%"></i></div><span>✓ ${Q.ok}</span><span>série ${Q.streak}</span><button class="ghost" id="qzQuit" title="Quitter (Échap)">Quitter</button></div>`}
function quizAsk(){
  const it=Q.cur=Q.items[Q.i];Q.answered=false;parts.forEach(p=>{if(p.flash){p.flash=0;apply(p)}});
  let q='',sub='',opts=null;
  if(Q.mode==='fiche'){const t=it.parts[0];const o=S.sel;S.sel=null;if(o)apply(o);for(const p of it.parts){p.flash=1;apply(p)}const bx=new THREE.Box3();it.parts.forEach(p=>bx.union(pbox(p)));flyTo(bx.getCenter(new THREE.Vector3()),Math.max(bx.getSize(new THREE.Vector3()).length()/2*1.7,.12));
    const seen=new Set([it.lab]);opts=shuffle([it,...shuffle(Q.pool.filter(e=>e.field===it.field&&!seen.has(e.lab)&&seen.add(e.lab))).slice(0,3)]);
    q=`${it.field[0]} : <em>${esc(it.name)}</em> ?`;sub='Le muscle est affiché en vert.'}
  else if(Q.mode==='name'){
    const t=it.parts[Math.random()*it.parts.length|0];it.target=t;const o=S.sel;S.sel=t;if(o)apply(o);apply(t);pbox(t);flyTo(t.center,Math.max(t.radius*2.4,.11));
    const near=Q.pool.filter(e=>e!==it&&e.fr!==it.fr).map(e=>{pbox(e.parts[0]);return{e,d:Math.min(...e.parts.map(p=>(pbox(p),p.center.distanceTo(t.center))))}}).sort((a,b)=>a.d-b.d).slice(0,8).map(x=>x.e);
    opts=shuffle([it,...shuffle(near).slice(0,3)]);q='Quelle est la structure en surbrillance ?'}
  else if(Q.mode==='find'){const o=S.sel;S.sel=null;if(o)apply(o);q=`Clique sur : <em>${esc(it.fr)}</em>`;sub=it.la?`<span class="la">${esc(it.la)}</span>`:''}
  else{
    const b=it.bone;if(LM.bone!==b){closeLm();for(const p of SYSID.squelette.parts){p.hidden=p!==b;apply(p)}openLm(b,true)}
    if(Q.mode==='lmname'){LM.sel=it.idx;paintLm();const L=LM.list[it.idx];flyTo(L.s,Math.max(b.radius*.6,.04),L.n);
      const seen=new Set([it.fr]);const others=shuffle(Q.pool.filter(e=>e.bone===b&&!seen.has(e.fr)&&seen.add(e.fr))).slice(0,3);
      opts=shuffle([it,...others]);q='Quel est le relief désigné ?';sub=esc(title(b))+(b.side?' · '+sideFr(b):'')}
    else{LM.sel=-1;paintLm();if(Q.lastBone!==b){pbox(b);flyTo(b.center,b.radius*1.15,new THREE.Vector3(0,0,1))}
      q=`Clique sur : <em>${esc(it.fr)}</em>`;sub=esc(title(b))+(it.la?` · <span class="la">${esc(it.la)}</span>`:'')+' — tourne l\'os si la pastille est derrière'}
    Q.lastBone=b}
  $('#qz').innerHTML=qHead()+`<div id="qzQ">${q}</div><div id="qzSub">${sub}</div>`+(opts?`<div id="qzOpts">${opts.map((o,i)=>`<button data-k="${esc(o.key)}"><kbd style="margin:0">${i+1}</kbd><span>${esc(o.lab||o.fr)}</span></button>`).join('')}</div>`:'')
   +`<div id="qzFoot"><span class="mut" id="qzMsg"></span><span class="sp"></span><button id="qzSkip">Je ne sais pas</button><button id="qzNext" class="on" style="display:none">Suivant<kbd>↵</kbd></button></div>`;
  $('#qzQuit').onclick=quizQuit;$('#qzSkip').onclick=()=>quizAnswer(false,null);$('#qzNext').onclick=quizNext;
  $$('#qzOpts button').forEach(b=>b.onclick=()=>{if(!Q.answered)quizAnswer(b.dataset.k===it.key,b)});sheetOffset()}
function quizAnswer(ok,btn,clicked){
  if(Q.answered||Q.done)return;Q.answered=true;const it=Q.cur,now=Date.now(),v=srs[it.key]||[0,0];
  if(ok){Q.ok++;Q.streak++;v[0]=Math.min(4,v[0]+1);v[1]=now+[0,1,3,7,21][v[0]]*864e5}else{Q.streak=0;v[0]=0;v[1]=now;Q.errs.push(it)}
  srs[it.key]=v;LS.set('srs',srs);stats.n++;if(ok)stats.ok++;LS.set('stats',stats);
  $$('#qzOpts button').forEach(b=>{if(b.dataset.k===it.key)b.classList.add('good');else if(b===btn)b.classList.add('bad');b.disabled=true});
  let msg=ok?'Exact !':'';
  if(Q.mode==='find'){if(clicked&&!ok){clicked.flash=-1;apply(clicked);msg='Tu as cliqué : '+title(clicked)+'.'}
    const t=it.parts.find(p=>p===clicked)||it.parts[0];for(const p of it.parts){p.flash=1;apply(p)}if(!ok){pbox(t);flyTo(t.center,Math.max(t.radius*2.6,.12))}}
  if(Q.mode==='lmfind'){if(clicked!==undefined&&clicked!==null&&!ok)msg='Tu as cliqué : '+(LM.list[clicked].fr||LM.list[clicked].en)+'.';LM.sel=it.idx;paintLm();if(!ok){const L=LM.list[it.idx];flyTo(L.s,Math.max(it.bone.radius*.6,.04),L.n)}}
  if(!ok&&!msg)msg=it.lab?'La bonne réponse est en vert.':'Réponse : '+it.fr;if(!ok&&(Q.mode==='find'||Q.mode==='lmfind'))msg+=' La bonne réponse est montrée.';
  const m=$('#qzMsg');m.textContent=msg;m.style.color=ok?'var(--ok)':'var(--ko)';
  $('#qzSkip').style.display='none';$('#qzNext').style.display='';$('#qzNext').focus();invalidate()}
function quizNext(){if(!Q.answered)return;Q.i++;if(Q.i>=Q.items.length)quizEnd();else quizAsk()}
function quizClick(h){
  if(Q.answered||Q.done)return;const it=Q.cur;
  if(Q.mode==='find'&&h&&h.part)quizAnswer(it.parts.includes(h.part)||h.part.sys.id+'|'+h.part.base===it.key,null,h.part);
  else if(Q.mode==='lmfind'&&h&&h.lm!==undefined)quizAnswer(h.lm===it.idx||(LM.list[h.lm].fr&&LM.list[h.lm].fr===it.fr),null,h.lm)}
function quizEnd(){
  Q.done=true;const n=Q.items.length,pc=Math.round(Q.ok/n*100),sec=Math.round((Date.now()-Q.t0)/1000),errs=[...new Set(Q.errs)];
  parts.forEach(p=>{if(p.flash){p.flash=0;apply(p)}});
  $('#qz').innerHTML=`<div id="qzTop"><span>Résultat</span><span style="flex:1"></span><span>${Math.floor(sec/60)} min ${sec%60} s</span></div>
   <div class="score" style="color:${pc>=80?'var(--ok)':pc>=50?'var(--gold)':'var(--ko)'}">${pc} %</div><div class="mut">${Q.ok} bonnes réponses sur ${n}</div>
   ${errs.length?`<h3>À revoir</h3><div class="errs scroll">${errs.map(e=>`<div>${esc(e.fr)}${e.bone?` <span class="mut">· ${esc(title(e.bone))}</span>`:''}${e.la?` <span class="la mut">· ${esc(e.la)}</span>`:''}</div>`).join('')}</div>`:'<p>Sans faute.</p>'}
   <div id="qzFoot">${errs.length?'<button id="qzErr" class="on">Revoir les erreurs</button>':''}<button id="qzAgain">Nouvelle série</button><span class="sp"></span><button id="qzQuit">Quitter</button></div>`;
  $('#qzQuit').onclick=quizQuit;$('#qzAgain').onclick=()=>quizStart();if(errs.length)$('#qzErr').onclick=()=>quizStart(errs)}
function quizQuit(){
  closeLm();parts.forEach(p=>p.flash=0);Q.on=false;Q.done=false;const o=S.sel;S.sel=null;if(o)apply(o);
  $('#qz').classList.remove('on');if(Q.snap)restore(Q.snap);if(Q.cam){tw={t0:performance.now(),ms:500,p0:camera.position.clone(),p1:Q.cam[0],q0:controls.target.clone(),q1:Q.cam[1]}}
  if($('#pane-quiz').classList.contains('on'))quizPane();sheetOffset()}
function quizKey(e,k){
  if(k==='escape'){quizQuit();return}
  if(k==='enter'||k===' '){e.preventDefault();if(Q.done)return;if(Q.answered)quizNext();return}
  if(/^[1-4]$/.test(k)&&!Q.answered){const b=$$('#qzOpts button')[+k-1];if(b)b.click()}}

// ------------------------------------------------------------------ démarrage
SYS.forEach(sysRow);
$$('#optList button').forEach(b=>{const k=b.dataset.opt;b.classList.toggle('on',!!OPT[k]);b.onclick=()=>{if(Q.on)return;OPT[k]=!OPT[k];LS.set('opt',OPT);b.classList.toggle('on',OPT[k]);
  loadExtra(k).then(()=>{for(const p of parts)if(p.mat===k){p.hidden=!OPT[k];apply(p)}buildTree()})}});
async function loadExtra(k){for(const s of SYS){if(!s.extra||!s.extra[k]||s.state!=='ready'||(s.xl&&s.xl[k])||!OPT[k])continue;s.xl=s.xl||{};s.xl[k]=1;
  loading++;setLoader(.3);try{const g=await new Promise((res,rej)=>gltfL.load(EXPORT+s.extra[k],res,null,rej));const n0=s.parts.length;ingest(g,s);const nw=s.parts.slice(n0);
    nw.forEach(apply);for(const p of nw)IDX.push({t:norm(p.fr+' '+p.la+' '+p.en),p});s.parts.sort((a,b)=>title(a).localeCompare(title(b),'fr')||a.side.localeCompare(b.side));sysRow(s)}
  catch{s.xl[k]=0;toast('Impossible de charger '+s.extra[k])}finally{loading--;setLoader(1)}}}
function disableOpt(k){OPT[k]=false;LS.set('opt',OPT);const b=$(`#optList [data-opt="${k}"]`);if(b)b.classList.remove('on');for(const p of parts)if(p.mat===k){p.hidden=true;apply(p)}}
async function enableOpt(k){if(OPT[k])return;OPT[k]=true;LS.set('opt',OPT);const b=$(`#optList [data-opt="${k}"]`);if(b)b.classList.add('on');await loadExtra(k);for(const p of parts)if(p.mat===k){p.hidden=false;apply(p)}}
if(innerWidth<900)leftOpen(false);
(async()=>{
  try{CAT=await (await fetch('data/catalog.json?v='+VER)).json()}catch(e){$('#splashMsg').className='err';$('#splashMsg').textContent="Données introuvables (data/catalog.json). Lance l'appli avec « Lancer l'atlas.command ».";return}
  if(SEX==='f')for(const k in CAT.landmarks)for(const L of CAT.landmarks[k]){_wv.set(L.p[0],L.p[1],L.p[2]);warpF(_wv);L.p=[_wv.x,_wv.y,_wv.z]}
  indexCatalog();viewsPane();requestAnimationFrame(loop);
  fetch('data/muscles.json?v='+VER).then(r=>r.json()).then(d=>{MUS=d;if(S.sel)card()}).catch(()=>{});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  try{await setSys(SYSID.squelette,true)}catch{}
  if(SYSID.squelette.state!=='ready'){$('#splashMsg').className='err';$('#splashMsg').textContent="Modèle introuvable : le dossier « export » doit se trouver à côté du dossier « atlas ».";return}
  if(!innerWidth||!innerHeight)await new Promise(r=>{const f=()=>{if(innerWidth&&innerHeight){removeEventListener('resize',f);r()}};addEventListener('resize',f)});resize();
  const b=visibleBox(),c=b.getCenter(new THREE.Vector3());controls.target.copy(c);camera.position.set(c.x,c.y,c.z+b.getSize(new THREE.Vector3()).length()/2/Math.sin(THREE.MathUtils.degToRad(15))*1.18/Math.min(1,camera.aspect*.8));
  ground.position.set(c.x,b.min.y-.002,c.z);ground.userData.ready=true;applyCfg();
  invalidate();const sp=$('#splash');sp.style.opacity=0;setTimeout(()=>sp.remove(),520);
})();
window.__atlas={renderer,scene,THREE,parts,SYS,S,LM,Q,CAT,camera,controls,select,isolate,openLm,openIns,setSys,quizStart,invalidate};
