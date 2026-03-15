/* ════════════════════════════════════════════════
   speech.js — Web Speech API + Karaoke Highlight

   Highlighting strategy (two-layer):
   1. PRIMARY  — onboundary word events (index-based, not charIndex)
   2. FALLBACK — per-word setTimeout schedule, activated automatically
                 if onboundary never fires within 1.5 s of playback start
   ════════════════════════════════════════════════ */

const synth = window.speechSynthesis;

/* ── state ── */
let voices           = [];
let currentUtterance = null;
let wordSpans        = [];   // all <span class="word"> in DOM order
let totalWords       = 0;
let wordIndex        = 0;    // which word we are currently at
let isPaused         = false;

/* ── fallback timer ── */
let highlightTimers   = [];  // array of setTimeout ids
let onboundaryFired   = false;
let fallbackCheckTimer = null;


/* ════════════════════════════════════════════════
   VOICE LOADING
   ════════════════════════════════════════════════ */
function loadVoices() {
  voices = synth.getVoices();
  const sel = document.getElementById('voice-select');
  sel.innerHTML = '';

  // Prefer Malay (ms-*) then Indonesian (id-*) then everything else
  const preferred = voices.filter(v => v.lang.startsWith('ms') || v.lang.startsWith('id'));
  const rest      = voices.filter(v => !v.lang.startsWith('ms') && !v.lang.startsWith('id'));

  [...preferred, ...rest].forEach((v, i) => {
    const opt       = document.createElement('option');
    opt.value       = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  });
}

synth.addEventListener('voiceschanged', loadVoices);
loadVoices();

function getSelectedVoice() {
  const name = document.getElementById('voice-select').value;
  return voices.find(v => v.name === name) || null;
}


/* ════════════════════════════════════════════════
   BUILD WORD SPANS  (called from app.js on open)
   ════════════════════════════════════════════════ */
function buildWordSpans(story) {
  const container = document.getElementById('story-text');
  container.innerHTML = '';
  wordSpans = [];

  story.paragraphs.forEach((para, paraIndex) => {
    para.split(/(\s+)/).forEach(token => {
      if (token.trim() === '') {
        container.appendChild(document.createTextNode(' '));
      } else {
        const span       = document.createElement('span');
        span.className   = 'word';
        span.textContent = token.trim();
        container.appendChild(span);
        wordSpans.push(span);
        container.appendChild(document.createTextNode(' '));
      }
    });

    if (paraIndex < story.paragraphs.length - 1) {
      const gap       = document.createElement('span');
      gap.className   = 'para-break';
      container.appendChild(gap);
    }
  });

  totalWords = wordSpans.length;
}


/* ════════════════════════════════════════════════
   CORE HIGHLIGHT — advance one word
   ════════════════════════════════════════════════ */
function highlightWord(index) {
  if (index < 0 || index >= wordSpans.length) return;

  // Dim all words before this one
  for (let i = 0; i < index; i++) {
    wordSpans[i].classList.remove('active');
    wordSpans[i].classList.add('done');
  }

  // Highlight the current word
  const span = wordSpans[index];
  span.classList.add('active');
  span.classList.remove('done');
  span.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Progress bar
  updateProgress(Math.round(((index + 1) / totalWords) * 100));
}

function clearAllHighlights() {
  wordSpans.forEach(s => s.classList.remove('active', 'done'));
  updateProgress(0);
}

function markAllDone() {
  wordSpans.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
}

function updateProgress(pct) {
  document.getElementById('progress-fill').style.width = pct + '%';
}


/* ════════════════════════════════════════════════
   TIMER FALLBACK
   Activated when onboundary does not fire.
   Schedules per-word highlights proportional
   to each word's character length.
   ════════════════════════════════════════════════ */
