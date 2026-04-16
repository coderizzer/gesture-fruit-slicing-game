/* ===================================================
   FRUIT SLASH — script.js  (AAA visual upgrade)
   Phaser 3 game engine + MediaPipe hand tracking.
   =================================================== */

// ─── Constants ─────────────────────────────────────────────────────────────

const FRUIT_TYPES = [
  { emoji: '🍉', color: 0xff4466, name: 'watermelon' },
  { emoji: '🍊', color: 0xff8c00, name: 'orange'     },
  { emoji: '🍋', color: 0xffe600, name: 'lemon'      },
  { emoji: '🍇', color: 0xcc44ff, name: 'grape'      },
  { emoji: '🍓', color: 0xff2255, name: 'strawberry' },
  { emoji: '🍍', color: 0xffcc00, name: 'pineapple'  },
  { emoji: '🥝', color: 0x66dd44, name: 'kiwi'       },
  { emoji: '🍑', color: 0xff9966, name: 'peach'      },
];

const MAX_LIVES      = 3;
const SPAWN_INTERVAL = 1200;
const MIN_INTERVAL   = 450;
const GRAVITY        = 600;
const FRUIT_SIZE     = 64;

// ── Slash Trail ──────────────────────────────────────────────────────────────
const TRAIL_MAX_POINTS   = 12;
const TRAIL_LIFETIME_MS  = 120;
const TRAIL_CORE_WIDTH   = 4;
const TRAIL_GLOW_WIDTH   = 18;
const TRAIL_CORE_COLOR   = 0xffffff;
const TRAIL_GLOW_COLOR   = 0x00f5ff;
const TRAIL_CORE_ALPHA   = 1.0;
const TRAIL_GLOW_ALPHA   = 0.45;

// ── Swipe / velocity ─────────────────────────────────────────────────────────
const SLICE_MIN_SPEED      = 45;
const VELOCITY_SMOOTH      = 0.7;
const SEGMENT_RADIUS       = FRUIT_SIZE * 0.85;
const SLICE_MIN_SEGMENT_PX = 8;
const SLICE_DIR_SAMPLES    = 2;

// ── Effects ──────────────────────────────────────────────────────────────────
const SHAKE_DURATION     = 180;   // ms
const SHAKE_INTENSITY    = 7;     // px max offset
const SLOWMO_THRESHOLD   = 3;     // rapid slices to trigger
const SLOWMO_WINDOW_MS   = 800;   // window to count rapid slices
const SLOWMO_DURATION    = 2200;  // ms slow-mo lasts
const SLOWMO_TIMESCALE   = 0.35;  // physics speed multiplier
const COMBO_WINDOW_MS    = 1200;  // ms between slices to keep combo

// ── Bombs ────────────────────────────────────────────────────────────────────
const BOMB_CHANCE        = 0.18;  // probability a spawn slot becomes a bomb (0–1)
const BOMB_SIZE          = 64;    // px — same hitbox as fruit
const BOMB_SHAKE_INT     = 28;    // camera shake intensity on explosion
const BOMB_SHAKE_DUR     = 500;   // ms

// ── Power-ups ────────────────────────────────────────────────────────────────
const POWERUP_CHANCE     = 0.10;  // probability a spawn slot becomes a power-up
const POWERUP_SIZE       = 56;    // px
const FREEZE_DURATION    = 3000;  // ms freeze lasts
const DOUBLE_DURATION    = 5000;  // ms double-score lasts

// ─── Game State ─────────────────────────────────────────────────────────────

let score              = 0;
let lives              = MAX_LIVES;
let gameRunning        = false;
let combo              = 0;
let comboTimer         = null;
let highScore          = parseInt(localStorage.getItem('fruitSlashHigh') || '0');
let spawnDelay         = SPAWN_INTERVAL;
let diffTimer          = null;
let spawnTimer         = null;
let rapidSliceCount    = 0;
let rapidSliceTimer    = null;

// Power-up state
let doubleScoreActive  = false;
let doubleScoreTimer   = null;
let freezeActive       = false;
let freezeTimer        = null;

// ─── DOM References ──────────────────────────────────────────────────────────

const scoreEl        = document.getElementById('score-value');
const lifeIcons      = document.querySelectorAll('.life-icon');
const comboEl        = document.getElementById('combo-display');
const gameOverEl     = document.getElementById('game-over-screen');
const finalScoreEl   = document.getElementById('final-score');
const highScoreEl    = document.getElementById('high-score-value');
const startScreen    = document.getElementById('start-screen');
const startBtn       = document.getElementById('start-btn');
const restartBtn     = document.getElementById('restart-btn');
const slowMoVignette = document.getElementById('slow-mo-vignette');
const powerupHUD     = document.getElementById('powerup-hud');        // new
const gameOverReason = document.getElementById('game-over-reason');   // new

// ─── FINGERTIP TRACKING (MediaPipe Hands) ────────────────────────────────────
// Exact pipeline preserved — do not modify.

let fingerX = null;
let fingerY = null;

const FINGER_SMOOTH     = 0.25;
const FINGER_LERP_STEPS = 2;

