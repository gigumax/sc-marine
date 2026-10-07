/* ============================================================
   allies.js — AI marine fireteam: formation follow + combat
   ============================================================ */

const PROMOTE_KILLS = 50;                // your zerg kills to take command

const Allies = {
  list: [],
  cmd: 'push',                      // 'push' | 'fall' — your last order
  radioT: 0,                        // global radio throttle
  hurtBarkT: 0,                     // cooldown on 'cover the LT' barks
  names: ['RAYNOR', 'DIAZ', 'HORNER', 'TYCUS', 'SWANN', 'VOGEL', 'BISHOP'],
  accents: [0xffd24a, 0x4ad0ff, 0x6aff8a, 0xff6a4a, 0xc07aff, 0xff9a3a, 0x7ae8d0],
  // wedge slots behind the leader, in leader-local space {x, z}
  // (local -z is the facing direction, so +z trails behind)
  slots: [
    { x: -2.4, z: 2.6 }, { x: 2.4, z: 2.6 },      // flank pair
    { x: -4.4, z: 4.6 }, { x: 4.4, z: 4.6 },      // wide pair
    { x: -1.5, z: 4.6 }, { x: 1.5, z: 4.6 },      // inner pair
    { x: 0, z: 6.2 },                              // rear guard
  ],
};

/* who's calling the shots — a random marine leads until you're promoted */
function squadLeader() {
  if (Game.leader) return null;
  return Allies.list.find(a => a.leader && !a.dead) || null;
}

/* ---------- squad comms ---------- */
const BARKS = {
  fallAck:  ['"Copy — falling back!"', '"Pulling back!"', '"Regroup on the LT!"'],
  pushAck:  ['"Pushing the hives!"', '"Moving up!"', '"You got it — advancing!"'],
  thanks:   ['"Anytime, LT."', '"Just doing my job."', '"All in a day\'s work."'],
  sorry:    ['"Watch it next time."', '"All good, LT."', '"Forget it."'],
  crit:     ['"I\'m hit bad!"', '"Taking heavy fire!"', '"Armor\'s failing!"'],
  coverYou: ['"LT\'s bleeding out — cover him!"', '"Protect the LT!"'],
  cmdTaken: ['"I\'ll take point."', '"Command\'s mine — keep pushing."'],
  kill:     ['"Hostile down."', '"Got one."', '"Splattered."'],
};
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// append a fading line to the radio feed — accent colors the speaker name
function squadChat(name, text, accent) {
  const feed = document.getElementById('chat');
  if (!feed) return;
  const line = document.createElement('div');
  line.className = 'chat-line';
  line.innerHTML = `<b style="color:${accent || '#9fd0ff'}">${name}:</b> ${text}`;
  feed.appendChild(line);
  while (feed.children.length > 4) feed.removeChild(feed.firstChild);
  setTimeout(() => { line.classList.add('out'); setTimeout(() => line.remove(), 450); }, 4200);
}

// a living marine speaks — radio blip + feed line (throttled unless forced)
function allySay(a, text, force) {
  if (!a || a.dead) return;
  if (!force && Allies.radioT > 0) return;
  Allies.radioT = 1.1;
  Audio2.radio();
  squadChat(a.name, text, a.accent);
}

// Z/X/C/V or comms buttons — you give the order, the squad acknowledges
// online: the line goes out to real squadmates instead of AI barks
const COMM_LINES = { fall: '"Fall back on me!"', push: '"Push the hives!"', thanks: '"Thanks!"', sorry: '"My bad."' };
function issueOrder(cmd) {
  if (!Game.running || Player.dead) return;
  Audio2.radio();
  if (Net.on) {
    const line = COMM_LINES[cmd];
    if (line) { squadChat(Net.name, line, Net.accent); Net.comm(line); }
    return;
  }
  const lead = squadLeader() || Allies.list.find(a => !a.dead);
  if (cmd === 'fall') {
    Allies.cmd = 'fall';
    squadChat('YOU', '"Fall back on me!"', '#ffffff');
    allySay(lead, pick(BARKS.fallAck), true);
  } else if (cmd === 'push') {
    Allies.cmd = 'push';
    squadChat('YOU', '"Push the hives!"', '#ffffff');
    allySay(lead, pick(BARKS.pushAck), true);
  } else if (cmd === 'thanks' || cmd === 'sorry') {
    squadChat('YOU', cmd === 'thanks' ? '"Thanks!"' : '"My bad."', '#ffffff');
    const alive = Allies.list.filter(a => !a.dead);
    if (alive.length)
      allySay(alive[Math.floor(Math.random() * alive.length)], pick(BARKS[cmd]));
  }
}

