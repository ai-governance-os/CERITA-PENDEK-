/* ════════════════════════════════════════════════
   effects.js — Sound Effects, Confetti, Countdown,
                Star Rating Popup
   ════════════════════════════════════════════════ */

/* ── Reuse audioCtx from music.js (shared global) ── */
function _ensureCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/* ════════════════════════════════════════════════
   SOUND EFFECTS
   ════════════════════════════════════════════════ */

/** Short "pop" click sound for buttons */
function playClick() {
  try {
    _ensureCtx(); if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } catch(e) {}
}

/** Ascending C–E–G ding for each star */
function playStarSound(delayMs) {
  try {
    _ensureCtx(); if (!audioCtx) return;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = audioCtx.currentTime + (delayMs / 1000) + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.5);
    });
  } catch(e) {}
}

/** Applause burst (band-pass filtered white noise) */
function playApplause() {
  try {
    _ensureCtx(); if (!audioCtx) return;
    const sr     = audioCtx.sampleRate;
    const bufLen = Math.floor(sr * 0.12);
    const buf    = audioCtx.createBuffer(1, bufLen, sr);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

    for (let b = 0; b < 10; b++) {
      const src  = audioCtx.createBufferSource();
      src.buffer = buf;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 1400; filt.Q.value = 0.7;
      const gain = audioCtx.createGain();
      src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
      const t = audioCtx.currentTime + b * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.start(t); src.stop(t + 0.16);
    }
  } catch(e) {}
}

/** Countdown tick sound (lower for 3-2-1, higher for GO) */
function playTick(isGo) {
  try {
    _ensureCtx(); if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = isGo ? 880 : 440;
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } catch(e) {}
}


/* ════════════════════════════════════════════════
   CONFETTI
   ════════════════════════════════════════════════ */
const CONFETTI_COLORS = [
  '#FF6B35','#FFD23F','#06D6A0','#118AB2',
  '#EF476F','#9B5DE5','#FF70A6','#FFEAA7','#00B4D8'
];

function showConfetti() {
  for (let i = 0; i < 90; i++) {
    const p     = document.createElement('div');
    p.className = 'confetti-piece';
    const isCircle = Math.random() > 0.6;
    const size  = 6 + Math.random() * 8;
    p.style.cssText = `
      left:             ${Math.random() * 100}%;
      width:            ${size}px;
      height:           ${isCircle ? size : size * 1.6}px;
      border-radius:    ${isCircle ? '50%' : '2px'};
      background:       ${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]};
      animation-duration:  ${1.6 + Math.random() * 2.2}s;
      animation-delay:     ${Math.random() * 0.9}s;
      transform:        rotate(${Math.random() * 360}deg);
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 4500);
  }
}


/* ════════════════════════════════════════════════
   COUNTDOWN  3 – 2 – 1 – Mula!
   ════════════════════════════════════════════════ */
function showCountdown(callback) {
  const overlay = document.createElement('div');
  overlay.className = 'countdown-overlay';
  document.body.appendChild(overlay);

  const steps = ['3', '2', '1', 'Mula!'];
  let i = 0;

  function next() {
    const isGo = (i === steps.length - 1);
    overlay.innerHTML = `<span class="cd-num ${isGo ? 'cd-go' : ''}">${steps[i]}</span>`;
    const el = overlay.querySelector('.cd-num');
    void el.offsetWidth;                        // force reflow for animation restart
    el.classList.add('cd-animate');
    playTick(isGo);
    i++;

    if (i < steps.length) {
      setTimeout(next, 850);
    } else {
      setTimeout(() => { overlay.remove(); callback(); }, 650);
    }
  }
  next();
}


/* ════════════════════════════════════════════════
   STAR RATING POPUP
   ════════════════════════════════════════════════ */
/**
 * Show the completion popup with 3 animated stars.
 * @param {function} onAction  called with 'again' | 'back'
 */
function showStarRating(onAction) {
  // Sound & confetti
  playApplause();
  showConfetti();
  playStarSound(400);

  const overlay = document.createElement('div');
  overlay.className = 'sr-overlay';
  overlay.innerHTML = `
    <div class="sr-box">
      <div class="sr-trophy">🏆</div>
      <div class="sr-title">Tahniah! Hebat!</div>
      <div class="sr-sub">Kamu telah membaca cerita ini dengan baik!</div>
      <div class="sr-stars">
        <span class="sr-star" style="animation-delay:.2s">⭐</span>
        <span class="sr-star" style="animation-delay:.5s">⭐</span>
        <span class="sr-star" style="animation-delay:.8s">⭐</span>
      </div>
      <div class="sr-btns">
        <button class="sr-btn sr-again">🔄 Cuba Lagi</button>
        <button class="sr-btn sr-back">🏠 Menu</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.sr-again').addEventListener('click', () => {
    playClick(); overlay.remove(); if (onAction) onAction('again');
  });
  overlay.querySelector('.sr-back').addEventListener('click', () => {
    playClick(); overlay.remove(); if (onAction) onAction('back');
  });
}
