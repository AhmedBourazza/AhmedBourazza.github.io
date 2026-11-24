import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { profile, projects } from './data.js';

// ============================================================
//  Palette: modern office, dark and understated
// ============================================================
const PAL = {
  wall: 0x36373a,
  wallBack: 0x3b3c3f,
  ceiling: 0x1d1e20,
  baseboard: 0x18191b,
  oak: 0xb38a5c,
  oakDark: 0x8a6843,
  metal: 0x1b1c1e,
  steel: 0x9a9ea4,
  fabric: 0x2a2b2e,
  rug: 0x4d4944,
  white: 0xe9e6e0,
  accent: '#8fb0cf', // single soft steel-blue accent
  text: '#ece9e4',
  textMuted: '#9c9a95',
};
const FONT = '"Inter", system-ui, sans-serif';
// Texture quality: full on desktop, lighter on phones/tablets to save memory
const TEXQ = window.matchMedia('(pointer: coarse)').matches ? 0.6 : 1;
let ANISO = 4; // set to the GPU maximum once the renderer exists

// Materials are cached so identical ones are shared (fewer GPU state changes,
// and it lets static meshes with the same material be merged into one draw call).
const matCache = new Map();
const std = (color, rough = 0.7, metal = 0.05) => {
  const key = `s|${color}|${rough}|${metal}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(key);
};
const glow = (hex, power = 1) => {
  const key = `g|${hex}|${power}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power) }));
  return matCache.get(key);
};

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO; // keeps text sharp when a wall is seen at an angle
  return { tex: t, canvas: c, ctx };
}
// On-demand rendering flag (see frame()): anything that changes the picture calls invalidate()
let needsRender = true;
const invalidate = () => { needsRender = true; };

// Loads an image and draws it "cover"-cropped into a canvas texture of the size we need,
// so big screenshots never sit in GPU memory at full size. In Chrome, fetch + createImageBitmap
// decodes the image off the main thread, so loading doesn't make the scene stutter.
async function loadBitmap(url) {
  try {
    if ('createImageBitmap' in window) {
      const blob = await (await fetch(url, { mode: 'cors' })).blob();
      return await createImageBitmap(blob);
    }
    return await new Promise((ok, ko) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ok(img);
      img.onerror = ko;
      img.src = url;
    });
  } catch {
    return null;
  }
}
async function loadCover(url, w, h, onReady) {
  try {
    const src = await loadBitmap(url);
    if (!src) return;
    const t = canvasTex(w, h, (ctx) => {
      const s = Math.max(w / src.width, h / src.height);
      const dw = src.width * s, dh = src.height * s;
      ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    });
    if (src.close) src.close(); // free the decoded bitmap right away
    onReady(t.tex);
    invalidate();
  } catch {
    // image unavailable: the placeholder stays
  }
}
function fitFont(ctx, text, weight, size, maxW) {
  let fs = size;
  ctx.font = `${weight} ${fs}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && fs > 10) {
    fs -= 2;
    ctx.font = `${weight} ${fs}px ${FONT}`;
  }
  return fs;
}

// A printed / engraved plate: matte dark metal, crisp text, thin accent rule. No glow.
function makePlate({ width, height, lines, rule = true, plate = 0x1a1b1d }) {
  const g = new THREE.Group();
  box(width, height, 0.03, std(plate, 0.35, 0.6), 0, 0, 0, g);
  const res = Math.min(Math.round(800 * TEXQ), Math.floor(4096 / width)); // pixels per metre
  const t = canvasTex(Math.round(width * res), Math.round(height * res), (ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l.size * res * 1.45, 0) + (rule ? 0.06 * res : 0);
    let y = h / 2 - total / 2;
    lines.forEach((l, i) => {
      const lh = l.size * res * 1.45;
      ctx.letterSpacing = l.spacing || '0px';
      fitFont(ctx, l.text, l.weight || 500, l.size * res, w * 0.86);
      ctx.fillStyle = l.color || PAL.text;
      ctx.fillText(l.text, w / 2, y + lh / 2);
      ctx.letterSpacing = '0px';
      y += lh;
      if (rule && i === 0) {
        ctx.fillStyle = PAL.accent;
        ctx.fillRect(w / 2 - w * 0.06, y + 0.01 * res, w * 0.12, Math.max(2, 0.008 * res));
        y += 0.06 * res;
      }
    });
  });
  // unlit so the lettering reads evenly whatever the lighting on the wall
  const mat = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, toneMapped: false });
  mat.color.setScalar(0.95);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  p.position.z = 0.017;
  g.add(p);
  return g;
}

// A gallery frame: thin black frame, optional white mat (passe-partout), picture.
function makeFrame({ width, height, mat = 0, frame = 0.025, depth = 0.04, unlit = false }) {
  const g = new THREE.Group();
  const fm = std(0x111214, 0.4, 0.3);
  const ow = width + mat * 2, oh = height + mat * 2;
  box(ow + frame * 2, frame, depth, fm, 0, oh / 2 + frame / 2, 0, g);
  box(ow + frame * 2, frame, depth, fm, 0, -oh / 2 - frame / 2, 0, g);
  box(frame, oh, depth, fm, -ow / 2 - frame / 2, 0, 0, g);
  box(frame, oh, depth, fm, ow / 2 + frame / 2, 0, 0, g);
  if (mat > 0) box(ow, oh, 0.01, std(0xf2efe9, 0.9), 0, 0, -0.005, g);
  // unlit = exact colours and crisp text (used for text panels); lit = realistic prints/photos
  const picMat = unlit
    ? new THREE.MeshBasicMaterial({ color: 0x2a2b2e, toneMapped: false })
    : new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.55 });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(width, height), picMat);
  pic.position.z = 0.002;
  g.add(pic);
  return { group: g, picMat };
}

// ============================================================
//  Renderer / scene
// ============================================================
const canvas = document.getElementById('scene');
// Antialiasing always on: it keeps text and frame edges clean on every screen.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Quality tiers, picked automatically from the measured frame rate (see adaptQuality)
// On a real GPU the resolution never drops below 1.75x (text stays sharp);
// the last tier is only used when Chrome renders on the CPU (no hardware acceleration).
const QUALITY = [
  { pr: Math.min(window.devicePixelRatio, 2) },
  { pr: Math.min(window.devicePixelRatio, 1.75) },
];
const SOFTWARE_TIER = { pr: 1 };
let softwareRendering = false;
let qLevel = 0;
ANISO = renderer.capabilities.getMaxAnisotropy();
// If Chrome is rendering on the CPU (hardware acceleration off or GPU blocklisted),
// start directly at a lighter tier instead of lagging until adaptQuality catches up.
{
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  softwareRendering = /swiftshader|basic render driver|llvmpipe|softpipe|software/i.test(gpu);
}
const currentTier = () => (softwareRendering ? SOFTWARE_TIER : QUALITY[qLevel]);
renderer.setPixelRatio(currentTier().pr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The room never moves, so shadows are computed once instead of every frame
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f10);
scene.fog = new THREE.Fog(0x0e0f10, 16, 32);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

const clickables = [];
const animated = [];

await document.fonts.load(`600 100px "Inter"`);
await document.fonts.load(`400 20px "Inter"`);
await document.fonts.load('400 20px "JetBrains Mono"');

// ============================================================
//  Lighting: warm, soft, realistic
// ============================================================
scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a2520, 0.95));
const roomLight = new THREE.PointLight(0xffe2c0, 24, 16, 1.5);
roomLight.position.set(0, 4.1, 0.5);
scene.add(roomLight);
// downlight over the desk (casts the only shadows, baked once)
const deskSpot = new THREE.SpotLight(0xffe6c8, 55, 10, Math.PI / 6, 0.6, 1.3);
deskSpot.position.set(-0.8, 4.45, -3.85);
deskSpot.target.position.set(-0.8, 0.7, -4.3);
deskSpot.castShadow = true;
deskSpot.shadow.mapSize.set(1024, 1024);
deskSpot.shadow.bias = -0.0005;
scene.add(deskSpot, deskSpot.target);
// gallery light washing the projects wall
// soft wash on the projects wall (the cards themselves are unlit, so no hot spot on them)
const gallery = new THREE.SpotLight(0xfff0dc, 18, 12, Math.PI / 2.6, 1, 1.2);
gallery.position.set(1.2, 4.3, 0);
gallery.target.position.set(5, 2.1, 0);
scene.add(gallery, gallery.target);

// ============================================================
//  Room
// ============================================================
const W = 10, D = 10, H = 4.5;
{
  // dark oak plank floor
  const floorTex = canvasTex(1024, 1024, (ctx, w, h) => {
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -((r * 173) % 400);
      while (x < w) {
        const len = 360 + ((r * 7 + x) % 5) * 60;
        const shade = 46 + ((r * 13 + Math.floor(x / 37)) % 7) * 2;
        ctx.fillStyle = `rgb(${shade + 12}, ${shade}, ${shade - 10})`;
        ctx.fillRect(x, r * rh, len, rh);
        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          const gy = r * rh + 8 + k * (rh / 6);
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len / 3, gy + 3, x + (2 * len) / 3, gy - 3, x + len, gy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, r * rh, w, 2);
    }
  });
  floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping;
  floorTex.tex.repeat.set(2, 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: floorTex.tex, roughness: 0.55, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // fine plaster grain so the walls don't look like flat colour
  const plaster = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const r = 20 + Math.random() * 70;
      const x = Math.random() * w, y = Math.random() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const v = Math.random() > 0.5 ? 255 : 205;
      g.addColorStop(0, `rgba(${v},${v},${v},0.18)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  });
  plaster.tex.wrapS = plaster.tex.wrapT = THREE.RepeatWrapping;
  const wallMat = (color, rx, ry) => {
    const t = plaster.tex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color, map: t, roughness: 0.92 });
  };
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat(PAL.wallBack, 5, 2.25));
  back.position.set(0, H / 2, -D / 2);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat(PAL.wall, 5, 2.25));
  left.rotation.y = Math.PI / 2;
  left.position.set(-W / 2, H / 2, 0);
  left.receiveShadow = true;
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.set(W / 2, H / 2, 0);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(PAL.ceiling, 1));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  scene.add(back, left, right, ceil);

  // baseboards
  const bb = std(PAL.baseboard, 0.6);
  box(W, 0.1, 0.02, bb, 0, 0.05, -D / 2 + 0.01);
  box(0.02, 0.1, D, bb, -W / 2 + 0.01, 0.05, 0);
  box(0.02, 0.1, D, bb, W / 2 - 0.01, 0.05, 0);

  // recessed ceiling panels (soft warm light, no glow effect)
  for (const [x, z] of [[-2.5, -1.8], [2.5, -1.8], [-2.5, 2.2], [2.5, 2.2]]) {
    box(0.7, 0.02, 0.7, std(0x111111, 0.6), x, H - 0.005, z);
    box(0.62, 0.01, 0.62, glow(0xfff2de, 0.95), x, H - 0.015, z);
  }

  // rectangular wool rug under the desk
  const rugTex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4d4944';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.03)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshStandardMaterial({ map: rugTex.tex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.8, 0.006, -3.3);
  rug.receiveShadow = true;
  scene.add(rug);
}

