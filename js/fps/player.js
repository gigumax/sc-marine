/* ============================================================
   player.js — marine: FPS controls, rifle, shooting, vitals
   ============================================================ */

const Player = {
  pos: new THREE.Vector3(0, 0, 0),       // feet position
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  eyeH: 1.62,
  hp: 100, maxHp: 100,
  mag: 32, magSize: 32, reserve: 320,
  healPwr: 0,                                 // medic beam hp per pulse
  energy: 100, energyMax: 100,                // medic capacitor — blue cubes refill it
  unit: 'marine',                         // 'marine' | 'marauder'
  fireRate: 1 / 9, dmg: 2, hsDmg: 34,
  reloading: false, reloadT: 0,
  fireT: 0, firing: false, aiming: false, ads: false,
  firingMouse: false, aimingMouse: false,
  dead: false,
  kills: 0,                          // your zerg kills → 50 earns command
  regenT: 0,
  stimT: 0, stimCd: 0,                // stimpack burn + injector cooldown
  bobT: 0, stepT: 0,
  recoil: 0,
  shake: 0,
  grounded: true,
  moving: false,
  self: null, selfLegs: [],               // your visible body/legs
  cam: null, gun: null, muzzle: null, muzzleLight: null,
  arms: null, armSide: 1,                   // marauder launcher arms + which tube fires next
  tracers: [], impacts: [],
  missiles: [], smoke: [],                  // marauder projectiles + exhaust
};

const EYE = () => Player.pos.y + Player.eyeH;

/* ---------- rifle viewmodel ---------- */
function buildGun(camera) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4552, roughness: 0.5, metalness: 0.7 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.7, metalness: 0.4 });
  const glow  = new THREE.MeshBasicMaterial({ color: 0x4ad0ff });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), metal);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.42);
  g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), dark);
  mag.position.set(0, -0.13, 0.05); mag.rotation.x = 0.25;
  g.add(mag);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.2), dark);
  stock.position.set(0, -0.01, 0.32);
  g.add(stock);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), metal);
  sight.position.set(0, 0.095, -0.1);
  g.add(sight);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), glow);
  dot.position.set(0, 0.115, -0.1);
  g.add(dot);
  // grip light strip (marine suit glow)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.015, 0.3), glow);
  strip.position.set(0, -0.045, -0.05);
  g.add(strip);

  // muzzle flash sprite + light
  const flashMat = new THREE.SpriteMaterial({
    color: 0xffd080, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.35, 0.35, 0.35);
  flash.position.set(0, 0.02, -0.66);
  g.add(flash);
  Player.muzzle = flash;
  const ml = new THREE.PointLight(0xffb060, 0, 9);
  ml.position.set(0, 0.02, -0.7);
  g.add(ml);
  Player.muzzleLight = ml;

  g.position.set(0.26, -0.22, -0.45);
  camera.add(g);
  Player.gun = g;
}

/* ---------- marauder launcher arms — two tubes, each with a visible bore ---------- */
function buildMarauderArms(camera) {
  const armor  = new THREE.MeshStandardMaterial({ color: 0x2e3a48, roughness: 0.55, metalness: 0.45 });
  const armorD = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.7,  metalness: 0.35 });
  const boreMat= new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.4,  metalness: 0.7 });
  const red    = new THREE.MeshStandardMaterial({ color: 0xb83426, roughness: 0.55, metalness: 0.4 });
  const glowO  = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const hole   = new THREE.MeshBasicMaterial({ color: 0x05070a });

  const mk = side => {
    const arm = new THREE.Group();
    // forearm gauntlet — the square launcher pod + red wrist cuff
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.62), armor));
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.24), red);
    cuff.position.set(0, 0, -0.18); arm.add(cuff);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.4), armorD);
    plate.position.set(0, 0.12, 0.04); arm.add(plate);
    // launcher bore — barrel collar, dark cavity, glowing rim (missiles exit here)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 12), boreMat);
    collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.02, -0.33); arm.add(collar);
    const cavity = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), hole);
    cavity.position.set(0, 0.02, -0.395); arm.add(cavity);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.013, 6, 18), glowO);
    rim.position.set(0, 0.02, -0.398); arm.add(rim);
    // top vent slots
    for (const vx of [-0.09, 0.09]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.3), glowO);
      v.position.set(vx, 0.17, -0.02); arm.add(v);
    }
    // upper arm trailing back toward the body
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.5), armorD);
    upper.position.set(-side * 0.08, -0.1, 0.42); upper.rotation.x = 0.5; arm.add(upper);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), armor);
    shoulder.position.set(-side * 0.05, 0.05, 0.62); arm.add(shoulder);   // pauldron edge peeking in
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), armor);
    elbow.position.set(-side * 0.1, -0.28, 0.6); arm.add(elbow);
    // fire bits — bore origin, per-arm flash + light
    const bore = new THREE.Object3D();
    bore.position.set(0, 0.02, -0.44); arm.add(bore);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffd080, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flash.scale.set(0.55, 0.55, 0.55); flash.position.copy(bore.position); arm.add(flash);
    const light = new THREE.PointLight(0xffb060, 0, 8);
    light.position.copy(bore.position); arm.add(light);
    arm.userData = { bore, flash, light, recoil: 0, side,
      base: new THREE.Vector3(side * 0.36, -0.3, -0.66) };
    arm.position.copy(arm.userData.base);
    arm.rotation.y = -side * 0.16;                          // toe-in so the bore reads on screen
    return arm;
  };
  Player.arms = { L: mk(-1), R: mk(1) };
  camera.add(Player.arms.L, Player.arms.R);
}

