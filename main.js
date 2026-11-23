import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { profile, projects } from './data.js';

// ---------- Palette ----------
const COL = {
  wall: 0x1b1930,
  wallSide: 0x221f3b,
  floor: 0x121019,
  ceiling: 0x0e0c16,
  violet: '#a78bfa',
  amber: '#fbbf24',
  pink: '#f472b6',
  dark: 0x1f1d2b,
  light: 0xe8e6f0,
};

// Materials are cached so identical ones are shared (fewer GPU state changes,
// and it lets static meshes with the same material be merged into one draw call).
const matCache = new Map();
const neon = (hex, power = 2.4) => {
  const key = `n|${hex}|${power}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power) }));
  return matCache.get(key);
};
const std = (color, rough = 0.7, metal = 0.05) => {
  const key = `s|${color}|${rough}|${metal}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
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
  t.anisotropy = 4;
  return { tex: t, canvas: c, ctx };
}
// Loads an image and draws it "cover"-cropped into a small canvas texture,
// so big screenshots never sit in GPU memory at full size.
function loadCover(url, w, h, onReady) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    const t = canvasTex(w, h, (ctx) => {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    });
    onReady(t.tex);
  };
  img.src = url;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Readable sign: dark plate + crisp text (below bloom threshold) + glowing neon frame
function makeSign({ lines, width, height, accent }) {
  const g = new THREE.Group();
  box(width, height, 0.05, std(0x0c0a14, 0.6), 0, 0, 0, g);
  const nm = neon(accent, 2.6);
  const t = 0.035;
  box(width + t, t, 0.07, nm, 0, height / 2, 0.01, g);
  box(width + t, t, 0.07, nm, 0, -height / 2, 0.01, g);
  box(t, height + t, 0.07, nm, -width / 2, 0, 0.01, g);
  box(t, height + t, 0.07, nm, width / 2, 0, 0.01, g);
  const res = 320;
  const tex = canvasTex(Math.round(width * res), Math.round(height * res), (ctx, w, h) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l.size * res * 1.2, 0);
    let y = h / 2 - total / 2;
    for (const l of lines) {
      let fs = l.size * res;
      const font = () => `${l.weight || 700} ${fs}px "Space Grotesk"`;
      ctx.font = font();
      while (ctx.measureText(l.text).width > w * 0.88) { fs -= 2; ctx.font = font(); }
      const lh = l.size * res * 1.2;
      if (l.spacing) ctx.letterSpacing = l.spacing;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, w / 2, y + lh / 2);
      ctx.letterSpacing = '0px';
      y += lh;
    }
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true });
  mat.color.setScalar(0.88);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  p.position.z = 0.03;
  g.add(p);
  return g;
}

// ---------- Renderer / scène ----------
const canvas = document.getElementById('scene');
// antialias is off: everything is drawn through the post-processing composer,
// whose render targets ignore it anyway, so it only cost memory.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// Quality tiers, picked automatically from the measured frame rate (see adaptQuality)
const QUALITY = [
  { pr: Math.min(window.devicePixelRatio, 1.5), bloom: true },
  { pr: Math.min(window.devicePixelRatio, 1.25), bloom: true },
  { pr: 1, bloom: true },
  { pr: 0.85, bloom: false },
];
let qLevel = 0;
renderer.setPixelRatio(QUALITY[0].pr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// The room never moves, so shadows are computed once instead of every frame
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060c);
scene.fog = new THREE.Fog(0x07060c, 14, 30);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const clickables = [];
const animated = [];

await document.fonts.load('700 100px "Space Grotesk"');
await document.fonts.load('400 20px "JetBrains Mono"');

// ---------- Lumières ----------
scene.add(new THREE.HemisphereLight(0x9d8cff, 0x1a1020, 0.55));
const roomLight = new THREE.PointLight(0xb9a6ff, 18, 14, 1.6);
roomLight.position.set(0, 4, 0);
scene.add(roomLight);
const spot = new THREE.SpotLight(0xfff1dd, 40, 12, Math.PI / 5, 0.5, 1.4);
spot.position.set(-0.5, 4.3, -2.5);
spot.target.position.set(-0.8, 0.8, -4.3);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0005;
scene.add(spot, spot.target);
const projLight = new THREE.PointLight(0xf0abfc, 12, 9, 1.6);
projLight.position.set(2.5, 3, 0);
scene.add(projLight);