// ============================================================
//  Back wall: name plate + abstract print
// ============================================================
{
  const namePlate = makePlate({
    width: 3.4,
    height: 0.95,
    lines: [
      { text: profile.name.toUpperCase(), size: 0.2, weight: 600, spacing: '14px' },
      { text: profile.role, size: 0.11, weight: 400, color: '#bdbab4', spacing: '4px' },
    ],
  });
  namePlate.position.set(-0.8, 3.25, -D / 2 + 0.02);
  scene.add(namePlate);

  // framed abstract print
  const art = makeFrame({ width: 1.05, height: 1.4, mat: 0.12 });
  const ARS = 2 * TEXQ;
  const artTex = canvasTex(Math.round(420 * ARS), Math.round(560 * ARS), (ctx) => {
    ctx.scale(ARS, ARS);
    const w = 420, h = 560;
    ctx.fillStyle = '#d9d3c7';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f3a46';
    ctx.beginPath(); ctx.arc(w * 0.38, h * 0.62, w * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b07a4f';
    ctx.fillRect(w * 0.52, h * 0.18, w * 0.3, h * 0.36);
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.3); ctx.lineTo(w * 0.88, h * 0.3); ctx.stroke();
    ctx.fillStyle = 'rgba(28,28,28,0.85)';
    ctx.beginPath(); ctx.arc(w * 0.72, h * 0.78, w * 0.06, 0, Math.PI * 2); ctx.fill();
  });
  art.picMat.map = artTex.tex;
  art.picMat.color.set(0xffffff);
  art.group.position.set(-3.65, 2.35, -D / 2 + 0.03);
  scene.add(art.group);
}