/* ---------- init ---------- */
function initPlayer(camera) {
  Player.cam = camera;
  Player.pos.set(0, 0, 0);
  Player.yaw = Math.PI; Player.pitch = 0;
  Player.hp = 100; Player.mag = 32; Player.reserve = 320;
  Player.reloading = false; Player.dead = false;
  Player.recoil = 0; Player.shake = 0;
  buildGun(camera);
  buildMarauderArms(camera);
  Player.armSide = 1;
  {
    const heavy = Player.unit === 'marauder';
    Player.gun.visible = !heavy;
    Player.arms.L.visible = Player.arms.R.visible = heavy;
  }

  // helmet flashlight
  const spot = new THREE.SpotLight(0xcfe8ff, 0.9, 40, 0.55, 0.4, 1);
  camera.add(spot);
  spot.position.set(0, 0.1, 0);
  const tgt = new THREE.Object3D();
  tgt.position.set(0, 0, -10);
  camera.add(tgt);
  spot.target = tgt;

  // mouselook
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement && !Player.dead) {
      Player.yaw   -= e.movementX * 0.0022;
      Player.pitch -= e.movementY * 0.0022;
      Player.pitch = Math.max(-1.45, Math.min(1.45, Player.pitch));
    }
  });
  document.addEventListener('mousedown', e => {
    if (!Game.running || Player.dead) return;
    if (e.button === 0) Player.firingMouse = true;
    if (e.button === 2) Player.aimingMouse = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) Player.firingMouse = false;
    if (e.button === 2) Player.aimingMouse = false;
  });
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'r') startReload();
    if (e.key.toLowerCase() === 't') stimPack();
    if (e.key === ' ') { e.preventDefault(); tryJump(); }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());

  buildSelfBody(camera.parent);           // camera.parent === scene
}

/* ---------- movement ---------- */
const KEYS = {};
document.addEventListener('keydown', e => KEYS[e.key.toLowerCase()] = true);
document.addEventListener('keyup',   e => KEYS[e.key.toLowerCase()] = false);

function tryJump() {
  if (Player.grounded && !Player.dead) {
    Player.vel.y = 5.4;
    Player.grounded = false;
    Audio2.jump();
  }
}
function startReload() {
  // bottomless mags — reload is a no-op now
}

/* ---------- stimpack — burn vitals for speed + fire-rate (SC canon: can't kill) ---------- */
function stimPack() {
  if (!Game.running || Player.dead) return;
  if (Player.stimCd > 0) { Audio2.dry(); UI.toast('STIM RECHARGING'); return; }
  const cost = Math.min(15, Player.hp - 8);          // needles stop short of lethal
  if (cost <= 0) { Audio2.dry(); UI.toast('TOO WEAK FOR STIM'); return; }
  Player.hp -= cost;
  Player.stimT = 7; Player.stimCd = 20;              // 7s hot, 20s till the next dose
  Audio2.stim();
  UI.toast('STIMPACK — SYSTEMS HOT');
}

function movePlayer(dt, moveX, moveZ, sprint) {
  // input dir in local space → world
  const sin = Math.sin(Player.yaw), cos = Math.cos(Player.yaw);
  let dx = moveX * cos + moveZ * sin;
  let dz = -moveX * sin + moveZ * cos;
  const len = Math.hypot(dx, dz);
  const speed = (sprint ? 9.2 : 6.0) * (Player.ads ? 0.55 : 1)
    * (Player.stimT > 0 ? 1.45 : 1);                  // stim legs — scoped-in still slows
  if (len > 0) { dx /= len; dz /= len; }

  const res = worldCollide(
    Player.pos.x + dx * speed * dt,
    Player.pos.z + dz * speed * dt,
    0.5
  );
  Player.pos.x = res.x; Player.pos.z = res.z;

  // gravity / jump
  Player.vel.y -= 16 * dt;
  Player.pos.y += Player.vel.y * dt;
  if (Player.pos.y <= 0) { Player.pos.y = 0; Player.vel.y = 0; Player.grounded = true; }

  Player.moving = len > 0;
  // headbob + footsteps
  if (len > 0 && Player.grounded) {
    Player.bobT += dt * (sprint ? 11 : 8);
    Player.stepT -= dt;
    if (Player.stepT <= 0) { Player.stepT = sprint ? 0.28 : 0.4; Audio2.step(); }
  } else {
    Player.bobT *= 1 - Math.min(1, dt * 8);
  }

  // regen vitals after 5s no damage
  if (Player.regenT > 0) Player.regenT -= dt;
  else if (Player.hp < Player.maxHp) Player.hp = Math.min(Player.maxHp, Player.hp + 9 * dt);
}

