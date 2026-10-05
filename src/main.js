import * as THREE from 'three';
import { createMaterials, shared } from './materials.js';
import { buildWorld, FOG_COLOR } from './world.js';
import { Rain, Fire, Smoke, Mist, Particles, fxUniforms } from './effects.js';
import { Post } from './post.js';
import { Game, roman } from './game.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const QUALITY = {
  low: { pr: 0.75, msaa: 0, ao: false, shadow: 1024, grass: 0.25, rain: 7000, lights: 6 },
  high: { pr: 1, msaa: 4, ao: false, shadow: 2048, grass: 0.6, rain: 16000, lights: 10 },
  ultra: { pr: Math.min(devicePixelRatio, 2), msaa: 4, ao: true, shadow: 4096, grass: 1, rain: 28000, lights: 14 },
};
let qName = 'ultra';

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(QUALITY[qName].pr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0078);
scene.background = FOG_COLOR.clone();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1600);
camera.position.set(0, 4, 32);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x8a96a8, 0x2a2018, 0.75); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xc4ccd8, 1.5);
moon.position.set(-38, 62, 30); moon.target.position.set(0, 0, 0);
moon.castShadow = true;
Object.assign(moon.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 10, far: 180 });
moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04; moon.shadow.radius = 2.5;
scene.add(moon, moon.target);
const warmFill = new THREE.DirectionalLight(0xffa860, 0.25); warmFill.position.set(30, 10, -40); scene.add(warmFill);

const ui = {
  hp: $('hpfill'), st: $('stfill'), wave: $('waveLabel'), kills: $('kills'), ebars: $('enemyBars'),
  announce(title, sub) { const a = $('announce'); a.innerHTML = `${title}<small>${sub || ''}</small>`; a.classList.add('show'); clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove('show'), 3800); },
  end(won, g) {
    document.exitPointerLock?.(); g.running = false;
    $('endTitle').textContent = won ? 'Winterhold Stands' : 'You Have Fallen';
    $('endText').textContent = won ? `The Black Champion lies dead in the mud. ${g.kills} of the Crimson Host were slain. The North remembers.` : `You fell during wave ${roman(Math.max(1, g.wave))} after slaying ${g.kills}. The rain washes the blood from the stones.`;
    $('againBtn').textContent = won ? 'Fight again' : 'Rise again';
    $('end').classList.remove('hidden');
  },
};

const setLoad = (label, f) => { $('loadtext').textContent = label; $('loadfill').style.width = `${Math.round(f * 100)}%`; };