// ============================================================
//  Desk
// ============================================================
const deskX = -0.8, deskZ = -4.35;
{
  const oak = std(PAL.oak, 0.55);
  const metal = std(PAL.metal, 0.45, 0.5);
  // oak top on a black steel frame
  box(2.6, 0.05, 1.0, oak, deskX, 0.76, deskZ);
  for (const sx of [-1.22, 1.22]) {
    box(0.04, 0.72, 0.04, metal, deskX + sx, 0.37, deskZ - 0.44);
    box(0.04, 0.72, 0.04, metal, deskX + sx, 0.37, deskZ + 0.44);
    box(0.04, 0.04, 0.92, metal, deskX + sx, 0.7, deskZ);
  }
  box(2.4, 0.04, 0.04, metal, deskX, 0.7, deskZ - 0.44);
  // slim drawer cabinet
  box(0.45, 0.55, 0.6, std(0x202124, 0.5), deskX + 0.85, 0.3, deskZ + 0.05);
  box(0.2, 0.012, 0.012, std(PAL.steel, 0.3, 0.8), deskX + 0.85, 0.48, deskZ + 0.36);
  box(0.2, 0.012, 0.012, std(PAL.steel, 0.3, 0.8), deskX + 0.85, 0.26, deskZ + 0.36);

  // recessed downlight in the ceiling above the desk
  cyl(0.16, 0.16, 0.02, std(0x111111, 0.6), deskX, H - 0.005, deskZ + 0.5, null, 32);
  cyl(0.12, 0.12, 0.01, glow(0xfff0d8, 1), deskX, H - 0.016, deskZ + 0.5, null, 32);

  // monitor with a calm editor theme
  const dark = std(0x111214, 0.4, 0.3);
  box(0.36, 0.012, 0.2, std(PAL.steel, 0.3, 0.8), deskX - 0.1, 0.79, deskZ - 0.2);
  box(0.04, 0.34, 0.025, std(PAL.steel, 0.3, 0.8), deskX - 0.1, 0.96, deskZ - 0.25);
  box(1.36, 0.66, 0.025, dark, deskX - 0.1, 1.33, deskZ - 0.22);

  const codeLines = [
    ['#8fb0cf', 'const '], ['#d4d4d4', 'engineer = {'], null,
    ['#9c9a95', '  name: '], ['#c9b28a', `'${profile.name}',`], null,
    ['#9c9a95', '  focus: '], ['#c9b28a', "['Full Stack', 'Cloud'],"], null,
    ['#9c9a95', '  stack: '], ['#c9b28a', "'Java, C#, Angular, React, Azure',"], null,
    ['#d4d4d4', '};'], null, null,
    ['#6b6f75', '// from requirements to production'], null,
    ['#8fb0cf', 'const '], ['#d4d4d4', 'app = '], ['#b9c7d6', 'build'], ['#d4d4d4', '(needs);'], null,
    ['#8fb0cf', 'await '], ['#b9c7d6', 'deploy'], ['#d4d4d4', '(app);'], null,
  ];
  // Drawn in a 768x384 coordinate space, scaled down to a 512x256 texture
  const SW = Math.round(1024 * TEXQ);
  const screen = canvasTex(SW, SW / 2, () => {});
  screen.ctx.setTransform(SW / 768, 0, 0, SW / 768, 0, 0);
  let typed = 0;
  const total = codeLines.reduce((n, s) => n + (s ? s[1].length : 0), 0);
  function drawCode() {
    const { ctx } = screen;
    ctx.fillStyle = '#1b1c1f';
    ctx.fillRect(0, 0, 768, 384);
    ctx.fillStyle = '#232428';
    ctx.fillRect(0, 0, 768, 30);
    ctx.fillStyle = '#5c5f66';
    ctx.font = '16px "JetBrains Mono"';
    ctx.fillText('engineer.ts', 16, 21);
    ctx.font = '21px "JetBrains Mono"';
    let x = 50, y = 64, left = typed, line = 1;
    ctx.fillStyle = '#4a4d52';
    ctx.fillText(String(line), 14, y);
    for (const seg of codeLines) {
      if (!seg) {
        y += 29; x = 50; line++;
        if (left > 0) { ctx.fillStyle = '#4a4d52'; ctx.fillText(String(line), 14, y); }
        continue;
      }
      if (left <= 0) break;
      const s = seg[1].slice(0, left);
      left -= s.length;
      ctx.fillStyle = seg[0];
      ctx.fillText(s, x, y);
      x += ctx.measureText(s).width;
    }
    if (Math.floor(performance.now() / 500) % 2) {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(x + 2, y - 19, 2, 23);
    }
    screen.tex.needsUpdate = true;
  }
  let last = 0;
  const frustum = new THREE.Frustum();
  const vp = new THREE.Matrix4();
  animated.push((t) => {
    if (t - last > 0.09) {
      // skip the texture upload and the redraw when the monitor is off-screen
      // (About and Projects views): the room then costs nothing while idle
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(vp);
      if (!frustum.intersectsObject(scr)) return;
      last = t;
      typed = typed >= total + 50 ? 0 : typed + 1;
      drawCode();
      invalidate();
    }
  });
  const scrMat = new THREE.MeshBasicMaterial({ map: screen.tex });
  scrMat.color.setScalar(0.85);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.6), scrMat);
  scr.position.set(deskX - 0.1, 1.33, deskZ - 0.206);
  scene.add(scr);

  // aluminium keyboard, mouse, notebook
  box(0.78, 0.018, 0.24, std(0xb8bbc0, 0.35, 0.7), deskX - 0.1, 0.79, deskZ + 0.2);
  box(0.74, 0.004, 0.2, std(0x2b2c2f, 0.6), deskX - 0.1, 0.8, deskZ + 0.2);
  box(0.065, 0.022, 0.11, std(0xd9dadc, 0.35, 0.3), deskX + 0.48, 0.79, deskZ + 0.22);
  const notebook = box(0.24, 0.02, 0.32, std(0x26282b, 0.8), deskX + 0.78, 0.79, deskZ + 0.15);
  notebook.rotation.y = -0.18;
  const pen = cyl(0.006, 0.006, 0.18, std(0xb38a5c, 0.4, 0.5), deskX + 0.78, 0.806, deskZ + 0.15, null, 8);
  pen.rotation.set(Math.PI / 2, 0, 0.3);

  // architect desk lamp (black)
  cyl(0.09, 0.1, 0.025, metal, deskX + 1.05, 0.79, deskZ - 0.3);
  const arm1 = box(0.02, 0.45, 0.02, metal, deskX + 1.05, 1.0, deskZ - 0.3);
  arm1.rotation.z = 0.15;
  const arm2 = box(0.02, 0.38, 0.02, metal, deskX + 0.93, 1.32, deskZ - 0.3);
  arm2.rotation.z = 1.0;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 24, 1, true), metal);
  head.position.set(deskX + 0.78, 1.36, deskZ - 0.3);
  head.rotation.z = 2.4;
  scene.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), glow(0xffe3b8, 1.1));
  bulb.position.set(deskX + 0.75, 1.32, deskZ - 0.3);
  scene.add(bulb);
  const lampLight = new THREE.PointLight(0xffc98a, 2.5, 2.5, 1.6);
  lampLight.position.copy(bulb.position);
  scene.add(lampLight);

  // small framed photo on the desk
  if (profile.photo) {
    const pf = makeFrame({ width: 0.2, height: 0.26, mat: 0.03, frame: 0.015, depth: 0.02 });
    loadCover(profile.photo, 160, 208, (tx) => {
      pf.picMat.map = tx;
      pf.picMat.color.set(0xffffff);
      pf.picMat.needsUpdate = true;
    });
    pf.group.position.set(deskX - 1.0, 0.95, deskZ - 0.15);
    pf.group.rotation.set(-0.12, 0.35, 0);
    pf.group.userData = { action: 'about', hover: true };
    scene.add(pf.group);
    clickables.push(pf.group);
  }

  // white ceramic mug — the discreet trigger for the hidden visitor counter
  const mug = new THREE.Group();
  const ceramic = std(0xeeeae4, 0.35);
  cyl(0.05, 0.045, 0.11, ceramic, 0, 0.055, 0, mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 20), ceramic);
  handle.position.set(0.055, 0.06, 0);
  mug.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.044, 20), std(0x2a1a10, 0.3));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.1;
  mug.add(coffee);
  mug.position.set(deskX - 0.75, 0.785, deskZ + 0.18);
  scene.add(mug);
  if (profile.goatcounter) {
    mug.userData = { action: 'stats', hover: true };
    // the mug is small on screen: an invisible, larger sphere makes it easy to click
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.06;
    mug.add(hit);
    clickables.push(mug);
  }
}