/* ---------- leader star (canvas-drawn, one texture shared) ---------- */
let _starTex = null;
function starTexture() {
  if (_starTex) return _starTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 62);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 20 : 50;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffd24a';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(70,46,0,.9)';
  g.stroke();
  _starTex = new THREE.CanvasTexture(c);
  return _starTex;
}

/* ---------- armor scratch texture — gouges + chips, shared ---------- */
let _scratchTex = null;
function armorScratchTexture() {
  if (_scratchTex) return _scratchTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {                        // claw gouges
    const x = 15 + Math.random() * 98, y = 15 + Math.random() * 98;
    const a = Math.random() * Math.PI, l = 18 + Math.random() * 30;
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    g.strokeStyle = 'rgba(20,10,8,.85)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke();
    g.strokeStyle = 'rgba(215,225,235,.8)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke();
  }
  for (let i = 0; i < 5; i++) {                        // impact chips
    g.fillStyle = 'rgba(15,10,10,.9)';
    g.beginPath(); g.arc(20 + Math.random() * 88, 20 + Math.random() * 88, 2 + Math.random() * 3, 0, 7); g.fill();
  }
  _scratchTex = new THREE.CanvasTexture(c);
  return _scratchTex;
}

// fade armor decals in as a marine loses HP — works for AI squad + remote players
function setMarineScratches(mesh, hpFrac) {
  const decals = mesh.userData.scratch;
  if (!decals) return;
  const o = Math.max(0, Math.min(1, (0.78 - hpFrac) / 0.78)) * 0.85;
  for (const d of decals) { d.visible = o > 0.02; d.material.opacity = o; }
}