// ---------- Pièce ----------
const W = 10, D = 10, H = 4.5;
{
  const floorTex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#16131f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0b0a10';
    ctx.lineWidth = 6;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
    }
  });
  floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping;
  floorTex.tex.repeat.set(2.5, 2.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: floorTex.tex, roughness: 0.35, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std(COL.wall, 0.9));
  back.position.set(0, H / 2, -D / 2);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), std(COL.wallSide, 0.9));
  left.rotation.y = Math.PI / 2;
  left.position.set(-W / 2, H / 2, 0);
  left.receiveShadow = true;
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.set(W / 2, H / 2, 0);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(COL.ceiling, 1));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  scene.add(back, left, right, ceil);

  // Néons de contour
  const v = neon(COL.violet, 2.6);
  const a = neon(COL.amber, 2.2);
  box(W, 0.05, 0.05, v, 0, H - 0.03, -D / 2 + 0.03);
  box(0.05, 0.05, D, v, -W / 2 + 0.03, H - 0.03, 0);
  box(0.05, 0.05, D, v, W / 2 - 0.03, H - 0.03, 0);
  box(W, 0.03, 0.03, a, 0, 0.03, -D / 2 + 0.02);
  box(0.03, 0.03, D, a, -W / 2 + 0.02, 0.03, 0);
  box(0.03, 0.03, D, a, W / 2 - 0.02, 0.03, 0);

  // Panneaux lumineux au plafond (anneaux)
  for (const [x, z] of [[-2.5, -2], [2.5, -2], [0, 2]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 64), neon('#e9e3ff', 1.2));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, H - 0.02, z);
    scene.add(ring);
  }

  // Tapis rond
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), std(0x2a2245, 1));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.8, 0.005, -2.9);
  rug.receiveShadow = true;
  scene.add(rug);
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.6, 64), std(0x6d5bd0, 1));
  rugRing.rotation.x = -Math.PI / 2;
  rugRing.position.set(-0.8, 0.007, -2.9);
  scene.add(rugRing);
}

// ---------- Mur du fond : enseigne néon ----------
{
  const nameSign = makeSign({
    width: 3.9,
    height: 1.15,
    accent: COL.violet,
    lines: [
      { text: profile.name.toUpperCase(), size: 0.4, color: '#ffffff', spacing: '6px' },
      { text: profile.role, size: 0.17, color: '#fcd34d', weight: 500 },
    ],
  });
  nameSign.position.set(-0.8, 3.15, -D / 2 + 0.04);
  scene.add(nameSign);

  // Anneau décoratif
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 12, 80), neon(COL.amber, 2.4));
  ring.position.set(-3.6, 2.6, -D / 2 + 0.05);
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 12, 80), neon(COL.pink, 2.4));
  ring2.position.set(-3.6, 2.6, -D / 2 + 0.05);
  ring2.userData.dynamic = true;
  scene.add(ring2);
  animated.push((t) => {
    ring2.scale.setScalar(1 + Math.sin(t * 1.5) * 0.06);
  });
}