async function init() {
  const M = await createMaterials(setLoad, renderer.capabilities.getMaxAnisotropy());
  await new Promise((r) => setTimeout(r, 0));
  const world = buildWorld(scene, M, QUALITY[qName]);
  setLoad('Lighting the torches', 0.88); await new Promise((r) => setTimeout(r, 0));

  // environment map from the stormy sky for metal reflections
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(world.sky.clone());
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.8, 0.6) });
    for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), warm); const a = (i / 8) * Math.PI * 2; s.position.set(Math.cos(a) * 60, 4, Math.sin(a) * 60); envScene.add(s); }
    const groundE = new THREE.Mesh(new THREE.CircleGeometry(400, 16), new THREE.MeshBasicMaterial({ color: 0x1a1612 })); groundE.rotation.x = -Math.PI / 2; groundE.position.y = -2; envScene.add(groundE);
    const env = pm.fromScene(envScene, 0.02, 1, 1000).texture;
    scene.environment = env; scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  // effects
  const litTorches = world.torches;
  const fire = new Fire(scene, litTorches);
  const smokeSpots = [...world.smokeSpots, ...litTorches.filter((t) => t.scale > 1.05).map((t) => t.pos.clone().add(new THREE.Vector3(0, 0.6, 0)))];
  const smoke = new Smoke(scene, smokeSpots, M.puff);
  const rain = new Rain(scene, 30000);
  const mist = new Mist(scene, M.puff, new THREE.Color(0x9aa2ac));
  const sparks = new Particles(scene, 1500, true);
  const blood = new Particles(scene, 1500, false);
  const fx = { sparks, blood };

  // torch light pool: nearest torches to the camera receive real point lights
  const lightPool = [];
  for (let i = 0; i < 14; i++) { const l = new THREE.PointLight(0xff8a3c, 0, 20, 2); scene.add(l); lightPool.push({ l, t: null, seed: Math.random() * 100 }); }
  const lightTorches = litTorches.filter((t) => t.light);
  const flash = new THREE.PointLight(0xffc080, 0, 9, 2); scene.add(flash); let flashT = 0;

  const post = new Post(renderer, scene, camera);
  post.hide.push(rain.mesh, rain.ripples, ...mist.cards);

  const audio = new Audio();
  const game = new Game({ scene, camera, M, world, audio, fx, ui });
  window.__game = game;
  game.onFlash = (p) => { flash.position.copy(p); flashT = 1; };
  game.trailMeshes = () => [game.player.trail.mesh, ...game.enemies.map((e) => e.trail.mesh)];

  function applyQuality(name) {
    qName = name; const q = QUALITY[name];
    document.querySelectorAll('.quality button').forEach((b) => b.classList.toggle('active', b.dataset.q === name));
    renderer.setPixelRatio(q.pr); renderer.setSize(innerWidth, innerHeight);
    moon.shadow.mapSize.set(q.shadow, q.shadow); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
    world.grass.count = Math.floor(world.grass.userData.max * q.grass);
    rain.setCount(q.rain);
    lightPool.forEach((p, i) => (p.l.visible = i < q.lights));
    post.build(q);
    fxUniforms.uViewH.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  }
  applyQuality(qName);

  setLoad('Compiling shaders', 0.94); await new Promise((r) => setTimeout(r, 0));
  game.update(0.016, 0);
  try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
  setLoad('Ready', 1);

  // ---------------------------------------------------------------- UI / input
  $('loading').classList.add('hidden'); $('title').classList.remove('hidden');
  document.querySelectorAll('.quality button').forEach((b) => b.addEventListener('click', () => applyQuality(b.dataset.q)));
  let attract = true;
  const lock = () => { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {} };
  $('startBtn').addEventListener('click', () => {
    $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
    audio.start(); attract = false; game.reset(); game.running = true; lock();
  });
  $('againBtn').addEventListener('click', (e) => { e.stopPropagation(); $('end').classList.add('hidden'); game.reset(); game.running = true; lock(); });
  $('pause').addEventListener('click', () => { $('pause').classList.add('hidden'); lock(); });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && hadLock && game.running && !game.over && $('end').classList.contains('hidden')) { paused = true; $('pause').classList.remove('hidden'); }
    if (locked) { paused = false; hadLock = true; } else hadLock = false;
  });
  let paused = false, hadLock = false, dragging = false;
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas || (dragging && game.running)) game.onMouseMove(e.movementX, e.movementY); });
  addEventListener('mousedown', () => (dragging = true)); addEventListener('mouseup', () => (dragging = false));
  canvas.addEventListener('mousedown', (e) => { if (document.pointerLockElement !== canvas && game.running) lock(); game.onMouseDown(e.button); });
  addEventListener('mouseup', (e) => game.onMouseUp(e.button));
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') applyQuality('low'); if (e.code === 'Digit2') applyQuality('high'); if (e.code === 'Digit3') applyQuality('ultra');
    if (e.code === 'Space') e.preventDefault();
    game.onKey(e.code, true);
  });
  addEventListener('keyup', (e) => game.onKey(e.code, false));
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); post.setSize();
    fxUniforms.uViewH.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  });

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let time = 0, lightning = 0, nextBolt = 6, lightAssignT = 0, fpsAcc = 0, fpsN = 0;
  const tmpV = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    const rawDt = clock.getDelta(); let dt = Math.min(rawDt, 0.05);
    fpsAcc += rawDt; fpsN++; if (fpsAcc > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${qName}`; fpsAcc = 0; fpsN = 0; }
    if (paused) dt = 0;
    let gdt = dt;
    if (game.hitStop > 0) { game.hitStop -= dt; gdt = dt * 0.08; }
    time += dt; shared.uTime.value = time;

    // attract mode: slow orbit around the courtyard before the game starts
    if (attract) {
      const a = time * 0.05;
      camera.position.set(Math.sin(a) * 26, 6 + Math.sin(time * 0.1) * 1.5, 18 + Math.cos(a) * 10);
      camera.lookAt(0, 6, -30);
      game.player.animate(dt, time);
    } else game.update(gdt, time);

    // lightning
    nextBolt -= dt;
    if (nextBolt < 0) { lightning = 1; nextBolt = 9 + Math.random() * 16; audio.thunder(0.6 + Math.random() * 1.6); }
    lightning = Math.max(0, lightning - dt * 2.6);
    const strobe = lightning > 0 ? lightning * (0.6 + 0.4 * Math.sin(time * 60)) : 0;
    world.sky.material.uniforms.uFlash.value = strobe; fxUniforms.uFlash.value = strobe;
    moon.intensity = 1.5 + strobe * 9; hemi.intensity = 0.75 + strobe * 2;

    // torch light pool assignment + flicker
    lightAssignT -= dt;
    if (lightAssignT <= 0) {
      lightAssignT = 0.25;
      const cp = camera.position;
      const look = new THREE.Vector3(); camera.getWorldDirection(look);
      const scored = lightTorches.map((t) => { tmpV.subVectors(t.pos, cp); const d = tmpV.length(); const front = tmpV.normalize().dot(look); return { t, s: d * (front < -0.2 ? 2.5 : 1) / t.scale }; }).sort((a, b) => a.s - b.s);
      const n = QUALITY[qName].lights; const chosen = new Set(scored.slice(0, n).map((x) => x.t));
      // keep existing assignments, fill free slots
      const free = [];
      for (let i = 0; i < n; i++) { const p = lightPool[i]; if (!p.t || !chosen.has(p.t)) { p.t = null; free.push(p); } else chosen.delete(p.t); }
      for (const t of chosen) { const p = free.shift(); if (!p) break; p.t = t; p.fade = 0; p.l.position.copy(t.pos); p.l.position.y += 0.35; }
    }
    for (const p of lightPool) {
      if (!p.t || !p.l.visible) { p.l.intensity = 0; continue; }
      p.fade = Math.min(1, (p.fade || 0) + dt * 3);
      const f = 0.82 + Math.sin(time * 13 + p.seed) * 0.08 + Math.sin(time * 27.3 + p.seed * 2) * 0.06 + Math.sin(time * 5.1 + p.seed) * 0.05;
      p.l.intensity = 20 * Math.sqrt(p.t.scale) * f * p.fade; p.l.distance = 16 + p.t.scale * 5;
    }
    flashT = Math.max(0, flashT - dt * 9); flash.intensity = flashT * 60;

    fxUniforms.uCam.value.copy(camera.position);
    mist.update(time, camera);
    sparks.update(gdt); blood.update(gdt);
    // AO pass ignores transparent FX
    post.hide.length = 0; post.hide.push(rain.mesh, rain.ripples, ...mist.cards, ...game.trailMeshes());
    const g = post.grade.uniforms; g.uTime.value = time; g.uDamage.value = game.damageFlash || 0; g.uFlash.value = strobe;
    post.render(dt);
  }
  frame();
}

init().catch((e) => { console.error(e); $('loadtext').textContent = 'Error: ' + e.message; });