/* ---------- shooting ---------- */
const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();

const MEDIC_ECOST = 4;                        // energy per beam pulse (~4s of sustained fire)

function fireWeapon() {
  if (Player.unit === 'medic' && Player.energy <= 0) {
    Player.fireT = 0.3; Audio2.dry(); return;   // capacitor dead — grab a blue cube
  }
  Player.fireT = Player.fireRate * (Player.stimT > 0 ? 0.6 : 1);  // stim shreds
  Player.recoil = Math.min(1, Player.recoil + 0.55);
  Player.shake = Math.min(1, Player.shake + (Player.unit === 'marauder' ? 0.7 : 0.3));
  Player.pitch += Player.unit === 'marauder'
    ? 0.02 + Math.random() * 0.008
    : 0.006 + Math.random() * 0.004;
  Player.yaw   += (Math.random() - .5) * 0.004;

  // muzzle flash (marine rifle only — marauder flashes at the fired tube)
  if (Player.unit !== 'marauder') {
    Player.muzzle.material.opacity = 1;
    Player.muzzle.material.rotation = Math.random() * 7;
    Player.muzzleLight.intensity = 2.2;
  }

  Player.unit === 'marauder' ? Audio2.shotBig()
    : Player.unit === 'medic' ? Audio2.heal() : Audio2.shot();
  // the swarm hears the discharge — they stalk the firing point
  noiseAt(Player.pos.x, Player.pos.z, Player.unit === 'medic' ? 12 : 30);

  // medic: green nano beam — knits squadmates back together, hurts nothing
  if (Player.unit === 'medic') {
    Player.energy -= MEDIC_ECOST;
    _dir.set((Math.random() - .5) * 0.006, (Math.random() - .5) * 0.006, -1)
        .normalize().applyQuaternion(Player.cam.quaternion);
    _ray.set(Player.cam.getWorldPosition(new THREE.Vector3()), _dir);
    _ray.far = 30;                                // beam has a working range
    const meshes = [];
    for (const a of Allies.list) if (!a.dead) meshes.push(a.mesh);
    if (Net.on) for (const id in Net.peers) {
      const q = Net.peers[id];
      if (!q.dead) meshes.push(q.mesh);
    }
    const hits = _ray.intersectObjects(meshes, true);
    const mz = Player.cam.getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0.12, -0.08, 0).applyQuaternion(Player.cam.quaternion));
    let end = _ray.ray.origin.clone().addScaledVector(_dir, 28);
    if (hits.length) {
      const h = hits[0]; end = h.point.clone();
      let obj = h.object;
      while (obj) {
        if (obj.userData.ally) {
          const a = obj.userData.ally;
          if (a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + Player.healPwr);
            a.healT = 0.3;                        // green flash on the patient
            if (Math.random() < 0.06) allySay(a, pick(BARKS.thanks));
          }
          healBurst(h.point);
          break;
        }
        if (obj.userData.peerId) {
          Net.send('pheal', { to: obj.userData.peerId, amt: Player.healPwr });
          healBurst(h.point);
          break;
        }
        obj = obj.parent;
      }
    } else {
      const t = -_ray.ray.origin.y / _dir.y;      // beam hits the deck
      if (_dir.y < 0 && t > 0 && t < 28) end = _ray.ray.origin.clone().addScaledVector(_dir, t);
    }
    // beam visual is the continuous green laser in updateMedicBeam —
    // this pulse only heals + leaves contact motes, no projectile spam
    if (Net.on) Net.tellShot({ o: mz, e: end, heal: 1 });
    return;
  }

  // marauder: alternate launcher tubes — rocket spawns at the bore, that arm kicks back
  if (Player.unit === 'marauder') {
    const arm = Player.armSide > 0 ? Player.arms.R : Player.arms.L;
    Player.armSide = -Player.armSide;               // alternate barrels L ↔ R
    const ud = arm.userData;
    ud.recoil = 1;                                  // that arm jerks back
    ud.flash.material.opacity = 1;
    ud.flash.material.rotation = Math.random() * 7;
    ud.light.intensity = 2.4;
    _dir.set((Math.random() - .5) * 0.01, (Math.random() - .5) * 0.01, -1)
        .normalize().applyQuaternion(Player.cam.quaternion);
    const portPos = ud.bore.getWorldPosition(new THREE.Vector3());
    spawnMissile(portPos.clone().addScaledVector(_dir, 0.3), _dir.clone());
    if (Net.on) Net.tellShot({ o: portPos, e: portPos.clone().addScaledVector(_dir, 60), mis: 1 });
    return;
  }

  const muzzlePos = Player.cam.getWorldPosition(new THREE.Vector3())
    .add(new THREE.Vector3(0.12, -0.08, 0).applyQuaternion(Player.cam.quaternion));

  // spread: tighter when aiming
  const spread = Player.aiming ? 0.004 : 0.017;
  _dir.set((Math.random() - .5) * spread * 2, (Math.random() - .5) * spread * 2, -1)
      .normalize().applyQuaternion(Player.cam.quaternion);
  _ray.set(Player.cam.getWorldPosition(new THREE.Vector3()), _dir);
  _ray.far = 120;

  const meshes = [];
  for (const e of Enemies.list) if (!e.dead) meshes.push(e.mesh);
  for (const s of World.spawners) if (!s.dead) meshes.push(s.mesh);
  if (World.base && !World.base.warped) meshes.push(World.base.g);   // the ride home
  const hits = _ray.intersectObjects(meshes, true);

  let end = _ray.ray.origin.clone().add(_dir.clone().multiplyScalar(80));
  if (hits.length) {
    const h = hits[0];
    end = h.point.clone();
    // walk up to the entity root
    let obj = h.object, en = null, sp = null, part = 'body';
    let hitBase = false;
    while (obj) {
      if (obj.userData.enemy) { en = obj.userData.enemy; break; }
      if (obj.userData.spawner) { sp = obj.userData.spawner; break; }
      if (obj.userData.base) { hitBase = true; break; }
      if (obj.userData.part) part = obj.userData.part;
      obj = obj.parent;
    }
    if (en) {
      const head = part === 'head';
      const dmg = head ? Player.hsDmg : Player.dmg;
      if (Net.on) Net.hitEnemy(en, dmg, head);
      else damageEnemy(en, dmg, head, true);
    } else if (sp) {
      const ok = Net.on
        ? Net.hitHive(sp, Player.dmg, Player.pos)
        : damageSpawner(sp, Player.dmg, Player.pos);
      if (ok === false) {
        // armored shell shrugged it off — you're too far away
        if (!Player._rangeHintT || performance.now() - Player._rangeHintT > 4000) {
          Player._rangeHintT = performance.now();
          UI.toast('HIVE ARMORED — GET CLOSER');
        }
      }
    } else if (hitBase) {                                // friendly fire on the dropship
      sparkBurst(h.point);
      const b = World.base;
      if (b && !b.boomed) {
        b.hp -= Player.dmg;
        if (b.hp <= 0) baseBoom();
        else if (b.hp < 200 && (!Player._baseHintT || performance.now() - Player._baseHintT > 5000)) {
          Player._baseHintT = performance.now();
          UI.toast('CEASE FIRE — THAT\'S OUR LIFT OUT');
        }
      }
    }
  } else {
    // wall/ground spark — cheap test: ray vs ground plane
    const t = -_ray.ray.origin.y / _dir.y;
    if (_dir.y < 0 && t > 0 && t < 80) {
      end = _ray.ray.origin.clone().add(_dir.clone().multiplyScalar(t));
      sparkBurst(end);
    }
  }
  spawnTracer(muzzlePos.clone().addScaledVector(_dir, 0.9), end);
  if (Net.on) Net.tellShot({ o: muzzlePos, e: end });
}