// ---------- Bureau ----------
const deskX = -0.8, deskZ = -4.35;
{
  const white = std(COL.light, 0.45);
  const dark = std(COL.dark, 0.6);
  box(2.6, 0.07, 1.0, white, deskX, 0.78, deskZ);
  box(0.06, 0.78, 0.9, white, deskX - 1.25, 0.39, deskZ);
  box(0.6, 0.74, 0.9, white, deskX + 1.0, 0.37, deskZ);
  for (let i = 0; i < 3; i++) box(0.56, 0.2, 0.02, std(0xd4d1e0, 0.5), deskX + 1.0, 0.13 + i * 0.24, deskZ + 0.46);
  box(2.6, 0.015, 0.015, neon(COL.violet, 2.5), deskX, 0.74, deskZ + 0.5);

  // Écran avec code animé
  cyl(0.18, 0.2, 0.02, dark, deskX - 0.1, 0.83, deskZ - 0.15);
  box(0.05, 0.4, 0.05, dark, deskX - 0.1, 1.02, deskZ - 0.2);
  box(1.4, 0.7, 0.04, dark, deskX - 0.1, 1.38, deskZ - 0.18);

  const codeLines = [
    ['#c084fc', 'const '], ['#e2e8f0', 'portfolio = {'], null,
    ['#94a3b8', '  name: '], ['#fbbf24', `'${profile.name}',`], null,
    ['#94a3b8', '  focus: '], ['#fbbf24', "['AI', 'Full Stack'],"], null,
    ['#94a3b8', '  stack: '], ['#fbbf24', "'Python, .NET, Spring',"], null,
    ['#e2e8f0', '};'], null, null,
    ['#c084fc', 'const '], ['#e2e8f0', 'model = '], ['#60a5fa', 'train'], ['#e2e8f0', '(data);'], null,
    ['#c084fc', 'return '], ['#60a5fa', 'ship'], ['#e2e8f0', '(model);'], null,
    ['#e2e8f0', '}'], null,
  ];
  // Drawn in a 768x384 coordinate space, scaled down to a 512x256 texture
  // (less to re-upload to the GPU each time a character is typed)
  const screen = canvasTex(512, 256, () => {});
  screen.ctx.setTransform(512 / 768, 0, 0, 512 / 768, 0, 0);
  let typed = 0;
  const total = codeLines.reduce((n, s) => n + (s ? s[1].length : 0), 0);
  function drawCode() {
    const { ctx } = screen;
    ctx.fillStyle = '#0f0d1a';
    ctx.fillRect(0, 0, 768, 384);
    ctx.fillStyle = '#1e1b2e';
    ctx.fillRect(0, 0, 768, 30);
    ['#f87171', '#fbbf24', '#34d399'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(20 + i * 22, 15, 6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.font = '22px "JetBrains Mono"';
    let x = 50, y = 64, left = typed, line = 1;
    ctx.fillStyle = '#4b5563';
    ctx.fillText(String(line), 14, y);
    for (const seg of codeLines) {
      if (!seg) {
        y += 30; x = 50; line++;
        if (left > 0) { ctx.fillStyle = '#4b5563'; ctx.fillText(String(line), 14, y); }
        continue;
      }
      if (left <= 0) break;
      const s = seg[1].slice(0, left);
      left -= s.length;
      ctx.fillStyle = seg[0];
      ctx.fillText(s, x, y);
      x += ctx.measureText(s).width;
    }
    if (Math.floor(performance.now() / 400) % 2) {
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(x + 2, y - 20, 12, 24);
    }
    screen.tex.needsUpdate = true;
  }
  let last = 0;
  animated.push((t) => {
    if (t - last > 0.08) {
      last = t;
      typed = typed >= total + 40 ? 0 : typed + 1;
      drawCode();
    }
  });
  const scrMat = new THREE.MeshBasicMaterial({ map: screen.tex });
  scrMat.color.setScalar(0.95);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.62), scrMat);
  scr.position.set(deskX - 0.1, 1.38, deskZ - 0.155);
  scene.add(scr);

  // Clavier, souris, tasse
  box(0.8, 0.03, 0.26, dark, deskX - 0.1, 0.83, deskZ + 0.2);
  box(0.76, 0.005, 0.22, neon(COL.violet, 1.2), deskX - 0.1, 0.847, deskZ + 0.2);
  box(0.08, 0.03, 0.13, dark, deskX + 0.5, 0.83, deskZ + 0.22);
  const mug = cyl(0.06, 0.055, 0.14, std(0xfbbf24, 0.4), deskX - 0.85, 0.89, deskZ + 0.15);
  mug.castShadow = true;

  // Cadre photo sur le bureau
  if (profile.photo) {
    const pf = new THREE.Group();
    box(0.3, 0.38, 0.02, std(0x2b2840, 0.4), 0, 0, 0, pf);
    const photoMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.33), photoMat);
    ph.position.z = 0.011;
    pf.add(ph);
    loadCover(profile.photo, 192, 256, (tx) => {
      photoMat.map = tx;
      photoMat.color.setScalar(0.85);
      photoMat.needsUpdate = true;
    });
    pf.position.set(deskX - 1.0, 1.0, deskZ - 0.15);
    pf.rotation.set(-0.12, 0.35, 0);
    pf.userData = { action: 'about', hover: true };
    scene.add(pf);
    clickables.push(pf);
  }

  // Lampe
  const lampMat = std(0x2b2840, 0.4, 0.6);
  cyl(0.12, 0.14, 0.03, lampMat, deskX + 0.95, 0.83, deskZ - 0.2);
  const arm = box(0.03, 0.6, 0.03, lampMat, deskX + 0.95, 1.12, deskZ - 0.2);
  arm.rotation.z = 0.25;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 24, 1, true), lampMat);
  head.position.set(deskX + 0.8, 1.42, deskZ - 0.2);
  head.rotation.z = 0.9;
  scene.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), neon('#ffe4b5', 3));
  bulb.position.set(deskX + 0.77, 1.38, deskZ - 0.2);
  scene.add(bulb);
  const lampLight = new THREE.PointLight(0xffc98a, 4, 3, 1.5);
  lampLight.position.copy(bulb.position);
  scene.add(lampLight);

  // Tour PC
  const pcX = deskX + 1.75, pcZ = deskZ + 0.05;
  box(0.32, 0.7, 0.62, std(0x18161f, 0.3, 0.5), pcX, 0.35, pcZ);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.58),
    new THREE.MeshStandardMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.15, roughness: 0.05 })
  );
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(pcX - 0.165, 0.35, pcZ);
  scene.add(glass);
  for (let i = 0; i < 3; i++) {
    const fan = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 32), neon(i === 1 ? COL.pink : COL.violet, 2.6));
    fan.position.set(pcX - 0.15, 0.17 + i * 0.18, pcZ + 0.12);
    fan.rotation.y = Math.PI / 2;
    scene.add(fan);
  }
  box(0.01, 0.6, 0.01, neon(COL.amber, 2.4), pcX - 0.16, 0.35, pcZ - 0.28);
}