// ============================================================
//  Office chair
// ============================================================
{
  const chair = new THREE.Group();
  const fabric = std(PAL.fabric, 0.85);
  const chrome = std(0x8e9196, 0.25, 0.85);
  box(0.56, 0.08, 0.54, fabric, 0, 0.5, 0, chair);
  const back = box(0.52, 0.7, 0.06, fabric, 0, 0.95, 0.29, chair);
  back.rotation.x = -0.1;
  box(0.05, 0.03, 0.34, std(PAL.metal, 0.5, 0.4), -0.31, 0.67, 0.02, chair);
  box(0.05, 0.03, 0.34, std(PAL.metal, 0.5, 0.4), 0.31, 0.67, 0.02, chair);
  box(0.03, 0.18, 0.03, std(PAL.metal, 0.5, 0.4), -0.31, 0.58, 0.12, chair);
  box(0.03, 0.18, 0.03, std(PAL.metal, 0.5, 0.4), 0.31, 0.58, 0.12, chair);
  cyl(0.03, 0.03, 0.38, chrome, 0, 0.27, 0, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.3, 0.03, 0.045, chrome, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15, chair);
    leg.rotation.y = -a;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), std(0x151515, 0.6));
    w.position.set(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3);
    chair.add(w);
  }
  chair.position.set(deskX - 0.1, 0, deskZ + 1.1);
  chair.rotation.y = Math.PI + 0.3;
  scene.add(chair);
}

// ============================================================
//  Oak shelves + portrait
// ============================================================
{
  const oak = std(PAL.oak, 0.55);
  const sx = 2.9, sz = -D / 2 + 0.17;
  for (let i = 0; i < 3; i++) {
    box(1.4, 0.035, 0.28, oak, sx, 1.2 + i * 0.6, sz);
    box(0.02, 0.1, 0.24, std(PAL.metal, 0.5, 0.5), sx - 0.62, 1.15 + i * 0.6, sz);
    box(0.02, 0.1, 0.24, std(PAL.metal, 0.5, 0.5), sx + 0.62, 1.15 + i * 0.6, sz);
  }
  const bookColors = [0x2f3b4c, 0x6b6257, 0x5e3434, 0x3d4a3d, 0xd8d2c4, 0x222326];
  for (let s = 0; s < 3; s++) {
    let x = sx - 0.6;
    const n = 4 + s;
    for (let i = 0; i < n; i++) {
      const h = 0.26 + ((i * 7 + s * 3) % 5) * 0.025;
      const w = 0.055 + ((i + s) % 3) * 0.015;
      box(w, h, 0.2, std(bookColors[(i + s * 2) % bookColors.length], 0.8), x, 1.218 + s * 0.6 + h / 2, sz);
      x += w + 0.008;
    }
  }
  // ceramic vase and a small stone sculpture
  cyl(0.06, 0.08, 0.24, std(0xd9d4ca, 0.6), sx + 0.45, 1.34, sz);
  cyl(0.035, 0.06, 0.06, std(0xd9d4ca, 0.6), sx + 0.45, 1.49, sz);
  const stone = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), std(0x55524d, 0.9));
  stone.scale.set(1.2, 0.8, 1);
  stone.position.set(sx + 0.42, 1.89, sz);
  stone.castShadow = true;
  scene.add(stone);

  // portrait, gallery style (black frame + white mat)
  if (profile.portrait || profile.photo) {
    const pf = makeFrame({ width: 0.72, height: 0.76, mat: 0.1 });
    loadCover(profile.portrait || profile.photo, Math.round(720 * TEXQ), Math.round(760 * TEXQ), (tx) => {
      pf.picMat.map = tx;
      pf.picMat.color.set(0xffffff);
      pf.picMat.needsUpdate = true;
    });
    pf.group.position.set(sx, 3.4, -D / 2 + 0.03);
    pf.group.userData = { action: 'about', hover: true };
    scene.add(pf.group);
    clickables.push(pf.group);
  }
}