function spawnTracer(from, to, col, ttl) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: col || 0xffe8a0, transparent: true, opacity: 0.9,
  }));
  Enemies.scene.add(line);
  Player.tracers.push({ m: line, t: 0, ttl: ttl || 0.07 });
}

/* little green motes where the nano beam makes contact */
const _healGeo = new THREE.SphereGeometry(0.035, 4, 3);
const _healMat = new THREE.MeshBasicMaterial({ color: 0x5aff9a });
/* continuous nano beam — a real green laser from screen-center while the
   medic holds the trigger; pulses in fireWeapon do the healing */
let _beamG = null;
function updateMedicBeam() {
  const on = Player.unit === 'medic' && Player.firing && !Player.dead
    && !Player.reloading && Player.energy > 0;
  if (!on) { if (_beamG) _beamG.visible = false; return; }
  if (!_beamG) {
    _beamG = new THREE.Group();
    const mk = (col, op, th) => {
      const g = new THREE.CylinderGeometry(th, th, 1, 6, 1, true);
      g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);   // base at origin, +z out
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      _beamG.add(m); return m;
    };
    mk(0x4aff8a, 0.35, 0.05);                            // green halo
    mk(0xeafff4, 0.9, 0.018);                            // white-hot core
    _beamG.visible = false;
    Enemies.scene.add(_beamG);
  }
  const from = Player.cam.getWorldPosition(new THREE.Vector3());
  _dir.set(0, 0, -1).applyQuaternion(Player.cam.quaternion);
  _ray.set(from, _dir); _ray.far = 30;
  const meshes = [];
  for (const a of Allies.list) if (!a.dead) meshes.push(a.mesh);
  if (Net.on) for (const id in Net.peers) {
    const q = Net.peers[id]; if (!q.dead) meshes.push(q.mesh);
  }
  const hits = _ray.intersectObjects(meshes, true);
  let end;
  if (hits.length) end = hits[0].point;
  else {
    const t = -from.y / _dir.y;                          // beam hits the deck
    end = (_dir.y < 0 && t > 0 && t < 28)
      ? from.clone().addScaledVector(_dir, t)
      : from.clone().addScaledVector(_dir, 28);
  }
  const mz = from.clone().addScaledVector(_dir, 0.45);   // just ahead of the lens
  _beamG.visible = true;
  _beamG.position.copy(mz);
  _beamG.lookAt(end);
  _beamG.scale.set(1, 1, Math.max(0.01, end.distanceTo(mz)));
  _beamG.children[0].material.opacity = 0.3 + Math.sin(Game.time * 40) * 0.08; // shimmer
}