// ---------- Chaise ----------
{
  const chair = new THREE.Group();
  const seatMat = std(0x26232f, 0.6);
  const accent = std(0xd97706, 0.5);
  box(0.6, 0.1, 0.58, seatMat, 0, 0.5, 0, chair);
  const back = box(0.56, 0.8, 0.09, seatMat, 0, 0.95, 0.3, chair);
  back.rotation.x = -0.12;
  const stripe = box(0.14, 0.78, 0.095, accent, 0, 0.95, 0.3, chair);
  stripe.rotation.x = -0.12;
  box(0.06, 0.04, 0.4, seatMat, -0.33, 0.68, 0.0, chair);
  box(0.06, 0.04, 0.4, seatMat, 0.33, 0.68, 0.0, chair);
  box(0.04, 0.2, 0.04, seatMat, -0.33, 0.58, 0.1, chair);
  box(0.04, 0.2, 0.04, seatMat, 0.33, 0.58, 0.1, chair);
  cyl(0.035, 0.035, 0.4, std(0x666070, 0.3, 0.8), 0, 0.27, 0, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.3, 0.035, 0.05, seatMat, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15, chair);
    leg.rotation.y = -a;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), seatMat);
    w.position.set(Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3);
    chair.add(w);
  }
  chair.position.set(deskX - 0.1, 0, deskZ + 1.15);
  chair.rotation.y = Math.PI + 0.35;
  scene.add(chair);
}

// ---------- Étagère + plante ----------
{
  const shelfMat = std(0x3b3355, 0.6);
  const sx = 2.9, sz = -D / 2 + 0.2;
  for (let i = 0; i < 3; i++) {
    box(1.4, 0.04, 0.32, shelfMat, sx, 1.2 + i * 0.6, sz);
    box(1.4, 0.008, 0.01, neon(COL.violet, 1.8), sx, 1.177 + i * 0.6, sz + 0.16);
  }
  const bookColors = [0xa78bfa, 0xfbbf24, 0xf472b6, 0x60a5fa, 0x34d399, 0xe2e8f0];
  for (let s = 0; s < 3; s++) {
    let x = sx - 0.6;
    const n = 4 + s;
    for (let i = 0; i < n; i++) {
      const h = 0.28 + ((i * 7 + s * 3) % 5) * 0.03;
      const w = 0.06 + ((i + s) % 3) * 0.015;
      box(w, h, 0.22, std(bookColors[(i + s * 2) % bookColors.length], 0.7), x, 1.22 + s * 0.6 + h / 2, sz);
      x += w + 0.012;
    }
  }
  // Petite planète sur l'étagère
  const planet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 32), std(0x7c3aed, 0.4, 0.2));
  planet.position.set(sx + 0.45, 1.36 + 0.6, sz);
  scene.add(planet);
  const pRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 8, 48), neon(COL.amber, 2));
  pRing.position.copy(planet.position);
  pRing.rotation.x = 1.2;
  scene.add(pRing);
  planet.userData.dynamic = pRing.userData.dynamic = true;
  animated.push((t) => { planet.rotation.y = t * 0.6; pRing.rotation.z = t * 0.4; });

  // Portrait au mur, au-dessus de l'étagère
  if (profile.portrait || profile.photo) {
    const pw = 0.92, ph = 0.96;
    const portrait = new THREE.Group();
    box(pw + 0.1, ph + 0.1, 0.04, std(0x0c0a14, 0.6), 0, 0, 0, portrait);
    const nm = neon(COL.amber, 2.4);
    const t = 0.03;
    box(pw + 0.13, t, 0.06, nm, 0, (ph + 0.1) / 2, 0.01, portrait);
    box(pw + 0.13, t, 0.06, nm, 0, -(ph + 0.1) / 2, 0.01, portrait);
    box(t, ph + 0.13, 0.06, nm, -(pw + 0.1) / 2, 0, 0.01, portrait);
    box(t, ph + 0.13, 0.06, nm, (pw + 0.1) / 2, 0, 0.01, portrait);
    const pMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), pMat);
    pic.position.z = 0.025;
    portrait.add(pic);
    loadCover(profile.portrait || profile.photo, 384, 400, (tx) => {
      pMat.map = tx;
      pMat.color.setScalar(0.82); // white background stays under the bloom threshold
      pMat.needsUpdate = true;
    });
    portrait.position.set(sx, 3.45, -D / 2 + 0.04);
    portrait.userData = { action: 'about', hover: true };
    scene.add(portrait);
    clickables.push(portrait);
  }

  // Plante
  const plant = new THREE.Group();
  cyl(0.22, 0.17, 0.42, std(0xe8e6f0, 0.5), 0, 0.21, 0, plant);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e6b, roughness: 0.6, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + (i % 3) * 0.05, 0), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.15, 0.6 + (i % 3) * 0.18, Math.sin(a) * 0.15);
    leaf.castShadow = true;
    plant.add(leaf);
  }
  plant.position.set(4.3, 0, -4.3);
  scene.add(plant);
  // Easter egg: clicking the plant shows the hidden visitor counter
  if (profile.goatcounter) {
    plant.userData.action = 'stats';
    clickables.push(plant);
  }
}

