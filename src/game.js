// Gameplay: fighters (player + AI), melee combat, camera, waves.
import * as THREE from 'three';
import { KnightModel, POSES, fullPose, blendPose, overlayPose, clonePose } from './characters.js';
import { SwordTrail } from './effects.js';

const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

const ATTACKS = {
  A: { wind: 'slashA_wind', hit: 'slashA_hit', windEnd: 0.24, hitEnd: 0.4, dur: 0.62, dmg: 24, reach: 2.4, cos: 0.25, lunge: 3.2, stam: 12 },
  B: { wind: 'slashB_wind', hit: 'slashB_hit', windEnd: 0.28, hitEnd: 0.44, dmg: 28, dur: 0.68, reach: 2.5, cos: 0.55, lunge: 3.6, stam: 14 },
  C: { wind: 'slashC_wind', hit: 'slashC_hit', windEnd: 0.26, hitEnd: 0.43, dmg: 34, dur: 0.72, reach: 2.5, cos: 0.2, lunge: 3.4, stam: 16 },
  H: { wind: 'heavy_wind', hit: 'heavy_hit', windEnd: 0.6, hitEnd: 0.78, dmg: 60, dur: 1.2, reach: 2.8, cos: 0.4, lunge: 4.5, stam: 30, heavy: true },
};
const COMBO = { A: 'B', B: 'C', C: 'A' };
const PRE = {}; for (const k in ATTACKS) { PRE[k] = { wind: fullPose(POSES[ATTACKS[k].wind]), hit: fullPose(POSES[ATTACKS[k].hit]) }; }
const GUARD = fullPose();
const GUARD_SHIELD = fullPose(POSES.shieldGuard);
const BLOCK_SWORD = fullPose(POSES.swordBlock);
const BLOCK_SHIELD = fullPose(POSES.shieldGuard, POSES.shieldBlock);
const HIT = POSES.hit, DODGE = POSES.dodge;