function healBurst(pos) {
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(_healGeo, _healMat);
    m.position.copy(pos);
    Enemies.scene.add(m);
    Enemies.gibs.push({
      m, ttl: 0.35, t: 0,
      vx: (Math.random() - .5) * 1.6, vy: 1 + Math.random() * 1.6,
      vz: (Math.random() - .5) * 1.6, rs: (Math.random() - .5) * 6,
    });
  }
}

const _sparkGeo = new THREE.SphereGeometry(0.03, 4, 3);
const _sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc060 });
function sparkBurst(pos) {
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(_sparkGeo, _sparkMat);
    m.position.copy(pos);
    Enemies.scene.add(m);
    Enemies.gibs.push({
      m, ttl: 0.25, t: 0,
      vx: (Math.random() - .5) * 4, vy: 1 + Math.random() * 2, vz: (Math.random() - .5) * 4, rs: 0,
    });
  }
}

/* ---------- marauder rockets — projectile + smoke trail + splash ---------- */
const _misGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.4, 6);
const _misMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.5, metalness: 0.6 });
const _misTipGeo = new THREE.ConeGeometry(0.05, 0.16, 6);
const _misTipMat = new THREE.MeshBasicMaterial({ color: 0xff9040 });
const MIS_SPD = 26, SPLASH_R = 2.6;

function missileMesh() {
  const m = new THREE.Group();
  m.add(new THREE.Mesh(_misGeo, _misMat));
  const tip = new THREE.Mesh(_misTipGeo, _misTipMat);
  tip.position.y = 0.28;
  m.add(tip);
  return m;
}

function spawnMissile(from, dir, dmg) {
  const m = missileMesh();
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  Enemies.scene.add(m);
  Player.missiles.push({ m, vel: dir.clone().multiplyScalar(MIS_SPD), t: 0, smokeT: 0,
                         live: true, dmg: dmg || Player.dmg });
}

let _smokeTex = null;
function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _smokeTex = new THREE.CanvasTexture(c);
  return _smokeTex;
}
function spawnSmokePuff(pos, color, ttl, scale) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({
    map: smokeTexture(), color: color || 0x9aa4ae,
    transparent: true, opacity: 0.5, depthWrite: false,
  }));
  m.position.copy(pos);
  Enemies.scene.add(m);
  Player.smoke.push({ m, t: 0, ttl: ttl || 0.9, scale: scale || 1 });
}

const _boomGeo = new THREE.SphereGeometry(0.06, 5, 4);
const _boomMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
function explodeFx(pos) {
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(_boomGeo, _boomMat);
    m.position.copy(pos);
    Enemies.scene.add(m);
    Enemies.gibs.push({
      m, ttl: 0.4, t: 0,
      vx: (Math.random() - .5) * 8, vy: 1 + Math.random() * 4, vz: (Math.random() - .5) * 8, rs: 0,
    });
  }
  spawnSmokePuff(pos, 0xffa030, 0.25, 1.8);            // core flash
  for (let i = 0; i < 4; i++)
    spawnSmokePuff(pos.clone().add(new THREE.Vector3(
      (Math.random() - .5) * 0.8, Math.random() * 0.5, (Math.random() - .5) * 0.8)), 0x555a60, 1.3, 1.3);
  Audio2.boom(pos.distanceTo(Player.pos));
}

function explodeDamage(pos, direct, dmg) {
  dmg = dmg || Player.dmg;
  if (direct) {                                        // the thing it actually hit eats full damage
    if (Net.on) Net.hitEnemy(direct, dmg, false);
    else damageEnemy(direct, dmg, false, true);
  }
  for (const e of Enemies.list) {                      // everything nearby takes splash
    if (e.dead || e === direct) continue;
    if (e.mesh.position.distanceTo(pos) < SPLASH_R) {
      const s = Math.round(dmg / 2);
      if (Net.on) Net.hitEnemy(e, s, false);
      else damageEnemy(e, s, false, true);
    }
  }
}