// ---------- Mur gauche : fenêtre + tableau "À propos" ----------
{
  const winTex = canvasTex(800, 520, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1030');
    g.addColorStop(1, '#3b1d5a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.8 + 0.2})`;
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.6, 2, 2);
    }
    ctx.fillStyle = '#fef3c7';
    ctx.shadowColor = '#fde68a';
    ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(620, 120, 50, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    let x = 0;
    while (x < w) {
      const bw = 40 + Math.random() * 70;
      const bh = 120 + Math.random() * 230;
      ctx.fillStyle = '#0a0814';
      ctx.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 12; wy < h - 10; wy += 22)
        for (let wx = x + 8; wx < x + bw - 10; wx += 16)
          if (Math.random() > 0.6) {
            ctx.fillStyle = Math.random() > 0.5 ? '#fbbf24' : '#c4b5fd';
            ctx.fillRect(wx, wy, 7, 10);
          }
      x += bw + 4;
    }
  });
  const win = new THREE.Group();
  const winMat = new THREE.MeshBasicMaterial({ map: winTex.tex });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), winMat);
  win.add(pane);
  const frame = std(0xe8e6f0, 0.4);
  box(2.75, 0.08, 0.1, frame, 0, 0.89, 0, win);
  box(2.75, 0.08, 0.1, frame, 0, -0.89, 0, win);
  box(0.08, 1.78, 0.1, frame, -1.34, 0, 0, win);
  box(0.08, 1.78, 0.1, frame, 1.34, 0, 0, win);
  box(0.05, 1.7, 0.08, frame, 0, 0, 0, win);
  box(2.9, 0.06, 0.25, frame, 0, -0.95, 0.1, win);
  win.rotation.y = Math.PI / 2;
  win.position.set(-W / 2 + 0.03, 2.3, -2.3);
  scene.add(win);

  // Tableau en liège avec post-it (compétences)
  const board = new THREE.Group();
  box(2.5, 1.6, 0.06, std(0x8b6b4a, 0.95), 0, 0, 0, board);
  box(2.62, 0.06, 0.08, std(0x2b2840, 0.5), 0, 0.82, 0.01, board);
  box(2.62, 0.06, 0.08, std(0x2b2840, 0.5), 0, -0.82, 0.01, board);
  const aboutSign = makeSign({
    width: 2.3,
    height: 0.5,
    accent: COL.amber,
    lines: [{ text: 'ABOUT ME', size: 0.3, color: '#fde68a', spacing: '8px' }],
  });
  aboutSign.rotation.y = Math.PI / 2;
  aboutSign.position.set(-W / 2 + 0.05, 3.45, 1.6);
  scene.add(aboutSign);
  const noteColors = ['#fde68a', '#f9a8d4', '#a5f3fc', '#c4b5fd', '#bbf7d0', '#fed7aa'];
  (profile.boardSkills || profile.skills).slice(0, 6).forEach((skill, i) => {
    const t = canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = noteColors[i % noteColors.length];
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1f2937';
      ctx.font = '600 34px "Space Grotesk"';
      ctx.textAlign = 'center';
      const words = skill.split(' ');
      words.forEach((wd, k) => ctx.fillText(wd, w / 2, h / 2 + 10 + (k - (words.length - 1) / 2) * 40));
    });
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.9 }));
    note.position.set(-0.75 + (i % 3) * 0.75, 0.32 - Math.floor(i / 3) * 0.64, 0.04 + i * 0.001);
    note.rotation.z = ((i * 37) % 11 - 5) * 0.02;
    board.add(note);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), std(0xef4444, 0.3));
    pin.position.set(note.position.x, note.position.y + 0.2, 0.06);
    board.add(pin);
  });
  board.rotation.y = Math.PI / 2;
  board.position.set(-W / 2 + 0.04, 2.2, 1.6);
  board.userData = { action: 'about', hover: true };
  scene.add(board);
  clickables.push(board);
}