/* ---------- marine model (primitives) ---------- */
function buildMarineMesh(accent) {
  const g = new THREE.Group();
  const armor  = new THREE.MeshStandardMaterial({ color: 0x3d5a78, roughness: 0.55, metalness: 0.45 });
  const armorD = new THREE.MeshStandardMaterial({ color: 0x24344a, roughness: 0.7,  metalness: 0.35 });
  const joint  = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.9 });
  const visor  = new THREE.MeshBasicMaterial({ color: accent });
  const gunM   = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.7, metalness: 0.5 });

  // legs — hip-pivot boxes for walk cycle
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), armorD);
    leg.geometry = leg.geometry.clone();
    leg.geometry.translate(0, -0.34, 0);               // pivot at hip
    leg.position.set(s * 0.16, 0.78, 0);
    g.add(leg); legs.push(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), joint);
    boot.position.set(s * 0.16, 0.06, 0.04);
    g.add(boot);
  }

  // torso — chunky CMC power armor
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.36), armor);
  torso.position.y = 1.18;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.1), armorD);
  chest.position.set(0, 1.28, 0.22);
  g.add(chest);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.34), joint);
  belt.position.y = 0.86;
  g.add(belt);

  // pauldrons — signature marine bulk
  const arms = [];
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), armor);
    pad.scale.set(1, 0.85, 1);
    pad.position.set(s * 0.4, 1.45, 0);
    g.add(pad);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.15), joint);
    arm.position.set(s * 0.34, 1.14, 0.06);
    arm.rotation.x = -0.5;
    g.add(arm); arms.push(arm);
  }

  // helmet + glowing visor (team accent color)
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), armor);
  helm.scale.set(1, 1.05, 1.05);
  helm.position.y = 1.72;
  g.add(helm);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.05), visor);
  vis.position.set(0, 1.72, 0.19);
  g.add(vis);
  // backpack vents
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.12), armorD);
  pack.position.set(0, 1.28, -0.24);
  g.add(pack);

  // gauss rifle held forward
  const gun = new THREE.Group();
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.52), gunM);
  gun.add(gBody);
  const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6), armorD);
  gBarrel.rotation.x = Math.PI / 2; gBarrel.position.z = 0.4;
  gun.add(gBarrel);
  const gMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), armorD);
  gMag.position.set(0, -0.12, -0.05);
  gun.add(gMag);
  gun.position.set(0.22, 1.24, 0.3);
  g.add(gun);

  // muzzle flash sprite at barrel tip
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffd080, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.set(0.3, 0.3, 0.3);
  flash.position.set(0, 0, 0.58);
  gun.add(flash);

  // overhead health bar — bg + fg sprites
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x180c0c, transparent: true, opacity: 0.75, depthWrite: false,
  }));
  barBg.scale.set(0.95, 0.09, 1); barBg.position.y = 2.12;
  g.add(barBg);
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x5aff8a, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  barFg.scale.set(0.9, 0.06, 1); barFg.position.y = 2.12;
  g.add(barFg);

  // floating gold star — shown only over the current squad leader
  const star = new THREE.Sprite(new THREE.SpriteMaterial({
    map: starTexture(), transparent: true, depthWrite: false,
  }));
  star.scale.set(0.42, 0.42, 1);
  star.position.y = 2.45;
  star.visible = false;
  g.add(star);

  // armor damage decals — hidden until the marine gets chewed on
  const scratch = [];
  for (const [z, ry] of [[0.195, 0], [-0.19, Math.PI]]) {   // torso front + back
    const mat = new THREE.MeshBasicMaterial({
      map: armorScratchTexture(), transparent: true, opacity: 0, depthWrite: false,
    });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.62), mat);
    d.position.set(0, 1.18, z);
    d.rotation.y = ry;
    d.visible = false;
    g.add(d); scratch.push(d);
  }
  for (const s of [-1, 1]) {                               // pauldron faces
    const mat = new THREE.MeshBasicMaterial({
      map: armorScratchTexture(), transparent: true, opacity: 0, depthWrite: false,
    });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), mat);
    d.position.set(s * 0.42, 1.45, 0);
    d.rotation.y = s * Math.PI / 2;
    d.visible = false;
    g.add(d); scratch.push(d);
  }

  g.userData.legs = legs;
  g.userData.flash = flash;
  g.userData.scratch = scratch;
  g.userData.barFg = barFg;
  g.userData.barBg = barBg;
  g.userData.star = star;
  return g;
}

