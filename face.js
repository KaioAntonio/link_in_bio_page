// Voxel hologram of the hero face.
// images/face-voxels.png packs: R = luminance, G = depth, A = mask (104x104).

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";
const MAP_URL = "./images/face-voxels.png";

const stage = document.getElementById("faceStage");
const canvas = document.getElementById("faceCanvas");
const hudCount = document.getElementById("faceHudCount");
const hudRot = document.getElementById("faceHudRot");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

const DEPTH = 30; // how far the nose sticks out, in cells
const PIVOT = { x: -3.2, y: 7.6, z: DEPTH * 0.45 }; // roughly the center of the head
const INTRO_ROW_SPREAD = 1.1;
const INTRO_DURATION = 0.7;

// Green phosphor ramp, in the site's accent color (#39ff88)
const RAMP = [
  [0.0, [0.01, 0.06, 0.035]],
  [0.35, [0.025, 0.17, 0.09]],
  [0.7, [0.22, 1.0, 0.53]],
  [1.0, [0.82, 1.0, 0.9]],
];

function ramp(l) {
  for (let i = 1; i < RAMP.length; i++) {
    const [p1, c1] = RAMP[i];
    if (l <= p1) {
      const [p0, c0] = RAMP[i - 1];
      const t = (l - p0) / (p1 - p0);
      return c0.map((v, k) => v + (c1[k] - v) * t);
    }
  }
  return RAMP[RAMP.length - 1][1];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function readCells(img) {
  const n = img.width;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, n, n).data;

  const cells = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4;
      if (data[o + 3] < 128) continue;
      cells.push({
        x: i - n / 2 + 0.5,
        y: n / 2 - j - 0.5,
        depth: (data[o + 1] / 255) * DEPTH,
        lum: data[o] / 255,
        row: j,
      });
    }
  }
  return { n, cells };
}

function buildRoom(THREE) {
  const R = 175;
  const cz = 30;
  const y0 = -64;
  const y1 = 140;
  const pts = [];
  const push = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const onWall = (deg, y) => {
    const a = (deg * Math.PI) / 180;
    return [R * Math.sin(a), y, cz - R * Math.cos(a)];
  };

  for (let d = -78; d <= 78; d += 6.5) push(onWall(d, y0), onWall(d, y1));
  for (let y = y0; y <= y1; y += 13) {
    for (let d = -78; d < 78; d += 3.25) push(onWall(d, y), onWall(d + 3.25, y));
  }
  // floor, clipped to the inside of the curved wall
  for (let x = -R + 10; x < R; x += 13) {
    const zb = cz - Math.sqrt(R * R - x * x);
    push([x, y0, zb], [x, y0, cz + 80]);
  }
  for (let z = cz - R + 13; z < cz + 80; z += 13) {
    const h = Math.sqrt(Math.max(0, R * R - (z - cz) ** 2));
    push([-h, y0, z], [h, y0, z]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x39ff88,
    transparent: true,
    opacity: 0.34,
    fog: true,
  });
  return new THREE.LineSegments(geo, mat);
}