// ---------- Mur droit : projets ----------
{
  const t = makeSign({
    width: 3.6,
    height: 0.66,
    accent: COL.pink,
    lines: [{ text: 'MY PROJECTS', size: 0.36, color: '#fbcfe8', spacing: '10px' }],
  });
  t.rotation.y = -Math.PI / 2;
  t.position.set(W / 2 - 0.05, 3.82, 0);
  scene.add(t);

  const cols =[-3.45, -1.15, 1.15, 3.45];
  const rows = [2.75, 1.35];
  projects.slice(0, 8).forEach((p, i) => {
    const g = new THREE.Group();
    const fw = 2.0, fh = 1.18;
    box(fw + 0.12, fh + 0.12, 0.05, std(0x15131d, 0.4), 0, 0, 0, g);
    const nm = neon(p.color, 2.2);
    box(fw + 0.14, 0.025, 0.06, nm, 0, (fh + 0.12) / 2, 0.005, g);
    box(fw + 0.14, 0.025, 0.06, nm, 0, -(fh + 0.12) / 2, 0.005, g);
    box(0.025, fh + 0.14, 0.06, nm, -(fw + 0.12) / 2, 0, 0.005, g);
    box(0.025, fh + 0.14, 0.06, nm, (fw + 0.12) / 2, 0, 0.005, g);

    const tex = canvasTex(640, 376, (ctx, w, h) => drawProjectCard(ctx, w, h, p));
    const mat = new THREE.MeshBasicMaterial({ map: tex.tex });
    mat.color.setScalar(0.78); // reste sous le seuil du bloom
    if (p.image) loadCover(p.image, 640, 376, (img) => {
      tex.tex.dispose(); // free the placeholder card
      mat.map = img;
      mat.needsUpdate = true;
    });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), mat);
    pic.position.z = 0.03;
    g.add(pic);

    g.rotation.y = -Math.PI / 2;
    g.position.set(W / 2 - 0.05, rows[Math.floor(i / 4)], cols[i % 4]);
    g.userData = { action: 'project', index: i, hover: true };
    scene.add(g);
    clickables.push(g);
  });
}

function drawProjectCard(ctx, w, h, p) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, p.color);
  g.addColorStop(1, '#0f0d1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, w, 34);
  ['#f87171', '#fbbf24', '#34d399'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(22 + i * 22, 17, 6, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, 120, 9, 300, 16, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, 380, 70, 220, 170, 14); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  roundRect(ctx, 400, 90, 180, 90, 10); ctx.fill();
  ctx.fillStyle = '#ffffff';
  let fs = 50;
  ctx.font = `700 ${fs}px "Space Grotesk"`;
  while (ctx.measureText(p.title).width > 560 && fs > 24) ctx.font = `700 ${(fs -= 2)}px "Space Grotesk"`;
  ctx.fillText(p.title, 30, 120);
  ctx.font = '400 24px "Space Grotesk"';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(p.type, 32, 158);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, 32, 190, 150, 42, 21); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = '600 20px "Space Grotesk"';
  ctx.fillText('View project', 50, 218);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, h - 56, w, 56);
  ctx.font = '500 20px "JetBrains Mono"';
  ctx.fillStyle = '#e9d5ff';
  ctx.fillText(p.tech.join('  •  '), 30, h - 20);
}

