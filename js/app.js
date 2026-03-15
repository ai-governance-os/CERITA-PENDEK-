/* ════════════════════════════════════════════════
   app.js — Main Application Logic
   Depends on: data.js, syllable.js, music.js,
               speech.js, effects.js, progress.js
   ════════════════════════════════════════════════ */

let currentStory = null;
let musicEnabled = false;

const BUBBLE_COLORS = [
  '#FF6B35','#FFD23F','#06D6A0','#118AB2',
  '#EF476F','#A8DADC','#9B5DE5'
];

/* Deco positions for scene emojis in char-stage */
const DECO_SLOTS = [
  { top:'8%',  left:'6%',   fontSize:'2rem',   animDelay:'0s'   },
  { top:'8%',  right:'6%',  fontSize:'2.2rem', animDelay:'0.5s' },
  { bottom:'6px', left:'12%', fontSize:'2.5rem', animDelay:'0.3s' },
  { bottom:'6px', right:'12%',fontSize:'2rem',  animDelay:'0.8s' },
];


/* ════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  makeBubbles();
  buildStoryGrid();
  initSpeedSlider();
  bindButtons();
  showProgressBanner();
});


/* ════════════════════════════════════════════════
   FLOATING BUBBLES
   ════════════════════════════════════════════════ */
