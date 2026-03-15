/* ════════════════════════════════════════════════
   app.js — Main Application Logic
   Wires together: UI, story grid, navigation,
   music toggle, speed slider, and button events.
   Depends on: data.js, music.js, speech.js
   ════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let currentStory  = null;
let musicEnabled  = false;

const BUBBLE_COLORS = [
  '#FF6B35', '#FFD23F', '#06D6A0', '#118AB2',
  '#EF476F', '#A8DADC', '#9B5DE5'
];


/* ─────────────────────────────────────────
   INIT — runs on page load
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  makeBubbles();
  buildStoryGrid();
  initSpeedSlider();
  bindButtons();
});


/* ─────────────────────────────────────────
   FLOATING BUBBLES (background decoration)
───────────────────────────────────────── */
function makeBubbles() {
  const wrap = document.getElementById('bubbles');
  for (let i = 0; i < 18; i++) {
    const b    = document.createElement('div');
    b.className = 'bubble';
    const size  = 30 + Math.random() * 90;
    const left  = Math.random() * 100;
    const delay = Math.random() * 14;
    const dur   = 12 + Math.random() * 16;
    b.style.cssText = `
      width:  ${size}px;
      height: ${size}px;
      left:   ${left}%;
      background: ${BUBBLE_COLORS[i % BUBBLE_COLORS.length]};
      animation-delay:    ${delay}s;
      animation-duration: ${dur}s;
    `;
    wrap.appendChild(b);
  }
}


/* ─────────────────────────────────────────
   STORY GRID (menu screen)
───────────────────────────────────────── */
function buildStoryGrid() {
  const grid = document.getElementById('story-grid');

  STORIES.forEach((story, index) => {
    const card = document.createElement('button');
    card.className = 'story-card';
    card.style.background = `linear-gradient(135deg, ${story.color1}, ${story.color2})`;
    card.style.color       = story.textColor;
    card.innerHTML = `
      <div class="card-glow"></div>
      <div class="card-emoji" style="animation-delay: ${index * 0.4}s">${story.emoji}</div>
      <div class="card-num">Cerita ${story.id}</div>
      <div class="card-title">${story.title}</div>
      <div class="card-preview">${story.preview}</div>
    `;
    card.addEventListener('click', () => openStory(story));
    grid.appendChild(card);
  });
}


/* ─────────────────────────────────────────
   OPEN STORY (navigate to story screen)
───────────────────────────────────────── */
function openStory(story) {
  currentStory = story;

  // Populate header
  document.getElementById('header-title').textContent = story.title;
  document.getElementById('header-emoji').textContent = story.emoji;

  // Character stage colours & emojis
  const stage = document.getElementById('char-stage');
  stage.style.background = `linear-gradient(135deg, ${story.color1}22, ${story.color2}22)`;
  document.getElementById('char-main').textContent      = story.charMain;
  document.getElementById('char-secondary').textContent = story.charSecondary;
  document.getElementById('char-secondary').classList.remove('visible');
  stage.classList.remove('playing');

  // Progress bar gradient matches story colours
  document.getElementById('progress-fill').style.background =
    `linear-gradient(90deg, ${story.color1}, ${story.color2})`;

  // Build karaoke word spans
  buildWordSpans(story);

  // Reset music state
  musicEnabled = false;
  updateMusicBtn();
  stopMusic();

  // Reset speech state
  synth.cancel();
  isPaused = false;
  setPlayingState(false);
  updateProgress(0);

  // Switch screens
  document.getElementById('screen-menu').style.display  = 'none';
  document.getElementById('screen-story').style.display = 'flex';
}


/* ─────────────────────────────────────────
   BACK TO MENU
───────────────────────────────────────── */
function goBack() {
  synth.cancel();
  stopMusic();
  isPaused = false;
  currentStory = null;

  document.getElementById('screen-story').style.display = 'none';
  document.getElementById('screen-menu').style.display  = 'flex';
  document.getElementById('char-secondary').classList.remove('visible');
}


/* ─────────────────────────────────────────
   MUSIC BUTTON
───────────────────────────────────────── */
function updateMusicBtn() {
  const btn = document.getElementById('btn-music');
  if (musicEnabled) {
    btn.textContent = '🔕 Muzik';
    btn.classList.remove('muted');
  } else {
    btn.textContent = '🎵 Muzik';
    btn.classList.add('muted');
  }
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  updateMusicBtn();

  if (musicEnabled && synth.speaking && !synth.paused) {
    startMusic();
  } else {
    stopMusic();
  }
}


/* ─────────────────────────────────────────
   SPEED SLIDER
───────────────────────────────────────── */
function initSpeedSlider() {
  const range = document.getElementById('speed-range');
  const label = document.getElementById('speed-label');

  function refresh() {
    const v   = parseFloat(range.value);
    const pct = ((v - range.min) / (range.max - range.min)) * 100;

    // Track fill colour
    range.style.background =
      `linear-gradient(to right, #FF6B35 ${pct}%, #ddd ${pct}%)`;

    // Label
    if      (v <= 0.60) label.textContent = 'Perlahan';
    else if (v <= 0.85) label.textContent = 'Sederhana';
    else if (v <= 1.10) label.textContent = 'Biasa';
    else                label.textContent = 'Pantas';
  }

  range.addEventListener('input', refresh);
  refresh();
}


/* ─────────────────────────────────────────
   STAR BURST — shown when story finishes
───────────────────────────────────────── */
function showStarBurst() {
  const el = document.createElement('div');
  el.className = 'star-burst';
  el.style.cssText = `
    font-size: 2rem;
    color: #FFD23F;
    font-weight: 900;
    text-shadow: 0 2px 12px rgba(0,0,0,0.3);
    background: rgba(255,255,255,0.92);
    padding: 20px 36px;
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  `;
  el.textContent = '⭐ Tahniah! Syabas! ⭐';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}


/* ─────────────────────────────────────────
   BUTTON EVENT BINDINGS
───────────────────────────────────────── */
function bindButtons() {
  document.getElementById('btn-play').addEventListener('click', () => {
    if (currentStory) playStory(currentStory, musicEnabled);
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    pauseStory(musicEnabled);
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    stopStory(musicEnabled);
  });

  document.getElementById('btn-music').addEventListener('click', toggleMusic);

  document.getElementById('btn-back').addEventListener('click', goBack);

  // If voice changes mid-playback, stop and let user replay
  document.getElementById('voice-select').addEventListener('change', () => {
    if (synth.speaking) stopStory(musicEnabled);
  });
}
