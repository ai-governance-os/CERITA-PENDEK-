/* ════════════════════════════════════════════════
   music.js — Background Music (Web Audio API)
   Generates a gentle pentatonic lullaby melody.
   No external audio files needed.
   ════════════════════════════════════════════════ */

// Pentatonic scale: C D E G A c d e
const PENTATONIC_FREQ = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

// Melody pattern (indices into PENTATONIC_FREQ)
const MELODY_PATTERN = [0, 2, 4, 5, 4, 2, 0, 1, 2, 4, 2, 0, 5, 4, 2, 4];
const BASS_PATTERN   = [0, 4, 0, 4, 0, 4, 0, 4];

const MUSIC_BPM   = 76;
const MUSIC_BARS  = 4;   // bars before looping

let audioCtx    = null;
let musicNodes  = [];
let musicOn     = false;
let loopTimer   = null;

/**
 * Start background music.
 * Safe to call even if already playing — it will restart cleanly.
 */
function startMusic() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume suspended context (required by some browsers)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => _scheduleMusic());
    return;
  }
  _scheduleMusic();
}

function _scheduleMusic() {
  stopMusic();
  musicOn = true;

  const master = audioCtx.createGain();
  master.gain.value = 0.22;
  master.connect(audioCtx.destination);
  musicNodes.push(master);

  const beat = 60 / MUSIC_BPM;
  const now  = audioCtx.currentTime + 0.1;

  for (let rep = 0; rep < MUSIC_BARS; rep++) {
    // Melody (right hand)
    MELODY_PATTERN.forEach((noteIdx, i) => {
      const freq = PENTATONIC_FREQ[noteIdx % PENTATONIC_FREQ.length];
      const time = now + rep * MELODY_PATTERN.length * beat * 0.6 + i * beat * 0.6;
      _playNote(master, freq, time, beat * 0.8, 0.45);
    });

    // Bass (left hand, one octave lower)
    BASS_PATTERN.forEach((noteIdx, i) => {
      const freq = PENTATONIC_FREQ[noteIdx] / 2;
      const time = now + rep * BASS_PATTERN.length * beat + i * beat;
      _playNote(master, freq, time, beat * 1.6, 0.25);
    });
  }

  // Loop
  const loopDuration = MUSIC_BARS * MELODY_PATTERN.length * beat * 0.6 * 1000;
  loopTimer = setTimeout(() => { if (musicOn) startMusic(); }, loopDuration);
}

/**
 * Stop background music immediately.
 */
function stopMusic() {
  musicOn = false;
  clearTimeout(loopTimer);
  loopTimer = null;

  musicNodes.forEach(node => {
    try {
      if (node.stop)       node.stop();
      if (node.disconnect) node.disconnect();
    } catch (_) {}
  });
  musicNodes = [];
}

/**
 * Internal: schedule a single note.
 * @param {GainNode} dest    - destination gain node
 * @param {number}   freq    - frequency in Hz
 * @param {number}   time    - audioCtx start time
 * @param {number}   dur     - duration in seconds
 * @param {number}   vol     - peak volume (0–1)
 */
function _playNote(dest, freq, time, dur, vol) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.1);

  musicNodes.push(osc);
}