class Fighter {
  constructor(game, o) {
    this.game = game; this.isPlayer = !!o.player; this.boss = !!o.boss;
    this.model = new KnightModel({ mats: game.M, house: o.house, shield: o.shield, scale: o.scale || 1 });
    this.scale = o.scale || 1; this.shield = !!o.shield;
    game.scene.add(this.model.root);
    this.pos = o.pos.clone(); this.yaw = o.yaw || 0; this.vel = new THREE.Vector3();
    this.hp = this.maxHp = o.hp; this.dmgMul = o.dmgMul || 1; this.timeMul = o.timeMul || 1;
    this.radius = 0.45 * this.scale;
    this.state = 'idle'; this.t = 0; this.atk = null; this.queued = null; this.hitSet = new Set();
    this.phase = Math.random() * 6; this.speed = 0; this.blockW = 0; this.hitW = 0; this.dodgeW = 0;
    this.blocking = false; this.dead = false; this.deadT = 0; this.iframe = 0; this.poise = o.poise || 0;
    this.pose = clonePose(GUARD); this.tmp = clonePose(GUARD); this.tmp2 = clonePose(GUARD);
    this.trail = new SwordTrail(game.scene, o.player ? new THREE.Color(1.2, 1.4, 1.9) : new THREE.Color(1.9, 0.9, 0.5));
    this.wb = new THREE.Vector3(); this.wt = new THREE.Vector3();
    this.stepAcc = 0;
  }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  chest() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.35 * this.scale, this.pos.z); }

  startAttack(type) {
    const a = ATTACKS[type];
    this.atk = { type, def: a, t: 0, mul: this.timeMul, swung: false }; this.state = 'attack'; this.t = 0; this.hitSet.clear(); this.queued = null;
    return a;
  }
  inActive() { if (this.state !== 'attack') return false; const a = this.atk, t = a.t / a.mul; return t > a.def.windEnd - 0.03 && t < a.def.hitEnd; }

  takeHit(src, dmg, heavy) {
    if (this.dead) return 'none';
    if (this.iframe > 0) return 'dodged';
    const toSrc = new THREE.Vector3().subVectors(src.pos, this.pos).setY(0).normalize();
    const facing = this.forward.dot(toSrc);
    const g = this.game;
    if (this.blocking && facing > 0.3 && !(heavy && !this.isPlayer)) {
      if (this.isPlayer) {
        g.stamina -= dmg * 0.8;
        if (g.stamina < 0) { g.stamina = 0; this.blocking = false; this.applyDamage(dmg * 0.5, src, true); return 'broken'; }
      }
      if (!src.boss) src.stagger(src.isPlayer ? 0.28 : 0.65);
      return 'blocked';
    }
    this.applyDamage(dmg, src, heavy);
    return 'hit';
  }
  applyDamage(dmg, src, heavy) {
    this.hp -= dmg; this.hitW = 1;
    if (this.hp <= 0) { this.die(src); return; }
    if (!this.boss || heavy || Math.random() < 0.25) this.stagger(heavy ? 0.6 : 0.38);
  }
  stagger(d) { if (this.dead) return; this.state = 'hit'; this.t = 0; this.staggerDur = d; this.atk = null; this.hitW = 1; }
  die(src) {
    this.dead = true; this.state = 'dead'; this.t = 0; this.atk = null;
    const away = new THREE.Vector3().subVectors(this.pos, src.pos).setY(0).normalize();
    this.yaw = Math.atan2(-away.x, -away.z); // face the killer, fall backward
    this.vel.copy(away).multiplyScalar(2.5);
  }

  /** Locomotion + action pose blending. */
  animate(dt, time) {
    const s = clamp(this.speed / 4.2, 0, 1.7);
    this.phase += dt * (2.2 + this.speed * 1.55);
    const ph = this.phase; const L = this.tmp; const base = this.shield ? GUARD_SHIELD : GUARD;
    for (const k in base) { if (Array.isArray(base[k])) { L[k][0] = base[k][0]; L[k][1] = base[k][1]; L[k][2] = base[k][2]; } }
    L.hipsY = base.hipsY;
    const sw = Math.sin(ph), cw = Math.cos(ph);
    L.lHip[0] += sw * 0.6 * s; L.rHip[0] -= sw * 0.6 * s;
    L.lKnee[0] += Math.max(0, cw) * 0.95 * s; L.rKnee[0] += Math.max(0, -cw) * 0.95 * s;
    L.hipsY += -Math.abs(cw) * 0.05 * s + Math.sin(time * 1.7) * 0.006;
    L.spine[0] += 0.1 * s; L.chest[1] += sw * 0.1 * s; L.chest[0] += Math.sin(time * 1.8) * 0.02;
    if (!this.shield) { L.lShoulder[0] -= sw * 0.45 * s; }
    L.rShoulder[0] += sw * 0.12 * s;

    let P = L;
    if (this.state === 'attack' && this.atk) {
      const a = this.atk.def, t = this.atk.t / this.atk.mul, pre = PRE[this.atk.type];
      const A = this.tmp2;
      if (t < a.windEnd) blendPose(A, base, pre.wind, ease(t / a.windEnd));
      else if (t < a.hitEnd) blendPose(A, pre.wind, pre.hit, easeOut((t - a.windEnd) / (a.hitEnd - a.windEnd)));
      else blendPose(A, pre.hit, base, ease((t - a.hitEnd) / (a.dur - a.hitEnd)));
      if (this.shield) { A.lShoulder = base.lShoulder.slice(); A.lElbow = base.lElbow.slice(); }
      overlayPose(this.pose, L, A, 1); P = this.pose;
      // keep legs from locomotion if moving slowly, else from attack
    } else { overlayPose(this.pose, L, {}, 0); P = this.pose; }
    this.blockW += ((this.blocking ? 1 : 0) - this.blockW) * Math.min(1, dt * 14);
    if (this.blockW > 0.01) overlayPose(P, P, this.shield ? BLOCK_SHIELD : BLOCK_SWORD, this.blockW);
    this.dodgeW += ((this.state === 'dodge' ? 1 : 0) - this.dodgeW) * Math.min(1, dt * 16);
    if (this.dodgeW > 0.01) overlayPose(P, P, DODGE, this.dodgeW);
    if (this.hitW > 0.01) { overlayPose(P, P, HIT, this.hitW * 0.9); this.hitW = Math.max(0, this.hitW - dt * 3.2); }
    this.model.applyPose(P);
    // root
    const r = this.model.root;
    r.position.copy(this.pos); r.rotation.y = this.yaw;
    if (this.dead) {
      const k = ease(clamp(this.t / 0.75, 0, 1));
      r.rotation.x = -1.45 * k; r.position.y = this.pos.y + 0.12 * this.scale * k - Math.max(0, this.t - 8) * 0.25;
      const j = this.model.j; j.lShoulder.rotation.z = 1.2 * k; j.rShoulder.rotation.z = -1.0 * k; j.neck.rotation.x = -0.5 * k; j.lKnee.rotation.x = 0.4 * k;
    } else r.rotation.x = 0;
    this.model.updateCape(time, this.speed, this.state === 'attack' ? 0.3 : 0);
    r.updateMatrixWorld(true);
    this.model.bladeBase.getWorldPosition(this.wb); this.model.bladeTip.getWorldPosition(this.wt);
    this.trail.update(this.wb, this.wt, this.inActive() || (this.state === 'attack' && this.atk.def.heavy && this.atk.t / this.atk.mul > this.atk.def.windEnd - 0.1 && this.atk.t / this.atk.mul < this.atk.def.hitEnd + 0.05), dt);
  }

  /** Advance timers & attack resolution. Returns nothing. */
  tick(dt, targets) {
    this.t += dt; this.iframe = Math.max(0, this.iframe - dt);
    const g = this.game;
    if (this.state === 'attack') {
      const a = this.atk; a.t += dt; const def = a.def, t = a.t / a.mul;
      if (!a.swung && t > def.windEnd - 0.06) { a.swung = true; g.audio.swing(def.heavy); }
      if (t > def.windEnd - 0.08 && t < def.hitEnd) this.vel.addScaledVector(this.forward, def.lunge * dt * 6 / a.mul * (this.isPlayer ? 1 : 0.6));
      if (this.inActive()) {
        for (const tg of targets) {
          if (tg.dead || this.hitSet.has(tg)) continue;
          const d = new THREE.Vector3().subVectors(tg.pos, this.pos).setY(0); const dist = d.length() - tg.radius;
          if (dist > def.reach * this.scale) continue;
          d.normalize(); if (this.forward.dot(d) < def.cos && dist > 0.5) continue;
          this.hitSet.add(tg);
          g.resolveHit(this, tg, def.dmg * this.dmgMul, !!def.heavy);
        }
      }
      if (this.queued && t > def.hitEnd) { const q = this.queued; this.queued = null; this.startAttack(q); }
      else if (t >= def.dur) { this.state = 'idle'; this.atk = null; }
    } else if (this.state === 'hit') { if (this.t > this.staggerDur) this.state = 'idle'; }
    else if (this.state === 'dodge') { if (this.t > 0.45) this.state = 'idle'; }
  }
}

