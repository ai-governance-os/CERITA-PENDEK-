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
  const v = synth.getVoices();
  if (!v.length) return; // not ready yet
  voices = v;
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
// Some mobile browsers (especially iOS) delay voice loading — retry a few times
let _voiceRetries = 0;
const _voiceRetryTimer = setInterval(() => {
  if (voices.length || _voiceRetries++ >= 10) { clearInterval(_voiceRetryTimer); return; }
  loadVoices();
}, 300);

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
  // Resume from pause — only check our own flag, not synth.paused
  // (synth.paused is unreliable on Android/iOS mobile browsers)
  if (isPaused) {
    synth.resume();
    isPaused = false;
    setPlayingState(true);
    if (musicEnabled) startMusic();
    // On iOS, resume() sometimes silently fails — detect and fall through to fresh play
    setTimeout(() => {
      if (!synth.speaking) {
        isPaused = false;
        playStory(story, musicEnabled);
      }
    }, 400);
    return;
  }

  // Check if browser supports speech synthesis
  if (!window.speechSynthesis) {
    alert('Penyemak imbas ini tidak menyokong bacaan suara. Sila guna Chrome atau Safari terbaru.');
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
    if (musicEnabled) setTimeout(stopMusic, 3500);
    // Notify app.js — triggers star rating + badge save
    if (typeof onStoryComplete === 'function') onStoryComplete();
  };

  utter.onerror = (e) => {
    if (e.error === 'not-allowed') {
      alert('Sila ketik butang sekali lagi — penyemak imbas anda memerlukan tindakan pengguna untuk memulakan suara.');
    } else if (e.error !== 'interrupted' && e.error !== 'canceled') {
      console.warn('Speech error:', e.error);
    }
    setPlayingState(false);
  };

  synth.speak(utter);
  setPlayingState(true);
  if (musicEnabled) startMusic();

  // Detect silent failure: if speech hasn't started within 2s, show warning
  setTimeout(() => {
    if (!synth.speaking && !synth.paused) {
      setPlayingState(false);
    }
  }, 2000);

  setTimeout(() => {
    document.getElementById('char-secondary').classList.add('visible');
  }, 2000);
}

function pauseStory(musicEnabled) {
  // synth.speaking check only — synth.paused is unreliable on mobile
  if (synth.speaking) {
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
