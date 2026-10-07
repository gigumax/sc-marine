# Starcraft — Marine

A fan-made, StarCraft-style **first-person shooter** for **personal use**.
You're a marine in a powered suit holding a night landing zone against waves
of zerglings (and worse). Original code — all art is procedural primitives,
all audio is synthesized. Not affiliated with Blizzard.

## Run it

```bash
cd "xbox starcraft"
python3 -m http.server 8471
# open http://localhost:8471
```
Everything is vendored locally (Three.js included) — no internet needed.
Also works by double-clicking `index.html`.

**On an actual Xbox:** open Microsoft Edge on the console, browse to the
served URL, connect a controller — it's playable with full Gamepad support.

## Online Match setup (Firebase)

Multiplayer runs on **Cloud Firestore** — free Spark tier covers a private
squad (it bills per read/write, so keep the squad small and sessions sane).
One-time setup:

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
   (name it anything, e.g. `sc-marine`; disable Analytics — not needed).
2. Build → **Firestore Database** → **Create database** → pick a region →
   start in **test mode** (rules `allow read, write: if true` are fine
   for a private game — tighten later if you share the link publicly).
3. Project settings ⚙ → **Your apps** → **Web** `</>` → register an app →
   copy the `firebaseConfig` object.
4. Paste the values into `FB_CFG` at the top of `js/fps/net.js`
   (`apiKey`, `authDomain`, `projectId`, `appId` — no databaseURL needed).

Until `FB_CFG` is filled in, the lobby shows `NEEDS API KEY — see README`.
Solo Ops works regardless — it never touches the network.

## Controls

| Mouse & Keyboard | Xbox Controller | Action |
|---|---|---|
| WASD | Left stick | Move |
| Mouse | Right stick | Look |
| LMB (hold) | RT | Fire (full-auto C-14) |
| RMB (hold) | LT | Aim down sights |
| Shift | L-stick click | Sprint |
| Space | A | Jump |
| R | X | Reload |
| Esc | — | Release pointer |

## Gameplay

- **Objective:** destroy the **4 spawn-hives** (purple beacons at the corners),
  then clear remaining zerg to secure the zone.
- You deploy as a private under **★ Raynor**, who pushes the hives while
  Diaz & Horner hold formation on him. Rack up **50 zerg kills** (lings +
  hunters) and you're promoted to squad leader — the squad falls in on you.
- Hives pour out burst spawns continuously while they live; threat ramps
  over time:
  **zerglings** chase & lunge, **roaches** hold range and spit acid,
  **hunters** (big lings) appear late.
- **Headshots** deal double damage. Kills may drop **ammo** / **medkits**.
- Vitals regenerate after 5s out of combat.
- Radar (top-right) tracks hives, hostiles, acid bolts, and drops.

## Tech

Three.js r128 (vendored `js/lib/three.min.js`), vanilla JS, WebAudio synth.
Files: `js/fps/audio.js` (sfx), `world.js` (arena), `enemies.js` (zergling
AI + waves), `player.js` (controls + weapon), `main.js` (loop + HUD + pad).
