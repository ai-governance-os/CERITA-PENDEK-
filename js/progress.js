/* ════════════════════════════════════════════════
   progress.js — Story Completion Tracking
   Uses localStorage to persist progress across sessions.
   ════════════════════════════════════════════════ */

const PROGRESS_KEY = 'cerita-bm-v1';

/** Mark a story as completed */
function markDone(id) {
  const done = loadDone();
  if (!done.includes(id)) {
    done.push(id);
    saveDone(done);
  }
}

/** Check if a story has been completed */
function isDone(id) {
  return loadDone().includes(id);
}

/** How many stories completed out of total */
function getDoneCount() {
  return loadDone().length;
}

/** Reset all progress */
function resetProgress_all() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch(e) {}
}

function loadDone() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]'); }
  catch(e) { return []; }
}

function saveDone(arr) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(arr)); }
  catch(e) {}
}
