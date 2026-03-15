/* ════════════════════════════════════════════════
   speech.js — Web Speech API
   Handles voice loading, TTS playback, and
   suku kata word span building.
   No karaoke highlight — suku kata colours only.
   ════════════════════════════════════════════════ */

const synth = window.speechSynthesis;

let voices   = [];
let wordSpans = [];
let isPaused  = false;
let progressTimer = null;


/* ════════════════════════════════════════════════
   VOICE LOADING
   ════════════════════════════════════════════════ */
function loadVoices() {
  voices = synth.getVoices();
  const sel = document.getElementById('voice-select');
  sel.innerHTML = '';

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
   BUILD WORD SPANS  (suku kata colour coding)
   ════════════════════════════════════════════════ */
function buildWordSpans(story) {
  const container = document.getElementById('story-text');
  container.innerHTML = '';
  wordSpans = [];

  story.paragraphs.forEach((para, pi) => {
    para.split(/(\s+)/).forEach(token => {
      if (token.trim() === '') {
        container.appendChild(document.createTextNode(' '));
      } else {
        const word = token.trim();
        const span = document.createElement('span');
        span.className = 'word';

        // Colour each syllable alternately red / blue
        const syllables = splitSukuKata(word);
        if (syllables.length <= 1) {
          span.textContent = word;
        } else {
          syllables.forEach((suku, si) => {
            const sk       = document.createElement('span');
            sk.className   = `suku suku-${si % 2 === 0 ? 'a' : 'b'}`;
            sk.textContent = suku;
            span.appendChild(sk);
          });
        }

        container.appendChild(span);
        wordSpans.push(span);
        container.appendChild(document.createTextNode(' '));
      }
    });

    if (pi < story.paragraphs.length - 1) {
      const gap     = document.createElement('span');
      gap.className = 'para-break';
      container.appendChild(gap);
    }
  });
}


/* ════════════════════════════════════════════════
   PROGRESS BAR  (time-based estimate)
   ════════════════════════════════════════════════ */
function startProgress(estimatedMs) {
  clearProgress();
  const fill  = document.getElementById('progress-fill');
  const start = Date.now();

  progressTimer = setInterval(() => {
    const pct = Math.min(100, ((Date.now() - start) / estimatedMs) * 100);
    fill.style.width = pct + '%';
    if (pct >= 100) clearProgress();
  }, 200);
}

function clearProgress() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function resetProgress() {
  clearProgress();
  document.getElementById('progress-fill').style.width = '0%';
}

function completeProgress() {
  clearProgress();
  document.getElementById('progress-fill').style.width = '100%';
}


/* ════════════════════════════════════════════════
   PLAYBACK
   ════════════════════════════════════════════════ */
function playStory(story, musicEnabled) {
  // Resume from pause
  if (isPaused && synth.paused) {
    synth.resume();
    isPaused = false;
    setPlayingState(true);
    if (musicEnabled) startMusic();
    return;
  }

  synth.cancel();
  resetProgress();

  const fullText = story.paragraphs.join(' ');
  const utter    = new SpeechSynthesisUtterance(fullText);
  const rate     = parseFloat(document.getElementById('speed-range').value);

  utter.rate   = rate;
  utter.pitch  = 1.15;
  utter.volume = 1.0;
  utter.lang   = 'ms-MY';

  const voice = getSelectedVoice();
  if (voice) utter.voice = voice;

  // Estimate total duration for progress bar (~13 chars/sec at rate 1.0)
  const estimatedMs = (fullText.length / (13 * rate)) * 1000;

  utter.onstart = () => {
    startProgress(estimatedMs);
  };

  utter.onend = () => {
    clearProgress();
    completeProgress();
    setPlayingState(false);
    document.getElementById('char-stage').classList.remove('playing');
    showStarBurst();
    if (musicEnabled) setTimeout(stopMusic, 3000);
  };

  utter.onerror = (e) => {
    if (e.error !== 'interrupted') console.warn('Speech error:', e.error);
  };

  synth.speak(utter);
  setPlayingState(true);
  if (musicEnabled) startMusic();

  setTimeout(() => {
    document.getElementById('char-secondary').classList.add('visible');
  }, 2000);
}

function pauseStory(musicEnabled) {
  if (synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    clearProgress();
    setPlayingState(false);
    document.getElementById('char-stage').classList.remove('playing');
    if (musicEnabled) stopMusic();
  }
}

function stopStory(musicEnabled) {
  synth.cancel();
  isPaused = false;
  resetProgress();
  setPlayingState(false);
  document.getElementById('char-secondary').classList.remove('visible');
  document.getElementById('char-stage').classList.remove('playing');
  document.getElementById('text-wrap').scrollTop = 0;
  if (musicEnabled) stopMusic();
}

function setPlayingState(playing) {
  document.getElementById('btn-play') .classList.toggle('hidden',  playing);
  document.getElementById('btn-pause').classList.toggle('hidden', !playing);
  document.getElementById('btn-stop') .classList.toggle('hidden', !playing);
  document.getElementById('char-stage').classList.toggle('playing', playing);
}


/* ════════════════════════════════════════════════
   AUTO-PAUSE when tab is hidden
   ════════════════════════════════════════════════ */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    clearProgress();
    setPlayingState(false);
  }
});