/* ---------- marauder model — heavy firebat-frame grenadier ---------- */
function buildMarauderMesh(accent) {
  const g = new THREE.Group();
  const armor  = new THREE.MeshStandardMaterial({ color: 0x2e3a48, roughness: 0.6, metalness: 0.5 });
  const armorD = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.75, metalness: 0.35 });
  const joint  = new THREE.MeshStandardMaterial({ color: 0x10151d, roughness: 0.9 });
  const blue   = new THREE.MeshStandardMaterial({ color: 0x2a4a9a, roughness: 0.5, metalness: 0.5 });
  const glowO  = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const gunM   = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.55, metalness: 0.6 });
  const chalk  = new THREE.MeshBasicMaterial({ color: 0xcfd8e0 });

  // legs — heavy powered gait, hip-pivot boxes
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.82, 0.3), armorD);
    leg.geometry = leg.geometry.clone();
    leg.geometry.translate(0, -0.4, 0);                // pivot at hip
    leg.position.set(s * 0.22, 0.9, 0);
    g.add(leg); legs.push(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.44), blue);
    boot.position.set(s * 0.22, 0.07, 0.06);
    g.add(boot);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.1), armor);
    shin.position.set(s * 0.22, 0.5, 0.14);
    g.add(shin);
  }

  // torso — slab power armor, orange chest vents, hanging pelvis plate
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.66, 0.46), armor);
  torso.position.y = 1.3;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.12), armorD);
  chest.position.set(0, 1.42, 0.26);
  g.add(chest);
  for (const s of [-1, 1]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.05), glowO);
    vent.position.set(s * 0.17, 1.32, 0.27);
    g.add(vent);
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 0.42), joint);
  belt.position.y = 0.98;
  g.add(belt);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), armorD);
  skirt.position.set(0, 0.8, 0.15);
  g.add(skirt);

  // massive pauldrons — blue caps + chalk kill-marks, the marauder silhouette
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.46), armor);
    pad.position.set(s * 0.54, 1.64, 0);
    g.add(pad);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.38), blue);
    cap.position.set(s * 0.54, 1.85, 0);
    g.add(cap);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.22), chalk);
    mark.position.set(s * 0.73, 1.62, 0.02);
    mark.rotation.z = s * 0.35;
    g.add(mark);
  }

  // head sunk between shoulders — orange eye slit
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), armorD);
  helm.position.y = 1.64;
  g.add(helm);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.04), glowO);
  eyes.position.set(0, 1.65, 0.16);
  g.add(eyes);

  // twin smokestacks on the back
  for (const s of [-1, 1]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 6), gunM);
    stack.position.set(s * 0.18, 1.92, -0.24);
    stack.rotation.x = -0.15;
    g.add(stack);
  }

  // forearm grenade launchers — twin tubes, accent ring at the muzzle
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), joint);
    arm.position.set(s * 0.52, 1.22, 0.08);
    arm.rotation.x = -0.4;
    g.add(arm); arms.push(arm);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 8), gunM);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(s * 0.52, 1.02, 0.44);
    g.add(tube);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.02, 6, 12),
      new THREE.MeshBasicMaterial({ color: accent }));
    ring.position.set(s * 0.52, 1.02, 0.7);
    g.add(ring);
  }

  // gun anchor for muzzle flash + net compat — right tube tip
  const gun = new THREE.Group();
  gun.position.set(0.52, 1.02, 0.44);
  g.add(gun);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffc060, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.set(0.5, 0.5, 0.5);
  flash.position.set(0, 0, 0.34);
  gun.add(flash);

  // overhead health bar — bg + fg sprites (rides higher, frame is taller)
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x180c0c, transparent: true, opacity: 0.75, depthWrite: false,
  }));
  barBg.scale.set(0.95, 0.09, 1); barBg.position.y = 2.4;
  g.add(barBg);
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x5aff8a, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  barFg.scale.set(0.9, 0.06, 1); barFg.position.y = 2.4;
  g.add(barFg);

  // floating gold star — leader only
  const star = new THREE.Sprite(new THREE.SpriteMaterial({
    map: starTexture(), transparent: true, depthWrite: false,
  }));
  star.scale.set(0.46, 0.46, 1);
  star.position.y = 2.75;
  star.visible = false;
  g.add(star);

  // armor damage decals — same contract as the marine
  const scratch = [];
  for (const [z, ry] of [[0.24, 0], [-0.235, Math.PI]]) {
    const mat = new THREE.MeshBasicMaterial({
      map: armorScratchTexture(), transparent: true, opacity: 0, depthWrite: false,
    });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.66), mat);
    d.position.set(0, 1.3, z);
    d.rotation.y = ry;
    d.visible = false;
    g.add(d); scratch.push(d);
  }
  for (const s of [-1, 1]) {
    const mat = new THREE.MeshBasicMaterial({
      map: armorScratchTexture(), transparent: true, opacity: 0, depthWrite: false,
    });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat);
    d.position.set(s * 0.73, 1.64, 0);
    d.rotation.y = s * Math.PI / 2;
    d.visible = false;
    g.add(d); scratch.push(d);
  }

  g.userData.legs = legs;
  g.userData.flash = flash;
  g.userData.scratch = scratch;
  g.userData.barFg = barFg;
  g.userData.barBg = barBg;
  g.userData.star = star;
  g.userData.gun = gun;
  return g;
}

