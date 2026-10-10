/* ============================================================
   main.js — bootstrap, HUD, gamepad, radar, main loop
   ============================================================ */

const $id = id => document.getElementById(id);

const Game = {
  running: false,
  paused: false,
  won: false,
  online: false,                     // online match rules — no pausing
  leader: false,                        // you command the squad after 50 kills
  scene: null, renderer: null, cam: null,
  time: 0,
  respawnT: 0,                          // online: auto-redeploy countdown
  unit: 'marine',                       // class pick on the start screen
};

/* ==================== UI helpers ==================== */
const UI = {
  toastTimer: null,
  flashOp: 0,                            // hit-flash opacity (decays via timer)
  _lobbyStage: 0,
  toast(msg) {
    const t = $id('toast');
    t.textContent = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.textContent = '', 1600);
  },
  waveBanner(text) {
    const b = $id('wave-banner');
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.add('hidden'), 2200);
  },
  hitmarker(kill) {
    const h = $id('hitmarker');
    h.classList.toggle('kill', kill);
    h.classList.add('on');
    clearTimeout(this._ht);
    this._ht = setTimeout(() => h.classList.remove('on'), 110);
  },
  damageFlash() {
    this.flashOp = 1;
    clearTimeout(this._vt);
    this._vt = setTimeout(() => this.flashOp = 0, 130);
  },
  // point-blank kill — ichor splatters the side of the visor facing the bug
  bloodSplat(sx) {
    const hud = $id('hud');
    const W = innerWidth, H = innerHeight;
    for (let i = 0, n = 2 + (Math.random() * 2 | 0); i < n; i++) {
      const b = document.createElement('div');
      b.className = 'splat';
      const sz = 26 + Math.random() * 64;
      b.style.width = b.style.height = sz + 'px';
      b.style.left = (W * 0.5 + sx * W * 0.34 + (Math.random() - .5) * sz * 1.6 - sz / 2) + 'px';
      b.style.top = (H * (0.32 + Math.random() * 0.42) - sz / 2) + 'px';
      b.style.borderRadius =
        `${40 + Math.random() * 30}% ${40 + Math.random() * 30}% ${40 + Math.random() * 30}% ${40 + Math.random() * 30}% / ` +
        `${40 + Math.random() * 30}% ${40 + Math.random() * 30}% ${40 + Math.random() * 30}% ${40 + Math.random() * 30}%`;
      b.style.transform = `rotate(${Math.random() * 360}deg)`;
      hud.appendChild(b);
      setTimeout(() => b.classList.add('fade'), 1200 + Math.random() * 900);
      setTimeout(() => b.remove(), 4400);
    }
    // cap the mess
    const all = hud.querySelectorAll('.splat');
    for (let i = 0; i < all.length - 18; i++) all[i].remove();
  },
  updateHud() {
    const hpFrac = Player.hp / Player.maxHp;
    const fill = $id('hp-fill');
    fill.style.width = (hpFrac * 100) + '%';
    fill.className = hpFrac > 0.55 ? '' : hpFrac > 0.28 ? 'warn' : 'crit';
    $id('hp-num').textContent = Math.ceil(Player.hp);
    $id('suit-warn').classList.toggle('hidden', Player.hp > 30);
    // red ring while hurt — base by hp, hit-flash on top; always cleared at full
    $id('vignette').style.opacity = Math.max(Player.hp < 30 ? 0.45 : 0, this.flashOp);

    const med = Player.unit === 'medic';
    $id('ammo-mag').textContent = med ? Math.ceil(Player.energy) : Player.mag;
    $id('ammo-res').textContent = med ? 'NRG' : Player.reserve;
    $id('ammo').classList.toggle('low', med ? Player.energy <= 25 : Player.mag <= 8);
    const rh = $id('reload-hint');
    if (rh) rh.textContent = med && Player.energy <= 0 ? 'NO ENERGY — GRAB A CUBE' : '';
    $id('wave-num').textContent = 'WAVE ' + Math.max(1, Waves.wave);
    $id('score').textContent = 'KILLS ' + Enemies.kills;
    $id('hive-num').textContent = 'HIVES ' + Waves.hivesLeft() + '/4';
    $id('rank').textContent = Game.leader
      ? '★ SQUAD LEADER'
      : 'PVT · ' + Math.min(PROMOTE_KILLS, Player.kills) + '/' + PROMOTE_KILLS;
    $id('objective').textContent = Game.leader
      ? '★ LEAD THE SQUAD — DESTROY THE HIVES'
      : Net.on
        ? 'LINKED — DESTROY THE HIVES'
        : 'FOLLOW ★ — DESTROY THE HIVES';
    updateSquadHud();
    // matchmaking line — searching until peers link; nobody home → solo deployment
    if (Game.online) {
      const stage = Object.keys(Net.peers).length ? 3
        : Game.time < 9 ? 0 : Game.time < 22 ? 1 : 2;
      if (stage !== this._lobbyStage) {
        this._lobbyStage = stage;
        $id('lobby').textContent =
          stage === 0 ? 'SEARCHING FOR SQUAD…'
          : stage === 1 ? 'STILL SEARCHING…'
          : stage === 2 ? 'NO SQUADMATES FOUND — SOLO DEPLOYMENT'
          : 'SQUAD LINKED — LIVE';
      }
    } else if (this._lobbyStage) this._lobbyStage = 0;
    // visor wear — scratches creep in under 75% HP, cracks under 40%
    const fr = Math.max(0, Player.hp / Player.maxHp);
    $id('visor').style.opacity = Math.max(0, (0.75 - fr) / 0.75) * 0.5;
    $id('visor-cracks').style.opacity = Math.max(0, (0.4 - fr) / 0.4) * 0.85;
  },
};