// ============================================================
//  Left wall: window + "About" panel
// ============================================================
{
  const WS = 1.6 * TEXQ;
  const winTex = canvasTex(Math.round(800 * WS), Math.round(520 * WS), (ctx) => {
    ctx.scale(WS, WS);
    const w = 800, h = 520;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1018');
    g.addColorStop(1, '#1d2633');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.4 + 0.1})`;
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.5, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(235,228,210,0.8)';
    ctx.beginPath(); ctx.arc(610, 110, 26, 0, Math.PI * 2); ctx.fill();
    let x = 0;
    while (x < w) {
      const bw = 50 + Math.random() * 80;
      const bh = 120 + Math.random() * 220;
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 14; wy < h - 10; wy += 22)
        for (let wx = x + 8; wx < x + bw - 10; wx += 15)
          if (Math.random() > 0.78) {
            ctx.fillStyle = `rgba(222,190,140,${0.35 + Math.random() * 0.3})`;
            ctx.fillRect(wx, wy, 6, 9);
          }
      x += bw + 3;
    }
  });
  const win = new THREE.Group();
  const winMat = new THREE.MeshBasicMaterial({ map: winTex.tex });
  winMat.color.setScalar(0.8);
  win.add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), winMat));
  const frame = std(0x151618, 0.4, 0.4);
  box(2.72, 0.05, 0.08, frame, 0, 0.875, 0, win);
  box(2.72, 0.05, 0.08, frame, 0, -0.875, 0, win);
  box(0.05, 1.8, 0.08, frame, -1.335, 0, 0, win);
  box(0.05, 1.8, 0.08, frame, 1.335, 0, 0, win);
  box(0.03, 1.7, 0.06, frame, 0, 0, 0, win);
  box(2.8, 0.04, 0.2, std(PAL.oak, 0.55), 0, -0.92, 0.08, win);
  win.rotation.y = Math.PI / 2;
  win.position.set(-W / 2 + 0.03, 2.3, -2.3);
  scene.add(win);

  // "About" panel: a framed print with a short summary
  const about = makeFrame({ width: 2.0, height: 1.3, mat: 0, unlit: true });
  const AS = 2.2 * TEXQ; // drawn in a 1000x650 layout, rendered at ~2x for crisp text
  const aboutTex = canvasTex(Math.round(1000 * AS), Math.round(650 * AS), (ctx) => {
    ctx.scale(AS, AS);
    const w = 1000, h = 650;
    ctx.fillStyle = '#18191b';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '8px';
    ctx.fillStyle = PAL.accent;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText('ABOUT', 70, 110);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = PAL.text;
    fitFont(ctx, profile.name, 600, 64, w - 140);
    ctx.fillText(profile.name, 70, 200);
    ctx.fillStyle = PAL.textMuted;
    fitFont(ctx, profile.role, 400, 32, w - 140);
    ctx.fillText(profile.role, 70, 250);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(70, 300, w - 140, 2);
    const facts = [
      ['Experience', 'VINCI Energies · OCP · ALTEN · Amorino'],
      ...(profile.involvement || []).slice(0, 1).map((v) => ['Extracurricular', `${v.role}, ${v.org}`]),
      ['Status', 'Available now · France'],
    ];
    facts.forEach(([k, v], i) => {
      const y = 370 + i * 70;
      ctx.fillStyle = PAL.textMuted;
      fitFont(ctx, k.toUpperCase(), 500, 22, 260);
      ctx.fillText(k.toUpperCase(), 70, y);
      ctx.fillStyle = PAL.text;
      fitFont(ctx, v, 400, 30, w - 420);
      ctx.fillText(v, 350, y);
    });
    ctx.fillStyle = PAL.textMuted;
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText('Click to read more  →', 70, h - 50);
  });
  about.picMat.map = aboutTex.tex;
  about.picMat.color.set(0xffffff);
  about.group.rotation.y = Math.PI / 2;
  about.group.position.set(-W / 2 + 0.03, 2.25, 1.6);
  about.group.userData = { action: 'about', hover: true };
  scene.add(about.group);
  clickables.push(about.group);
}

// ============================================================
//  Right wall: projects gallery
// ============================================================
{
  const title = makePlate({
    width: 2.6,
    height: 0.42,
    lines: [{ text: 'SELECTED PROJECTS', size: 0.1, weight: 600, spacing: '12px' }],
    rule: false,
  });
  title.rotation.y = -Math.PI / 2;
  title.position.set(W / 2 - 0.02, 3.85, 0);
  scene.add(title);

  // Project cards: screenshot + text strip drawn into ONE texture, rendered unlit
  // (no lighting or tone mapping), so colours are exact and text is crisp.
  // 2 rows; the number of columns (and card size) adapts to the number of projects.
  const list = projects.slice(0, 10);
  const nCols = Math.max(1, Math.ceil(list.length / 2));
  const span = 9.5;
  const spacing = span / nCols;
  const CARD_W = 1024, IMG_H = 576, BAND_H = 200, CARD_H = IMG_H + BAND_H; // layout in px
  const cw = Math.min(2.0, spacing - 0.14);
  const ch = cw * (CARD_H / CARD_W);
  const rows = [2.62, 2.62 - ch - 0.16];
  const slot = (i) => {
    const row = i < nCols ? 0 : 1;
    const inRow = row === 0 ? Math.min(nCols, list.length) : list.length - nCols;
    const k = row === 0 ? i : i - nCols;
    const offset = ((nCols - inRow) / 2) * spacing; // centers a shorter second row
    return { y: rows[row], z: -span / 2 + spacing * (k + 0.5) + offset };
  };
  const CS = Math.min(1.5, 2 * TEXQ); // render the 1024 layout at up to 1536 px wide

  list.forEach((p, i) => {
    const g = new THREE.Group();
    // thin dark frame with a slim accent line on top
    box(cw + 0.03, ch + 0.03, 0.025, std(0x0d0e10, 0.5, 0.3), 0, 0, -0.012, g);

    const card = canvasTex(Math.round(CARD_W * CS), Math.round(CARD_H * CS), () => {});
    const draw = (img) => {
      const ctx = card.ctx;
      ctx.setTransform(CS, 0, 0, CS, 0, 0);
      drawProjectCard(ctx, CARD_W, IMG_H, BAND_H, p, img);
      card.tex.needsUpdate = true;
      invalidate();
    };
    draw(null);
    if (p.image) loadBitmap(p.image).then((img) => img && (draw(img), img.close && img.close()));

    const mat = new THREE.MeshBasicMaterial({ map: card.tex, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), mat);
    plane.position.z = 0.002;
    g.add(plane);

    g.rotation.y = -Math.PI / 2;
    const s = slot(i);
    g.position.set(W / 2 - 0.03, s.y, s.z);
    g.userData = { action: 'project', index: i, hover: true };
    scene.add(g);
    clickables.push(g);
  });
}

// Card layout: screenshot on top (cover-cropped), dark text strip below
function drawProjectCard(ctx, w, imgH, bandH, p, img) {
  // image area
  if (img) {
    const s = Math.max(w / img.width, imgH / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, imgH);
    ctx.clip();
    ctx.drawImage(img, (w - dw) / 2, (imgH - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, w, imgH);
    g.addColorStop(0, '#2a2e34');
    g.addColorStop(1, '#17191c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, imgH);
    ctx.fillStyle = PAL.accent;
    ctx.fillRect(64, imgH / 2 - 70, 64, 4);
    ctx.fillStyle = PAL.text;
    fitFont(ctx, p.title, 600, 84, w - 128);
    ctx.fillText(p.title, 64, imgH / 2 + 20);
    ctx.fillStyle = '#8f8d88';
    ctx.font = '26px "JetBrains Mono"';
    ctx.fillText('No preview available', 64, imgH / 2 + 74);
  }
  // text strip
  ctx.fillStyle = '#141517';
  ctx.fillRect(0, imgH, w, bandH);
  ctx.fillStyle = PAL.accent;
  ctx.fillRect(0, imgH, w, 4);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f2efea';
  fitFont(ctx, p.title, 600, 54, w - 96);
  ctx.fillText(p.title, 48, imgH + 74);
  ctx.fillStyle = PAL.accent;
  fitFont(ctx, p.type.toUpperCase(), 600, 26, w - 96);
  ctx.letterSpacing = '3px';
  ctx.fillText(p.type.toUpperCase(), 48, imgH + 120);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#a9a6a0';
  ctx.font = '26px "JetBrains Mono"';
  let tech = p.tech.join('  ·  ');
  while (ctx.measureText(tech).width > w - 96 && tech.includes('·')) tech = tech.slice(0, tech.lastIndexOf('  ·  '));
  ctx.fillText(tech, 48, imgH + 168);
}

// ============================================================
//  Camera, navigation and UI
// ============================================================
const isNarrow = () => window.innerWidth / window.innerHeight < 0.9;
const stations = {
  accueil: () => ({ pos: isNarrow() ? [4.2, 3.4, 9.5] : [5.0, 3.1, 6.4], target: [-0.4, 1.6, -2] }),
  // close enough that the wall panel's text reads large and sharp
  apropos: () => ({ pos: isNarrow() ? [0.6, 2.25, 1.6] : [-1.3, 2.25, 2.2], target: [-5, 2.25, 2.2] }),
  projets: () => {
    // step back so every column fits on screen
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const dist = Math.min(9.3, Math.max(5.8, 5 / half));
    return { pos: [5 - dist, 2.15, 0], target: [5, 2.1, 0] };
  },
  contact: () => ({ pos: isNarrow() ? [-0.6, 1.9, 0.6] : [-0.6, 1.7, -1.7], target: [-0.8, 1.5, -5] }),
};
const order = ['accueil', 'apropos', 'projets', 'contact'];
let current = 'accueil';

const cam = { pos: new THREE.Vector3(14, 9, 16), target: new THREE.Vector3(0, 1, -2) };
let tween = null;

function goTo(name) {
  if (!stations[name]) return;
  closePanel();
  current = name;
  const s = stations[name]();
  const toPos = new THREE.Vector3(...s.pos);
  const toTarget = new THREE.Vector3(...s.target);
  // Orientation is interpolated as a rotation (slerp), not by sliding the look-at point,
  // so big turns (e.g. About -> Projects) pan smoothly instead of snapping.
  helper.position.copy(toPos);
  helper.lookAt(toTarget);
  const qFrom = camera.quaternion.clone();
  const qTo = helper.quaternion.clone();
  const angle = qFrom.angleTo(qTo);
  const fromPos = camera.position.clone();
  const travel = fromPos.distanceTo(toPos);
  parAmt = 0;
  tween = {
    fromPos,
    fromTarget: cam.target.clone(),
    toPos,
    toTarget,
    qFrom,
    qTo,
    lift: Math.min(0.4, angle * 0.12 + travel * 0.02),
    start: performance.now(),
    dur: 1400 + angle * 450 + travel * 60,
    done: () => {
      if (name === 'contact') openPanel(contactHTML());
      if (name === 'apropos') openPanel(aboutHTML());
    },
  };
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  hint.textContent =
    name === 'projets' ? 'Select a project to see the details'
    : name === 'accueil' ? 'Scroll or use the arrow keys to move through the office'
    : '';
}
const helper = new THREE.PerspectiveCamera(); // a camera, so lookAt() uses the camera convention (-Z forward)
let parAmt = 0;
const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Mouse parallax
const mouse = new THREE.Vector2();
const parallax = new THREE.Vector2();
let pointerDirty = false; // hover ray is only cast when the mouse or camera moved
window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerDirty = true;
});

// Hover and click
const raycaster = new THREE.Raycaster();
let hovered = null;
function pick() {
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(clickables, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.action) o = o.parent;
  return o;
}
canvas.addEventListener('click', () => {
  const o = pick();
  if (!o) return;
  if (o.userData.action === 'project') {
    if (current !== 'projets') goTo('projets');
    openPanel(projectHTML(projects[o.userData.index]));
  } else if (o.userData.action === 'about') {
    goTo('apropos');
  } else if (o.userData.action === 'stats') {
    openStats();
  }
});

// Wheel / keyboard
let wheelLock = 0;
window.addEventListener('wheel', (e) => {
  if (document.getElementById('panel').classList.contains('open') && e.target.closest('#panel')) return;
  const now = performance.now();
  if (now < wheelLock || Math.abs(e.deltaY) < 10) return;
  wheelLock = now + 1200;
  step(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
window.addEventListener('keydown', (e) => {
  // don't move the camera while someone is typing in the contact form
  if (e.target.closest && e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
  if (e.key === 'Escape') closePanel();
});
function step(dir) {
  const i = Math.min(order.length - 1, Math.max(0, order.indexOf(current) + dir));
  if (order[i] !== current) goTo(order[i]);
}

// ---------- HTML panels ----------
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const hint = document.getElementById('hint');
document.getElementById('panel-close').addEventListener('click', closePanel);
function openPanel(html) {
  panelBody.innerHTML = html;
  panel.classList.add('open');
  panel.scrollTop = 0;
}
function closePanel() {
  panel.classList.remove('open');
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function projectHTML(p) {
  return `
    <span class="tag">${esc(p.type)}</span>
    <h2>${esc(p.title)}</h2>
    <p>${esc(p.description)}</p>
    <div class="chips">${p.tech.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    <div class="actions">
      ${p.link ? `<a class="btn primary" href="${esc(p.link)}" target="_blank" rel="noopener">Watch the demo</a>` : ''}
      ${p.code ? `<a class="btn${p.link ? '' : ' primary'}" href="${esc(p.code)}" target="_blank" rel="noopener">Source code</a>` : ''}
      <a class="btn" href="${esc(profile.socials.github)}" target="_blank" rel="noopener">GitHub</a>
    </div>`;
}
function aboutHTML() {
  return `
    <div class="head">
      ${profile.photo ? `<img class="avatar" src="${esc(profile.photo)}" alt="${esc(profile.name)}" />` : ''}
      <div>
        <span class="tag">About</span>
        <h2>${esc(profile.name)}</h2>
        <p class="role">${esc(profile.role)}</p>
      </div>
    </div>
    <p>${esc(profile.intro)}</p>
    ${profile.experience ? `<h3>Experience</h3><ul class="timeline">${profile.experience.map((e) => `<li><b>${esc(e.date)}</b><span>${esc(e.title)}<small>${esc(e.company)}</small>${e.missions ? `<ul class="missions">${e.missions.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : e.mission ? `<em>${esc(e.mission)}</em>` : ''}${e.softSkills ? `<span class="soft">${e.softSkills.map((s) => `<i>${esc(s)}</i>`).join('')}</span>` : ''}</span></li>`).join('')}</ul>` : ''}
    ${profile.involvement ? `<h3>Extracurricular activities</h3><ul class="timeline">${profile.involvement.map((v) => `<li><b></b><span>${esc(v.role)}<small>${esc(v.org)}</small>${v.description ? `<em>${esc(v.description)}</em>` : ''}</span></li>`).join('')}</ul>` : ''}
    ${profile.education ? `<h3>Education</h3><ul class="timeline">${profile.education.map((e) => `<li><b>${esc(e.date.slice(-4))}</b><span>${esc(e.title)}<small>${esc(e.school)}</small></span></li>`).join('')}</ul>` : ''}
    <h3>Skills</h3>
    <div class="chips">${profile.skills.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-go="projets">View projects</button>
      ${profile.cv ? `<a class="btn" href="${esc(profile.cv)}" target="_blank" rel="noopener">Download CV</a>` : ''}
    </div>`;
}
function contactHTML() {
  return `
    <span class="tag">Contact</span>
    <h2>Let's work together</h2>
    <p>${profile.status ? `${esc(profile.status)}. ` : ''}Have an opportunity, a project or a question? Get in touch.</p>
    <ul class="contact-list">
      <li><span>Email</span><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a></li>
      ${profile.phone ? `<li><span>Phone</span><a href="tel:${esc(profile.phone.replace(/\s/g, ''))}">${esc(profile.phone)}</a></li>` : ''}
    </ul>
    ${profile.contactForm ? `
    <form id="contact-form" class="contact-form" novalidate>
      <h3>Send a message</h3>
      <label>Name<input name="name" autocomplete="name" placeholder="Jane Smith" /></label>
      <small class="field-error" data-err="name"></small>
      <label>Email<input name="email" type="email" autocomplete="email" placeholder="jane@company.com" /></label>
      <small class="field-error" data-err="email"></small>
      <label>Message<textarea name="message" rows="4" placeholder="Tell me about the role or project"></textarea></label>
      <small class="field-error" data-err="message"></small>
      <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <button type="submit" class="btn primary">Send message</button>
      <p class="form-status" role="status"></p>
    </form>` : ''}
    <div class="actions">
      <a class="btn" href="${esc(profile.socials.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>
      ${profile.cv ? `<a class="btn" href="${esc(profile.cv)}" target="_blank" rel="noopener">Download CV</a>` : ''}
    </div>`;
}
panelBody.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) goTo(b.dataset.go);
});