export class Game {
  constructor({ scene, camera, M, world, audio, fx, ui }) {
    Object.assign(this, { scene, camera, M, world, audio, fx, ui });
    this.colliders = world.colliders; this.playerCols = [...world.colliders, ...world.playerOnly];
    this.keys = {}; this.mouse = { l: false, r: false };
    this.camYaw = Math.PI; this.camPitch = 0.12; this.camDist = 4.6; this.trauma = 0; this.hitStop = 0;
    this.camPos = new THREE.Vector3(0, 3, 26); this.camTarget = new THREE.Vector3();
    this.enemies = []; this.kills = 0; this.wave = 0; this.waveState = 'idle'; this.waveT = 0; this.toSpawn = 0;
    this.running = false;
    this.reset();
  }
  reset() {
    if (this.player) { this.scene.remove(this.player.model.root); this.player.trail.dispose(this.scene); }
    for (const e of this.enemies) { this.scene.remove(e.model.root); e.trail.dispose(this.scene); e.bar?.remove(); }
    this.enemies = [];
    this.player = new Fighter(this, { player: true, house: 'wolf', pos: new THREE.Vector3(0, 0, 22), yaw: Math.PI, hp: 100 });
    this.stamina = 100; this.kills = 0; this.wave = 0; this.waveState = 'intro'; this.waveT = 0; this.over = false; this.camYaw = 0;
    this.ui.ebars.innerHTML = '';
  }