function updateMissiles(dt) {
  for (const ms of Player.missiles) {
    ms.t += dt; ms.smokeT -= dt;
    ms.m.position.addScaledVector(ms.vel, dt);
    ms.vel.y -= 1.5 * dt;                              // subtle droop on the arc
    if (ms.smokeT <= 0) { ms.smokeT = 0.035; spawnSmokePuff(ms.m.position); }

    let detonate = ms.t > 4, direct = null;
    if (ms.live && !detonate) {
      const mp = ms.m.position;
      for (const e of Enemies.list) {
        if (e.dead) continue;
        if (mp.distanceTo(e.mesh.position.clone().setY(mp.y)) < (e.radius || 0.8) + 0.55
            && mp.y < e.mesh.position.y + 1.6) { detonate = true; direct = e; break; }
      }
      if (!detonate) for (const s of World.spawners) {
        if (s.dead) continue;
        if (Math.hypot(mp.x - s.pos.x, mp.z - s.pos.z) < 2.3 && mp.y < 2.5) {
          detonate = true;
          const ok = Net.on ? Net.hitHive(s, ms.dmg, Player.pos)
                            : damageSpawner(s, ms.dmg, Player.pos);
          break;
        }
      }
      if (!detonate && World.base && !World.base.warped
          && Math.hypot(mp.x, mp.z - 18) < 3.4 && mp.y < 3.4) {   // grenade on the pad
        detonate = true;
        const b = World.base;
        if (!b.boomed && (b.hp -= ms.dmg) <= 0) baseBoom();
      }
      if (!detonate && mp.y <= 0.05) detonate = true;  // dirt
    }
    if (detonate) {
      if (ms.live) explodeDamage(ms.m.position.clone(), direct, ms.dmg);
      explodeFx(ms.m.position.clone());
      Enemies.scene.remove(ms.m); ms.done = true;
    }
  }
  Player.missiles = Player.missiles.filter(m => !m.done);

  for (const s of Player.smoke) {                      // puffs grow + fade
    s.t += dt;
    const k = Math.min(1, s.t / s.ttl);
    s.m.material.opacity = 0.5 * (1 - k);
    s.m.scale.setScalar((0.3 + k * 1.5) * s.scale);
    if (s.t >= s.ttl) { Enemies.scene.remove(s.m); s.done = true; }
  }
  Player.smoke = Player.smoke.filter(s => !s.done);
}

function updateTracers(dt) {
  for (const t of Player.tracers) {
    t.t += dt;
    t.m.material.opacity = 0.9 * (1 - t.t / t.ttl);
    if (t.t > t.ttl) { Enemies.scene.remove(t.m); t.done = true; }
  }
  Player.tracers = Player.tracers.filter(t => !t.done);
}

/* ---------- damage ---------- */
const SUIT_CRIT = 0.3;                             // hp fraction → "SUIT CRITICAL" voice

function damagePlayer(dmg, fromPos) {
  if (Player.dead) return;
  const wasOk = Player.hp > Player.maxHp * SUIT_CRIT;
  Player.hp -= dmg;
  Player.regenT = 5;
  Player.shake = Math.min(1.6, Player.shake + 0.8);
  Audio2.hurt();
  UI.damageFlash();
  if (Player.hp > 0 && wasOk && Player.hp <= Player.maxHp * SUIT_CRIT)
    Audio2.suitCritical();                         // suit computer calls the drop once per crossing
  if (Player.hp <= 0) {
    Player.hp = 0;
    Player.dead = true;
    Game.gameOver();
  }
}
Player.heal = function (n) {
  this.hp = Math.min(this.maxHp, this.hp + n);
  const hf = document.getElementById('heal-flash');
  hf.style.opacity = 1; setTimeout(() => hf.style.opacity = 0, 60);
};