window.FingerCursor = (() => {
  let _hands          = null;
  let _videoEl        = null;
  let _ready          = false;
  let _lastVideoTime  = -1;
  let _prevX          = null;
  let _prevY          = null;
  let _lastResultTime = 0;

  function _onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      fingerX = null;
      fingerY = null;
      _prevX  = null;
      _prevY  = null;
      _lastResultTime = 0;
      SwipeDetector.reset();
      SlashTrail.clear();
      return;
    }

    const lm   = results.multiHandLandmarks[0][8];
    const rawX = (1 - lm.x) * window.innerWidth;
    const rawY =       lm.y  * window.innerHeight;

    if (fingerX === null) {
      fingerX = rawX;
      fingerY = rawY;
    } else {
      fingerX += FINGER_SMOOTH * (rawX - fingerX);
      fingerY += FINGER_SMOOTH * (rawY - fingerY);
    }

    const scene = window._phaserScene;
    if (!scene || !gameRunning) {
      _prevX = fingerX;
      _prevY = fingerY;
      return;
    }

    const now = performance.now();
    const dt  = _lastResultTime > 0 ? Math.min(now - _lastResultTime, 100) : 16;
    _lastResultTime = now;

    if (_prevX !== null) {
      for (let s = 1; s <= FINGER_LERP_STEPS; s++) {
        const t = s / (FINGER_LERP_STEPS + 1);
        SlashTrail.addPoint(
          _prevX + t * (fingerX - _prevX),
          _prevY + t * (fingerY - _prevY)
        );
      }
    }

    SlashTrail.addPoint(fingerX, fingerY);
    SwipeDetector.update(fingerX, fingerY, dt);
    checkSlice.call(scene, fingerX, fingerY);

    _prevX = fingerX;
    _prevY = fingerY;
  }

  let lastProcessTime = 0;

  function _loop() {
    requestAnimationFrame(_loop);
    if (!_ready || !_videoEl || _videoEl.readyState < 2) return;
    if (_videoEl.currentTime === _lastVideoTime) return;
    _lastVideoTime = _videoEl.currentTime;
    _hands.send({ image: _videoEl });
  }

  async function start(videoEl) {
    if (_ready) return;
    _videoEl = videoEl;
    console.log('[FingerCursor] Constructing MediaPipe Hands...');
    _hands = new Hands({
      locateFile: (f) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}`
    });
    _hands.setOptions({
      maxNumHands: 1, modelComplexity: 1,
      minDetectionConfidence: 0.7, minTrackingConfidence: 0.5,
    });
    _hands.onResults(_onResults);
    console.log('[FingerCursor] Loading WASM model...');
    await _hands.initialize();
    console.log('[FingerCursor] Ready — starting frame loop.');
    _ready = true;
    _loop();
  }

  return { start };
})();

// ─── Phaser Configuration ────────────────────────────────────────────────────

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 'rgba(0,0,0,0)',
  transparent: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: GRAVITY }, debug: false }
  },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// ─── Phaser Scene Variables ───────────────────────────────────────────────────

let fruits    = [];
let _legacyGfx;
let _dotGfx;
let particles = [];

// ─── SCREEN SHAKE MODULE ─────────────────────────────────────────────────────
// Applies decaying random camera offset each frame — no DOM transforms.
// Public: ScreenShake.trigger(scene, intensity?, duration?)  .tick(delta)
const ScreenShake = (() => {
  let _timer     = 0;
  let _intensity = 0;
  let _scene     = null;

  function trigger(scene, intensity = SHAKE_INTENSITY, duration = SHAKE_DURATION) {
    _scene     = scene;
    _timer     = duration;
    // Only escalate intensity, never reduce an ongoing shake
    if (intensity > _intensity) _intensity = intensity;
  }

  function tick(delta) {
    if (_timer <= 0 || !_scene) return;
    _timer -= delta;
    const decay = Math.max(0, _timer / SHAKE_DURATION);
    const amp   = _intensity * decay;
    _scene.cameras.main.setScroll(
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp
    );
    if (_timer <= 0) {
      _scene.cameras.main.setScroll(0, 0);
      _intensity = 0;
    }
  }

  return { trigger, tick };
})();

// ─── SLOW MOTION MODULE ───────────────────────────────────────────────────────
// Slows Phaser physics + time manager; DOM vignette shows the effect.
// Public: SlowMotion.trigger(scene)  .isActive()
const SlowMotion = (() => {
  let _active  = false;
  let _timeout = null;

  function trigger(scene) {
    if (_active) return;
    _active = true;
    scene.physics.world.timeScale = 1 / SLOWMO_TIMESCALE;
    scene.time.timeScale           = SLOWMO_TIMESCALE;
    if (slowMoVignette) slowMoVignette.classList.add('active');
    clearTimeout(_timeout);
    _timeout = setTimeout(() => {
      scene.physics.world.timeScale = 1;
      scene.time.timeScale           = 1;
      if (slowMoVignette) slowMoVignette.classList.remove('active');
      _active = false;
    }, SLOWMO_DURATION);
  }

  function isActive() { return _active; }
  return { trigger, isActive };
})();

// ─── SLASH TRAIL MODULE ───────────────────────────────────────────────────────
// Catmull-Rom spline with timestamp fade-out, two-pass glow rendering.
// Public: SlashTrail.init(scene)  .addPoint(x,y)  .clear()  .draw(now)
const SlashTrail = (() => {
  const buf = new Array(TRAIL_MAX_POINTS).fill(null);
  let head  = 0;
  let count = 0;
  let gfxGlow, gfxCore;

  function init(scene) {
    gfxGlow = scene.add.graphics(); gfxGlow.setDepth(8);
    gfxCore = scene.add.graphics(); gfxCore.setDepth(9);
  }

  function addPoint(x, y) {
    buf[head] = { x, y, t: performance.now() };
    head      = (head + 1) % TRAIL_MAX_POINTS;
    if (count < TRAIL_MAX_POINTS) count++;
  }

  function clear() { count = 0; head = 0; buf.fill(null); }

  function _livePoints(now) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const idx = (head - 1 - i + TRAIL_MAX_POINTS) % TRAIL_MAX_POINTS;
      const pt  = buf[idx];
      if (!pt) continue;
      const age = now - pt.t;
      if (age > TRAIL_LIFETIME_MS) break;
      out.unshift({ x: pt.x, y: pt.y, alpha: 1 - age / TRAIL_LIFETIME_MS });
    }
    return out;
  }

  function _cr(p0, p1, p2, p3, t) {
    const t2 = t*t, t3 = t2*t;
    return 0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
  }

  function _buildCurve(pts) {
    if (pts.length < 2) return pts;
    const STEPS = 3;
    const out   = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i-1)],   p1 = pts[i];
      const p2 = pts[i+1], p3 = pts[Math.min(pts.length-1, i+2)];
      for (let s = 0; s < STEPS; s++) {
        const t = s / STEPS;
        out.push({
          x: _cr(p0.x,p1.x,p2.x,p3.x,t), y: _cr(p0.y,p1.y,p2.y,p3.y,t),
          alpha: p1.alpha + (p2.alpha - p1.alpha) * t
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function draw(now) {
    gfxGlow.clear(); gfxCore.clear();
    const live = _livePoints(now);
    if (live.length < 2) return;
    const curve = _buildCurve(live);
    if (curve.length < 2) return;
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i].alpha * TRAIL_GLOW_ALPHA;
      if (a < 0.01) continue;
      gfxGlow.lineStyle(TRAIL_GLOW_WIDTH, TRAIL_GLOW_COLOR, a);
      gfxGlow.beginPath();
      gfxGlow.moveTo(curve[i-1].x, curve[i-1].y);
      gfxGlow.lineTo(curve[i].x,   curve[i].y);
      gfxGlow.strokePath();
    }
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i].alpha * TRAIL_CORE_ALPHA;
      if (a < 0.01) continue;
      gfxCore.lineStyle(TRAIL_CORE_WIDTH, TRAIL_CORE_COLOR, a);
      gfxCore.beginPath();
      gfxCore.moveTo(curve[i-1].x, curve[i-1].y);
      gfxCore.lineTo(curve[i].x,   curve[i].y);
      gfxCore.strokePath();
    }
  }

  return { init, addPoint, clear, draw };
})();

// ─── BOMB SYSTEM ──────────────────────────────────────────────────────────────
// Bombs share the same physics pipeline as fruits (added to the `fruits` array
// with kind:'bomb'). checkSlice routes them here instead of sliceFruit.
// Public: BombSystem.spawn(scene)  .explode(fruit, scene)
const BombSystem = (() => {

  function spawn(scene) {
    if (!gameRunning || !scene) return;
    const W = window.innerWidth, H = window.innerHeight;
    const x = Phaser.Math.Between(W * 0.15, W * 0.85);

    // Invisible physics sprite (same pattern as fruits)
    const gfx = scene.add.graphics();
    gfx.fillStyle(0x111111, 0.0);
    gfx.fillCircle(BOMB_SIZE/2, BOMB_SIZE/2, BOMB_SIZE/2);
    gfx.generateTexture('bomb_' + Date.now(), BOMB_SIZE, BOMB_SIZE);
    gfx.destroy();

    const sprite = scene.physics.add.sprite(x, H + 40, 'bomb_' + Date.now());
    sprite.setCircle(BOMB_SIZE/2);
    sprite.setAlpha(0);
    sprite.setDepth(1);

    // Emoji label: bomb with warning glow
    const label = scene.add.text(x, H + 40, '💣', {
      fontSize: `${BOMB_SIZE}px`, align: 'center'
    });
    label.setOrigin(0.5, 0.5);
    label.setDepth(2);

    // Pulsing red glow ring around the bomb
    const glow = scene.add.circle(x, H + 40, BOMB_SIZE * 0.7, 0xff2200, 0);
    glow.setStrokeStyle(3, 0xff4400, 0.8);
    glow.setDepth(1);
    scene.tweens.add({
      targets: glow, scaleX: 1.25, scaleY: 1.25, alpha: 0.6,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    sprite.body.setVelocity(
      Phaser.Math.Between(-180, 180),
      Phaser.Math.Between(-720, -520)
    );
    sprite.body.setMaxVelocityY(1200);

    fruits.push({
      sprite, text: label, glow,
      kind: 'bomb',
      type: { color: 0xff2200, name: 'bomb', emoji: '💣' },
      sliced: false,
      spinSpeed: Phaser.Math.Between(-120, 120)
    });
  }

  function explode(fruit, scene) {
    const cx = fruit.sprite.x;
    const cy = fruit.sprite.y;

    // Destroy the bomb visuals
    if (fruit.glow?.active)   fruit.glow.destroy();
    if (fruit.sprite?.active) fruit.sprite.destroy();
    if (fruit.text?.active)   fruit.text.destroy();

    // Shockwave ring
    const ring = scene.add.circle(cx, cy, 10, 0xffffff, 0);
    ring.setStrokeStyle(5, 0xff4400, 1);
    ring.setDepth(30);
    scene.tweens.add({
      targets: ring, scaleX: 9, scaleY: 9, alpha: 0,
      duration: 500, ease: 'Sine.easeOut',
      onComplete: () => { if (ring.active) ring.destroy(); }
    });

    // Bright orange flash
    const flash = scene.add.circle(cx, cy, BOMB_SIZE * 0.8, 0xff6600, 0.95);
    flash.setDepth(29);
    scene.tweens.add({
      targets: flash, scaleX: 3.5, scaleY: 3.5, alpha: 0,
      duration: 280, ease: 'Quad.easeOut',
      onComplete: () => { if (flash.active) flash.destroy(); }
    });

    // Debris dots — 10 orange + dark particles
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const speed = Phaser.Math.Between(120, 300);
      const col   = i % 2 === 0 ? 0xff4400 : 0x222222;
      const dot   = scene.add.circle(cx, cy, Phaser.Math.Between(5, 9), col, 1);
      dot.setDepth(28);
      scene.tweens.add({
        targets: dot,
        x: cx + Math.cos(angle) * speed,
        y: cy + Math.sin(angle) * speed,
        scaleX: 0.1, scaleY: 0.1, alpha: 0,
        duration: 450 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => { if (dot.active) dot.destroy(); }
      });
    }

    // Full-screen red flash
    const screenFlash = scene.add.rectangle(
      window.innerWidth/2, window.innerHeight/2,
      window.innerWidth, window.innerHeight, 0xff2200, 0.5
    );
    screenFlash.setDepth(50);
    scene.tweens.add({
      targets: screenFlash, alpha: 0, duration: 600, ease: 'Quad.easeOut',
      onComplete: () => { if (screenFlash.active) screenFlash.destroy(); }
    });

    // Heavy screen shake then game over after brief delay so explosion plays
    ScreenShake.trigger(scene, BOMB_SHAKE_INT, BOMB_SHAKE_DUR);
    setTimeout(() => triggerGameOver('💣 BOMB HIT!'), 550);
  }

  return { spawn, explode };
})();

// ─── POWER-UP SYSTEM ──────────────────────────────────────────────────────────
// Two types: 'freeze' (stops gravity on all fruits for 3 s)
//             'double' (doubles all scoring for 5 s)
// Power-ups also live in the `fruits` array with kind:'powerup'.
// Public: PowerUpSystem.spawn(scene)  .activate(fruit, scene)
//         PowerUpSystem.getScoreMultiplier()  .resetAll()
const PowerUpSystem = (() => {

  const TYPES = [
    {
      id      : 'freeze',
      emoji   : '❄️',
      color   : 0x00ccff,
      label   : '❄️ FREEZE!',
      duration: FREEZE_DURATION,
    },
    {
      id      : 'double',
      emoji   : '⚡',
      color   : 0xffdd00,
      label   : '⚡ 2× SCORE!',
      duration: DOUBLE_DURATION,
    },
  ];

  function spawn(scene) {
    if (!gameRunning || !scene) return;
    const W    = window.innerWidth, H = window.innerHeight;
    const type = TYPES[Phaser.Math.Between(0, TYPES.length - 1)];
    const x    = Phaser.Math.Between(W * 0.1, W * 0.9);

    const gfx = scene.add.graphics();
    gfx.fillStyle(type.color, 0.0);
    gfx.fillCircle(POWERUP_SIZE/2, POWERUP_SIZE/2, POWERUP_SIZE/2);
    gfx.generateTexture('pu_' + type.id + '_' + Date.now(), POWERUP_SIZE, POWERUP_SIZE);
    gfx.destroy();

    const sprite = scene.physics.add.sprite(x, H + 40, 'pu_' + type.id + '_' + Date.now());
    sprite.setCircle(POWERUP_SIZE/2);
    sprite.setAlpha(0);
    sprite.setDepth(1);

    const label = scene.add.text(x, H + 40, type.emoji, {
      fontSize: `${POWERUP_SIZE}px`, align: 'center'
    });
    label.setOrigin(0.5, 0.5);
    label.setDepth(2);

    // Spinning halo ring
    const glow = scene.add.circle(x, H + 40, POWERUP_SIZE * 0.75, 0xffffff, 0);
    glow.setStrokeStyle(3, type.color, 0.9);
    glow.setDepth(1);
    scene.tweens.add({
      targets: glow, angle: 360,
      duration: 1200, repeat: -1, ease: 'Linear'
    });
    // Pulse scale
    scene.tweens.add({
      targets: glow, scaleX: 1.18, scaleY: 1.18,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    sprite.body.setVelocity(
      Phaser.Math.Between(-150, 150),
      Phaser.Math.Between(-700, -520)
    );
    sprite.body.setMaxVelocityY(1200);

    fruits.push({
      sprite, text: label, glow,
      kind   : 'powerup',
      puType : type,
      type   : { color: type.color, name: type.id, emoji: type.emoji },
      sliced : false,
      spinSpeed: Phaser.Math.Between(-80, 80)
    });
  }

  function activate(fruit, scene) {
    const cx = fruit.sprite.x, cy = fruit.sprite.y;
    const pt = fruit.puType;

    // Collect visual
    const flash = scene.add.circle(cx, cy, POWERUP_SIZE * 0.6, pt.color, 0.9);
    flash.setDepth(20);
    scene.tweens.add({
      targets: flash, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 350, ease: 'Quad.easeOut',
      onComplete: () => { if (flash.active) flash.destroy(); }
    });

    // Floating activation label in Phaser canvas
    const pop = scene.add.text(cx, cy - 20, pt.label, {
      fontFamily: 'Boogaloo, cursive', fontSize: '36px',
      color: '#ffffff',
      stroke: '#000000', strokeThickness: 5
    });
    pop.setOrigin(0.5, 0.5).setDepth(25);
    scene.tweens.add({
      targets: pop, y: cy - 130, alpha: 0, scaleX: 1.4, scaleY: 1.4,
      duration: 900, ease: 'Cubic.easeOut',
      onComplete: () => { if (pop.active) pop.destroy(); }
    });

    if (pt.id === 'freeze') _activateFreeze(scene, pt.duration);
    if (pt.id === 'double') _activateDouble(pt.duration);
  }

  function _activateFreeze(scene, dur) {
    // Don't stack — reset existing timer if re-triggered
    clearTimeout(freezeTimer);
    freezeActive = true;

    // Slow all fruit bodies to near-zero gravity
    fruits.forEach(f => {
      if (!f.sliced && f.kind !== 'bomb' && f.kind !== 'powerup' && f.sprite?.body) {
        f.sprite.body.setGravityY(-(GRAVITY)); // cancel world gravity
        f.sprite.body.setVelocityY(f.sprite.body.velocity.y * 0.1);
      }
    });

    _showPowerupBanner('❄️ FREEZE ACTIVE', 'freeze', dur);

    freezeTimer = setTimeout(() => {
      freezeActive = false;
      // Restore normal gravity (world gravity handles it, just remove override)
      fruits.forEach(f => {
        if (!f.sliced && f.kind !== 'bomb' && f.kind !== 'powerup' && f.sprite?.body) {
          f.sprite.body.setGravityY(0); // let world gravity take over again
        }
      });
      _hidePowerupBanner('freeze');
    }, dur);
  }

  function _activateDouble(dur) {
    clearTimeout(doubleScoreTimer);
    doubleScoreActive = true;
    _showPowerupBanner('⚡ 2× SCORE', 'double', dur);
    doubleScoreTimer = setTimeout(() => {
      doubleScoreActive = false;
      _hidePowerupBanner('double');
    }, dur);
  }

  function _showPowerupBanner(text, id, dur) {
    if (!powerupHUD) return;
    // Remove any old badge for this id before adding the new one
    const old = powerupHUD.querySelector(`[data-pu="${id}"]`);
    if (old) old.remove();

    const badge = document.createElement('div');
    badge.className   = 'pu-badge pu-badge--in';
    badge.dataset.pu  = id;
    badge.textContent = text;

    // Countdown bar inside the badge
    const bar = document.createElement('div');
    bar.className = 'pu-bar';
    badge.appendChild(bar);
    powerupHUD.appendChild(badge);

    // Trigger CSS entrance animation
    requestAnimationFrame(() => badge.classList.add('pu-badge--visible'));

    // Animate the countdown bar shrinking
    bar.style.transition = `width ${dur}ms linear`;
    requestAnimationFrame(() => { bar.style.width = '0%'; });
  }

  function _hidePowerupBanner(id) {
    if (!powerupHUD) return;
    const badge = powerupHUD.querySelector(`[data-pu="${id}"]`);
    if (!badge) return;
    badge.classList.remove('pu-badge--visible');
    badge.classList.add('pu-badge--out');
    setTimeout(() => badge.remove(), 350);
  }

  function getScoreMultiplier() {
    return doubleScoreActive ? 2 : 1;
  }

  function resetAll() {
    clearTimeout(freezeTimer);
    clearTimeout(doubleScoreTimer);
    freezeActive      = false;
    doubleScoreActive = false;
    if (powerupHUD) powerupHUD.innerHTML = '';
  }

  return { spawn, activate, getScoreMultiplier, resetAll };
})();

// ─── PRELOAD ──────────────────────────────────────────────────────────────────
function preload() {}

// ─── CREATE ───────────────────────────────────────────────────────────────────
function create() {
  SlashTrail.init(this);
  // 🔥 PRELOAD FRUIT TEXTURES (ADD THIS BLOCK)
this.fruitTextures = {};

FRUIT_TYPES.forEach(type => {
  const gfx = this.add.graphics();
  gfx.fillStyle(type.color, 1);
  gfx.fillCircle(FRUIT_SIZE/2, FRUIT_SIZE/2, FRUIT_SIZE/2);

  const key = 'fruit_' + type.name;
  gfx.generateTexture(key, FRUIT_SIZE, FRUIT_SIZE);
  gfx.destroy();

  this.fruitTextures[type.name] = key;
});
  _legacyGfx = this.add.graphics();
  _dotGfx    = this.add.graphics();
  _dotGfx.setDepth(20);
  this.input.enabled = false;
  if (this.input.mouse) this.input.mouse.disableContextMenu();
  window._phaserScene = this;
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update(time, delta) {
  _legacyGfx.clear();
  ScreenShake.tick(delta);

  // Fingertip dot — three-layer neon ring
  _dotGfx.clear();
  if (fingerX !== null && fingerY !== null) {
    _dotGfx.fillStyle(0x00f5ff, 0.12); _dotGfx.fillCircle(fingerX, fingerY, 30);
    _dotGfx.fillStyle(0x00f5ff, 0.50); _dotGfx.fillCircle(fingerX, fingerY, 17);
    _dotGfx.fillStyle(0xffffff, 1.00); _dotGfx.fillCircle(fingerX, fingerY,  5);
  }

  if (!gameRunning) return;

  SlashTrail.draw(performance.now());

  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    if (!fruit || fruit.sliced) continue;
    const { sprite, text: label } = fruit;
    sprite.angle += fruit.spinSpeed * (delta / 1000);
    // 🚫 Prevent fruits from escaping horizontally
if (sprite.x < 50) {
  sprite.x = 50;
  sprite.body.setVelocityX(Math.abs(sprite.body.velocity.x));
}
if (sprite.x > window.innerWidth - 50) {
  sprite.x = window.innerWidth - 50;
  sprite.body.setVelocityX(-Math.abs(sprite.body.velocity.x));
}
    if (label) { label.setPosition(sprite.x, sprite.y); label.setAngle(sprite.angle); }
    // Sync glow ring (bombs & powerups) to the physics sprite position
    if (fruit.glow?.active) { fruit.glow.setPosition(sprite.x, sprite.y); }
    // Bombs and powerups that fall off-screen are silently removed (no life lost)
    if (sprite.y > window.innerHeight + 80 && sprite.body.velocity.y > 0) {
      if (fruit.kind === 'bomb' || fruit.kind === 'powerup') {
        if (fruit.glow?.active)   fruit.glow.destroy();
        if (sprite.active)        sprite.destroy();
        if (label?.active)        label.destroy();
        fruits.splice(i, 1);
      } else {
        missedFruit(i);
      }
    }
  }

  particles = particles.filter(p => {
    if (p && p.active) return true;
    if (p) p.destroy();
    return false;
  });
}

// ─── SPAWN FRUIT ─────────────────────────────────────────────────────────────
// Each spawn slot is first rolled against BOMB_CHANCE, then POWERUP_CHANCE.
// Only if both rolls miss does a regular fruit spawn.
function spawnFruit() {
  if (fruits.length > 6) return;
  if (!gameRunning || !window._phaserScene) return;
  const scene = window._phaserScene;

  const roll = Math.random();
  if (roll < BOMB_CHANCE)                          { BombSystem.spawn(scene);   return; }
  if (roll < BOMB_CHANCE + POWERUP_CHANCE)         { PowerUpSystem.spawn(scene); return; }

  // ── Regular fruit ─────────────────────────────────────────────────────────
  const W = window.innerWidth, H = window.innerHeight;
  const type = FRUIT_TYPES[Phaser.Math.Between(0, FRUIT_TYPES.length - 1)];
  const x    = Phaser.Math.Between(W * 0.08, W * 0.92);
  const y    = H + 40;

  const textureKey = scene.fruitTextures[type.name];
  const sprite = scene.physics.add.sprite(x, y, textureKey);
  sprite.setCircle(FRUIT_SIZE/2);
  sprite.setAlpha(0);
  sprite.setDepth(1);

  const label = scene.add.text(x, y, type.emoji, {
    fontSize: `${FRUIT_SIZE}px`, align: 'center'
  });
  label.setOrigin(0.5, 0.5);
  label.setDepth(2);

  sprite.body.setVelocity(Phaser.Math.Between(-120, 120), Phaser.Math.Between(-750, -550));
  sprite.body.setMaxVelocityY(1200);

  fruits.push({ sprite, text: label, kind: 'fruit', type, sliced: false, spinSpeed: Phaser.Math.Between(-200, 200) });
}

// ─── SWIPE DETECTOR MODULE ────────────────────────────────────────────────────
// Exact logic preserved — segment-vs-circle with _fromX/_fromY snapshot.
const SwipeDetector = (() => {
  let prevX = null, prevY = null;
  let _fromX = null, _fromY = null;
  let _speed = 0;
  const _angleWindow = [];

  function reset() {
    prevX = null; prevY = null;
    _fromX = null; _fromY = null;
    _speed = 0; _angleWindow.length = 0;
  }

  function update(x, y, dt) {
    if (prevX !== null && dt > 0) {
      const dx = x - prevX, dy = y - prevY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      _speed = (1 - VELOCITY_SMOOTH) * _speed + VELOCITY_SMOOTH * (dist / (dt / 1000));
      if (dist >= SLICE_MIN_SEGMENT_PX * 0.5) {
        _angleWindow.push(Math.atan2(dy, dx));
        if (_angleWindow.length > SLICE_DIR_SAMPLES) _angleWindow.shift();
      }
    }
    _fromX = prevX; _fromY = prevY;
    prevX  = x;     prevY  = y;
  }

  function getFrom() { return { x: _fromX, y: _fromY }; }

  function canSlice() {
    return _fromX !== null && _speed >= SLICE_MIN_SPEED;
  }

  function segmentHitsFruit(fruit, currX, currY) {
    if (_fromX === null) return false;
    const ax = _fromX, ay = _fromY, bx = currX, by = currY;
    const abx = bx-ax, aby = by-ay;
    const abLenSq = abx*abx + aby*aby;
    if (abLenSq < SLICE_MIN_SEGMENT_PX * SLICE_MIN_SEGMENT_PX) return false;
    const cx = fruit.sprite.x, cy = fruit.sprite.y;
    const t  = Math.max(0, Math.min(1, ((cx-ax)*abx + (cy-ay)*aby) / abLenSq));
    const dx = (ax + t*abx) - cx, dy2 = (ay + t*aby) - cy;
    return (dx*dx + dy2*dy2) < (SEGMENT_RADIUS * SEGMENT_RADIUS);
  }

  return { reset, update, canSlice, segmentHitsFruit, getFrom };
})();

// ─── CHECK SLICE ─────────────────────────────────────────────────────────────
// Routes to sliceFruit, BombSystem.explode, or PowerUpSystem.activate
// depending on the hit object's kind. Bombs and power-ups bypass combo logic.
function checkSlice(currX, currY) {
  if (!SwipeDetector.canSlice()) return;

  const scene = this;

  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    if (!fruit || fruit.sliced) continue;

    if (!SwipeDetector.segmentHitsFruit(fruit, currX, currY)) continue;

    // ⚠️ DO NOT mark sliced here

    if (fruit.kind === 'bomb') {
      fruit.sliced = true;
      fruits.splice(i, 1);
      BombSystem.explode(fruit, scene);
      return;
    }

    if (fruit.kind === 'powerup') {
      fruit.sliced = true;

      if (fruit.glow?.active) fruit.glow.destroy();
      if (fruit.sprite?.active) fruit.sprite.destroy();
      if (fruit.text?.active) fruit.text.destroy();

      fruits.splice(i, 1);
      PowerUpSystem.activate(fruit, scene);
      continue;
    }

    // ✅ NORMAL FRUIT
    sliceFruit.call(scene, i);
  }
}

// ─── SLICE FRUIT ─────────────────────────────────────────────────────────────
function sliceFruit(index) {
  const fruit = fruits[index];
  if (!fruit || fruit.sliced) return;
  fruit.sliced = true;

  const scene = window._phaserScene;
  const cx    = fruit.sprite.x;
  const cy    = fruit.sprite.y;

  // ── Combo ────────────────────────────────────────────────────────────────
  combo++;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { combo = 0; }, COMBO_WINDOW_MS);

  // ── Rapid-slice → slow-motion trigger ─────────────────────────────────────
  rapidSliceCount++;
  clearTimeout(rapidSliceTimer);
  rapidSliceTimer = setTimeout(() => { rapidSliceCount = 0; }, SLOWMO_WINDOW_MS);
  if (rapidSliceCount >= SLOWMO_THRESHOLD) {
    SlowMotion.trigger(scene);
    rapidSliceCount = 0;
  }

  // ── Scoring with multiplier + power-up double ───────────────────────────
  const comboMult  = combo >= 4 ? 4 : combo >= 3 ? 3 : combo >= 2 ? 2 : 1;
  const multiplier = comboMult * PowerUpSystem.getScoreMultiplier();
  addScore(multiplier, cx, cy);
  showCombo(combo);

  // ── Screen shake (scales with combo) ────────────────────────────────────
  ScreenShake.trigger(scene, Math.min(SHAKE_INTENSITY + combo * 1.5, 18), SHAKE_DURATION);

  // ── Particle burst ───────────────────────────────────────────────────────
  spawnParticles(scene, fruit);

  // ── Slice animation: two emoji halves diverge along the cut ──────────────
  // Left half (cropped right side hidden)
  const halfL = scene.add.text(cx, cy, fruit.type.emoji, {
    fontSize: `${FRUIT_SIZE}px`, align: 'center'
  });
  halfL.setOrigin(0.5, 0.5);
  halfL.setDepth(7);
  halfL.setCrop(0, 0, Math.floor(halfL.width / 2), halfL.height);

  // Right half (cropped left side hidden)
  const halfR = scene.add.text(cx, cy, fruit.type.emoji, {
    fontSize: `${FRUIT_SIZE}px`, align: 'center'
  });
  halfR.setOrigin(0.5, 0.5);
  halfR.setDepth(7);
  halfR.setCrop(Math.ceil(halfR.width / 2), 0, halfR.width, halfR.height);

  const flyDist  = Phaser.Math.Between(65, 120);
  const flyAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);

  scene.tweens.add({
    targets: halfL,
    x: cx - Math.cos(flyAngle) * flyDist,
    y: cy - Math.abs(Math.sin(flyAngle)) * flyDist - 30,
    angle: -Phaser.Math.Between(90, 180),
    alpha: 0, scaleX: 0.5, scaleY: 0.5,
    duration: 500, ease: 'Cubic.easeOut',
    onComplete: () => { if (halfL.active) halfL.destroy(); }
  });

  scene.tweens.add({
    targets: halfR,
    x: cx + Math.cos(flyAngle) * flyDist,
    y: cy - Math.abs(Math.sin(flyAngle)) * flyDist - 30,
    angle:  Phaser.Math.Between(90, 180),
    alpha: 0, scaleX: 0.5, scaleY: 0.5,
    duration: 500, ease: 'Cubic.easeOut',
    onComplete: () => { if (halfR.active) halfR.destroy(); }
  });

  // Fade out original sprites immediately
  scene.tweens.add({
    targets: [fruit.sprite, fruit.text],
    scaleX: 1.25, scaleY: 1.25, alpha: 0,
    duration: 70, ease: 'Quad.easeOut',
    onComplete: () => {
      if (fruit.sprite?.active) fruit.sprite.destroy();
      if (fruit.text?.active)   fruit.text.destroy();
    }
  });

  fruits.splice(index, 1);
}

// ─── SPAWN PARTICLES — 5-layer AAA juice burst ───────────────────────────────
function spawnParticles(scene, fruit) {
  const color = fruit.type.color;
  const cx    = fruit.sprite.x;
  const cy    = fruit.sprite.y;

  // Layer 1 — instant white core flash
  const flash = scene.add.circle(cx, cy, FRUIT_SIZE * 0.55, 0xffffff, 0.9);
  flash.setDepth(10);
  scene.tweens.add({
    targets: flash, scaleX: 2.5, scaleY: 2.5, alpha: 0,
    duration: 150, ease: 'Quad.easeOut',
    onComplete: () => { if (flash.active) flash.destroy(); }
  });

  // Layer 2 — expanding coloured ring shockwave
  const ring = scene.add.circle(cx, cy, FRUIT_SIZE * 0.3, 0xffffff, 0);
  ring.setStrokeStyle(4, color, 1.0);
  ring.setDepth(5);
  scene.tweens.add({
    targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
    duration: 400, ease: 'Sine.easeOut',
    onComplete: () => { if (ring.active) ring.destroy(); }
  });

  // Second thinner ring slightly delayed
  const ring2 = scene.add.circle(cx, cy, FRUIT_SIZE * 0.2, 0xffffff, 0);
  ring2.setStrokeStyle(2, 0xffffff, 0.7);
  ring2.setDepth(5);
  scene.tweens.add({
    targets: ring2, scaleX: 6, scaleY: 6, alpha: 0,
    delay: 80, duration: 480, ease: 'Sine.easeOut',
    onComplete: () => { if (ring2.active) ring2.destroy(); }
  });

  // Layer 3 — chunky juice drops
  const DROP_COUNT = 6;
  for (let i = 0; i < DROP_COUNT; i++) {
    const baseAngle = (i / DROP_COUNT) * Math.PI * 2;
    const angle     = baseAngle + Phaser.Math.FloatBetween(-0.25, 0.25);
    const speed     = Phaser.Math.Between(70, 280);
    const radius    = Phaser.Math.Between(4, 10);
    const dropColor = i % 4 === 0 ? 0xffffff : color;
    const drop      = scene.add.circle(cx, cy, radius, dropColor, 1);
    drop.setDepth(6);
    scene.tweens.add({
      targets: drop,
      x: cx + Math.cos(angle) * speed,
      y: cy + Math.sin(angle) * speed - Phaser.Math.Between(0, 40),
      scaleX: 0.1, scaleY: 0.1, alpha: 0,
      duration: 420 + Math.random() * 260,
      ease: 'Quad.easeOut',
      onComplete: () => { if (drop.active) drop.destroy(); }
    });
  }

  // Layer 4 — elongated juice streaks
  const STREAK_COUNT = 4;
  for (let i = 0; i < STREAK_COUNT; i++) {
    const angle  = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed  = Phaser.Math.Between(100, 300);
    const len    = Phaser.Math.Between(20, 50);
    const streak = scene.add.rectangle(cx, cy, len, Phaser.Math.Between(3, 5), color, 0.85);
    streak.setDepth(6);
    streak.setRotation(angle);
    scene.tweens.add({
      targets: streak,
      x: cx + Math.cos(angle) * speed,
      y: cy + Math.sin(angle) * speed,
      scaleX: 0.05, scaleY: 0.05, alpha: 0,
      duration: 360 + Math.random() * 200,
      ease: 'Cubic.easeOut',
      onComplete: () => { if (streak.active) streak.destroy(); }
    });
  }

  // Layer 5 — soft mist clouds
  for (let i = 0; i < 2; i++) {
    const ox   = Phaser.Math.Between(-25, 25);
    const oy   = Phaser.Math.Between(-25, 25);
    const mist = scene.add.circle(cx + ox, cy + oy,
      Phaser.Math.Between(18, 38), color, 0.15);
    mist.setDepth(4);
    scene.tweens.add({
      targets: mist,
      scaleX: 4, scaleY: 4, alpha: 0,
      duration: 550 + Math.random() * 200,
      ease: 'Sine.easeOut',
      onComplete: () => { if (mist.active) mist.destroy(); }
    });
  }
}

// ─── MISSED FRUIT ────────────────────────────────────────────────────────────
function missedFruit(index) {
  const fruit = fruits[index];
  if (!fruit) return;
  if (fruit.sprite?.active) fruit.sprite.destroy();
  if (fruit.text?.active)   fruit.text.destroy();
  fruits.splice(index, 1);
  combo = 0;
  lives--;
  updateLivesUI();

  // Full-screen red flash on life loss
  const scene = window._phaserScene;
  if (scene) {
    const flash = scene.add.rectangle(
      window.innerWidth/2, window.innerHeight/2,
      window.innerWidth, window.innerHeight, 0xff0000, 0.25
    );
    flash.setDepth(50);
    scene.tweens.add({
      targets: flash, alpha: 0, duration: 500, ease: 'Quad.easeOut',
      onComplete: () => { if (flash.active) flash.destroy(); }
    });
    ScreenShake.trigger(scene, 12, 250);
  }

  if (lives <= 0) triggerGameOver('3 fruits missed');
}

// ─── ADD SCORE ────────────────────────────────────────────────────────────────
// Updates HUD + spawns a floating "+N ×M" pop-up at the slice position.
function addScore(points, cx, cy) {
  score += points;
  scoreEl.textContent = score;

  scoreEl.classList.remove('pop');
  requestAnimationFrame(() => scoreEl.classList.add('pop'));
  setTimeout(() => scoreEl.classList.remove('pop'), 150);

  const scene = window._phaserScene;
  if (scene && cx !== undefined) {
    const txt   = points > 1 ? `+${points} ×${points}` : `+${points}`;
    const color = points >= 4 ? '#ff2d78' : points >= 3 ? '#ff8c00' : points >= 2 ? '#ffe600' : '#ffffff';
    const pop   = scene.add.text(cx, cy - 10, txt, {
      fontFamily: 'Boogaloo, cursive',
      fontSize  : points > 1 ? '38px' : '28px',
      color,
      stroke         : '#000000',
      strokeThickness: 4,
    });
    pop.setOrigin(0.5, 0.5);
    pop.setDepth(15);
    scene.tweens.add({
      targets: pop,
      y: cy - 100, alpha: 0, scaleX: 1.5, scaleY: 1.5,
      duration: 750, ease: 'Cubic.easeOut',
      onComplete: () => { if (pop.active) pop.destroy(); }
    });
  }
}

// ─── UPDATE LIVES UI ─────────────────────────────────────────────────────────
function updateLivesUI() {
  lifeIcons.forEach((icon, i) => {
    if (i >= lives) icon.classList.add('lost');
  });
}

// ─── SHOW COMBO ───────────────────────────────────────────────────────────────
// Uses CSS level-classes for colour escalation + slam animation.
function showCombo(count) {
  if (count < 2) {
    comboEl.textContent = '';
    comboEl.classList.remove('show', 'combo-2', 'combo-3', 'combo-4', 'combo-mega');
    return;
  }

  const labels = ['', '', 'DOUBLE!', 'TRIPLE!', 'QUAD!', 'ULTRA!'];
  comboEl.textContent = count < labels.length ? labels[count] : `${count}× COMBO!`;

  // Force reflow so animation re-fires each consecutive slice
  comboEl.classList.remove('show', 'combo-2', 'combo-3', 'combo-4', 'combo-mega');
  void comboEl.offsetWidth;

  const lvl = count >= 5 ? 'combo-mega' : count === 4 ? 'combo-4' : count === 3 ? 'combo-3' : 'combo-2';
  comboEl.classList.add('show', lvl);

  clearTimeout(window._comboHideTimer);
  window._comboHideTimer = setTimeout(() => {
    comboEl.classList.remove('show', 'combo-2', 'combo-3', 'combo-4', 'combo-mega');
  }, 1100);
}

// ─── START GAME ───────────────────────────────────────────────────────────────
function startGame() {
  score           = 0;
  lives           = MAX_LIVES;
  combo           = 0;
  rapidSliceCount = 0;
  spawnDelay      = SPAWN_INTERVAL;
  gameRunning     = true;

  clearFruits();
  PowerUpSystem.resetAll();

  scoreEl.textContent = '0';
  lifeIcons.forEach(icon => icon.classList.remove('lost'));
  comboEl.classList.remove('show', 'combo-2', 'combo-3', 'combo-4', 'combo-mega');
  if (slowMoVignette) slowMoVignette.classList.remove('active');
  if (gameOverReason) gameOverReason.textContent = '';

  // Reset slow-mo and physics if still active from last game
  const scene = window._phaserScene;
  if (scene) {
    scene.physics.world.timeScale = 1;
    scene.time.timeScale           = 1;
  }

  startScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');

  spawnTimer = setInterval(spawnFruit, spawnDelay);
  diffTimer  = setInterval(() => {
    clearInterval(spawnTimer);
    spawnDelay = Math.max(MIN_INTERVAL, spawnDelay - 80);
    spawnTimer = setInterval(spawnFruit, spawnDelay);
  }, 10000);
}

// ─── GAME OVER ────────────────────────────────────────────────────────────────
// reason: optional string shown under the GAME OVER heading (e.g. '💣 BOMB HIT!')
function triggerGameOver(reason) {
  if (!gameRunning) return;          // guard against double-call (bomb + timeout race)
  gameRunning = false;
  clearInterval(spawnTimer);
  clearInterval(diffTimer);
  clearFruits();

  // Restore time scale in case slow-mo was active
  const scene = window._phaserScene;
  if (scene) {
    scene.physics.world.timeScale = 1;
    scene.time.timeScale           = 1;
  }
  if (slowMoVignette) slowMoVignette.classList.remove('active');

  // Cancel any active power-ups
  PowerUpSystem.resetAll();

  // Leaderboard: update high score
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('fruitSlashHigh', highScore);
  }

  // Show reason (bomb hit, lives depleted, etc.)
  if (gameOverReason) {
    gameOverReason.textContent = reason || '3 fruits missed';
  }

  finalScoreEl.textContent = score;
  highScoreEl.textContent  = highScore;
  gameOverEl.classList.remove('hidden');
}

// ─── CLEAR FRUITS ─────────────────────────────────────────────────────────────
function clearFruits() {
  for (const fruit of fruits) {
    if (fruit.glow?.active)   fruit.glow.destroy();   // bombs + powerups have a glow
    if (fruit.sprite?.active) fruit.sprite.destroy();
    if (fruit.text?.active)   fruit.text.destroy();
  }
  fruits = [];
}

// ─── BUTTON LISTENERS ─────────────────────────────────────────────────────────
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

if (highScore > 0) {
  const hint = document.getElementById('hint-text');
  if (hint) hint.textContent = `Best: ${highScore} · Slice fruits · Miss 3 = game over`;
}