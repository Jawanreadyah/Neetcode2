import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const DIST = new URL('../dist/', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1024, height: 576 } });
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.route('http://g.local/**', async r => { const path = new URL(r.request().url()).pathname; try { await r.fulfill({ body: await readFile(join(DIST, path)), contentType: {'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(path)] }); } catch { await r.fulfill({status:404, body:''}); } });
await p.goto('http://g.local/index.html');
await p.waitForSelector('#title:not(.hidden)', { timeout: 120000 });
await p.click('.quality button[data-q="low"]'); await p.click('#startBtn');
const r = await p.evaluate(() => { const g = window.__game; const out = []; let t = 100;
  for (let i = 0; i < 560; i++) { t += 0.033;
    const e = g.enemies.find(e => !e.dead && e.pos.z > -36);
    if (e) { g.camYaw = Math.atan2(g.player.pos.x - e.pos.x, g.player.pos.z - e.pos.z); const d = g.player.pos.distanceTo(e.pos); g.keys.KeyW = d > 2.0; g.mouse.l = d < 3; g.mouse.r = false; } else { g.keys.KeyW = false; g.mouse.l = false; }
    g.update(0.033, t);
    if (i % 300 === 0) out.push(JSON.stringify({ i, ws: g.waveState, wave: g.wave, kills: g.kills, hp: g.player.hp | 0, st: g.stamina | 0, ps: g.player.state, en: g.enemies.map(e => [e.pos.x.toFixed(1), e.pos.z.toFixed(1), e.state, e.hp | 0]) }));
    if (g.player.dead) { out.push('player died at ' + i); break; } }
  return out; });
console.log(r.join('\n'));
await p.evaluate(()=>{const g=window.__game; g.mouse.l=true;}); await p.waitForTimeout(1500); await p.screenshot({path:'/projects/sandbox/.kiro/artifacts/screenshots/05-battle.png', timeout:120000}); console.log('errors', errs);
await b.close();