// ---------- Contact form ----------
panelBody.addEventListener('input', (e) => {
  const err = e.target.name && panelBody.querySelector(`[data-err="${e.target.name}"]`);
  if (err) err.textContent = '';
});
panelBody.addEventListener('submit', async (e) => {
  const f = e.target.closest('#contact-form');
  if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const name = (d.name || '').trim(), email = (d.email || '').trim(), message = (d.message || '').trim();
  const errors = {};
  if (!name) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (message.length < 10) errors.message = 'Write a message of at least 10 characters.';
  f.querySelectorAll('.field-error').forEach((el) => (el.textContent = errors[el.dataset.err] || ''));
  const status = f.querySelector('.form-status');
  status.className = 'form-status';
  status.textContent = '';
  if (Object.keys(errors).length) {
    f.querySelector(`[name="${Object.keys(errors)[0]}"]`).focus();
    return;
  }
  if (d._honey) return; // bot filled the hidden field
  const btn = f.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const r = await fetch(profile.contactForm, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name,
        email,
        message,
        _subject: `Portfolio: new message from ${name}`,
        _replyto: email,
        _template: 'table',
        _captcha: 'false',
      }),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || String(res.success) === 'false') throw new Error(res.message || 'send failed');
    f.reset();
    status.classList.add('ok');
    status.textContent = "Thanks, your message has been sent. I'll get back to you soon.";
  } catch {
    status.classList.add('err');
    status.innerHTML = `Your message couldn't be sent. Email me directly at <a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>.`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send message';
  }
});
document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.go)));