async function start() {
  const [THREE, img] = await Promise.all([import(THREE_URL), loadImage(MAP_URL)]);
  const { n, cells } = readCells(img);
  const count = cells.length;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030506, 0.003);

  const camera = new THREE.PerspectiveCamera(28, 1, 1, 2000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const key = new THREE.DirectionalLight(0xffffff, 4.4);
  key.position.set(150, 60, 55);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4da3ff, 1.4);
  rim.position.set(-90, 20, -20);
  scene.add(rim);

  scene.add(buildRoom(THREE));

  // Voxels: one column per cell, front face at the cell's depth
  const box = new THREE.BoxGeometry(0.8, 0.8, 1);
  box.translate(0, 0, -0.5);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(box, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const head = new THREE.Group();
  mesh.position.set(-PIVOT.x, -PIVOT.y, -PIVOT.z);
  head.add(mesh);
  scene.add(head);

  // Per-cell data in flat arrays for a cheap per-frame update
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const len = new Float32Array(count);
  const row = new Uint8Array(count);
  const delay = new Float32Array(count);
  const base = new Float32Array(count * 3);
  cells.forEach((c, k) => {
    px[k] = c.x;
    py[k] = c.y;
    pz[k] = c.depth;
    len[k] = 2.4;
    row[k] = c.row;
    delay[k] = (c.row / n) * INTRO_ROW_SPREAD + Math.random() * 0.35;
    const l = Math.min(1, Math.max(0, (c.lum - 0.1) / 0.8));
    const rgb = ramp(l * l * (3 - 2 * l));
    base[k * 3] = rgb[0];
    base[k * 3 + 1] = rgb[1];
    base[k * 3 + 2] = rgb[2];
  });

  const mArr = mesh.instanceMatrix.array;
  const cArr = mesh.instanceColor.array;
  const rowShift = new Float32Array(n);

  function writeCells(t, bandY) {
    for (let k = 0; k < count; k++) {
      const p = Math.min(1, Math.max(0, (t - delay[k]) / INTRO_DURATION));
      const e = 1 - (1 - p) ** 3;
      const scan = bandY === null ? 0 : Math.max(0, 1 - Math.abs(py[k] - bandY) / 3.5);
      const o = k * 16;
      const s = e;
      mArr[o] = s;
      mArr[o + 5] = s;
      mArr[o + 10] = Math.max(0.0001, len[k] * e);
      mArr[o + 12] = px[k] + rowShift[row[k]];
      mArr[o + 13] = py[k];
      mArr[o + 14] = pz[k] - (1 - e) * 70 + scan * 1.8;
      mArr[o + 15] = 1;

      const flash = Math.min(1, (1 - e) * 1.6 + scan * 0.85);
      const c = k * 3;
      cArr[c] = base[c] + (1 - base[c]) * flash * 0.8;
      cArr[c + 1] = base[c + 1] + (1 - base[c + 1]) * flash * 0.8;
      cArr[c + 2] = base[c + 2] + (1 - base[c + 2]) * flash * 0.8;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  if (hudCount) hudCount.textContent = `${count.toLocaleString("pt-BR")} VOXELS`;

  // Framing: keep the head and shoulders in view at any aspect ratio
  const wideQuery = window.matchMedia("(min-width: 1080px)");
  let viewY = 1;
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    // wide layout: text sits beside the face, so it can fill the stage;
    // stacked layout: leave the chin clear of the name below it
    const wide = wideQuery.matches;
    const visH = wide ? Math.max(92, 76 / camera.aspect) : Math.max(108, 80 / camera.aspect);
    viewY = wide ? 1 : -4;
    const dist = visH / 2 / Math.tan(halfFov);
    camera.position.set(0, viewY, dist);
    camera.lookAt(0, viewY, 0);
    camera.updateProjectionMatrix();
    if (!running) renderer.render(scene, camera);
  }

  // Pointer → head turns toward the cursor
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let lastPointer = -Infinity;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      target.y = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      target.x = THREE.MathUtils.clamp((e.clientY - (r.top + r.height * 0.4)) / (r.height / 2), -1, 1);
      lastPointer = performance.now();
    },
    { passive: true }
  );

  // Glitch: a few rows of voxels slip sideways for a moment
  let glitchUntil = 0;
  let nextGlitch = 2.6;
  function triggerGlitch(t) {
    rowShift.fill(0);
    const bands = 1 + Math.floor(Math.random() * 3);
    for (let b = 0; b < bands; b++) {
      const start = Math.floor(Math.random() * n);
      const size = 2 + Math.floor(Math.random() * 7);
      const dx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 7);
      for (let r = start; r < Math.min(n, start + size); r++) rowShift[r] = dx;
    }
    glitchUntil = t + 0.08 + Math.random() * 0.16;
    nextGlitch = t + (Math.random() < 0.3 ? 0.25 : 3 + Math.random() * 4);
    stage.classList.add("is-glitch");
  }
  function clearGlitch() {
    rowShift.fill(0);
    stage.classList.remove("is-glitch");
  }

  // Scan band sweeping down the face every few seconds
  const SCAN_EVERY = 6.5;
  const SCAN_TIME = 1.6;
  const SCAN_FIRST = INTRO_ROW_SPREAD + INTRO_DURATION + 1.2;
  const scanTop = n / 2 + 4;
  const scanBottom = -n / 2 - 4;

  let running = false;
  let visible = true;
  let raf = 0;
  let t0 = performance.now();
  let introDone = reduceMotion;
  let wasDirty = true;
  let frame = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const t = (now - t0) / 1000;

    // head rotation
    const idle = !finePointer || now - lastPointer > 4000;
    const tx = idle ? Math.sin(t * 0.35) * 0.06 : target.x * 0.12;
    const ty = idle ? Math.sin(t * 0.5) * 0.18 : target.y * 0.28;
    current.x += (tx - current.x) * 0.06;
    current.y += (ty - current.y) * 0.06;
    head.rotation.x = current.x;
    head.rotation.y = current.y;
    head.position.y = Math.sin(t * 1.3) * 0.6;
    camera.position.x = -current.y * 6;
    camera.lookAt(0, viewY, 0);

    // glitch
    let dirty = false;
    if (introDone && t >= nextGlitch && glitchUntil < t) {
      triggerGlitch(t);
      dirty = true;
    } else if (glitchUntil && t > glitchUntil) {
      glitchUntil = 0;
      clearGlitch();
      dirty = true;
    }

    // scan band
    let bandY = null;
    if (introDone && t > SCAN_FIRST) {
      const phase = (t - SCAN_FIRST) % SCAN_EVERY;
      if (phase < SCAN_TIME) bandY = scanTop + (scanBottom - scanTop) * (phase / SCAN_TIME);
    }

    if (!introDone) {
      dirty = true;
      if (t > INTRO_ROW_SPREAD + 0.35 + INTRO_DURATION) introDone = true;
    }
    if (bandY !== null || glitchUntil) dirty = true;

    if (dirty || wasDirty) writeCells(introDone ? 1e3 : t, bandY);
    wasDirty = dirty;

    if (hudRot && ++frame % 6 === 0) {
      const fmt = (v) => (v >= 0 ? "+" : "-") + Math.abs((v * 180) / Math.PI).toFixed(1).padStart(4, "0");
      hudRot.textContent = `ROT X${fmt(current.x)} Y${fmt(current.y)}`;
    }

    renderer.render(scene, camera);
  }

  function play() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? play() : pause();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  new ResizeObserver(resize).observe(stage);

  writeCells(reduceMotion ? 1e3 : 0, null);
  resize();
  stage.classList.add("is-ready");
  t0 = performance.now();
  if (reduceMotion) renderer.render(scene, camera);
  else play();
}

if (stage && canvas) {
  start().catch((err) => {
    console.warn("[face] falling back to photo:", err);
    stage.classList.add("is-fallback");
  });
}