function makeBubbles() {
  const wrap = document.getElementById('bubbles');
  for (let i = 0; i < 18; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = 30 + Math.random() * 90;
    b.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      background:${BUBBLE_COLORS[i % BUBBLE_COLORS.length]};
      animation-delay:${Math.random()*14}s;
      animation-duration:${12+Math.random()*16}s;
    `;
    wrap.appendChild(b);
  }
}


/* ════════════════════════════════════════════════
   STORY GRID
   ════════════════════════════════════════════════ */
function buildStoryGrid() {
  const grid = document.getElementById('story-grid');
  STORIES.forEach((story, index) => {
    const card = document.createElement('button');
    card.className = 'story-card';
    card.id = `card-${story.id}`;
    card.style.background = `linear-gradient(135deg,${story.color1},${story.color2})`;
    card.style.color = story.textColor;
    card.innerHTML = `
      <div class="card-glow"></div>
      <div class="card-emoji" style="animation-delay:${index*0.4}s">${story.emoji}</div>
      <div class="card-num">Cerita ${story.id}</div>
      <div class="card-title">${story.title}</div>
      <div class="card-preview">${story.preview}</div>
      <div class="card-done-badge hidden" id="badge-${story.id}">⭐</div>
    `;
    card.addEventListener('click', () => { playClick(); openStory(story); });
    grid.appendChild(card);
  });
  refreshBadges();
}

/** Refresh completed badges on all cards */
function refreshBadges() {
  STORIES.forEach(s => {
    const badge = document.getElementById(`badge-${s.id}`);
    if (badge) badge.classList.toggle('hidden', !isDone(s.id));
  });
  showProgressBanner();
}

/** Show "X / 6 cerita selesai" banner */
function showProgressBanner() {
  const count = getDoneCount();
  const banner = document.getElementById('progress-banner');
  if (!banner) return;
  if (count === 0) {
    banner.style.display = 'none';
  } else {
    banner.style.display = 'block';
    banner.textContent = count === STORIES.length
      ? `🎉 Syabas! Semua ${STORIES.length} cerita telah dibaca!`
      : `⭐ ${count} / ${STORIES.length} cerita selesai`;
  }
}


/* ════════════════════════════════════════════════
   OPEN STORY
   ════════════════════════════════════════════════ */
function openStory(story) {
  // Switch screens FIRST — immediate visual feedback
  document.getElementById('screen-menu').style.display  = 'none';
  const ss = document.getElementById('screen-story');
  ss.style.display = 'flex';
  ss.classList.remove('screen-in');
  void ss.offsetWidth;
  ss.classList.add('screen-in');

  currentStory = story;

  // Apply story scene background
  ss.style.background = story.sceneBg || 'var(--bg)';

  // Header
  document.getElementById('header-title').textContent = story.title;
  document.getElementById('header-emoji').textContent = story.emoji;

  // Character stage
  const stage = document.getElementById('char-stage');
  stage.classList.remove('playing');
  document.getElementById('char-main').textContent      = story.charMain;
  document.getElementById('char-secondary').textContent = story.charSecondary;
  document.getElementById('char-secondary').classList.remove('visible');

  // Scene decorations
  const sceneBg = document.getElementById('scene-bg');
  sceneBg.innerHTML = '';
  (story.decos || []).forEach((emoji, i) => {
    const el = document.createElement('span');
    el.className = 'scene-deco';
    el.textContent = emoji;
    const slot = DECO_SLOTS[i % DECO_SLOTS.length];
    Object.assign(el.style, slot);
    sceneBg.appendChild(el);
  });

  // Progress bar colour
  document.getElementById('progress-fill').style.background =
    `linear-gradient(90deg,${story.color1},${story.color2})`;

  // Build suku kata spans
  try { buildWordSpans(story); } catch(e) { console.warn('buildWordSpans error:', e); }

  // Reset states
  musicEnabled = false;
  updateMusicBtn();
  stopMusic();
  if (synth) synth.cancel();
  isPaused = false;
  setPlayingState(false);
  resetProgress();
}


/* ════════════════════════════════════════════════
   BACK TO MENU
   ════════════════════════════════════════════════ */
function goBack() {
  playClick();
  if (synth) synth.cancel();
  stopMusic();
  isPaused = false;
  currentStory = null;

  document.getElementById('screen-story').style.display = 'none';
  const menu = document.getElementById('screen-menu');
  menu.style.display = 'flex';
  menu.classList.remove('screen-in');
  void menu.offsetWidth;
  menu.classList.add('screen-in');

  document.getElementById('char-secondary').classList.remove('visible');
  refreshBadges();
}


/* ════════════════════════════════════════════════
   MUSIC BUTTON
   ════════════════════════════════════════════════ */
function updateMusicBtn() {
  const btn = document.getElementById('btn-music');
  btn.textContent = musicEnabled ? '🔕 Muzik' : '🎵 Muzik';
  btn.classList.toggle('muted', !musicEnabled);
}

function toggleMusic() {
  playClick();
  musicEnabled = !musicEnabled;
  updateMusicBtn();
  if (musicEnabled && synth && synth.speaking && !synth.paused) {
    startMusic();
  } else {
    stopMusic();
  }
}


/* ════════════════════════════════════════════════
   SPEED SLIDER
   ════════════════════════════════════════════════ */
function initSpeedSlider() {
  const range = document.getElementById('speed-range');
  const label = document.getElementById('speed-label');

  function refresh() {
    const v   = parseFloat(range.value);
    const pct = ((v - range.min) / (range.max - range.min)) * 100;
    range.style.background =
      `linear-gradient(to right,#FF6B35 ${pct}%,rgba(255,255,255,0.3) ${pct}%)`;
    if      (v <= 0.60) label.textContent = 'Perlahan';
    else if (v <= 0.85) label.textContent = 'Sederhana';
    else if (v <= 1.10) label.textContent = 'Biasa';
    else                label.textContent = 'Pantas';
  }
  range.addEventListener('input', refresh);
  refresh();
}


/* ════════════════════════════════════════════════
   BUTTON BINDINGS
   ════════════════════════════════════════════════ */
function bindButtons() {
  document.getElementById('btn-play').addEventListener('click', () => {
    if (!currentStory) return;
    playClick();
    // If resuming a pause — no countdown
    if (isPaused) {
      playStory(currentStory, musicEnabled);
    } else {
      // Fresh start — show countdown first
      showCountdown(() => playStory(currentStory, musicEnabled));
    }
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    playClick(); pauseStory(musicEnabled);
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    playClick(); stopStory(musicEnabled);
  });

  document.getElementById('btn-music').addEventListener('click', toggleMusic);
  document.getElementById('btn-back').addEventListener('click', goBack);

  document.getElementById('voice-select').addEventListener('change', () => {
    if (synth && synth.speaking) stopStory(musicEnabled);
  });
}


/* ════════════════════════════════════════════════
   STORY COMPLETE CALLBACK  (called by speech.js)
   ════════════════════════════════════════════════ */
function onStoryComplete() {
  if (!currentStory) return;
  markDone(currentStory.id);
  refreshBadges();

  showStarRating((action) => {
    if (action === 'again') {
      showCountdown(() => playStory(currentStory, musicEnabled));
    } else {
      goBack();
    }
  });
}