/* ---------- squad lifecycle ---------- */
function spawnAllies() {
  clearAllies();
  if (Net.on) { buildSquadHud(); return; }   // online: the squad is real players
  const n = Allies.names.length;
  const leadIdx = Math.floor(Math.random() * n);      // random marine leads
  for (let i = 0; i < n; i++) {
    const mesh = i === leadIdx                    // commander wears the marauder chassis
      ? buildMarauderMesh(Allies.accents[i])
      : buildMarineMesh(Allies.accents[i]);
    // spawn in the wedge behind the player's facing dir
    const sl = Allies.slots[i];
    const sin = Math.sin(Player.yaw), cos = Math.cos(Player.yaw);
    const wx = sl.x * cos + sl.z * sin;
    const wz = -sl.x * sin + sl.z * cos;
    mesh.position.set(Player.pos.x + wx, 0, Player.pos.z + wz);
    mesh.rotation.y = Player.yaw;
    Enemies.scene.add(mesh);
    Allies.list.push({
      mesh, pos: mesh.position,
      idx: i,
      name: Allies.names[i],
      accent: '#' + Allies.accents[i].toString(16).padStart(6, '0'),
      leader: i === leadIdx,
      hp: i === leadIdx ? 150 : 90, maxHp: i === leadIdx ? 150 : 90,
      yaw: Player.yaw,
      dead: false, gone: false, deathT: 0,
      fireT: 0.4 + i * 0.15, retargetT: i * 0.12,
      tgt: null, tgtHive: null,
      slot: sl,
      walkT: Math.random() * 7,
      regenT: 0, hurtT: 0,
      radius: 0.55,
    });
  }
  buildSquadHud();
}

function clearAllies() {
  for (const a of Allies.list) Enemies.scene.remove(a.mesh);
  Allies.list = [];
  Allies.cmd = 'push'; Allies.radioT = 0; Allies.hurtBarkT = 0;
  const sq = document.getElementById('squad');
  if (sq) sq.innerHTML = '';
}

/* ---------- squad HUD chips ---------- */
function buildSquadHud() {
  const sq = document.getElementById('squad');
  if (!sq) return;
  let html = Allies.list.map((a, i) =>
    `<div class="chip" id="chip${i}"><b style="color:${a.accent}">${a.leader && !Game.leader ? '★ ' : ''}${a.name}</b><i><u></u></i></div>`
  ).join('');
  if (Net.on) {                              // chips for every remote marine
    html = `<div class="chip you" id="chipYou"><b>${Game.leader ? '★ ' : ''}YOU</b><i><u></u></i></div>`;
    for (const id in Net.peers) {
      const p = Net.peers[id];
      html += `<div class="chip" id="chipP${id}"><b style="color:${p.accent}">${p.name}</b><i><u></u></i></div>`;
    }
  } else if (Game.leader) {
    html += '<div class="chip you" id="chipYou"><b>★ YOU</b><i><u></u></i></div>';
  }
  sq.innerHTML = html;
}
function updateSquadHud() {
  for (const a of Allies.list) {
    const chip = document.getElementById('chip' + a.idx);
    if (!chip) continue;
    chip.classList.toggle('dead', a.dead);
    const f = chip.querySelector('u');
    f.style.width = Math.max(0, a.hp / a.maxHp * 100) + '%';
    f.className = a.hp > a.maxHp * 0.5 ? '' : a.hp > a.maxHp * 0.25 ? 'warn' : 'crit';
  }
  if (Net.on)
    for (const id in Net.peers) {
      const p = Net.peers[id];
      const chip = document.getElementById('chipP' + id);
      if (!chip) continue;
      chip.classList.toggle('dead', !!p.dead);
      const f = chip.querySelector('u');
      const frac = Math.max(0, Math.min(1, p.hp / (p.maxHp || 100)));
      f.style.width = frac * 100 + '%';
      f.className = frac > 0.5 ? '' : frac > 0.25 ? 'warn' : 'crit';
    }
  const you = document.getElementById('chipYou');
  if (you) {
    const f = you.querySelector('u');
    const frac = Player.hp / Player.maxHp;
    f.style.width = Math.max(0, frac * 100) + '%';
    f.className = frac > 0.5 ? '' : frac > 0.25 ? 'warn' : 'crit';
  }
}

/* ---------- command frame swap — whoever leads wears the marauder chassis ---------- */
function swapAllyFrame(a) {
  const col = parseInt(a.accent.slice(1), 16);
  const nm = (a.leader && !Game.leader)
    ? buildMarauderMesh(col) : buildMarineMesh(col);
  nm.position.copy(a.mesh.position);
  nm.rotation.y = a.mesh.rotation.y;
  Enemies.scene.remove(a.mesh);
  Enemies.scene.add(nm);
  a.mesh = nm; a.pos = nm.position;
  if (a.hp < a.maxHp) setMarineScratches(nm, a.hp / a.maxHp);
}