/* ==================== radar ==================== */
function drawRadar() {
  const c = $id('radar').getContext('2d');
  const R = 85, RANGE = 55;
  c.clearRect(0, 0, 170, 170);
  // rings
  c.strokeStyle = 'rgba(80,160,255,.25)';
  for (const r of [28, 56, 84]) { c.beginPath(); c.arc(R, R, r, 0, 7); c.stroke(); }
  c.beginPath(); c.moveTo(R, 0); c.lineTo(R, 170); c.moveTo(0, R); c.lineTo(170, R); c.stroke();

  const px = Player.pos.x, pz = Player.pos.z;
  const rot = Player.yaw;                          // rotate so up = facing
  const plot = (wx, wz, color, s) => {
    let dx = wx - px, dz = wz - pz;
    const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
    const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
    let x = rx / RANGE * R, y = rz / RANGE * R;
    const d = Math.hypot(x, y);
    if (d > R - 6) { x *= (R - 6) / d; y *= (R - 6) / d; }
    c.fillStyle = color;
    c.fillRect(R + x - s / 2, R + y - s / 2, s, s);
  };

  for (const s of World.spawners) if (!s.dead) plot(s.pos.x, s.pos.z, 'rgba(180,70,255,.95)', 7);
  for (const e of Enemies.list) if (!e.dead)
    plot(e.mesh.position.x, e.mesh.position.z,
         e.hunter ? '#ff8a3a' : '#ff4a3a',
         e.hunter ? 5 : 3.5);
  for (const p of Enemies.pickups) plot(p.m.position.x, p.m.position.z, p.type === 'ammo' ? '#5ab4ff' : '#5aff8a', 3.5);
  for (const a of Allies.list) if (!a.dead) plot(a.pos.x, a.pos.z, a.accent, 4);
  if (Net.on) for (const id in Net.peers) {
    const q = Net.peers[id];
    if (!q.dead) plot(q.mesh.position.x, q.mesh.position.z, q.accent || '#5ab4ff', 4);
  }

  // player arrow (center, pointing up)
  c.fillStyle = '#9fd0ff';
  c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R - 5, R + 5); c.lineTo(R + 5, R + 5); c.closePath(); c.fill();
}

/* ==================== gamepad ==================== */
const Pad = { on: false, prev: {}, lx: 0, ly: 0, rx: 0, ry: 0 };