  // ------------------------------------------------------------ input
  onMouseMove(dx, dy) { this.camYaw -= dx * 0.0024; this.camPitch = clamp(this.camPitch + dy * 0.0018, -0.35, 0.95); }
  onMouseDown(b) {
    if (b === 0) { this.mouse.l = true; this.playerAttack('A'); }
    if (b === 2) this.mouse.r = true;
  }
  onMouseUp(b) { if (b === 0) this.mouse.l = false; if (b === 2) this.mouse.r = false; }
  onKey(code, down) {
    this.keys[code] = down;
    if (!down || !this.running) return;
    if (code === 'Space') this.playerDodge();
    if (code === 'KeyQ') this.playerAttack('H');
  }
  playerAttack(kind) {
    const p = this.player; if (p.dead || !this.running) return;
    if (p.state === 'attack') {
      const t = p.atk.t / p.atk.mul;
      if (kind === 'A' && !p.atk.def.heavy && t > p.atk.def.windEnd) p.queued = COMBO[p.atk.type];
      return;
    }
    if (p.state === 'hit' || p.state === 'dodge') return;
    const def = ATTACKS[kind];
    if (this.stamina < def.stam * 0.5) return;
    this.stamina -= def.stam;
    this.softLock();
    p.startAttack(kind);
  }
  playerDodge() {
    const p = this.player; if (p.dead || p.state === 'hit' || this.stamina < 20) return;
    if (p.state === 'attack' && p.atk.t / p.atk.mul < p.atk.def.hitEnd) return;
    this.stamina -= 22; p.state = 'dodge'; p.t = 0; p.iframe = 0.38; p.atk = null;
    const dir = this.inputDir(); if (dir.lengthSq() < 0.01) dir.copy(p.forward).negate();
    p.vel.copy(dir).multiplyScalar(10.5);
    if (dir.dot(p.forward) > 0.3) p.yaw = Math.atan2(dir.x, dir.z);
    this.audio.burst({ freq: 600, q: 0.7, dur: 0.3, gain: 0.25, type: 'lowpass' });
  }
  softLock() {
    const p = this.player; let best = null, bd = 5;
    const look = this.inputDir(); if (look.lengthSq() < 0.01) look.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    for (const e of this.enemies) { if (e.dead) continue; const d = new THREE.Vector3().subVectors(e.pos, p.pos).setY(0); const l = d.length(); if (l < bd && d.normalize().dot(look) > 0.2) { bd = l; best = e; } }
    if (best) p.yaw = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
    else p.yaw = Math.atan2(look.x, look.z);
  }
  inputDir() {
    const f = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    const d = new THREE.Vector3();
    if (this.keys.KeyW) d.add(f); if (this.keys.KeyS) d.sub(f); if (this.keys.KeyD) d.add(r); if (this.keys.KeyA) d.sub(r);
    return d.lengthSq() > 0 ? d.normalize() : d;
  }

