// Tiny Arduino-style simulator: runs setup() once and loop() a few times against a virtual clock,
// records pin writes, and checks the challenge tests. Runs in the learner's own browser.
const LOOPS = 6;
const MAX_MS = 60000;

export function runArduino(code, tests = []) {
  const trace = []; // {t, pin, val}
  const modes = {};
  let t = 0;
  let phase = "setup";
  let modeAfterSetup = {};
  let firstLoopWrite = null;
  let loopNo = 0;

  const api = {
    pinMode: (pin, mode) => { modes[pin] = mode; },
    digitalWrite: (pin, val) => {
      const v = val ? 1 : 0;
      trace.push({ t, pin, val: v });
      if (phase === "loop" && loopNo === 1 && pin === 13 && firstLoopWrite === null) firstLoopWrite = v;
    },
    delay: (ms) => {
      t += Number(ms) || 0;
      if (t > MAX_MS) throw new Error("Program runs too long (virtual time limit hit)");
    },
  };

  let error = null;
  try {
    const js = code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/\bvoid\s+(setup|loop)\s*\(\s*(?:void)?\s*\)/g, "function $1()")
      .replace(/\b(?:const\s+)?(?:unsigned\s+)?(?:int|long|float|double|bool|boolean|byte|char|uint8_t|uint16_t|uint32_t)\s+(\w+)\s*(?==|;)/g, "let $1");
    const factory = new Function(
      "pinMode", "digitalWrite", "delay", "HIGH", "LOW", "OUTPUT", "INPUT", "INPUT_PULLUP",
      `${js}\nreturn { setup: typeof setup==='function'?setup:null, loop: typeof loop==='function'?loop:null };`
    );
    const prog = factory(api.pinMode, api.digitalWrite, api.delay, 1, 0, 1, 0, 2);
    if (!prog.setup || !prog.loop) throw new Error("Define both void setup() and void loop()");
    prog.setup();
    modeAfterSetup = { ...modes };
    phase = "loop";
    for (let i = 1; i <= LOOPS; i++) { loopNo = i; prog.loop(); }
  } catch (e) {
    error = e.message || String(e);
  }

  // build pin-13 timeline
  const w = trace.filter((x) => x.pin === 13);
  const segs = []; // {val, ms} durations between consecutive writes
  for (let i = 0; i < w.length - 1; i++) segs.push({ val: w[i].val, ms: w[i + 1].t - w[i].t });
  const firstHigh = segs.find((s) => s.val === 1);
  const firstLow = segs.find((s) => s.val === 0);
  const cycles = w.filter((x, i) => x.val === 1 && w[i + 1] && w[i + 1].val === 0).length;

  const checks = {
    pinModeOutput: () => modeAfterSetup[13] === 1,
    firstHigh: () => firstLoopWrite === 1,
    highMs: (tt) => !!firstHigh && Math.abs(firstHigh.ms - tt.ms) <= tt.tol,
    lowMs: (tt) => !!firstLow && Math.abs(firstLow.ms - tt.ms) <= tt.tol,
    cycles: (tt) => cycles >= tt.min,
  };

  const results = tests.map((tt) => {
    let ok = false;
    if (!error) { try { ok = !!checks[tt.check]?.(tt); } catch { ok = false; } }
    return { id: tt.id, text: tt.text, ok };
  });
  return { error, results, passed: results.filter((r) => r.ok).length, total: results.length, trace: w.slice(0, 12), allPassed: !error && results.length > 0 && results.every((r) => r.ok) };
}