function startTimerFallback(story, rate) {
  clearTimers();

  // Build word list in the same order as wordSpans
  const words = story.paragraphs
    .join(' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  // Average Malay/English speech: ~130 words/min at rate=1.0
  // → ms per "average" 5-char word
  const msPerAvgWord = (60 / 130) / rate * 1000;
  const avgLen       = 5;

  let delay = 300; // small startup delay

  words.forEach((word, i) => {
    // Longer words take proportionally longer to pronounce
    const wordMs = (word.length / avgLen) * msPerAvgWord;
    const d      = delay;

    const t = setTimeout(() => {
      if (i < wordSpans.length) {
        wordIndex = i;
        highlightWord(i);
      }
    }, d);

    highlightTimers.push(t);
    delay += Math.max(150, wordMs);
  });
}

function clearTimers() {
  highlightTimers.forEach(t => clearTimeout(t));
  highlightTimers = [];
  if (fallbackCheckTimer) {
    clearTimeout(fallbackCheckTimer);
    fallbackCheckTimer = null;
  }
}


/* ════════════════════════════════════════════════
   PLAYBACK CONTROLS
   ════════════════════════════════════════════════ */

/**
 * Play (or resume) the story.
 * @param {object}  story
 * @param {boolean} musicEnabled
 */
function playStory(story, musicEnabled) {
  // Resume from pause
  if (isPaused && synth.paused) {
    synth.resume();
    isPaused = false;
    setPlayingState(true);
    if (musicEnabled) startMusic();
    return;
  }

  // Fresh start
  synth.cancel();
  clearTimers();
  clearAllHighlights();
  wordIndex        = 0;
  onboundaryFired  = false;

  const fullText = story.paragraphs.join(' ');
  const utter    = new SpeechSynthesisUtterance(fullText);
  currentUtterance = utter;

  const rate = parseFloat(document.getElementById('speed-range').value);
  utter.rate   = rate;
  utter.pitch  = 1.15;
  utter.volume = 1.0;
  utter.lang   = 'ms-MY';

  const voice = getSelectedVoice();
  if (voice) utter.voice = voice;

  /* ── PRIMARY: onboundary word events ── */
  utter.onboundary = (e) => {
    if (e.name !== 'word') return;

    // First fire — cancel the fallback check and any scheduled timers
    if (!onboundaryFired) {
      onboundaryFired = true;
      clearTimers();
    }

    if (wordIndex < wordSpans.length) {
      highlightWord(wordIndex);
      wordIndex++;
    }
  };

  utter.onend = () => {
    clearTimers();
    setPlayingState(false);
    markAllDone();
    updateProgress(100);
    showStarBurst();
    document.getElementById('char-stage').classList.remove('playing');
    if (musicEnabled) setTimeout(stopMusic, 3000);
  };

  utter.onerror = (e) => {
    if (e.error !== 'interrupted') console.warn('Speech error:', e.error);
  };

  synth.speak(utter);
  setPlayingState(true);
  if (musicEnabled) startMusic();

  // Show secondary character after 2 s
  setTimeout(() => {
    document.getElementById('char-secondary').classList.add('visible');
  }, 2000);

  /* ── FALLBACK CHECK: if onboundary never fires after 1.5 s ── */
  fallbackCheckTimer = setTimeout(() => {
    if (!onboundaryFired && synth.speaking) {
      startTimerFallback(story, rate);
    }
  }, 1500);
}

/**
 * Pause speech.
 * @param {boolean} musicEnabled
 */
function pauseStory(musicEnabled) {
  if (synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    setPlayingState(false);
    document.getElementById('char-stage').classList.remove('playing');
    clearTimers(); // pause timers too
    if (musicEnabled) stopMusic();
  }
}

/**
 * Stop speech and reset everything.
 * @param {boolean} musicEnabled
 */
function stopStory(musicEnabled) {
  synth.cancel();
  clearTimers();
  isPaused = false;
  clearAllHighlights();
  wordIndex = 0;
  setPlayingState(false);
  document.getElementById('char-secondary').classList.remove('visible');
  document.getElementById('char-stage').classList.remove('playing');
  document.getElementById('text-wrap').scrollTop = 0;
  if (musicEnabled) stopMusic();
}

/**
 * Show/hide Play vs Pause+Stop buttons and character jump animation.
 * @param {boolean} playing
 */
function setPlayingState(playing) {
  document.getElementById('btn-play') .classList.toggle('hidden',  playing);
  document.getElementById('btn-pause').classList.toggle('hidden', !playing);
  document.getElementById('btn-stop') .classList.toggle('hidden', !playing);
  document.getElementById('char-stage').classList.toggle('playing', playing);
}


/* ════════════════════════════════════════════════
   PAGE VISIBILITY — auto-pause when tab hidden
   ════════════════════════════════════════════════ */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    clearTimers();
    setPlayingState(false);
  }
});