/* ---------- promotion: 50 kills → you take command ---------- */
function promoteToLeader() {
  Game.leader = true;
  setUnit('marauder');                       // command comes with the heavy frame
  for (const a of Allies.list) if (a.leader && !a.dead) swapAllyFrame(a);  // ex-CDR back to marine kit
  UI.waveBanner('PROMOTED — MARAUDER COMMAND FRAME');
  UI.toast('RAYNOR: "You\'ve got command — and the big guns. Push the hives!"');
  Audio2.pickup();
  buildSquadHud();
}

/* ---------- damage ---------- */
function damageAlly(a, dmg, fromPos) {
  if (a.dead) return;
  a.hp -= dmg;
  a.regenT = 6;
  a.hurtT = 0.18;
  bloodBurst(a.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 4);
  Audio2.hitAt(a.pos.distanceTo(Player.pos));
  if (a.hp <= 0) {
    a.hp = 0; a.dead = true; a.deathT = 0;
    a.mesh.userData.barBg.visible = false;
    a.mesh.userData.barFg.visible = false;
    if (a.mesh.userData.star) a.mesh.userData.star.visible = false;
    let extra = '';
    if (a.leader && !Game.leader) {
      // command passes to a random surviving marine
      a.leader = false;
      const alive = Allies.list.filter(x => !x.dead);
      if (alive.length) {
        const nl = alive[Math.floor(Math.random() * alive.length)];
        nl.leader = true;
        nl.maxHp = 150; nl.hp = Math.min(150, nl.hp + 60);   // heavy frame
        swapAllyFrame(nl);
        extra = ' — ' + nl.name + ' TAKES COMMAND';
        allySay(nl, pick(BARKS.cmdTaken), true);
      }
      buildSquadHud();
    }
    UI.toast('☠ ' + a.name + ' IS DOWN' + extra);
    Audio2.kill(a.pos.distanceTo(Player.pos));
    gibBurst(a.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), false);
  }
}

/* ---------- shooting ---------- */
const _aaim = new THREE.Vector3();

function allyShoot(a) {
  const tgtE = a.tgt, tgtH = a.tgtHive;
  const aim = tgtE
    ? _aaim.set(tgtE.mesh.position.x, tgtE.mesh.position.y + 0.55, tgtE.mesh.position.z)
    : _aaim.copy(tgtH.pos).setY(0.7);
  const dist = a.pos.distanceTo(aim);

  // muzzle flash + sound
  const fl = a.mesh.userData.flash;
  fl.material.opacity = 1; fl.material.rotation = Math.random() * 7;
  Audio2.shotAt(dist > 0 ? a.pos.distanceTo(Player.pos) : 1);

  // accuracy falls off with range; jitter while moving
  const acc = Math.max(0.12, 0.62 - dist * 0.015 - (a.moving ? 0.18 : 0));
  const hit = Math.random() < acc;
  let end = aim.clone();
  if (!hit) end.add(new THREE.Vector3(
    (Math.random() - .5) * dist * 0.13,
    (Math.random() - .5) * dist * 0.09,
    (Math.random() - .5) * dist * 0.13));
  if (hit) {
    if (tgtE) {
      damageEnemy(tgtE, 11, false);
      if (tgtE.dead && Math.random() < 0.12) allySay(a, pick(BARKS.kill));
    }
    else if (tgtH) damageSpawner(tgtH, 9, a.pos);
  }
  // tracer from rifle tip
  const from = a.pos.clone(); from.y = 1.3;
  from.x += Math.sin(a.yaw) * 0.55; from.z += Math.cos(a.yaw) * 0.55;
  spawnTracer(from, end);
}

