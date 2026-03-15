/* ════════════════════════════════════════════════
   speech.js — Web Speech API + Karaoke Highlight

   双轨高亮策略:
   TRACK A — 按字符位置比例预排 setTimeout (立即启动，确保一定highlight)
   TRACK B — onboundary 事件实时修正对齐 (有就用，没有就靠A)
   两者同时运行，wordIndex 只能前进不能后退，谁快谁主导。
   ════════════════════════════════════════════════ */

const synth = window.speechSynthesis;

/* ── state ── */
let voices    = [];
let wordSpans = [];      // DOM span 列表
let spanMap   = [];      // [{start, end, idx}] 字符位置映射
let totalWords  = 0;
let wordIndex   = 0;     // 当前进度（只增不减）
let isPaused    = false;
let highlightTimers = [];


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
   BUILD WORD SPANS
   ════════════════════════════════════════════════ */
function buildWordSpans(story) {
  const container = document.getElementById('story-text');
  container.innerHTML = '';
  wordSpans = [];
  spanMap   = [];

  story.paragraphs.forEach((para, pi) => {
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
    if (pi < story.paragraphs.length - 1) {
      const gap     = document.createElement('span');
      gap.className = 'para-break';
      container.appendChild(gap);
    }
  });

  totalWords = wordSpans.length;
}


/* ════════════════════════════════════════════════
   BUILD CHAR MAP  (用正则解析，更可靠)
   spanMap[i] = { start, end, idx }
   ════════════════════════════════════════════════ */
function buildCharMap(fullText) {
  spanMap = [];
  const regex = /\S+/g;
  let match;
  let spanIdx = 0;

  while ((match = regex.exec(fullText)) !== null && spanIdx < wordSpans.length) {
    spanMap.push({
      start : match.index,
      end   : match.index + match[0].length,
      idx   : spanIdx
    });
    spanIdx++;
  }
}


/* ════════════════════════════════════════════════
   HIGHLIGHT CORE
   ════════════════════════════════════════════════ */
function highlightWord(idx) {
  if (idx < 0 || idx >= wordSpans.length) return;

  wordSpans.forEach((s, i) => {
    if (i < idx)      { s.classList.remove('active'); s.classList.add('done'); }
    else if (i === idx){ s.classList.add('active');   s.classList.remove('done'); }
    // words after idx: leave as-is (未读)
  });

  wordSpans[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateProgress(Math.round(((idx + 1) / totalWords) * 100));
}

/** 只有在新位置 >= 当前位置时才高亮（防止倒退） */
function advanceTo(idx) {
  if (idx > wordIndex || (idx === 0 && wordIndex === 0)) {
    wordIndex = idx;
    highlightWord(idx);
  }
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
   FIND NEAREST SPAN  (for onboundary charIndex)
   ════════════════════════════════════════════════ */
function findSpanByChar(charIndex) {
  // 精确匹配
  for (const e of spanMap) {
    if (charIndex >= e.start && charIndex < e.end) return e.idx;
  }
  // 找最近
  let best = 0, bestDist = Infinity;
  spanMap.forEach((e, i) => {
    const d = Math.abs(e.start - charIndex);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}


/* ════════════════════════════════════════════════
   TRACK A — 预排计时器 (立即启动)
   按每个词的字符位置在全文中的比例来估算时间点
   ════════════════════════════════════════════════ */
function scheduleWordTimers(fullText, rate) {
  clearTimers();
  if (!spanMap.length) return;

  const totalChars  = fullText.length;
  // 马来语TTS: rate=1.0 约13字符/秒，加上句尾停顿略慢一点
  const charsPerSec = 12 * rate;
  const totalMs     = (totalChars / charsPerSec) * 1000;

  // TTS启动延迟约200ms
  const startDelay = 200;

  spanMap.forEach(entry => {
    const delay = startDelay + (entry.start / totalChars) * totalMs;
    const t = setTimeout(() => {
      // 只有在onboundary没跑到这里时才执行
      if (entry.idx >= wordIndex) {
        advanceTo(entry.idx);
      }
    }, delay);
    highlightTimers.push(t);
  });
}

function clearTimers() {
  highlightTimers.forEach(t => clearTimeout(t));
  highlightTimers = [];
}


/* ════════════════════════════════════════════════
   PLAYBACK
   ════════════════════════════════════════════════ */
function playStory(story, musicEnabled) {
  // 续播
  if (isPaused && synth.paused) {
    synth.resume();
    isPaused = false;
    setPlayingState(true);
    if (musicEnabled) startMusic();
    return;
  }

  // 全新开始
  synth.cancel();
  clearTimers();
  clearAllHighlights();
  wordIndex = 0;

  const fullText = story.paragraphs.join(' ');
  buildCharMap(fullText);

  const utter = new SpeechSynthesisUtterance(fullText);
  const rate  = parseFloat(document.getElementById('speed-range').value);

  utter.rate   = rate;
  utter.pitch  = 1.15;
  utter.volume = 1.0;
  utter.lang   = 'ms-MY';

  const voice = getSelectedVoice();
  if (voice) utter.voice = voice;

  /* TRACK A — 预排计时器，立即开始 */
  scheduleWordTimers(fullText, rate);

  /* TRACK B — onboundary 实时修正 */
  utter.onboundary = (e) => {
    if (e.name !== 'word') return;
    const idx = findSpanByChar(e.charIndex);
    // onboundary 跑得准，直接跳到正确位置（即使超过计时器）
    if (idx >= wordIndex) {
      wordIndex = idx;
      highlightWord(idx);
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

  setTimeout(() => {
    document.getElementById('char-secondary').classList.add('visible');
  }, 2000);
}

function pauseStory(musicEnabled) {
  if (synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    clearTimers();
    setPlayingState(false);
    document.getElementById('char-stage').classList.remove('playing');
    if (musicEnabled) stopMusic();
  }
}

function stopStory(musicEnabled) {
  synth.cancel();
  clearTimers();
  isPaused  = false;
  wordIndex = 0;
  clearAllHighlights();
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

/* 页面隐藏时自动暂停 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && synth.speaking && !synth.paused) {
    synth.pause();
    isPaused = true;
    clearTimers();
    setPlayingState(false);
  }
});