  // ------------------------------------------------------------ combat resolution
  resolveHit(src, tg, dmg, heavy) {
    const res = tg.takeHit(src, dmg, heavy);
    const fx = this.fx; const at = tg.chest();
    const dir = new THREE.Vector3().subVectors(tg.pos, src.pos).setY(0).normalize();
    if (res === 'blocked' || res === 'broken') {
      const sp = at.clone().addScaledVector(dir, -0.45 * tg.scale); sp.y -= 0.1;
      fx.sparks.emit(sp, new THREE.Vector3(-dir.x, 0.6, -dir.z), 40, { speed: 7, spread: 1.8, life: 0.5, color: [4, 2.4, 1.0], size: 0.05 });
      this.audio.clash(); this.hitStop = 0.06; this.trauma = Math.min(1, this.trauma + (src.isPlayer || tg.isPlayer ? 0.3 : 0.1));
      this.flashLight(sp);
    } else if (res === 'hit') {
      fx.blood.emit(at, new THREE.Vector3(dir.x, 0.5, dir.z), heavy ? 50 : 28, { speed: 4.5, spread: 1.4, life: 0.9, color: [0.28, 0.01, 0.01], size: 0.06 });
      fx.sparks.emit(at, new THREE.Vector3(dir.x, 0.4, dir.z), 10, { speed: 5, spread: 1.5, life: 0.25, color: [3, 1.6, 0.7], size: 0.04 });
      this.audio.hit(heavy); if (!tg.isPlayer) this.audio.grunt();
      this.hitStop = heavy ? 0.12 : 0.07; this.trauma = Math.min(1, this.trauma + (tg.isPlayer ? 0.6 : 0.35) * (heavy ? 1.4 : 1));
      tg.vel.addScaledVector(dir, heavy ? 6 : 3);
      if (tg.isPlayer) this.damageFlash = 1;
      if (tg.dead && !tg.isPlayer) { this.kills++; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8); }
    }
  }
  flashLight(p) { if (this.onFlash) this.onFlash(p); }

  // ------------------------------------------------------------ waves
  spawnEnemy(boss) {
    const w = this.wave;
    const x = (Math.random() - 0.5) * 3, z = -50 - Math.random() * 6;
    const e = new Fighter(this, boss
      ? { house: 'boss', pos: new THREE.Vector3(0, 0, -52), yaw: 0, hp: 520, scale: 1.28, dmgMul: 1.6, timeMul: 1.25, boss: true }
      : { house: 'lion', shield: Math.random() < 0.55, pos: new THREE.Vector3(x, 0, z), yaw: 0, hp: 60 + w * 12, dmgMul: 0.55 + w * 0.06, timeMul: 1.55 - Math.min(w, 4) * 0.06 });
    e.ai = { cd: 1 + Math.random() * 1.5, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, ring: 3.4 + Math.random() * 1.6 };
    const bar = document.createElement('div'); bar.className = 'ebar' + (boss ? ' boss' : ''); bar.innerHTML = '<div></div>'; this.ui.ebars.appendChild(bar); e.bar = bar;
    this.enemies.push(e);
  }
  updateWaves(dt) {
    this.waveT += dt;
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (this.waveState === 'intro' && this.waveT > 2.5) { this.nextWave(); }
    else if (this.waveState === 'spawning') {
      if (this.toSpawn > 0 && alive < 5 && this.waveT > 1.3) { this.waveT = 0; this.toSpawn--; this.spawnEnemy(this.bossWave && this.toSpawn === 0); }
      if (this.toSpawn === 0 && alive === 0) {
        if (this.wave >= 5) { this.waveState = 'won'; this.ui.end(true, this); }
        else { this.waveState = 'rest'; this.waveT = 0; this.ui.announce(`Wave ${roman(this.wave)} repelled`, 'Catch your breath. They regroup beyond the gate.'); }
      }
    } else if (this.waveState === 'rest' && this.waveT > 5) this.nextWave();
  }
  nextWave() {
    this.wave++; this.waveState = 'spawning'; this.waveT = 0;
    this.bossWave = this.wave === 5;
    this.toSpawn = this.bossWave ? 4 : 2 + this.wave;
    this.audio.horn();
    const lines = ['The Crimson Host breaches the gate', 'More sworn swords pour through', 'Shieldwall! They come in force', 'The vanguard of the Lion', 'The Mountain of Ashfall rides out'];
    this.ui.announce(this.bossWave ? 'The Black Champion' : `Wave ${roman(this.wave)}`, lines[this.wave - 1]);
  }

  // ------------------------------------------------------------ movement & collision
  moveFighter(f, dt, cols) {
    f.vel.multiplyScalar(Math.exp(-dt * 8));
    f.pos.addScaledVector(f.vel, dt);
    const r = f.radius;
    for (const c of cols) {
      if (f.pos.x + r < c.minX || f.pos.x - r > c.maxX || f.pos.z + r < c.minZ || f.pos.z - r > c.maxZ) continue;
      const cx = clamp(f.pos.x, c.minX, c.maxX), cz = clamp(f.pos.z, c.minZ, c.maxZ);
      let dx = f.pos.x - cx, dz = f.pos.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); if (d < r) { f.pos.x += (dx / d) * (r - d); f.pos.z += (dz / d) * (r - d); } }
      else { // inside: push out shortest axis
        const pl = f.pos.x - c.minX, pr = c.maxX - f.pos.x, pd = f.pos.z - c.minZ, pu = c.maxZ - f.pos.z; const m = Math.min(pl, pr, pd, pu);
        if (m === pl) f.pos.x = c.minX - r; else if (m === pr) f.pos.x = c.maxX + r; else if (m === pd) f.pos.z = c.minZ - r; else f.pos.z = c.maxZ + r;
      }
    }
  }

  updatePlayer(dt) {
    const p = this.player; const dir = this.inputDir();
    p.blocking = this.mouse.r && (p.state === 'idle') && !p.dead && this.stamina > 0;
    const sprint = this.keys.ShiftLeft && !p.blocking && dir.lengthSq() > 0 && this.stamina > 1;
    let target = 0;
    if (!p.dead && (p.state === 'idle')) {
      target = p.blocking ? 1.9 : sprint ? 7.2 : 4.2;
      if (dir.lengthSq() > 0) {
        const want = p.blocking ? Math.atan2(-Math.sin(this.camYaw), -Math.cos(this.camYaw)) : Math.atan2(dir.x, dir.z);
        p.yaw += angDiff(p.yaw, want) * Math.min(1, dt * 12);
      } else target = 0;
      if (p.blocking) p.yaw += angDiff(p.yaw, Math.atan2(-Math.sin(this.camYaw), -Math.cos(this.camYaw))) * Math.min(1, dt * 12);
    }
    if (sprint && target > 5) this.stamina -= dt * 14;
    else if (p.state !== 'attack' && p.state !== 'dodge') this.stamina = Math.min(100, this.stamina + dt * (p.blocking ? 8 : 24));
    p.speed += (target - p.speed) * Math.min(1, dt * 10);
    if (p.state === 'idle' && dir.lengthSq() > 0) { p.pos.addScaledVector(dir, p.speed * dt); }
    else if (p.state === 'idle') p.speed *= 0.8;
    if (p.state === 'attack' || p.state === 'hit') p.speed *= Math.exp(-dt * 10);
    this.moveFighter(p, dt, this.playerCols);
    p.pos.x = clamp(p.pos.x, -48, 48); p.pos.z = clamp(p.pos.z, -46, 48);
    p.tick(dt, this.enemies);
    if (p.speed > 1 && p.state === 'idle') { p.stepAcc += dt * p.speed * 0.55; if (p.stepAcc > 1) { p.stepAcc = 0; this.audio.step(); } }
    if (this.mouse.l && !p.dead) this.playerAttack('A');
    if (p.hp <= 0 && !this.over) { this.over = true; setTimeout(() => this.ui.end(false, this), 2200); }
  }

  updateEnemies(dt) {
    const p = this.player;
    const alive = this.enemies.filter((e) => !e.dead);
    // attack tokens for the two closest
    alive.sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
    alive.forEach((e, i) => (e.ai.token = i < 2 || e.boss));
    for (const e of this.enemies) {
      if (e.dead) { this.moveFighter(e, dt, this.colliders); e.tick(dt, []); continue; }
      const ai = e.ai; ai.cd -= dt;
      let goal = p.pos.clone();
      if (e.pos.z < -36.5) goal.set(clamp(e.pos.x, -1.5, 1.5) * 0.5, 0, -30); // funnel through the gate
      const to = new THREE.Vector3().subVectors(goal, e.pos).setY(0); const dist = to.length();
      const toP = new THREE.Vector3().subVectors(p.pos, e.pos).setY(0); const pd = toP.length();
      const wantYaw = Math.atan2(to.x, to.z);
      const turnRate = e.state === 'attack' ? (e.atk.t / e.atk.mul < e.atk.def.windEnd ? 3 : 0.4) : 6;
      if (e.state !== 'hit') e.yaw += angDiff(e.yaw, wantYaw) * Math.min(1, dt * turnRate);
      let move = new THREE.Vector3(), target = 0;
      e.blocking = false;
      if (e.state === 'idle' && !p.dead) {
        const engaged = e.pos.z > -36.5;
        if (!engaged) { move.copy(to).normalize(); target = 4.2; }
        else if (ai.token) {
          if (pd > 2.0 * e.scale) { move.copy(toP).normalize(); target = pd > 7 ? 4.6 : 2.6; }
          else if (pd < 1.3) { move.copy(toP).normalize().negate(); target = 1.5; }
          if (pd < 2.7 * e.scale && ai.cd <= 0) {
            const kinds = e.boss ? ['H', 'B', 'A', 'H'] : ['A', 'B', 'C'];
            e.startAttack(kinds[Math.floor(Math.random() * kinds.length)]);
            ai.cd = e.boss ? 1.2 + Math.random() * 1.2 : 1.4 + Math.random() * 1.8;
          }
          // react to the player's swing: raise shield
          if (e.shield && p.state === 'attack' && pd < 3.2 && Math.random() < dt * 4) ai.guardT = 0.6;
        } else {
          const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(ai.strafe);
          const radial = toP.clone().normalize().multiplyScalar(pd - ai.ring);
          move.copy(side).add(radial.multiplyScalar(0.6)).normalize(); target = 1.6;
          ai.strafeT += dt; if (ai.strafeT > 3 + Math.random() * 3) { ai.strafeT = 0; ai.strafe *= -1; }
          if (e.shield) ai.guardT = 0.3;
        }
        if (ai.guardT > 0) { ai.guardT -= dt; e.blocking = e.shield && ai.token ? true : e.shield; }
        if (e.blocking) target *= 0.6;
      }
      // separation
      for (const o of alive) { if (o === e) continue; const d = new THREE.Vector3().subVectors(e.pos, o.pos).setY(0); const l = d.length(); const min = e.radius + o.radius + 0.5; if (l < min && l > 0.001) e.pos.addScaledVector(d.normalize(), (min - l) * 0.5); }
      { const d = new THREE.Vector3().subVectors(e.pos, p.pos).setY(0); const l = d.length(); const min = e.radius + p.radius + 0.1; if (l < min && l > 0.001) { e.pos.addScaledVector(d.normalize(), (min - l)); } }
      e.speed += (target - e.speed) * Math.min(1, dt * 6);
      if (e.state === 'idle') e.pos.addScaledVector(move, e.speed * dt); else e.speed *= Math.exp(-dt * 8);
      this.moveFighter(e, dt, this.colliders);
      e.tick(dt, [p]);
      // telegraph flag
      const tele = e.state === 'attack' && e.atk.t / e.atk.mul < e.atk.def.windEnd;
      e.bar.classList.toggle('tele', tele);
    }
    // cleanup corpses
    for (const e of this.enemies) if (e.dead && e.t > 11 && !e.removed) { e.removed = true; this.scene.remove(e.model.root); e.trail.dispose(this.scene); e.bar.remove(); }
    this.enemies = this.enemies.filter((e) => !e.removed);
  }

  updateCamera(dt) {
    const p = this.player;
    const tgt = p.pos.clone(); tgt.y += 1.65;
    this.camTarget.lerp(tgt, 1 - Math.exp(-dt * 14));
    const cp = Math.cos(this.camPitch), dirv = new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const origin = this.camTarget.clone().addScaledVector(right, 0.55);
    let dist = this.camDist + (this.player.speed > 5 ? 0.6 : 0);
    // camera collision against world boxes
    const ray = new THREE.Ray(origin, dirv); const hit = new THREE.Vector3(); const bx = new THREE.Box3();
    for (const c of this.playerCols) {
      bx.min.set(c.minX - 0.25, -1, c.minZ - 0.25); bx.max.set(c.maxX + 0.25, 40, c.maxZ + 0.25);
      if (bx.containsPoint(origin)) continue;
      if (ray.intersectBox(bx, hit)) { const d = hit.distanceTo(origin); if (d < dist) dist = Math.max(0.6, d - 0.2); }
    }
    const want = origin.clone().addScaledVector(dirv, dist); want.y = Math.max(want.y, 0.4);
    this.camPos.lerp(want, 1 - Math.exp(-dt * 18));
    this.camera.position.copy(this.camPos);
    const sh = this.trauma * this.trauma; const t = performance.now() * 0.001;
    this.camera.position.x += (Math.sin(t * 61) * 0.12) * sh; this.camera.position.y += (Math.sin(t * 47 + 1) * 0.1) * sh;
    this.camera.lookAt(origin.x, origin.y + 0.05, origin.z);
    this.camera.rotation.z += Math.sin(t * 37) * 0.02 * sh;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  updateUI() {
    const ui = this.ui; const p = this.player;
    ui.hp.style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
    ui.st.style.width = `${Math.max(0, this.stamina)}%`;
    ui.wave.textContent = this.bossWave ? 'The Champion' : `Wave ${roman(Math.max(1, this.wave))} / V`;
    ui.kills.textContent = `${this.kills} slain`;
    const v = new THREE.Vector3(); const w = innerWidth, h = innerHeight;
    for (const e of this.enemies) {
      v.set(e.pos.x, e.pos.y + 2.25 * e.scale, e.pos.z); const d = v.distanceTo(this.camera.position);
      v.project(this.camera);
      const show = !e.dead && v.z < 1 && d < 32 && e.pos.z > -40;
      e.bar.style.display = show ? 'block' : 'none';
      if (show) { e.bar.style.left = `${(v.x * 0.5 + 0.5) * w}px`; e.bar.style.top = `${(-v.y * 0.5 + 0.5) * h}px`; e.bar.firstChild.style.width = `${(e.hp / e.maxHp) * 100}%`; }
    }
  }

  update(dt, time) {
    if (this.running) {
      this.updateWaves(dt);
      this.updatePlayer(dt);
      this.updateEnemies(dt);
    }
    this.player.animate(dt, time);
    for (const e of this.enemies) e.animate(dt, time);
    this.updateCamera(dt);
    this.updateUI();
    this.damageFlash = Math.max(0, (this.damageFlash || 0) - dt * 1.8);
  }
}

export function roman(n) { return ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] || String(n); }