/* ---------- per-frame ---------- */
function updatePlayer(dt) {
  // fire timer — no reload bookkeeping anymore
  if (Player.fireT > 0) Player.fireT -= dt;
  if (Player.stimT > 0) Player.stimT -= dt;          // burn down
  if (Player.stimCd > 0) Player.stimCd -= dt;        // injector refills
  if (Player.firing && Player.fireT <= 0 && !Player.dead) fireWeapon();

  // recoil & shake decay
  Player.recoil = Math.max(0, Player.recoil - dt * 5);
  Player.shake  = Math.max(0, Player.shake  - dt * 4);
  if (Player.muzzle.material.opacity > 0) Player.muzzle.material.opacity -= dt * 14;
  if (Player.muzzleLight.intensity > 0)  Player.muzzleLight.intensity -= dt * 30;

  updateTracers(dt);
  updateMissiles(dt);

  // camera transform: pos + yaw/pitch + bob + shake
  const bobY = Math.sin(Player.bobT * 2) * 0.03;
  const bobX = Math.cos(Player.bobT) * 0.02;
  updateMedicBeam();
  const sx = (Math.random() - .5) * Player.shake * 0.05;
  const sy = (Math.random() - .5) * Player.shake * 0.05;
  Player.cam.position.set(Player.pos.x + bobX, EYE() + bobY, Player.pos.z);
  Player.cam.rotation.order = 'YXZ';
  Player.cam.rotation.y = Player.yaw;
  Player.cam.rotation.x = Player.pitch + Player.recoil * 0.03 + sx;
  Player.cam.rotation.z = sy * 0.5;

  // FOV: aim zoom — only on real ADS; firing gets the accuracy, not the zoom
  const targetFov = Player.ads ? 52 : 75;
  if (Math.abs(Player.cam.fov - targetFov) > 0.5) {
    Player.cam.fov += (targetFov - Player.cam.fov) * Math.min(1, dt * 12);
    Player.cam.updateProjectionMatrix();
  }
  const chEl = document.getElementById('crosshair');
  chEl.classList.toggle('aim', Player.ads);
  chEl.classList.toggle('stim', Player.stimT > 0);   // amber-hot reticle while lit
  // marauder: reticle sits over whichever tube fires next
  const mar = Player.unit === 'marauder';
  chEl.classList.toggle('arm-l', mar && Player.armSide < 0);
  chEl.classList.toggle('arm-r', mar && Player.armSide > 0);

  // gun sway + recoil kick
  const g = Player.gun;
  g.position.z = -0.45 + Player.recoil * 0.07;
  g.position.x = 0.26 + Math.cos(Player.bobT) * 0.008 - (Player.ads ? 0.26 : 0);
  g.position.y = -0.22 + Math.sin(Player.bobT * 2) * 0.006 + (Player.ads ? 0.115 : 0);
  g.rotation.x = Player.reloading ? -0.7 : Player.recoil * 0.12;

  // marauder launcher arms — sway/bob + the fired tube jerks back on its own
  if (Player.arms) for (const arm of [Player.arms.L, Player.arms.R]) {
    if (!arm.visible) continue;
    const ud = arm.userData;
    ud.recoil = Math.max(0, ud.recoil - dt * 5);
    if (ud.flash.material.opacity > 0) ud.flash.material.opacity -= dt * 10;
    if (ud.light.intensity > 0) ud.light.intensity -= dt * 26;
    const r = ud.recoil, s = Math.sign(ud.base.x);
    arm.position.set(
      ud.base.x * (Player.ads ? 0.5 : 1) + Math.cos(Player.bobT) * 0.008,
      ud.base.y + Math.sin(Player.bobT * 2) * 0.008 - r * 0.03 + (Player.ads ? 0.1 : 0),
      ud.base.z + r * 0.26);
    arm.rotation.x = (Player.reloading ? -0.45 : 0) + r * 0.5;
    arm.rotation.y = -s * 0.16;
  }

  // first-person body — rides under the camera, legs swing with the headbob
  const b = Player.self;
  if (b) {
    b.visible = !Player.dead;
    b.rotation.y = Player.yaw + Math.PI;                 // model faces +z
    b.position.set(                                      // tucked just behind the eye
      Player.pos.x + Math.sin(Player.yaw) * 0.12,
      Player.pos.y,
      Player.pos.z + Math.cos(Player.yaw) * 0.12);
    const amp = Player.grounded ? (Player.moving ? 0.65 : 0) : 0;
    const l0 = Player.grounded ? Math.sin(Player.bobT) * amp : 0.3;
    const l1 = Player.grounded ? Math.sin(Player.bobT + Math.PI) * amp : -0.22;
    const k = Math.min(1, dt * 12);
    Player.selfLegs[0].rotation.x += (l0 - Player.selfLegs[0].rotation.x) * k;
    Player.selfLegs[1].rotation.x += (l1 - Player.selfLegs[1].rotation.x) * k;
  }
}

/* ---------- loadout — marine rifleman vs marauder grenadier ---------- */
const UNITS = {
  marine:   { hp: 100, mag: 32, reserve: 320, rate: 1 / 9, dmg: 2,  hs: 34, label: 'C-14 GAUSS',         flash: 0.35 },
  marauder: { hp: 300, mag: 8,  reserve: 96,  rate: 0.53,  dmg: 80, hs: 80, label: 'PUNISHER GRENADES',  flash: 0.6  },
  medic:    { hp: 100, mag: 40, reserve: 0,   rate: 1 / 6, dmg: 0,  hs: 0,  heal: 8, nrg: 100, label: 'NANO BEAM',    flash: 0.35 },
};