// Social links
document.getElementById('s-github').href = profile.socials.github;
document.getElementById('s-linkedin').href = profile.socials.linkedin;
document.getElementById('s-instagram').href = profile.socials.instagram;
document.getElementById('s-mail').href = `mailto:${profile.email}`;
document.title = `${profile.name} — Portfolio`;

// ---------- Visitor counter (GoatCounter) ----------
// Every visit is recorded, but the number is hidden: it only shows when someone
// clicks the coffee mug on the desk, or opens the site with ?stats in the URL.
const gcBase = profile.goatcounter ? `https://${profile.goatcounter}.goatcounter.com` : null;
if (gcBase) {
  // records this visit (GoatCounter ignores localhost automatically)
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `${gcBase}/count`;
  document.head.appendChild(s);
}
async function fetchVisitors() {
  // Counter for this page's path ("TOTAL" is only refreshed later by GoatCounter)
  const path = location.pathname.replace(/index\.html$/, '');
  let zero = null;
  for (const p of [path, 'TOTAL']) {
    try {
      const r = await fetch(`${gcBase}/counter/${encodeURIComponent(p)}.json`);
      if (!r.ok) continue;
      const d = await r.json();
      const n = d.count_unique ?? d.count;
      if (n != null && n !== '0') return n;
      if (n === '0') zero = '0';
    } catch {}
  }
  return zero;
}
async function openStats() {
  if (!gcBase) return;
  openPanel(`
    <span class="tag">Stats</span>
    <h2>Site visitors</h2>
    <div class="stat"><b id="stat-n">…</b><span>unique visitors</span></div>
    <p>Thanks for taking the time to look around.</p>`);
  const n = await fetchVisitors();
  const el = document.getElementById('stat-n');
  if (el) el.textContent = n ?? 'unavailable';
}

