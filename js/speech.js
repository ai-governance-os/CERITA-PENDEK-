/* ════════════════════════════════════════════════
   speech.js — Web Speech API + Karaoke Highlight
   Handles voice loading, text-to-speech playback,
   word-by-word highlighting, and progress tracking.
   ════════════════════════════════════════════════ */

const synth = window.speechSynthesis;

let voices           = [];
let currentUtterance = null;
let wordSpans        = [];    // all <span class="word"> elements
let spanCharMap      = [];    // [{start, end, span}] — char positions in full text
let totalWords       = 0;
let isPaused         = false;

/* ─────────────────────────────────────────
   VOICE LOADING
───────────────────────────────────────── */

/**
 * Populate the voice <select> dropdown.
 * Called on page load and whenever voices change.
 */
function loadVoices() {
  voices = synth.getVoices();
  const sel = document.getElementById('voice-select');
  sel.innerHTML = '';

  // Prioritise Malay (ms) and Indonesian (id) voices
  const preferred = voices.filter(v => v.lang.startsWith('ms') || v.lang.startsWith('id'));
  const rest      = voices.filter(v => !v.lang.startsWith('ms') && !v.lang.startsWith('id'));
  const ordered   = [...preferred, ...rest];

  ordered.forEach((v, i) => {
    const opt = document.createElement('option');
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


/* ─────────────────────────────────────────
   BUILD WORD SPANS (Karaoke Setup)
───────────────────────────────────────── */

/**
 * Render story paragraphs as individually-wrapped <span> words
 * so each word can be highlighted independently during playback.
 * @param {object} story - story object from data.js
 */
function buildWordSpans(story) {
  const container = document.getElementById('story-text');
  container.innerHTML = '';
  wordSpans   = [];
  spanCharMap = [];

  story.paragraphs.forEach((para, paraIndex) => {
    const tokens = para.split(/(\s+)/);

    tokens.forEach(token => {
      if (token.trim() === '') {
        container.appendChild(document.createTextNode(' '));
      } else {
        const span = document.createElement('span');
        span.className   = 'word';
        span.textContent = token.trim();
        container.appendChild(span);
        wordSpans.push(span);
        container.appendChild(document.createTextNode(' '));
      }
    });

    // Add visual paragraph gap (not a <br> — keeps flow natural)
    if (paraIndex < story.paragraphs.length - 1) {
      const gap = document.createElement('span');
      gap.className = 'para-break';
      container.appendChild(gap);
    }
  });

  totalWords = wordSpans.length;
}


/* ─────────────────────────────────────────
   CHAR MAP — maps charIndex → span
───────────────────────────────────────── */

/**
 * Build a map of {start, end, span} from the full joined text.
 * Used to match `onboundary` charIndex back to the correct span.
 * @param {object} story
 */
function buildCharMap(story) {
  const fullText = story.paragraphs.join(' ');
  spanCharMap = [];
  let searchFrom = 0;

  wordSpans.forEach(span => {
    const word = span.textContent;
    const pos  = fullText.indexOf(word, searchFrom);
    if (pos !== -1) {
      spanCharMap.push({ start: pos, end: pos + word.length, span });
      searchFrom = pos + word.length;
    }
  });
}


/* ─────────────────────────────────────────
   HIGHLIGHT LOGIC
───────────────────────────────────────── */

/**
 * Highlight the word at the given character index.
 * Words already read are dimmed; current word is yellow.
 * @param {number} charIndex
 */
function highlightWordAtChar(charIndex) {
  let found = null;

  // Exact match
  for (const entry of spanCharMap) {
    if (charIndex >= entry.start && charIndex < entry.end) {
      found = entry;
      break;
    }
  }

  // Fallback: nearest upcoming word
  if (!found) {
    for (const entry of spanCharMap) {
      if (charIndex < entry.end) {
        found = entry;
        break;
      }
    }
  }

  if (!found) return;

  spanCharMap.forEach(e => {
    e.span.classList.remove('active');
    if (e.end <= found.start) {
      e.span.classList.add('done');
    }
  });

  found.span.classList.add('active');
  found.span.classList.remove('done');

  // Scroll word into view (smooth)
  found.span.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Update progress bar
  const doneCount = spanCharMap.filter(e => e.span.classList.contains('done')).length;
  updateProgress(Math.round((doneCount / totalWords) * 100));
}

function clearWordHighlights() {
  wordSpans.forEach(s => s.classList.remove('active', 'done'));
  spanCharMap = [];
  updateProgress(0);
}

function markAllDone() {
  wordSpans.forEach(s => {
    s.classList.remove('active');
    s.classList.add('done');
  });
}

function updateProgress(pct) {
  document.getElementById('progress-fill').style.width = pct + '%';
}


/* ─────────────────────────────────────────
   PLAYBACK CONTROLS
───────────────────────────────────────── */

/**
 * Start reading the current story from the beginning.
 * If paused, resumes instead.
 * @param {object} story       - story object from data.js
 * @param {boolean} musicEnabled
 */
function playStory(story, musicEnabled) {
  if (isPaused && synth.paused) {
    synth.resume();
    isPaused = false;
    setPlayingState(true);
    if (musicEnabled) startMusic();
    return;
  }

  // Fresh start
  synth.cancel();
  clearWordHighlights();

  if (!spanCharMap.length) buildCharMap(story);

  const fullText = story.paragraphs.join(' ');
  const utter    = new SpeechSynthesisUtterance(fullText);
  currentUtterance = utter;

  utter.rate   = parseFloat(document.getElementById('speed-range').value);
  utter.pitch  = 1.15;   // slightly higher — storytelling feel
  utter.volume = 1.0;
  utter.lang   = 'ms-MY';

  const voice = getSelectedVoice();
  if (voice) utter.voice = voice;

  // Karaoke: highlight word on each boundary event
  utter.onboundary = (e) => {
    if (e.name === 'word') highlightWordAtChar(e.charIndex);
  };

  utter.onend = () => {
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

  // Show secondary character after a short delay
  setTimeout(() => {
    document.getElementById('char-secondary').classList.add('visible');
  }, 2000);
}

/**
 * Pause ongoing speech.
 * @param {boolean} musicEnabled
 */
function pauseStory(musicEnabled) {
  if (synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    setPlayingState(false);
    document.getElementById('char-stage').classList.remove('playing');
    if (musicEnabled) stopMusic();
  }
}

/**
 * Stop speech entirely and reset UI.
 * @param {boolean} musicEnabled
 */
function stopStory(musicEnabled) {
  synth.cancel();
  isPaused = false;
  clearWordHighlights();
  setPlayingState(false);
  document.getElementById('char-secondary').classList.remove('visible');
  document.getElementById('char-stage').classList.remove('playing');
  document.getElementById('text-wrap').scrollTop = 0;
  if (musicEnabled) stopMusic();
}

/**
 * Toggle play/pause button visibility and character animation.
 * @param {boolean} playing
 */
function setPlayingState(playing) {
  document.getElementById('btn-play') .classList.toggle('hidden',  playing);
  document.getElementById('btn-pause').classList.toggle('hidden', !playing);
  document.getElementById('btn-stop') .classList.toggle('hidden', !playing);
  document.getElementById('char-stage').classList.toggle('playing', playing);
}


/* ─────────────────────────────────────────
   PAGE VISIBILITY — auto-pause when hidden
───────────────────────────────────────── */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    setPlayingState(false);
  }
});