// ---------- Particules ----------
{
  const n = 150;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * W;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = (Math.random() - 0.5) * D;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc4b5fd, size: 0.025, transparent: true, opacity: 0.6 }));
  scene.add(pts);
  animated.push((t, dt) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      a[i * 3 + 1] += dt * 0.08;
      if (a[i * 3 + 1] > H) a[i * 3 + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// ============================================================
//  Caméra, navigation et interface
// ============================================================
const isNarrow = () => window.innerWidth / window.innerHeight < 0.9;
const stations = {
  accueil: () => ({ pos: isNarrow() ? [4.2, 3.6, 9.5] : [5.2, 3.4, 6.6], target: [-0.4, 1.5, -2] }),
  apropos: () => ({ pos: isNarrow() ? [2.2, 2.2, 1.6] : [0.6, 2.2, 1.6], target: [-5, 2.2, 1.6] }),
  projets: () => {
    // recule la caméra pour que les 4 colonnes tiennent dans l'écran
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const dist = Math.min(9.3, Math.max(5.8, 5 / half));
    return { pos: [5 - dist, 2.1, 0], target: [5, 2.05, 0] };
  },
  contact: () => ({ pos: isNarrow() ? [-0.6, 1.9, 0.6] : [-0.6, 1.75, -1.6], target: [-0.8, 1.6, -5] }),
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
    lift: Math.min(0.5, angle * 0.15 + travel * 0.02),
    start: performance.now(),
    dur: 1300 + angle * 450 + travel * 60,
    done: () => {
      if (name === 'contact') openPanel(contactHTML());
      if (name === 'apropos') openPanel(aboutHTML());
    },
  };
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  hint.textContent =
    name === 'projets' ? 'Click a project to open it'
    : name === 'accueil' ? 'Scroll or use the arrow keys to look around'
    : '';
}
const helper = new THREE.PerspectiveCamera(); // a camera, so lookAt() uses the camera convention (-Z forward)
let parAmt = 0;
// smooth ease-in-out (sine) — gentler start/stop than cubic
const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Parallaxe souris
const mouse = new THREE.Vector2();
const parallax = new THREE.Vector2();
let pointerDirty = false; // hover ray is only cast when the mouse or camera moved
window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerDirty = true;
});

// Survol et clic
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

// Molette / clavier
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