function pollPad(dt) {
  const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(p => p && p.connected);
  const lbl = $id('pad-status');
  if (!gp) { if (Pad.on) { Pad.on = false; lbl.classList.remove('connected'); $id('pad-label').textContent = 'no pad'; } return; }
  if (!Pad.on) { Pad.on = true; lbl.classList.add('connected'); $id('pad-label').textContent = gp.id.slice(0, 24); }

  const dz = v => Math.abs(v) < 0.16 ? 0 : v;
  Pad.lx = dz(gp.axes[0] || 0); Pad.ly = dz(gp.axes[1] || 0);
  Pad.rx = dz(gp.axes[2] || 0); Pad.ry = dz(gp.axes[3] || 0);

  // right stick → look
  Player.yaw   -= Pad.rx * 2.6 * dt * (Player.aiming ? 0.55 : 1);
  Player.pitch -= Pad.ry * 2.0 * dt * (Player.aiming ? 0.55 : 1);
  Player.pitch = Math.max(-1.45, Math.min(1.45, Player.pitch));

  const btn = i => gp.buttons[i] && gp.buttons[i].pressed;
  const once = i => { const n = btn(i), w = Pad.prev[i]; Pad.prev[i] = n; return n && !w; };

  if (once(2)) startReload();                        // X
  if (once(3)) stimPack();                           // Y
  if (once(0)) tryJump();                            // A
  if (once(9)) {                                     // Start
    if (Player.dead || Game.won) restart();
    else if (!Game.running && !Intro.playing && !Intro.story && Intro.visiting) deployFromBarracks();
    else if (!Game.running && !Intro.playing && !Intro.story && !Intro.visiting
             && $id('lobbyscreen').classList.contains('hidden')) {
      enterBarracks();
    }
  }
  return { moveX: Pad.lx, moveZ: Pad.ly, sprint: btn(10), fire: btn(7), aim: btn(6) };
}

/* ==================== pointer lock ==================== */
const canvasClick = () => {
  if (Game.running && !Player.dead && !document.pointerLockElement && !Pad.on) {
    Game.renderer.domElement.requestPointerLock();
  }
};

/* ---------- visor wear — procedural scratch/crack overlays ---------- */
function visorTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(225,240,255,.5)';
  if (kind === 'scratch') {
    // thin jagged gouges, denser toward the rim
    for (let i = 0; i < 55; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 130 + Math.random() * 220;                 // biased to edges
      const x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r;
      const l = 15 + Math.random() * 65, d = Math.random() * Math.PI * 2;
      g.lineWidth = 0.4 + Math.random() * 1.4;
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(d) * l * 0.5 + (Math.random() - .5) * 10,
               y + Math.sin(d) * l * 0.5 + (Math.random() - .5) * 10);
      g.lineTo(x + Math.cos(d) * l, y + Math.sin(d) * l);
      g.stroke();
    }
  } else {
    // spiderweb cracks radiating from edge impact points
    for (const [ix, iy] of [[64, 380], [440, 90], [380, 430]]) {
      for (let s = 0; s < 9; s++) {
        const a = Math.random() * Math.PI * 2;
        let x = ix, y = iy, aa = a;
        g.lineWidth = 1.4; g.globalAlpha = 0.7;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          aa += (Math.random() - .5) * 0.9;
          x += Math.cos(aa) * (14 + Math.random() * 30);
          y += Math.sin(aa) * (14 + Math.random() * 30);
          g.lineTo(x, y);
          g.lineWidth *= 0.72;
        }
        g.stroke();
      }
    }
  }
  return c.toDataURL();
}

/* ==================== HUD lifecycle ==================== */
function startGame(online) {
  Game.online = online !== undefined ? !!online : Net.on;   // online ⇒ online rules
  $id('startscreen').classList.add('hidden');
  $id('lobbyscreen').classList.add('hidden');
  $id('gameover').classList.add('hidden');
  $id('hud').classList.remove('hidden');
  $id('mode-tag').classList.toggle('hidden', !Game.online);
  $id('lobby').classList.toggle('hidden', !Game.online);
  Game.running = true;
  Game.paused = false;
  Game.won = false; Game.leader = false;
  Game.time = 0;
  Player.kills = 0;
  Intro.menu = false;                         // leave the barracks backdrop
  resetBaseLift();                            // your ride dusts off a few sec in
  setUnit(Game.unit);                     // marine or marauder loadout
  if (Net.on) Net.resetMatch();                                      // wave timers + objective banner
  if (Game.online) { clearAllies(); buildSquadHud(); }
  else spawnAllies();                                 // solo ops gets AI marines
  canvasClick();
}

// PICK → into the barracks where your rig waits
function enterBarracks() {
  $id('startscreen').classList.add('hidden');
  $id('barracks-back').classList.remove('hidden');
  Intro.visit();
}
// TAP THE SUIT → suit-up cinematic → drop into the fight
function deployFromBarracks() {
  $id('barracks-back').classList.add('hidden');
  Intro.play(() => { Net.on = false; startGame(); });
}

