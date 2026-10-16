const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const bz2 = require('unbzip2-stream');
const { DATA_DIR } = require('../config/pff');

// Python's C bz2 is ~10x faster than the pure-JS decoder (the ML server already needs Python).
let PYTHON;
function findPython() {
  if (PYTHON !== undefined) return PYTHON;
  PYTHON = null;
  for (const cmd of [process.env.PYTHON, 'python', 'python3', 'py'].filter(Boolean)) {
    try {
      const r = spawnSync(cmd, ['-c', 'import bz2'], { timeout: 5000, windowsHide: true });
      if (r.status === 0) { PYTHON = cmd; break; }
    } catch (e) { /* try next */ }
  }
  return PYTHON;
}

function decompressedStream(file) {
  const py = findPython();
  if (py) {
    const child = spawn(py, ['-c', 'import bz2,sys,shutil;shutil.copyfileobj(bz2.open(sys.argv[1]),sys.stdout.buffer,1<<20)', file],
      { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    child.on('error', (err) => console.error(`[PFF] python decompressor failed: ${err.message}`));
    return { stream: child.stdout, kill: () => child.kill(), via: `python (${py})` };
  }
  return { stream: fs.createReadStream(file).pipe(bz2()), kill: () => {}, via: 'unbzip2-stream (slow; install Python for fast seeking)' };
}

const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...parts), 'utf8'));

function loadMatch(gameId) {
  const meta = readJson('Metadata', `${gameId}.json`)[0];
  const roster = readJson('Rosters', `${gameId}.json`);
  const events = readJson('Event Data', `${gameId}.json`);
  const pitch = meta.stadium && meta.stadium.pitches && meta.stadium.pitches[0];
  return {
    meta,
    roster,
    events,
    pitch: { length: pitch ? Number(pitch.length) : 105, width: pitch ? Number(pitch.width) : 68 },
    trackingFile: path.join(DATA_DIR, 'Tracking Data', `${gameId}.jsonl.bz2`),
  };
}

/**
 * Streams a PFF tracking file (.jsonl.bz2) without loading it into memory.
 * Lines are buffered; only the frame actually shown is JSON-parsed.
 */
class TrackingReader {
  constructor(file) {
    this.queue = [];
    this.ended = false;
    this.available = fs.existsSync(file);
    if (!this.available) {
      this.ended = true;
      return;
    }
    this.skipBefore = null;
    const { stream, kill, via } = decompressedStream(file);
    this.kill = kill;
    this.via = via;
    stream.on('error', (err) => {
      console.error(`[PFF] tracking stream error: ${err.message}`);
      this.ended = true;
    });
    this.rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    this.rl.on('line', (line) => {
      if (!line) return;
      if (this.skipBefore !== null) {           // fast-forward: drop frames before the start time
        const t = TrackingReader.timeOf(line);
        if (t !== null && t < this.skipBefore) return;
        this.skipBefore = null;
      }
      this.queue.push(line);
      if (this.queue.length > 900) this.rl.pause();
    });
    this.rl.on('close', () => { this.ended = true; });
  }

  /** Drop every frame earlier than video time t (used to start mid-match). */
  skipUntil(t) {
    this.queue = this.queue.filter((l) => (TrackingReader.timeOf(l) ?? Infinity) >= t);
    if (!this.queue.length) this.skipBefore = t;
  }

  static timeOf(line) {
    const m = /"videoTimeMs":\s*([0-9.]+)/.exec(line);
    return m ? parseFloat(m[1]) / 1000 : null;
  }

  /** Video time (s) of the next buffered frame, or null if none buffered. */
  peekTime() {
    while (this.queue.length) {
      const t = TrackingReader.timeOf(this.queue[0]);
      if (t !== null) return t;
      this.queue.shift();
    }
    return null;
  }

  /** Consume all frames with time <= t and return the last one (parsed), or null. */
  takeUntil(t) {
    let last = null;
    while (this.queue.length) {
      const ft = TrackingReader.timeOf(this.queue[0]);
      if (ft === null) { this.queue.shift(); continue; }
      if (ft > t) break;
      last = this.queue.shift();
    }
    if (this.rl && this.queue.length < 300) this.rl.resume();
    return last ? JSON.parse(last) : null;
  }

  get exhausted() {
    return this.ended && this.queue.length === 0;
  }

  close() {
    if (this.rl) this.rl.close();
    if (this.kill) this.kill();
  }
}

module.exports = { loadMatch, TrackingReader };