// ---------- Panneaux HTML ----------
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const hint = document.getElementById('hint');
document.getElementById('panel-close').addEventListener('click', closePanel);
function openPanel(html) {
  panelBody.innerHTML = html;
  panel.classList.add('open');
}
function closePanel() {
  panel.classList.remove('open');
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function projectHTML(p) {
  return `
    <span class="tag" style="--c:${esc(p.color)}">${esc(p.type)}</span>
    <h2>${esc(p.title)}</h2>
    <p>${esc(p.description)}</p>
    <div class="chips">${p.tech.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    <div class="actions">
      ${p.link ? `<a class="btn primary" href="${esc(p.link)}" target="_blank" rel="noopener">Watch the demo</a>` : ''}
      ${p.code ? `<a class="btn" href="${esc(p.code)}" target="_blank" rel="noopener">Source code</a>` : ''}
      <a class="btn" href="${esc(profile.socials.github)}" target="_blank" rel="noopener">GitHub</a>
    </div>`;
}
function aboutHTML() {
  return `
    <div class="head">
      ${profile.photo ? `<img class="avatar" src="${esc(profile.photo)}" alt="${esc(profile.name)}" />` : ''}
      <div>
        <span class="tag" style="--c:#fbbf24">About me</span>
        <h2>${esc(profile.name)}</h2>
        <p class="role">${esc(profile.role)}</p>
      </div>
    </div>
    <p>${esc(profile.intro)}</p>
    ${profile.experience ? `<h3>Experience</h3><ul class="timeline">${profile.experience.map((e) => `<li><b>${esc(e.date)}</b><span>${esc(e.title)}<small>${esc(e.company)}</small>${e.mission ? `<em>${esc(e.mission)}</em>` : ''}${e.softSkills ? `<span class="soft">${e.softSkills.map((s) => `<i>${esc(s)}</i>`).join('')}</span>` : ''}</span></li>`).join('')}</ul>` : ''}
    ${profile.education ? `<h3>Education</h3><ul class="timeline">${profile.education.map((e) => `<li><b>${esc(e.date.slice(-4))}</b><span>${esc(e.title)}<small>${esc(e.school)}</small></span></li>`).join('')}</ul>` : ''}
    <h3>Skills</h3>
    <div class="chips">${profile.skills.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-go="projets">See my projects</button>
      ${profile.cv ? `<a class="btn" href="${esc(profile.cv)}" target="_blank" rel="noopener">Download CV</a>` : ''}
    </div>`;
}
function contactHTML() {
  return `
    <span class="tag" style="--c:#a78bfa">Contact</span>
    <h2>Let's work together</h2>
    <p>${profile.status ? `${esc(profile.status)}. ` : ''}Have an opportunity, a project or a question? Get in touch.</p>
    <ul class="contact-list">
      <li><span>Email</span><a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a></li>
      ${profile.phone ? `<li><span>Phone</span><a href="tel:${esc(profile.phone.replace(/\s/g, ''))}">${esc(profile.phone)}</a></li>` : ''}
    </ul>
    ${profile.contactForm ? `
    <form id="contact-form" class="contact-form" novalidate>
      <h3>Send me a message</h3>
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

// Liens sociaux
document.getElementById('s-github').href = profile.socials.github;
document.getElementById('s-linkedin').href = profile.socials.linkedin;
document.getElementById('s-instagram').href = profile.socials.instagram;
document.getElementById('s-mail').href = `mailto:${profile.email}`;
document.title = `${profile.name} — Portfolio`;

// ---------- Visitor counter (GoatCounter) ----------
// Every visit is recorded, but the number is hidden: it only shows when someone
// clicks the plant in the corner, or opens the site with ?stats in the URL.
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
    <span class="tag" style="--c:#7c3aed">Secret found</span>
    <h2>You found the secret plant</h2>
    <div class="stat"><b id="stat-n">…</b><span>visitors so far</span></div>
    <p>Thanks for exploring every corner of the room.</p>`);
  const n = await fetchVisitors();
  const el = document.getElementById('stat-n');
  if (el) el.textContent = n ?? 'unavailable';
}

// ---------- Boucle ----------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = isNarrow() ? 68 : 50;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  if (!tween && stations[current] && document.getElementById('intro').classList.contains('hide')) {
    const s = stations[current]();
    cam.pos.set(...s.pos);
    cam.target.set(...s.target);
  }
}
window.addEventListener('resize', onResize);
onResize();

// ---------- Performance ----------
// Merge every static mesh that shares a material into a single mesh
// (per clickable group, so hover/click still work). ~225 draw calls -> far fewer.
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
  const q = QUALITY[qLevel];
  renderer.setPixelRatio(q.pr);
  composer.setPixelRatio(q.pr);
  bloom.enabled = q.bloom;
  onResize();
}
applyQuality();

// Lowers resolution, then bloom, if the device can't keep ~45 fps
let sampleTime = 0, sampleFrames = 0, measureFrom = Infinity;
function adaptQuality(dt) {
  if (performance.now() < measureFrom || qLevel >= QUALITY.length - 1) return;
  sampleTime += dt;
  sampleFrames++;
  if (sampleTime < 2) return;
  const avg = sampleTime / sampleFrames;
  sampleTime = 0;
  sampleFrames = 0;
  if (avg > 1 / 45) {
    qLevel++;
    applyQuality();
    measureFrom = performance.now() + 1000;
  }
}

if (location.search.includes('debug')) window.__three = { renderer, scene, camera, composer, quality: () => qLevel, ui: { openPanel, contactHTML, aboutHTML } };

renderer.compile(scene, camera); // compile shaders up front so entering doesn't stutter
let entered = false;
const hoverScale = new THREE.Vector3(1.04, 1.04, 1.04);
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (!entered) return; // nothing to draw behind the opaque intro screen
  adaptQuality(dt);

  parallax.lerp(mouse, 0.05);
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
    // parallax fades back in after a move so there is no jump at the end
    const strength = current === 'accueil' ? 0.5 : 0.12;
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
    }
  }
  if (hovered) hovered.scale.lerp(hoverScale, 0.2);

  composer.render();
}
frame();

// Intro
document.getElementById('loader').classList.add('hide');
document.getElementById('enter').addEventListener('click', () => {
  document.getElementById('intro').classList.add('hide');
  entered = true;
  clock.getDelta();
  measureFrom = performance.now() + 2500; // let the first frames settle before judging speed
  goTo('accueil');
  if (new URLSearchParams(location.search).has('stats')) setTimeout(openStats, 1800);
});