// ONLINE — suit-up cinematic first, then pick a named world;
// everyone on the same world drops together
function startOnline() {
  if (Net.chan || Net.on || Intro.playing) return;   // already in
  $id('startscreen').classList.add('hidden');
  Intro.play(() => {
    $id('lobbyscreen').classList.remove('hidden');
    Net.lobby('PICK A WORLD');
  });
}

function joinWorld(w) {
  clearTimeout(Game._soloT);
  Net.bail();                                    // abort any in-flight join / other world
  document.querySelectorAll('.world').forEach(b =>
    b.classList.toggle('on', b.dataset.w === w));
  $id('lobbyscreen').classList.remove('hidden'); // bail() hides it — keep picker up
  Net.lobby('CONTACTING UPLINK…');
  Net.join(w);
  // nobody else is playing → deploy solo under online rules, squad stays empty
  Game._soloT = setTimeout(() => {
    if (!Net.on && !Net.started && !Game.running) {
      Net.bail();
      $id('lobby-status').textContent = 'NO SQUADMATES FOUND — DEPLOYING SOLO';
      startGame(true);
    }
  }, 9000);
}

// online death → redeploy after a short wait instead of match reset
function respawn() {
  Player.dead = false;
  Player.hp = Math.round(Player.maxHp * 0.6);
  if (Player.unit === 'medic') Player.energy = Player.energyMax;
  Player.mag = Player.magSize;
  Player.reserve = Math.max(Player.reserve, Player.unit === 'marauder' ? 24 : 96);
  Player.reloading = false; Player.firing = Player.firingMouse = false;
  const a = Math.random() * Math.PI * 2;        // drop near center, random angle
  Player.pos.set(Math.sin(a) * 4, 0, Math.cos(a) * 4);
  Player.vel.set(0, 0, 0);
  Player.cam.position.y = Player.eyeH;
  Player.cam.rotation.z = 0;
  $id('hud').classList.remove('hidden');
  UI.waveBanner('REDEPLOYED — BACK IN THE FIGHT');
  canvasClick();
}

function restart() {
  // clear entities
  for (const e of Enemies.list) Enemies.scene.remove(e.mesh);
  for (const g of Enemies.gibs) Enemies.scene.remove(g.m);
  for (const p of Enemies.pickups) Enemies.scene.remove(p.m);
  for (const t of Player.tracers) Enemies.scene.remove(t.m);
  for (const m of Player.missiles) Enemies.scene.remove(m.m);
  for (const s of Player.smoke) Enemies.scene.remove(s.m);
  Player.missiles = []; Player.smoke = [];
  Enemies.list = []; Enemies.gibs = []; Enemies.pickups = []; Player.tracers = [];
  spawnQueue.length = 0;                          // nothing hatches posthumously
  Net.resetMatch();              // drop remote replicas/state for the rematch
  // restore spawn-hives
  for (const s of World.spawners) {
    s.dead = false; s.hp = s.maxHp; s.flash = 0;
    s.ringMat.emissiveIntensity = 1.1; s.ringMat.color.setHex(0x4a1a70);
    s.moundMat.color.setHex(0x3a1a50);
    s.sacMat.emissiveIntensity = 0.8; s.sacMat.color.setHex(0x6a2aa0);
    s.glow.intensity = 0.9; s.beam.visible = true;
    s.mesh.rotation.z = 0; s.mesh.position.y = 0;
    for (const eg of s.eggs) {
      eg.t = Math.random() * (eg.ultra ? ULTRA_EGG_T : EGG_T);
      eg.m.visible = true;
    }
  }
  if (Net.on && !Net.isHost) { UI.toast('WAITING ON FIELD COMMAND'); return; }
  Enemies.kills = 0;
  if (Net.on) { Net.resetMatch(); Net.send('restart', {}); }
  Game.leader = false;                   // command resets — re-earn the star
  setUnit(Game.unit);                    // restores unit hp/mag/reserve
  Player.pos.set(0, 0, 0); Player.vel.set(0, 0, 0);
  Player.dead = false; Player.reloading = false;
  Player.firing = false; Player.firingMouse = false; Player.aiming = false; Player.aimingMouse = false; Player.ads = false;
  Player.yaw = Math.PI; Player.pitch = 0;
  Waves.wave = 0; Waves.t = 0; Waves.spawnT = 1.2;
  Game.won = false; Game.time = 0; Game.leader = false;
  Player.kills = 0;
  $id('gameover').classList.add('hidden');
  $id('victory').classList.add('hidden');
  $id('hud').classList.remove('hidden');
  Game.running = true;
  Waves.reset();
  resetBaseLift();                            // base waits on the pad again
  if (Game.online) { clearAllies(); buildSquadHud(); }
  else spawnAllies();                                 // solo ops gets AI marines
  canvasClick();
}