// ---------- Loop ----------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = isNarrow() ? 68 : 50;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (!tween && stations[current] && document.getElementById('intro').classList.contains('hide')) {
    const s = stations[current]();
    cam.pos.set(...s.pos);
    cam.target.set(...s.target);
  }
}
window.addEventListener('resize', () => { onResize(); invalidate(); });
onResize();

// ---------- Performance ----------
// Merge every static mesh that shares a material into a single mesh
// (per clickable group, so hover/click still work).
function mergeStatic() {
  scene.updateMatrixWorld(true);
  const containers = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.dynamic || Array.isArray(o.material)) return;
    let c = o.parent;
    while (c && c !== scene && !c.userData.action) {
      if (c.userData.dynamic) return;
      c = c.parent;
    }
    if (!containers.has(c)) containers.set(c, new Map());
    const byMat = containers.get(c);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  });
  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  for (const [c, byMat] of containers) {
    inv.copy(c.matrixWorld).invert();
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map((mesh) => {
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const out = new THREE.Mesh(merged, mat);
      out.castShadow = list.some((x) => x.castShadow);
      out.receiveShadow = list.some((x) => x.receiveShadow);
      for (const mesh of list) {
        mesh.parent.remove(mesh);
        mesh.geometry.dispose();
      }
      c.add(out);
    }
  }
  scene.updateMatrixWorld(true); // merged meshes get correct world matrices before the first click
}
mergeStatic();
renderer.shadowMap.needsUpdate = true; // bake shadows once

function applyQuality() {
  renderer.setPixelRatio(currentTier().pr);
  onResize();
}
applyQuality();

// Lowers the resolution step by step if the device can't keep ~45 fps
let sampleTime = 0, sampleFrames = 0, measureFrom = Infinity;
function adaptQuality(dt) {
  if (tween) return; // camera moves are not representative
  if (softwareRendering || performance.now() < measureFrom || qLevel >= QUALITY.length - 1) return;
  if (!renderedLastFrame) return; // with on-demand rendering, only back-to-back frames say anything about speed
  sampleTime += dt;
  sampleFrames++;
  if (sampleTime < 2) return;
  const avg = sampleTime / sampleFrames;
  sampleTime = 0;
  sampleFrames = 0;
  // only step down after two slow windows in a row (< 40 fps), so a loading hiccup
  // doesn't blur the site for good on a normal computer
  // only for a genuinely struggling GPU: under 30 fps for three windows in a row
  slowWindows = avg > 1 / 30 ? slowWindows + 1 : 0;
  if (slowWindows >= 3) {
    slowWindows = 0;
    qLevel++;
    applyQuality();
    measureFrom = performance.now() + 1500;
  }
}
let slowWindows = 0;

const render = () => renderer.render(scene, camera);
if (location.search.includes('debug')) window.__three = { renderer, scene, camera, render, quality: () => qLevel, ui: { openPanel, contactHTML, aboutHTML } };

let entered = false;
const hoverScale = new THREE.Vector3(1.02, 1.02, 1.02);
const lastCamPos = new THREE.Vector3();
const lastCamQuat = new THREE.Quaternion();
let renderedLastFrame = false;
const clock = new THREE.Clock();

// On-demand rendering: the room is static, so a new image is only drawn when
// something visible changes (camera, parallax, hover, typing on the monitor,
// a texture finishing loading, a resize). Same quality, far less GPU and battery.
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (!entered) return; // nothing to draw behind the opaque intro screen
  adaptQuality(dt);

  parallax.lerp(mouse, 0.04);
  if (tween) {
    const k = Math.min(1, (performance.now() - tween.start) / tween.dur);
    const e = ease(k);
    cam.pos.lerpVectors(tween.fromPos, tween.toPos, e);
    cam.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
    camera.position.copy(cam.pos);
    camera.position.y += Math.sin(Math.PI * e) * tween.lift;
    camera.quaternion.slerpQuaternions(tween.qFrom, tween.qTo, e);
    if (k >= 1) {
      const d = tween.done;
      tween = null;
      d();
    }
  } else {
    // subtle parallax that fades back in after a move
    const strength = current === 'accueil' ? 0.3 : 0.08;
    parAmt += (strength - parAmt) * 0.02;
    camera.position.copy(cam.pos);
    camera.position.x += parallax.x * parAmt;
    camera.position.y += parallax.y * parAmt * 0.6;
    camera.lookAt(cam.target);
  }

  for (const fn of animated) fn(t, dt);

  if (pointerDirty || tween) {
    pointerDirty = false;
    const h = pick();
    if (h !== hovered) {
      if (hovered) hovered.scale.setScalar(1);
      hovered = h;
      canvas.style.cursor = h ? 'pointer' : 'default';
      invalidate();
    }
  }
  if (hovered && hovered.scale.x < hoverScale.x - 0.0005) {
    hovered.scale.lerp(hoverScale, 0.2);
    invalidate();
  }

  // did the camera actually move since the last drawn image?
  if (
    camera.position.distanceToSquared(lastCamPos) > 1e-10 ||
    Math.abs(camera.quaternion.dot(lastCamQuat)) < 1 - 1e-10
  ) invalidate();

  if (needsRender) {
    needsRender = false;
    render();
    lastCamPos.copy(camera.position);
    lastCamQuat.copy(camera.quaternion);
    renderedLastFrame = true;
  } else {
    renderedLastFrame = false;
  }
}

// Intro: compile every shader in parallel during the loading screen (KHR_parallel_shader_compile
// in Chrome), so the first frame after "Enter" doesn't stutter.
const enterBtn = document.getElementById('enter');
enterBtn.disabled = true;
(renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera)))
  .catch(() => {})
  .finally(() => {
    document.getElementById('loader').classList.add('hide');
    enterBtn.disabled = false;
  });
frame();

document.getElementById('enter').addEventListener('click', () => {
  document.getElementById('intro').classList.add('hide');
  entered = true;
  invalidate();
  clock.getDelta();
  measureFrom = performance.now() + 4000; // let loading and the first camera move settle before judging speed
  goTo('accueil');
  if (new URLSearchParams(location.search).has('stats')) setTimeout(openStats, 1800);
});