/* ---------- per-frame squad update ---------- */
function updateAllies(dt) {
  const pp = Player.pos;
  const lead = squadLeader();
  const anchor = lead ? lead.pos : pp;             // formation anchor: leader, else you
  const anchorYaw = lead ? lead.yaw : Player.yaw;
  const falling = Allies.cmd === 'fall';           // FALL BACK order active
  Allies.radioT = Math.max(0, Allies.radioT - dt);
  Allies.hurtBarkT = Math.max(0, Allies.hurtBarkT - dt);

  // you're bleeding out → squad calls for cover on you (rare)
  if (Player.hp < 30 && Allies.hurtBarkT <= 0) {
    Allies.hurtBarkT = 25;
    allySay(lead || Allies.list.find(a => !a.dead), pick(BARKS.coverYou), true);
  }
  for (const a of Allies.list) {
    const m = a.mesh;

    if (a.dead) {
      a.deathT += dt;
      m.rotation.x = Math.min(Math.PI / 2, a.deathT * 5);
      if (a.deathT > 4) m.position.y = -(a.deathT - 4) * 0.4;   // sink away
      if (a.deathT > 6.5) { Enemies.scene.remove(m); a.gone = true; }
      continue;
    }

    a.fireT -= dt;
    a.retargetT -= dt;
    if (a.hurtT > 0) a.hurtT -= dt;
    if (a.regenT > 0) a.regenT -= dt;
    else if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + 4.5 * dt);
    setMarineScratches(m, a.hp / a.maxHp);

    /* --- pick target: nearest live zerg, else nearest live hive --- */
    if (a.retargetT <= 0) {
      a.retargetT = 0.35;
      a.tgt = null; a.tgtHive = null;
      let best = 34;
      for (const e of Enemies.list) {
        if (e.dead) continue;
        const d = Math.hypot(e.mesh.position.x - a.pos.x, e.mesh.position.z - a.pos.z);
        if (d < best) { best = d; a.tgt = e; }
      }
      if (!a.tgt) {
        best = 30;
        for (const s of World.spawners) {
          if (s.dead) continue;
          const d = Math.hypot(s.pos.x - a.pos.x, s.pos.z - a.pos.z);
          if (d < best && d < 24) { best = d; a.tgtHive = s; }   // can't hurt hives at range
        }
      }
    }
    if (a.tgt && a.tgt.dead) a.tgt = null;
    if (a.tgtHive && a.tgtHive.dead) a.tgtHive = null;

    /* --- move: leader pushes the objective, followers hold formation --- */
    a.moving = false;
    let sdx = 0, sdz = 0;                              // desired-dir (facing fallback)
    if (a === lead) {
      // leader answers to the objective, not to you — pushes the nearest
      // live hive, hunts the swarm once hives are down, halts on FALL BACK
      let goal = null, holdR = 2.4;
      if (!falling) {
        let bd = Infinity;
        for (const s of World.spawners) {
          if (s.dead) continue;
          const d = Math.hypot(s.pos.x - a.pos.x, s.pos.z - a.pos.z);
          if (d < bd) { bd = d; goal = s.pos; }
        }
        if (goal) holdR = 7;                              // stand off the hive
        else {
          bd = Infinity;
          for (const e of Enemies.list) {                 // mop-up: lead the hunt
            if (e.dead) continue;
            const d = Math.hypot(e.mesh.position.x - a.pos.x, e.mesh.position.z - a.pos.z);
            if (d < bd) { bd = d; goal = e.mesh.position; }
          }
          holdR = 6;
        }
      }
      if (goal) { sdx = goal.x - a.pos.x; sdz = goal.z - a.pos.z; }
      const gd = Math.hypot(sdx, sdz);
      if (gd > holdR) {
        const sp = gd > 10 ? 9.0 : 6.0;
        const res = worldCollide(a.pos.x + sdx / gd * sp * dt,
                                 a.pos.z + sdz / gd * sp * dt, a.radius);
        a.pos.x = res.x; a.pos.z = res.z;
        a.moving = true;
        a.walkT += dt * sp * 1.5;
      }
    } else {
      // follower: wedge slot behind the anchor (leader → later you)
      const tighten = falling ? 0.45 : 1;            // FALL BACK compacts the wedge
      const sin = Math.sin(anchorYaw), cos = Math.cos(anchorYaw);
      const sx = anchor.x + (a.slot.x * cos + a.slot.z * sin) * tighten;
      const sz = anchor.z + (-a.slot.x * sin + a.slot.z * cos) * tighten;
      sdx = sx - a.pos.x; sdz = sz - a.pos.z;
      const slotDist = Math.hypot(sdx, sdz);

      // hold ground & shoot if a target is close and we're near our slot
      const engaged = a.tgt && Math.hypot(a.tgt.mesh.position.x - a.pos.x,
                                          a.tgt.mesh.position.z - a.pos.z) < 15;
      if (slotDist > (falling ? 0.9 : engaged && slotDist < 7 ? 7 : 0.9)) {
        const sp = slotDist > 10 ? 9.0 : 6.0;             // sprint to catch up
        const res = worldCollide(a.pos.x + sdx / slotDist * sp * dt,
                                 a.pos.z + sdz / slotDist * sp * dt, a.radius);
        a.pos.x = res.x; a.pos.z = res.z;
        a.moving = true;
        a.walkT += dt * sp * 1.5;
      }
    }

    // separation: player, squadmates, zerg
    const sep = (ox, oz, min) => {
      const dx = a.pos.x - ox, dz = a.pos.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < min) { a.pos.x += dx / d * (min - d) * 0.5; a.pos.z += dz / d * (min - d) * 0.5; }
    };
    sep(pp.x, pp.z, 1.3);
    for (const o of Allies.list) if (o !== a && !o.dead) sep(o.pos.x, o.pos.z, 1.3);
    for (const e of Enemies.list) if (!e.dead) sep(e.mesh.position.x, e.mesh.position.z, e.radius + a.radius);

    /* --- facing: target > move dir > player --- */
    let wantYaw;
    const aimAt = a.tgt ? a.tgt.mesh.position : a.tgtHive ? a.tgtHive.pos : null;
    if (aimAt) wantYaw = Math.atan2(aimAt.x - a.pos.x, aimAt.z - a.pos.z);
    else if (a.moving) wantYaw = Math.atan2(sdx, sdz);
    else wantYaw = anchorYaw;
    let dy = wantYaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    a.yaw += dy * Math.min(1, dt * 10);
    m.rotation.y = a.yaw;

    /* --- fire --- */
    if (a.fireT <= 0 && aimAt && Math.abs(dy) < 0.35) {
      const d = Math.hypot(aimAt.x - a.pos.x, aimAt.z - a.pos.z);
      if (d < 34) { allyShoot(a); a.fireT = 0.17 + Math.random() * 0.06; }
    }

    /* --- animation --- */
    const legs = m.userData.legs;
    if (a.moving) {
      legs[0].rotation.x = Math.sin(a.walkT) * 0.7;
      legs[1].rotation.x = Math.sin(a.walkT + Math.PI) * 0.7;
      m.position.y = Math.abs(Math.sin(a.walkT)) * 0.05;
    } else {
      legs[0].rotation.x *= 1 - Math.min(1, dt * 10);
      legs[1].rotation.x *= 1 - Math.min(1, dt * 10);
      m.position.y = 0;
    }
    // wounded-marine bark — once per dip below 30% (re-arms on regen)
    if (a.hp < a.maxHp * 0.3 && !a.barkedCrit) {
      a.barkedCrit = true;
      allySay(a, pick(BARKS.crit));
    } else if (a.hp > a.maxHp * 0.6) {
      a.barkedCrit = false;
    }
    // hurt flash — red tint on armor
    m.traverse(o => {
      if (o.isMesh && o.material.emissive)
        o.material.emissive.setHex(a.hurtT > 0 ? 0x601008 : 0x000000);
    });
    const fl = m.userData.flash;
    if (fl.material.opacity > 0) fl.material.opacity -= dt * 16;
    // leader star — floats over whoever currently has command
    const star = m.userData.star;
    if (star) {
      star.visible = a.leader && !Game.leader;
      if (star.visible) star.position.y = 2.45 + Math.sin(Game.time * 3 + a.idx) * 0.06;
    }
    // health bar
    const frac = Math.max(0, a.hp / a.maxHp);
    const bar = m.userData.barFg;
    bar.scale.x = 0.9 * frac;
    bar.position.x = -0.45 * (1 - frac);                // left-align shrink
    bar.material.color.setHex(frac > 0.5 ? 0x5aff8a : frac > 0.25 ? 0xffd94a : 0xff5a4a);
  }
  Allies.list = Allies.list.filter(a => !a.gone);
}
