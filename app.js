'use strict';

/* ═══════════════════════════════════════════════════════════
   CHESS CLOCK — app.js
   Mobile-only, multicolour splash edition
═══════════════════════════════════════════════════════════ */

/* ── Audio ─────────────────────────────────────────────── */
const SFX = (() => {
  let ctx = null;
  let on  = true;

  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  /* ── Wall-clock TICK (every second countdown) ──────────────
     A sharp noise burst filtered to a high mechanical click,
     followed by a very brief body resonance — like a pendulum
     clock mechanism striking its escapement wheel.           */
  function tick() {
    if (!on) return;
    const ac = getCtx(), t = ac.currentTime;

    // White-noise burst (the sharp "click" transient)
    const bufSize = ac.sampleRate * 0.04;
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ac.createBufferSource();
    noise.buffer = buf;

    // High-pass filter to make it crisp, not boomy
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3800;

    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    noise.connect(hp).connect(ng).connect(ac.destination);
    noise.start(t); noise.stop(t + 0.04);

    // Brief tonal body resonance (the wood/plastic "tock" body)
    const body = ac.createOscillator();
    const bg = ac.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(900, t);
    body.frequency.exponentialRampToValueAtTime(420, t + 0.03);
    bg.gain.setValueAtTime(0.12, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    body.connect(bg).connect(ac.destination);
    body.start(t); body.stop(t + 0.06);
  }

  /* ── DGT Chess Clock SWITCH sound ─────────────────────────
     Deep, heavy mechanical thud: a low-pitched noise strike
     (the button mass hitting) + a punchy low-freq oscillator
     (the spring/lever resonance) + a subtle high tick on top. */
  function click() {
    if (!on) return;
    const ac = getCtx(), t = ac.currentTime;

    // Impact body — low thud (button bottom-out)
    const thud = ac.createOscillator();
    const tg   = ac.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(160, t);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    tg.gain.setValueAtTime(0.7, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    thud.connect(tg).connect(ac.destination);
    thud.start(t); thud.stop(t + 0.15);

    // Mid transient — plastic clack body
    const clack = ac.createOscillator();
    const cg    = ac.createGain();
    clack.type = 'square';
    clack.frequency.setValueAtTime(480, t);
    clack.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    cg.gain.setValueAtTime(0.18, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    clack.connect(cg).connect(ac.destination);
    clack.start(t); clack.stop(t + 0.07);

    // High-freq noise tick (surface click)
    const bufSize = ac.sampleRate * 0.025;
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = ac.createBufferSource();
    ns.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5000;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    ns.connect(hp).connect(ng).connect(ac.destination);
    ns.start(t); ns.stop(t + 0.025);
  }

  /* ── Alarm (time's up) ────────────────────────────────── */
  function alarm() {
    if (!on) return;
    const ac = getCtx(), t = ac.currentTime;
    [0, 0.15, 0.30].forEach(d => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = 660;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.18, t + d + 0.02);
      g.gain.linearRampToValueAtTime(0, t + d + 0.13);
      o.connect(g).connect(ac.destination);
      o.start(t + d); o.stop(t + d + 0.15);
    });
  }

  function toggle() { on = !on; return on; }
  function isOn()   { return on; }

  return { tick, click, alarm, toggle, isOn };
})();

/* ── Haptic ─────────────────────────────────────────────── */
const vibe = ms => navigator.vibrate && navigator.vibrate(ms);

/* ── State ──────────────────────────────────────────────── */
const S = {
  initTime:    300,
  increment:   2,
  times:       [0, 300, 300],
  moves:       [0, 0, 0],
  active:      0,        // 0 = not started
  running:     false,
  paused:      false,
  over:        false,
  _tid:        null,
  _lastTick:   0,
  _lastSecond: -1,   // for wall-clock tick sound
};

/* ── DOM ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const dom = {
  screens:  { landing: $('landing-screen'), game: $('game-screen') },
  overlays: { setup: $('setup-overlay'), win: $('win-overlay') },
  panel:    [null, $('panel-1'), $('panel-2')],
  clock:    [null, $('clock-1'), $('clock-2')],
  moves:    [null, $('moves-1'), $('moves-2')],
  hint:     [null, $('hint-1'),  $('hint-2')],
  status:   $('status-hint'),

  openSetup:  $('open-setup-btn'),
  startGame:  $('start-game-btn'),
  closeSetup: $('close-setup-btn'),
  pauseBtn:   $('pause-btn'),
  resetBtn:   $('reset-btn'),
  soundBtn:   $('sound-btn'),
  plusBtn:    $('plus-btn'),
  minusBtn:   $('minus-btn'),
  homeArrow:  $('home-arrow'),
  rematch:    $('rematch-btn'),
  menu:       $('menu-btn'),

  minInput:   $('minutes-input'),
  secInput:   $('seconds-input'),
  incInput:   $('increment-input'),
  winTitle:   $('win-title'),
  winSub:     $('win-sub'),
};

/* ── Screen helpers ─────────────────────────────────────── */
function showScreen(id) {
  Object.values(dom.screens).forEach(s => s.classList.remove('active'));
  dom.screens[id].classList.add('active');
}

function openOverlay(id) {
  Object.values(dom.overlays).forEach(o => o.classList.remove('active'));
  dom.overlays[id].classList.add('active');
}

function closeOverlays() {
  Object.values(dom.overlays).forEach(o => o.classList.remove('active'));
}

/* ── Format time ────────────────────────────────────────── */
function fmt(sec) {
  const s   = Math.max(0, Math.ceil(sec));
  const m   = Math.floor(s / 60);
  const ss  = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

/* ── UI refresh ─────────────────────────────────────────── */
function updateUI() {
  [1, 2].forEach(p => {
    dom.clock[p].textContent  = fmt(S.times[p]);
    dom.moves[p].textContent  = `${S.moves[p]} move${S.moves[p] !== 1 ? 's' : ''}`;

    const isActive   = S.active === p;
    const isInactive = S.active !== 0 && S.active !== p;
    const isLow      = S.times[p] <= 10 && S.times[p] > 0;

    dom.panel[p].classList.toggle('active',   isActive);
    dom.panel[p].classList.toggle('inactive', isInactive);
    dom.panel[p].classList.toggle('low-time', isActive && isLow);
  });

  // hints
  if (S.active === 0) {
    dom.hint[1].textContent = 'Tap to start';
    dom.hint[2].textContent = 'Waiting';
    dom.status.textContent  = 'READY';
    dom.status.className    = 'lcd-status';
  } else {
    dom.hint[S.active].textContent               = 'Tap to switch ▶';
    dom.hint[S.active === 1 ? 2 : 1].textContent = '';
    dom.status.textContent  = S.paused ? 'PAUSED' : 'RUNNING';
    dom.status.className    = `lcd-status${S.paused ? '' : ' running'}`;
  }

  // pause icon
  dom.pauseBtn.textContent = S.paused ? '▶' : '⏸';
}

/* ── Timer engine ───────────────────────────────────────── */
function startTicker() {
  clearInterval(S._tid);
  S._lastTick = Date.now();
  S._tid = setInterval(() => {
    if (!S.running || S.paused || S.over) return;
    const now   = Date.now();
    const delta = (now - S._lastTick) / 1000;
    S._lastTick = now;
    S.times[S.active] -= delta;

    // Wall-clock tick once per whole second
    const currentSec = Math.ceil(S.times[S.active]);
    if (currentSec !== S._lastSecond && S.times[S.active] > 0) {
      S._lastSecond = currentSec;
      SFX.tick();
    }

    if (S.times[S.active] <= 0) {
      S.times[S.active] = 0;
      triggerWin(S.active === 1 ? 2 : 1);
    }
    updateUI();
  }, 100);
}

function stopTicker() { clearInterval(S._tid); S._tid = null; }

/* ── Win ────────────────────────────────────────────────── */
function triggerWin(winner) {
  S.over = true; S.running = false;
  stopTicker();
  SFX.alarm();
  dom.winTitle.textContent = `Player ${winner} Wins!`;
  dom.winSub.textContent   = `Time's up for Player ${winner === 1 ? 2 : 1}.`;
  openOverlay('win');
}

/* ── Game init ──────────────────────────────────────────── */
function initGame() {
  const mins  = Math.max(0, parseInt(dom.minInput.value)  || 0);
  const secs  = Math.max(0, parseInt(dom.secInput.value)  || 0);
  const inc   = Math.max(0, parseInt(dom.incInput.value)  || 0);
  const total = mins * 60 + secs;
  if (total <= 0) { dom.minInput.focus(); return; }

  stopTicker();
  S.initTime  = total;
  S.increment = inc;
  S.times     = [0, total, total];
  S.moves     = [0, 0, 0];
  S.active    = 0;
  S.running   = false;
  S.paused    = false;
  S.over      = false;

  updateUI();
}

/* ── Tap handler ────────────────────────────────────────── */
function handleTap(player) {
  if (S.over || S.paused) return;

  // not started yet – first tap starts the game
  if (S.active === 0) {
    S.active  = player;
    S.running = true;
    SFX.click(); vibe(50);
    startTicker();
    updateUI();
    return;
  }

  // must tap OWN panel to finish turn
  if (player !== S.active) return;

  SFX.click(); vibe(30);
  S.times[player]  = Math.max(0, S.times[player] + S.increment);
  S.moves[player]++;
  S.active      = player === 1 ? 2 : 1;
  S._lastTick   = Date.now();
  S._lastSecond = Math.ceil(S.times[S.active]); // reset so tick fires fresh
  updateUI();
}

/* ── Event wiring ───────────────────────────────────────── */

// Landing → setup
dom.openSetup.addEventListener('click', () => openOverlay('setup'));

// Setup overlay
dom.closeSetup.addEventListener('click', closeOverlays);
dom.startGame.addEventListener('click', () => {
  initGame();
  closeOverlays();
  showScreen('game');
});

// Increment selector buttons
document.querySelectorAll('.inc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inc-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    dom.incInput.value = btn.dataset.inc;
  });
});

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const t = parseInt(btn.dataset.time);
    dom.minInput.value = Math.floor(t / 60);
    dom.secInput.value = t % 60;
  });
});