function setUnit(unit) {
  const u = UNITS[unit] || UNITS.marine;
  // marauder is command issue — marine until you earn the star
  Player.unit = (unit === 'marauder' && !Game.leader) ? 'marine'
              : (unit in UNITS ? unit : 'marine');
  Player.maxHp = u.hp; Player.hp = u.hp;
  Player.magSize = u.mag; Player.mag = u.mag; Player.reserve = u.reserve;
  Player.fireRate = u.rate; Player.dmg = u.dmg; Player.hsDmg = u.hs;
  Player.healPwr = u.heal || 0;
  Player.energyMax = u.nrg || 0; Player.energy = Player.energyMax;
  Player.stimT = 0; Player.stimCd = 0;               // fresh dose on redeploy
  if (Player.muzzle) {                          // beam color follows the kit
    Player.muzzle.material.color.setHex(Player.unit === 'medic' ? 0x66ffa0 : 0xffd080);
    Player.muzzleLight.color.setHex(Player.unit === 'medic' ? 0x4aff80 : 0xffb060);
  }
  const lb = document.getElementById('ammo-label');
  if (lb) lb.innerHTML = u.label + ' — <span id="reload-hint"></span>';
  if (Player.muzzle) Player.muzzle.scale.setScalar(u.flash);
  // marine shows the rifle; marauder shows the twin launcher arms instead
  if (Player.gun)  Player.gun.visible = Player.unit !== 'marauder';
  if (Player.arms) Player.arms.L.visible = Player.arms.R.visible = Player.unit === 'marauder';
  if (Player.self) { Player.self.parent.remove(Player.self); Player.self = null; Player.selfLegs = []; }
  if (Player.cam && Player.cam.parent) buildSelfBody(Player.cam.parent);
}

/* ---------- your own body — torso, arms, legs visible when you look down ---------- */
function buildSelfBody(scene) {
  const heavy = Player.unit === 'marauder';
  const armor  = new THREE.MeshStandardMaterial({ color: heavy ? 0x2e3a48 : 0x3d5a78, roughness: 0.55, metalness: 0.45 });
  const armorD = new THREE.MeshStandardMaterial({ color: heavy ? 0x1a2230 : 0x24344a, roughness: 0.7, metalness: 0.35 });
  const g = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.7 : 0.52, heavy ? 0.64 : 0.6, heavy ? 0.44 : 0.34), armor);
  torso.position.y = heavy ? 1.2 : 1.12; torso.rotation.x = 0.1;
  g.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.62 : 0.5, 0.12, heavy ? 0.42 : 0.36), armorD);
  belt.position.y = heavy ? 0.92 : 0.84;
  g.add(belt);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.44 : 0.34, 0.2, 0.06), armorD);
  chest.position.set(0, heavy ? 1.34 : 1.24, heavy ? 0.26 : 0.2);   // plate reads when you look down
  g.add(chest);

  if (heavy) {
    // marauder: orange chest vents + pauldron edges + forearm launcher tubes
    const glowO = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    for (const s of [-1, 1]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.05), glowO);
      vent.position.set(s * 0.15, 1.24, 0.24);
      g.add(vent);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.4), armor);
      pad.position.set(s * 0.5, 1.52, -0.04);
      g.add(pad);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x2a4a9a, roughness: 0.5, metalness: 0.5 }));
      cap.position.set(s * 0.5, 1.7, -0.04);
      g.add(cap);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), armorD);
      arm.geometry.translate(0, -0.25, 0);
      arm.position.set(s * 0.46, 1.42, 0.08);
      arm.rotation.x = -0.5;
      g.add(arm);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.55, metalness: 0.6 }));
      tube.rotation.x = Math.PI / 2;
      tube.position.set(s * 0.46, 1.05, 0.35);
      g.add(tube);
    }
  } else {
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2), armorD);
      pad.position.set(s * 0.32, 1.42, 0);
      g.add(pad);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), armor);
      arm.geometry.translate(0, -0.25, 0);                 // pivot at shoulder
      arm.position.set(s * 0.3, 1.38, 0.06);
      arm.rotation.x = -1.05;                              // reach forward to the rifle
      g.add(arm);
    }
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.24 : 0.16, 0.62, heavy ? 0.26 : 0.16), armorD);
    leg.geometry.translate(0, -0.31, 0);                 // pivot at hip
    leg.position.set(s * (heavy ? 0.2 : 0.14), heavy ? 0.8 : 0.74, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 0.3 : 0.18, heavy ? 0.13 : 0.11, heavy ? 0.4 : 0.3),
      heavy ? new THREE.MeshStandardMaterial({ color: 0x2a4a9a, roughness: 0.5, metalness: 0.5 }) : armor);
    boot.position.set(0, heavy ? -0.68 : -0.66, 0.05);
    leg.add(boot);
    g.add(leg);
    legs.push(leg);
  }

  Player.self = g; Player.selfLegs = legs;
  scene.add(g);
}