Game.gameOver = function () {
  Audio2.over();
  if (Net.on) {
    // match keeps going for the squad — you redeploy shortly
    Game.respawnT = 6;
    UI.waveBanner('K.I.A. — REDEPLOYING');
    document.exitPointerLock && document.exitPointerLock();
    return;
  }
  Game.running = false;
  document.exitPointerLock && document.exitPointerLock();
  $id('death-stats').innerHTML =
    `Hives destroyed: <b>${4 - Waves.hivesLeft()}/4</b><br>` +
    `Waves survived: <b>${Waves.wave}</b><br>Zerg killed: <b>${Enemies.kills}</b>`;
  $id('gameover').classList.remove('hidden');
};

Game.victory = function () {
  Game.running = false;
  Game.won = true;
  Audio2.pickup(); setTimeout(() => Audio2.wave(), 300);
  document.exitPointerLock && document.exitPointerLock();
  const mins = Math.floor(Game.time / 60), secs = Math.floor(Game.time % 60);
  $id('win-stats').innerHTML =
    `All spawn-hives destroyed.<br>` +
    `Time: <b>${mins}:${String(secs).padStart(2, '0')}</b><br>Zerg killed: <b>${Enemies.kills}</b>`;
  $id('victory').classList.remove('hidden');
};

/* ==================== boot ==================== */
window.addEventListener('load', () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  $id('app').appendChild(renderer.domElement);
  Game.renderer = renderer;

  const scene = new THREE.Scene();
  Game.scene = scene;
  Enemies.scene = scene;

  const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 2000);
  scene.add(cam);
  Game.cam = cam;

  buildWorld(scene);
  initPlayer(cam);

  renderer.domElement.addEventListener('click', canvasClick);
  document.addEventListener('pointerlockchange', () => {
    if (Intro.visiting && !document.pointerLockElement) {   // Esc out of the tour
      Intro.leave();
      $id('barracks-back').classList.add('hidden');
      $id('startscreen').classList.remove('hidden');
    }
    const unlocked = Game.running && !document.pointerLockElement && !Pad.on && !Player.dead;
    // online rules: no pausing — the swarm keeps coming without your mouse
    Game.paused = unlocked && !Game.online;
    const pa = $id('paused');
    pa.querySelector('h2').textContent = Game.online ? 'SIGNAL LOST' : 'PAUSED';
    pa.querySelector('p').textContent = Game.online
      ? 'Click to resume control — the match doesn\'t pause'
      : 'Click to resume control';
    pa.classList.toggle('hidden', !unlocked);
  });
  $id('paused').addEventListener('click', canvasClick);
  // squad comms — Z/X/C/V keys + HUD buttons
  document.addEventListener('keydown', e => {
    const c = { z: 'fall', x: 'push', c: 'thanks', v: 'sorry' }[e.key.toLowerCase()];
    if (c) issueOrder(c);
  });
  document.querySelectorAll('#comms button').forEach(b =>
    b.addEventListener('click', () => { issueOrder(b.dataset.cmd); canvasClick(); }));
  // visor damage layers — textures drawn once
  $id('visor').style.backgroundImage = `url(${visorTexture('scratch')})`;
  $id('visor-cracks').style.backgroundImage = `url(${visorTexture('crack')})`;
  document.querySelectorAll('.cls').forEach(b => b.onclick = () => {
    if (b.dataset.unit === 'marauder' && !Game.leader) {
      UI.toast('MARAUDER IS COMMAND ISSUE — EARN \u2605 AT 50 KILLS');
      return;
    }
    document.querySelectorAll('.cls').forEach(x => x.classList.toggle('on', x === b));
    Game.unit = b.dataset.unit;
    enterBarracks();                          // picked → go see your rig
  });
  Intro.onSuitTap = deployFromBarracks;
  $id('barracks-back').onclick = () => {
    Intro.leave();
    $id('barracks-back').classList.add('hidden');
    $id('startscreen').classList.remove('hidden');
  };
  $id('btn-online').onclick = startOnline;
  $id('btn-lobby-cancel').onclick = () => {
    clearTimeout(Game._soloT);
    Net.bail();
    document.querySelectorAll('.world').forEach(b => b.classList.remove('on'));
    $id('startscreen').classList.remove('hidden');
    Intro.show();                                    // back inside the barracks
  };
  document.querySelectorAll('.world').forEach(b =>
    b.addEventListener('click', () => { joinWorld(b.dataset.w); canvasClick(); }));
  $id('btn-retry').onclick = restart;
  $id('btn-vretry').onclick = restart;
  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    if (Intro.cam) { Intro.cam.aspect = cam.aspect; Intro.cam.updateProjectionMatrix(); }
    if (Intro.storyCam) { Intro.storyCam.aspect = cam.aspect; Intro.storyCam.updateProjectionMatrix(); }
  });
  // Enter also starts
  window.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !Game.running && (Player.dead || Game.won)) restart();
    else if (e.key === 'Enter' && !Game.running && !Intro.playing && !Intro.story && Intro.visiting) {
      deployFromBarracks();
    }
    else if (e.key === 'Enter' && !Game.running && !Intro.playing && !Intro.story && !Intro.visiting
             && $id('lobbyscreen').classList.contains('hidden')) {
      enterBarracks();
    }
  });

  // #auto → jump straight into a solo match (headless/debug hook)
  if (location.hash === '#auto') startGame(false);
  else Intro.playStory(() => {
    Intro.show();                                     // aerial done — drift in the barracks
    $id('startscreen').classList.remove('hidden');
  });                                 // menu lives inside the base

  let last = performance.now();
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    try {
      Net.update(dt);                          // lobby countdown + sync always ticks
    } catch (err) {                            // a net hiccup must not freeze the frame
      if (!Game._netErrT || performance.now() - Game._netErrT > 4000) {
        Game._netErrT = performance.now();
        console.error('[net]', err);
        UI.toast('NET ERR: ' + err.message);
      }
    }

    if (Game.running && !Game.paused) {
      try {
      Game.time += dt;
      if (!Player.dead) {
        const pad = pollPad(dt) || { moveX: 0, moveZ: 0, sprint: false, fire: false, aim: false };
        Player.firing = Player.firingMouse || pad.fire;
        // firing counts as aiming for accuracy/look/walk — ads stays
        // true ADS only so the FOV never zooms on its own
        Player.ads = Player.aimingMouse || pad.aim;
        Player.aiming = Player.ads || Player.firing;
        // merge keyboard
        const kx = (KEYS['d'] ? 1 : 0) - (KEYS['a'] ? 1 : 0) + pad.moveX;
        const kz = (KEYS['s'] ? 1 : 0) - (KEYS['w'] ? 1 : 0) + pad.moveZ;
        const sprint = KEYS['shift'] || pad.sprint;
        movePlayer(dt, Math.max(-1, Math.min(1, kx)), Math.max(-1, Math.min(1, kz)), sprint);
        updatePlayer(dt);
      } else {
        // death cam: slump to ground; online → auto-redeploy
        updateMedicBeam();                         // on-guard fails dead → beam off
        Player.cam.position.y += (0.35 - Player.cam.position.y) * dt * 3;
        Player.cam.rotation.z += (0.5 - Player.cam.rotation.z) * dt * 2;
        updateMissiles(dt);                          // rockets still fly while you bleed out
        if (Net.on) {
          Game.respawnT -= dt;
          if (Game.respawnT <= 0) respawn();
        }
      }

      // host simulates the swarm; clients render net replicas
      if (!Net.on || Net.isHost) {
        updateEnemies(dt, damagePlayer);
        Waves.update(dt);
      }
      updateAllies(dt);
      updateSpawners(dt);
      updateGibs(dt);
      updatePickups(dt);
      updateTracers(dt);
      updateBase(dt);                              // ride home spools up + lifts
      UI.updateHud();
      drawRadar();
      } catch (err) {                                  // surface sim errors instead of freezing
        if (!Game._errT || performance.now() - Game._errT > 4000) {
          Game._errT = performance.now();
          console.error('[sim]', err);
          UI.toast('SIM ERR: ' + err.message);
        }
      }
    } else {
      pollPad(dt);
    }

    Intro.update(dt);                                  // cinematic + menu backdrop tick
    const ix = Intro.active() && !Game.running;        // menu & cinematic share the intro scene
    renderer.render(Intro.story ? scene : (ix ? Intro.scene : scene),
                    Intro.story ? Intro.storyCam : (ix ? Intro.cam : cam));
  }
  requestAnimationFrame(loop);
});