// Player panel taps
[1, 2].forEach(p => {
  dom.panel[p].addEventListener('pointerdown', e => {
    e.preventDefault();
    handleTap(p);
  });
});

// Home arrow
dom.homeArrow.addEventListener('click', () => {
  stopTicker();
  S.running = false; S.over = false;
  showScreen('landing');
});

// Pause
dom.pauseBtn.addEventListener('click', () => {
  if (!S.running || S.over) return;
  S.paused = !S.paused;
  if (!S.paused) S._lastTick = Date.now();
  updateUI();
});

// Reset
dom.resetBtn.addEventListener('click', () => {
  initGame();      // reset with same settings
  updateUI();
});

// Sound toggle
dom.soundBtn.addEventListener('click', () => {
  const on = SFX.toggle();
  dom.soundBtn.textContent = on ? '🔊' : '🔇';
});

// +/- quick adjust (only when paused or not started)
dom.plusBtn.addEventListener('click', () => {
  if (!S.running || S.paused) {
    S.times[1] = Math.min(S.times[1] + 30, 5999);
    S.times[2] = Math.min(S.times[2] + 30, 5999);
    updateUI();
  }
});

dom.minusBtn.addEventListener('click', () => {
  if (!S.running || S.paused) {
    S.times[1] = Math.max(S.times[1] - 30, 5);
    S.times[2] = Math.max(S.times[2] - 30, 5);
    updateUI();
  }
});

// Win screen
dom.rematch.addEventListener('click', () => {
  closeOverlays();
  initGame();
});

dom.menu.addEventListener('click', () => {
  closeOverlays();
  stopTicker();
  showScreen('landing');
});

// Keyboard (desktop testing / Bluetooth keyboard)
document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); handleTap(S.active || 1); }
  if (e.code === 'Escape') dom.pauseBtn.click();
});

// Prevent context menu on long press (mobile)
document.addEventListener('contextmenu', e => e.preventDefault());

/* ── Boot ───────────────────────────────────────────────── */
// Highlight default 5-min preset
document.querySelector('.preset-btn[data-time="300"]').classList.add('selected');
