import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Atom, Award, BookOpen, BrainCircuit, CheckCircle2, ChevronRight, Clock3, Flame, Globe2, LockKeyhole, Sparkles, Target, Trophy, UserRound, X, Zap } from "lucide-react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { chat } from "./api";
import { runArduino } from "./pinsim";
import topicsData from "../data/topics.json";

const TAG = "digital-electronics";
const titleToTag = Object.fromEntries(topicsData.map((t) => [t.title, t.tag]));

/* ---------- small shared bits ---------- */
export function SignInCard({ app, title = "Sign in to continue", text = "Your XP, streak and badges are saved to your account." }) {
  return (
    <div className="panel signin-card">
      <UserRound size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="primary" onClick={app.signIn}>Sign in with Google</button>
    </div>
  );
}

export function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id} className={`toast ${toast.kind}`} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}>
          {toast.m}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Checkpoints({ title, dash }) {
  const p = dash?.topics?.[titleToTag[title]] || {};
  const Dot = ({ on, icon: I, label }) => (
    <span className={on ? "cp-on" : ""}><I size={14} /> {label}</span>
  );
  return (
    <div className="checkpoint">
      <Dot on={p.lesson} icon={BookOpen} label="Learn" />
      <Dot on={p.lab} icon={Atom} label="Lab" />
      <Dot on={p.quiz} icon={Zap} label="Quiz" />
    </div>
  );
}

/* ---------- Learn ---------- */
const LESSONS = [
  { title: "Logic Gates & Boolean Algebra", year: 2, topic: "Digital Electronics", time: "8 min", level: "Beginner", desc: "Understand logic 0/1, basic and derived gates, truth tables and universal gates.", formula: "NAND = NOT(A · B)" },
  { title: "Ohm’s Law & Circuit Analysis", year: 1, topic: "Circuit Theory", time: "10 min", level: "Beginner", desc: "Relate voltage, current and resistance; apply KCL/KVL to simple networks.", formula: "V = I × R" },
  { title: "Sampling & Aliasing", year: 2, topic: "Signals & Systems", time: "12 min", level: "Intermediate", desc: "Explore sampling frequency and why undersampling creates misleading signals.", formula: "fₛ ≥ 2fₘₐₓ" },
  { title: "AM and FM Fundamentals", year: 3, topic: "Analog Communication", time: "14 min", level: "Intermediate", desc: "Compare amplitude and frequency modulation and their bandwidth trade-offs.", formula: "AM: s(t) = A₍c₎[1 + μm(t)]cos(ω₍c₎t)" },
];

export function LearnPage({ app }) {
  const live = app.content.lessons[0];
  const done = !!app.dash?.topics?.[live.tag]?.lesson;
  return (
    <section className="page-section">
      <div className="section-head"><div><span className="eyebrow">INTERACTIVE LEARNING</span><h2>Understand the why, not just the formula.</h2><p>Short lessons use intuition first, then definitions, examples and checkpoints.</p></div></div>
      <div className="lesson-list">
        {LESSONS.map((l) => {
          const isLive = l.title === live.title;
          return (
            <article className="lesson-row" key={l.title}>
              <div className="lesson-icon"><BookOpen /></div>
              <div className="lesson-info">
                <span className="eyebrow">YEAR {l.year} · {l.topic} {isLive ? (done ? "· ✔ COMPLETED" : "· LIVE") : "· COMING SOON"}</span>
                <h3>{l.title}</h3><p>{l.desc}</p><code>{l.formula}</code>
              </div>
              <div className="lesson-meta">
                <span><Clock3 size={14} />{l.time}</span><span>{l.level}</span>
                <button className="icon-button" aria-label="Open lesson" onClick={() => (isLive ? app.setReaderOpen(true) : app.setAi(true))}><ChevronRight /></button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="concept-note"><Sparkles /><div><b>Learning rule</b><p>Each concept is explained once and linked to its lab, code, quiz and simulation—so practice applies the lesson instead of repeating it.</p></div></div>
    </section>
  );
}

function Block({ b }) {
  if (b.type === "concept")
    return (
      <div className="rd-block"><h4>{b.title}</h4>{b.text && <p>{b.text}</p>}
        {b.table && (
          <div className="rd-scroll"><table className="truth"><thead><tr>{b.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.cells.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}</tbody></table></div>
        )}
      </div>
    );
  if (b.type === "keypoints") return <div className="rd-block rd-key"><h4>Key points</h4><ul>{b.items.map((x) => <li key={x}>{x}</li>)}</ul></div>;
  if (b.type === "formula") return <div className="rd-block"><h4>Formulas</h4>{b.items.map((f) => <div className="rd-formula" key={f.name}><span>{f.name}</span><code>{f.formula}</code></div>)}</div>;
  if (b.type === "example") return <div className="rd-block"><h4>Worked example</h4><p><b>{b.problem}</b></p>{b.steps.map((s) => <code className="rd-step" key={s}>{s}</code>)}<p>Answer: <b>{b.answer}</b></p></div>;
  if (b.type === "mistakes") return <div className="rd-block rd-warn"><h4>Common mistakes</h4><ul>{b.items.map((x) => <li key={x}>{x}</li>)}</ul></div>;
  return null;
}

export function LessonReader({ app }) {
  const lesson = app.content.lessons[0];
  const [level, setLevel] = useState("standard");
  const [ai, setAi] = useState({ text: "", loading: false });
  const done = !!app.dash?.topics?.[lesson.tag]?.lesson;
  const close = () => app.setReaderOpen(false);

  const explain = async () => {
    if (!app.user) return app.signIn();
    setAi({ text: "", loading: true });
    try {
      const r = await chat([{ role: "user", content: `Explain "${lesson.title}" to me.` }], { mode: "explain", level, tag: lesson.tag, lessonId: lesson.id });
      setAi({ text: r.reply, loading: false });
    } catch (e) { setAi({ text: "Couldn’t get an answer: " + e.message, loading: false }); }
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="reader" onClick={(e) => e.stopPropagation()}>
        <div className="rd-head">
          <div><span className="eyebrow">YEAR 2 · #{lesson.tag}</span><h2>{lesson.title}</h2><small><Clock3 size={13} /> {lesson.minutes} min read</small></div>
          <button className="icon-button" onClick={close} aria-label="Close"><X /></button>
        </div>
        <div className="rd-block"><h4>Learning goals</h4><ul>{lesson.goals.map((g) => <li key={g}>{g}</li>)}</ul></div>
        {lesson.blocks.map((b, i) => <Block b={b} key={i} />)}
        <div className="rd-block rd-ai">
          <h4><BrainCircuit size={15} /> Explain it at your level</h4>
          <div className="level-tabs">{[["simple", "Simple"], ["standard", "Standard"], ["interview", "Interview depth"]].map(([k, l]) => <button key={k} className={level === k ? "active" : ""} onClick={() => setLevel(k)}>{l}</button>)}</div>
          <button className="secondary" onClick={explain} disabled={ai.loading}>{ai.loading ? "Thinking…" : app.user ? "Ask AI to explain this lesson" : "Sign in to ask AI"}</button>
          {ai.text && <div className="chat-bubble bot ai-out">{ai.text}</div>}
        </div>
        <div className="rd-actions">
          <span>Try it:</span>
          <button className="text-button" onClick={() => { close(); app.setLabTab("gates"); app.go("Virtual Lab"); }}>Lab</button>
          <button className="text-button" onClick={() => { close(); app.go("Code"); }}>Code</button>
          <button className="text-button" onClick={() => { close(); app.go("Play"); }}>Quiz</button>
          <button className="primary" disabled={done} onClick={() => app.record("lesson", lesson.tag, lesson.id)}>{done ? "Completed ✔" : "Mark as complete"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Quiz ---------- */
export function PlayPage({ app }) {
  const qs = useMemo(() => [...app.content.questions].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [app.content]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [sel, setSel] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(20);
  const [res, setRes] = useState(null);
  const q = qs[i];

  useEffect(() => {
    if (!started || done || sel !== null || !q) return;
    setLeft(q.timeSec || 20);
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [started, done, i, sel]);

  useEffect(() => { if (started && !done && sel === null && left <= 0) pick(-1); }, [left]);

  const pick = (idx) => {
    if (sel !== null) return;
    setSel(idx);
    setAnswers((a) => [...a, { id: q.id, ok: idx === q.answer, ref: q.lessonRef }]);
  };

  const next = async () => {
    if (i < qs.length - 1) { setI(i + 1); setSel(null); return; }
    setDone(true);
    const correct = answers.filter((a) => a.ok).length;
    const pct = Math.round((correct / qs.length) * 100);
    setRes({ pct, correct, gained: null, loading: true });
    const r = await app.record("quiz", TAG, "digital-basics", pct);
    setRes({ pct, correct, gained: r?.gained ?? 0, passed: pct >= 70, saved: !!r, loading: false });
  };

  const restart = () => { setStarted(true); setI(0); setSel(null); setAnswers([]); setDone(false); setRes(null); };
  const head = <div className="section-head"><div><span className="eyebrow">QUIZZES & MINI-GAMES</span><h2>Quick rounds. Real understanding.</h2><p>Digital basics · {qs.length} timed questions · pass mark 70%</p></div><span className="pill orange">+80 XP</span></div>;

  if (!started)
    return <section className="page-section">{head}<div className="quiz-card quiz-intro"><Zap size={36} /><h2>Digital basics</h2><p>{qs.length} questions, {qs[0]?.timeSec || 20} seconds each. Score 70% or more to earn XP and count toward the topic badge.</p>{!app.user && <p className="fine">Sign in first so your score is saved.</p>}<button className="primary" onClick={restart}>Start quiz</button></div></section>;

  if (done) {
    const weak = answers.filter((a) => !a.ok);
    return (
      <section className="page-section">{head}
        <div className="quiz-card"><div className="quiz-result"><Award size={42} /><span className="eyebrow">ROUND COMPLETE</span>
          <h2>{res?.pct ?? 0}% · {res?.correct ?? 0} of {qs.length} correct</h2>
          <p>{res?.loading ? "Saving…" : res?.passed ? (res.saved ? `Passed! +${res.gained} XP` : "Passed! Sign in to save XP.") : "Below the 70% pass mark — review and try again."}</p>
          {weak.length > 0 && <p className="fine">Review: {weak.map((w) => qs.find((x) => x.id === w.id)?.prompt).filter(Boolean).slice(0, 3).join(" · ")}</p>}
          <div className="quiz-actions"><button className="primary" onClick={restart}>Retry</button><button className="secondary" onClick={() => app.setReaderOpen(true)}>Review in lesson</button></div>
        </div></div>
      </section>
    );
  }

  return (
    <section className="page-section">{head}
      <div className="quiz-card">
        <div className="quiz-progress"><span>QUESTION {i + 1} / {qs.length}</span><div><i style={{ width: `${((i + 1) / qs.length) * 100}%` }} /></div></div>
        <div className="timer-row"><Clock3 size={14} /> {sel === null ? `${Math.max(left, 0)}s` : sel === -1 ? "Time’s up" : "Answered"}<div className="timer-bar"><i style={{ width: `${sel === null ? Math.max(left, 0) / (q.timeSec || 20) * 100 : 0}%` }} /></div></div>
        <h2>{q.prompt}</h2>
        <div className="answer-grid">{q.options.map((o, idx) => (
          <button key={o} disabled={sel !== null} className={`answer ${sel === idx ? (idx === q.answer ? "correct" : "wrong") : ""} ${sel !== null && idx === q.answer ? "correct" : ""}`} onClick={() => pick(idx)}>{String.fromCharCode(65 + idx)}<span>{o}</span>{sel !== null && idx === q.answer && <CheckCircle2 size={17} />}</button>
        ))}</div>
        {sel !== null && <div className="explanation"><b>{sel === q.answer ? "Correct!" : sel === -1 ? "Out of time." : "Not quite."}</b><p>{q.explanation}</p><button className="text-button" onClick={() => app.setReaderOpen(true)}>Review in lesson <ChevronRight size={14} /></button></div>}
        <div className="quiz-footer"><span><Clock3 size={15} /> Timed mode</span><button className="primary" disabled={sel === null} onClick={next}>{i === qs.length - 1 ? "Finish round" : "Next question"} <ChevronRight size={16} /></button></div>
      </div>
    </section>
  );
}

/* ---------- Virtual Lab ---------- */
const G2 = { AND: (a, b) => a & b, OR: (a, b) => a | b, NAND: (a, b) => 1 - (a & b), NOR: (a, b) => 1 - (a | b), XOR: (a, b) => a ^ b, XNOR: (a, b) => 1 - (a ^ b) };
const nand = (a, b) => 1 - (a & b);
const CIRC = {
  t2: { name: "NOT from NAND", inputs: ["A"], outs: ["OUT"], run: ([a]) => ({ nodes: {}, out: [nand(a, a)] }) },
  t3: { name: "XOR from 4 NANDs", inputs: ["A", "B"], outs: ["OUT"], run: ([a, b]) => { const n1 = nand(a, b), n2 = nand(a, n1), n3 = nand(b, n1); return { nodes: { N1: n1, N2: n2, N3: n3 }, out: [nand(n2, n3)] }; } },
  t4: { name: "Half adder", inputs: ["A", "B"], outs: ["Sum", "Carry"], run: ([a, b]) => ({ nodes: {}, out: [a ^ b, a & b] }) },
};

export function LabTabs({ app }) {
  return <div className="lab-tabs"><button className={app.labTab === "gates" ? "active" : ""} onClick={() => app.setLabTab("gates")}>Logic-gate lab</button><button className={app.labTab === "sim" ? "active" : ""} onClick={() => app.setLabTab("sim")}>Street-light simulation</button></div>;
}

export function LabPage({ app }) {
  return <>{app.labTab === "sim" ? <StreetLight app={app} /> : <GateLab app={app} />}</>;
}

function GateLab({ app }) {
  const lab = app.content.labs[0];
  const [task, setTask] = useState("t1");
  const [gate, setGate] = useState("AND");
  const [A, setA] = useState(0);
  const [B, setB] = useState(0);
  const [tried, setTried] = useState({});
  const [passed, setPassed] = useState({});
  const [msg, setMsg] = useState("");
  const sent = useRef(false);
  const labDone = !!app.dash?.topics?.[TAG]?.lab;

  const isNot = task === "t1" && gate === "NOT";
  const circ = CIRC[task];
  const nIn = task === "t1" ? (isNot ? 1 : 2) : circ.inputs.length;
  const key = task === "t1" ? `${gate}:${isNot ? A : `${A}${B}`}` : nIn === 1 ? `${A}` : `${A}${B}`;

  useEffect(() => { setTried((t) => ({ ...t, [task]: new Set([...(t[task] || []), key]) })); }, [key, task]);

  const out = task === "t1" ? (isNot ? [1 - A] : [G2[gate](A, B)]) : circ.run(nIn === 1 ? [A] : [A, B]);
  const outs = task === "t1" ? out : out.out;
  const nodes = task === "t1" ? {} : out.nodes;
  const total1 = 6 * 4 + 2;
  const t1Count = [...(tried.t1 || [])].length;
  const need = task === "t1" ? total1 : 2 ** nIn;
  const have = task === "t1" ? t1Count : (tried[task] || new Set()).size;

  const taskDef = (id) => lab.tasks.find((x) => x.id === id);
  const check = () => {
    if (have < need) return setMsg(`Try every input combination first — ${need - have} left.`);
    if (task !== "t1") {
      const rows = taskDef(task).expected.outputs;
      const ok = rows.every((r) => { const ins = r.cells.slice(0, nIn); const exp = r.cells.slice(nIn); return CIRC[task].run(ins).out.every((v, k) => v === exp[k]); });
      if (!ok) return setMsg("Output doesn’t match the target truth table.");
    }
    setMsg("✔ Passed — truth table matches.");
    setPassed((p) => ({ ...p, [task]: true }));
  };

  const allPassed = ["t1", "t2", "t3", "t4"].every((t) => passed[t]);
  useEffect(() => { if (allPassed && !sent.current) { sent.current = true; app.record("lab", TAG, lab.id); } }, [allPassed]);

  const rowsForTable = () => {
    if (task === "t1") {
      const ins = isNot ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
      return ins.map((r) => ({ ins: r, outs: isNot ? [1 - r[0]] : [G2[gate](r[0], r[1])], seen: (tried.t1 || new Set()).has(`${gate}:${isNot ? r[0] : r.join("")}`) }));
    }
    const ins = nIn === 1 ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
    return ins.map((r) => ({ ins: r, outs: CIRC[task].run(r).out, seen: (tried[task] || new Set()).has(r.join("")) }));
  };
  const labels = task === "t1" ? (isNot ? ["A"] : ["A", "B"]) : circ.inputs;
  const outLabels = task === "t1" ? [gate] : circ.outs;

  return (
    <section className="page-section">
      <div className="section-head"><div><span className="eyebrow">VIRTUAL LAB · DIGITAL ELECTRONICS</span><h2>{lab.title}</h2><p>{lab.aim}</p></div><span className={`status-pill ${labDone ? "done" : ""}`}><span /> {labDone ? "COMPLETED" : "EXPERIMENT"}</span></div>
      <LabTabs app={app} />
      <div className="gl-grid">
        <div className="panel gl-main">
          <div className="gl-tasks">{["t1", "t2", "t3", "t4"].map((t, k) => <button key={t} className={`${task === t ? "active" : ""} ${passed[t] ? "ok" : ""}`} onClick={() => { setTask(t); setMsg(""); }}>{passed[t] ? "✔ " : ""}Task {k + 1}</button>)}</div>
          <p className="gl-text">{taskDef(task).text}</p>
          {task === "t1" && <div className="gl-gates">{[...Object.keys(G2), "NOT"].map((g) => <button key={g} className={gate === g ? "active" : ""} onClick={() => setGate(g)}>{g}</button>)}</div>}
          <div className="gl-board">
            <div className="gl-inputs">{labels.map((l, k) => { const v = k === 0 ? A : B; const set = k === 0 ? setA : setB; return <button key={l} className={`gl-switch ${v ? "on" : ""}`} onClick={() => set(1 - v)}>{l} = {v}</button>; })}</div>
            <div className="gl-chip">{task === "t1" ? gate : circ.name}</div>
            <div className="gl-outs">{outLabels.map((l, k) => <div key={l} className={`gl-led ${outs[k] ? "on" : ""}`}><i />{l} = {outs[k]}</div>)}</div>
          </div>
          {Object.keys(nodes).length > 0 && <p className="gl-nodes">Internal nodes: {Object.entries(nodes).map(([k, v]) => `${k}=${v}`).join(" · ")}</p>}
          <div className="gl-actions"><span className="fine">Combinations tried: {have} / {need}</span><button className="primary" onClick={check}>Check my result</button></div>
          {msg && <div className={`gl-msg ${msg.startsWith("✔") ? "ok" : ""}`}>{msg}</div>}
        </div>
        <aside className="panel gl-table">
          <span className="eyebrow">AUTO TRUTH TABLE</span>
          <table className="truth"><thead><tr>{labels.map((l) => <th key={l}>{l}</th>)}{outLabels.map((l) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{rowsForTable().map((r, k) => <tr key={k} className={r.seen ? "" : "unseen"}>{r.ins.map((v, j) => <td key={j}>{v}</td>)}{r.outs.map((v, j) => <td key={j}>{r.seen ? v : "?"}</td>)}</tr>)}</tbody></table>
          <p className="fine">Toggle the switches to fill the table. Complete all four tasks to finish the lab.</p>
          {!app.user && <p className="fine">Sign in to save lab progress.</p>}
          <p className="fine">Conclusion: {lab.conclusion.join(" · ")}</p>
        </aside>
      </div>
    </section>
  );
}

function StreetLight({ app }) {
  const [light, setLight] = useState(80);
  const [thr, setThr] = useState(600);
  const [hyst, setHyst] = useState(false);
  const [lamp, setLamp] = useState(false);
  const [m1, setM1] = useState(false);
  const [dusk, setDusk] = useState(null);
  const sent = useRef(false);
  const adc = Math.round((100 - light) * 10.23);
  const simDone = !!app.dash?.topics?.[TAG]?.awarded?.includes("sim:smart-street-light");

  useEffect(() => {
    setLamp((on) => (hyst ? (!on && adc > thr + 40 ? true : on && adc < thr - 40 ? false : on) : adc > thr));
  }, [adc, thr, hyst]);
  useEffect(() => { if (light < 30 && lamp) setM1(true); }, [light, lamp]);

  const runDusk = () => {
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280) * 2 - 1;
    const count = (h) => { let on = false, n = 0; for (let k = 0; k < 40; k++) { const v = thr + rnd() * 30; const nx = h ? (!on && v > thr + 40 ? true : on && v < thr - 40 ? false : on) : v > thr; if (nx !== on) n++; on = nx; } return n; };
    setDusk({ off: count(false), on: count(true) });
  };
  const m2 = !!dusk && hyst && dusk.on <= 1;
  const finish = () => { if (!sent.current) { sent.current = true; app.record("sim", TAG, "smart-street-light"); } };

  return (
    <section className="page-section">
      <div className="section-head"><div><span className="eyebrow">REAL-WORLD SIM · YEAR 2</span><h2>Smart street-light simulator</h2><p>An LDR divider feeds the controller: darker means a higher ADC reading. Lamp turns on when the reading passes the threshold.</p></div><span className={`status-pill ${simDone ? "done" : ""}`}><span /> {simDone ? "COMPLETED" : "SIMULATION"}</span></div>
      <LabTabs app={app} />
      <div className="lab-layout">
        <div className="lab-visual">
          <div className="lab-sky" style={{ filter: `brightness(${Math.max(.18, light / 55)})` }}><div className="sun" /><div className="lamp-post"><div className={`lamp-head ${lamp ? "lit" : ""}`} /><div className="pole" /><div className="lamp-base" /></div><div className="road" /><div className="lab-label">AMBIENT LIGHT {light}%</div></div>
          <div className="lab-readings"><div><small>ADC READING</small><b>{adc}</b></div><div><small>LAMP OUTPUT</small><b>{lamp ? "ON" : "OFF"}</b></div><div><small>POWER</small><b>{lamp ? "60 W" : "0 W"}</b></div></div>
        </div>
        <aside className="control-panel">
          <span className="eyebrow">CONTROL PANEL</span>
          <label>Ambient light <b>{light}%</b></label><input type="range" min="0" max="100" value={light} onChange={(e) => setLight(+e.target.value)} />
          <label>Threshold <b>{thr} ADC</b></label><input type="range" min="100" max="900" step="10" value={thr} onChange={(e) => setThr(+e.target.value)} />
          <div className="toggle-row"><span>Hysteresis <small>Reduce flicker at dusk</small></span><button className={`toggle ${hyst ? "on" : ""}`} onClick={() => setHyst(!hyst)} aria-label="Toggle hysteresis"><i /></button></div>
          <button className="secondary full" onClick={runDusk}>Run dusk test (40 noisy readings)</button>
          {dusk && <p className="fine">Lamp toggles — without hysteresis: <b>{dusk.off}</b> · with hysteresis: <b>{dusk.on}</b></p>}
          <div className="mission"><Target size={17} /><div><b>Missions</b>
            <p className={m1 ? "m-ok" : ""}>{m1 ? "✔" : "○"} Lamp turns on when light falls below 30%.</p>
            <p className={m2 ? "m-ok" : ""}>{m2 ? "✔" : "○"} Remove dusk flicker: turn hysteresis on, then run the dusk test.</p></div></div>
          <button className="primary full" disabled={!(m1 && m2) || simDone} onClick={finish}>{simDone ? "Completed ✔" : "Complete missions (+70 XP)"}</button>
          <p className="fine">Browser-based educational model; not a hardware-accurate circuit solver.</p>
        </aside>
      </div>
    </section>
  );
}

/* ---------- Code ---------- */
export function CodePage({ app }) {
  const ch = app.content.challenges[0];
  const code = app.codeDraft || ch.starter;
  const [run, setRun] = useState(null);
  const [hints, setHints] = useState([]);
  const [loadingHint, setLoadingHint] = useState(false);
  const sent = useRef(false);
  const done = !!app.dash?.topics?.[TAG]?.code;

  const doRun = () => {
    const r = runArduino(code, ch.tests);
    setRun(r);
    app.setAttempts((a) => a + 1);
    if (r.allPassed && !sent.current) { sent.current = true; app.record("code", TAG, ch.id); }
  };

  const hint = async (rung) => {
    const stored = rung === 4 ? ch.solution : ch.hints[rung - 1];
    setLoadingHint(true);
    let text = stored;
    if (app.user) {
      try {
        const failing = run ? run.results.filter((x) => !x.ok).map((x) => x.text).join("; ") : "not run yet";
        const r = await chat([{ role: "user", content: `Challenge: ${ch.statement}\nMy code:\n${code}\nFailing tests: ${failing}${run?.error ? `\nError: ${run.error}` : ""}` }], { mode: "debug", rung, attempts: app.attempts, tag: TAG });
        text = r.reply;
      } catch { /* fall back to the stored hint */ }
    }
    setHints((h) => [...h, { rung, text }]);
    setLoadingHint(false);
  };

  const next = hints.filter((h) => h.rung < 4).length + 1;
  return (
    <section className="page-section">
      <div className="section-head"><div><span className="eyebrow">CODING CHALLENGES</span><h2>From logic to firmware.</h2><p>Arduino-style C runs in a simulated pin model right in your browser.</p></div></div>
      <div className="code-challenge">
        <div>
          <span className="pill purple">EASY · +{ch.xp} XP {done ? "· ✔ SOLVED" : ""}</span>
          <h2>{ch.title}</h2><p>{ch.statement}</p>
          <div className="test-list">{ch.tests.map((t) => { const r = run?.results.find((x) => x.id === t.id); return <span key={t.id} className={r ? (r.ok ? "ok" : "fail") : ""}>{r?.ok ? <CheckCircle2 /> : r ? <X /> : <CheckCircle2 style={{ opacity: .35 }} />} {t.text}</span>; })}</div>
          <div className="hint-ladder">
            <b>Hint ladder</b>
            {hints.map((h, k) => <div className="hint-item" key={k}><small>{h.rung === 4 ? "SOLUTION" : `HINT ${h.rung}`}</small><p>{h.text}</p></div>)}
            <div className="hint-btns">
              {[1, 2, 3].map((r) => <button key={r} className="secondary" disabled={loadingHint || r !== next} onClick={() => hint(r)}>Hint {r}</button>)}
              <button className="secondary" disabled={loadingHint || app.attempts < 1} onClick={() => hint(4)}>Show answer</button>
            </div>
            <small className="fine">{app.attempts < 1 ? "Run your code at least once to unlock the answer." : app.user ? "Hints come from the AI mentor." : "Sign in for AI hints tailored to your code."}</small>
          </div>
        </div>
        <div className="editor-col">
          <textarea className="editor" spellCheck="false" value={code} onChange={(e) => app.setCodeDraft(e.target.value)} />
          <div className="editor-actions"><button className="secondary" onClick={() => app.setCodeDraft(ch.starter)}>Reset</button><button className="primary" onClick={doRun}>Run & check</button></div>
          {run && (
            <div className="run-out">
              <b>{run.error ? "Error" : `${run.passed} of ${run.total} tests passed`}</b>
              {run.error && <code>{run.error}</code>}
              {!run.error && <code className="trace">{run.trace.length ? run.trace.map((x) => `${x.t}ms: pin13 ${x.val ? "HIGH" : "LOW"}`).join("\n") : "No writes to pin 13"}</code>}
              {run.allPassed && <p className="m-ok">✔ All tests passed{app.user ? "" : " — sign in to earn XP"}.</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Progress ---------- */
export function ProgressPage({ app }) {
  const [board, setBoard] = useState(null);
  const xp = app.dash?.user?.xp;
  useEffect(() => {
    if (!app.user) return;
    (async () => {
      try {
        const s = await getDocs(query(collection(db, "users"), orderBy("xp", "desc"), limit(10)));
        setBoard(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch { setBoard([]); }
    })();
  }, [app.user, xp]);

  const head = <div className="section-head"><div><span className="eyebrow">PROGRESS TRACKING</span><h2>Your consistency builds mastery.</h2><p>XP, streaks and badges are saved to your account.</p></div></div>;
  if (!app.user) return <section className="page-section">{head}<SignInCard app={app} title="Sign in to see your progress" /></section>;
  const d = app.dash;
  if (!d) return <section className="page-section">{head}<p className="fine">Loading your progress…</p></section>;
  const t = d.topics[TAG] || {};
  const rows = [["Lesson", t.lesson ? 100 : 0], ["Virtual lab", t.lab ? 100 : 0], ["Coding challenge", t.code ? 100 : 0], ["Quiz (best)", t.quizBest || 0]];
  return (
    <section className="page-section">{head}
      <div className="stats-grid">
        <article className="stat-card"><span><Zap size={18} /></span><small>Total XP</small><strong>{d.user.xp}</strong><p>Level {d.user.level} · {d.user.xpToNext} XP to next</p></article>
        <article className="stat-card"><span><Flame size={18} /></span><small>Current streak</small><strong>{d.user.streak} day{d.user.streak === 1 ? "" : "s"}</strong><p>Days with a completed activity</p></article>
        <article className="stat-card"><span><Award size={18} /></span><small>Badges</small><strong>{d.user.badges.length}</strong><p>{d.user.badges.join(", ") || "Master a topic to earn one"}</p></article>
        <article className="stat-card"><span><Target size={18} /></span><small>Year 2 mastery</small><strong>{d.yearProgress[2]}%</strong><p>{d.gate}% unlocks the next year</p></article>
      </div>
      <div className="progress-layout">
        <div className="panel"><div className="panel-head"><h3>Digital Electronics</h3><span className="pill">{t.mastered ? "MASTERED" : "IN PROGRESS"}</span></div>
          {rows.map(([n, v]) => <div className="mastery-row" key={n}><span>{n}</span><div className="bar"><i style={{ width: `${v}%` }} /></div><b>{v}%</b></div>)}
          <div className="year-gate"><LockKeyhole size={16} /><span>{[1, 2, 3, 4].map((y) => `Y${y}: ${d.yearProgress[y]}%${d.unlocked[y] ? "" : " 🔒"}`).join(" · ")}</span></div>
        </div>
        <div className="panel leaderboard"><div className="panel-head"><h3>Leaderboard</h3><Globe2 size={18} /></div>
          {(board || []).map((u, i) => <div className="rank-row" key={u.id}><b className={`rank rank${i < 3 ? i : 3}`}>{i + 1}</b><span>{u.name || "Learner"}{u.id === app.user.uid && <small>You</small>}</span><strong>{u.xp || 0} XP</strong></div>)}
          {board && board.length === 0 && <p className="fine">No entries yet — complete an activity to get on the board.</p>}
        </div>
      </div>
    </section>
  );
}

/* ---------- Profile ---------- */
export function ProfilePage({ app }) {
  const { profile, setProfile, profilePublic, setProfilePublic, user, dash } = app;
  if (!user) return <section className="page-section"><div className="section-head"><div><span className="eyebrow">PROFILE & PRIVACY</span><h2>Your learning identity.</h2></div></div><SignInCard app={app} title="Sign in to create your profile" /></section>;
  const name = user.displayName || profile.name || "Learner";
  return (
    <section className="page-section">
      <div className="section-head"><div><span className="eyebrow">PROFILE & PRIVACY</span><h2>Your learning identity.</h2><p>Name and email come from your Google account.</p></div><button className="secondary" onClick={app.signOut}>Sign out</button></div>
      <div className="profile-layout">
        <div className="profile-card">
          <div className="avatar">{user.photoURL ? <img className="avatar-img" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <UserRound />}</div>
          <span className="pill">ENTC · YEAR {profile.year}</span><h2>{name}</h2><p>{profile.bio}</p>
          <div className="profile-stats"><span><b>{dash?.user.xp ?? 0}</b> XP</span><span><b>{dash?.user.streak ?? 0}</b> day streak</span><span><b>{dash?.user.badges.length ?? 0}</b> badges</span></div>
        </div>
        <form className="panel profile-form" onSubmit={(e) => { e.preventDefault(); app.notify("Profile saved for this session"); }}>
          <h3>Edit profile</h3>
          <label>Email<input value={user.email || ""} readOnly /></label>
          <label>Current year<select value={profile.year} onChange={(e) => setProfile({ ...profile, year: e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>Bio<textarea rows="3" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} /></label>
          <div className="privacy-row"><div><b>Public achievements</b><small>Allow others to see badges and leaderboard entry.</small></div><button type="button" className={`toggle ${profilePublic ? "on" : ""}`} onClick={() => setProfilePublic(!profilePublic)}><i /></button></div>
          <button className="primary" type="submit">Save profile</button>
        </form>
      </div>
    </section>
  );
}

/* ---------- AI drawer ---------- */
const MODES = [["explain", "Explain"], ["debug", "Debug"], ["interview", "Interview"]];
const RUNGS = [[1, "Hint 1 · Nudge"], [2, "Hint 2 · Approach"], [3, "Hint 3 · Near-solution"], [4, "Show answer"]];

export function AiDrawer({ app, open, onClose }) {
  const [mode, setMode] = useState("explain");
  const [level, setLevel] = useState("standard");
  const [rung, setRung] = useState(1);
  const [jobType, setJobType] = useState("core electronics");
  const [difficulty, setDifficulty] = useState("medium");
  const [msgs, setMsgs] = useState({ explain: [], debug: [], interview: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const list = msgs[mode];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [list.length, busy, open]);

  const send = async (override) => {
    const content = (override ?? text).trim();
    if (!content || busy) return;
    const history = [...list, { role: "user", content }];
    setMsgs((m) => ({ ...m, [mode]: history }));
    setText(""); setBusy(true);
    const withCode = mode === "debug" && app.page === "Code" && app.codeDraft ? history.map((h, k) => (k === history.length - 1 ? { ...h, content: `${h.content}\n\nMy code:\n${app.codeDraft}` } : h)) : history;
    try {
      const opts = { mode, tag: TAG, lessonId: app.content.lessons[0].id, level, rung, attempts: app.attempts, jobType, difficulty, round: "technical" };
      const r = await chat(withCode, opts);
      setMsgs((m) => ({ ...m, [mode]: [...history, { role: "assistant", content: r.reply }] }));
    } catch (e) {
      setMsgs((m) => ({ ...m, [mode]: [...history, { role: "assistant", content: `⚠ ${e.message}` }] }));
    }
    setBusy(false);
  };

  const intro = { explain: "Ask about any Digital Electronics idea — I’ll match the lesson’s wording at the level you pick.", debug: "Paste your code or describe the problem. I reveal one hint at a time — pick the rung below.", interview: "Choose a job type and I’ll run a mock interview, one question at a time." }[mode];
  const starters = { explain: ["What is a NAND gate?", "Why are NAND gates universal?", "Explain De Morgan’s theorem"], debug: ["My LED glows faintly and doesn’t blink", "Why does my loop never turn the LED off?"], interview: [] }[mode];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="ai-drawer" initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: "spring", damping: 28, stiffness: 240 }}>
            <div className="drawer-head"><div className="ai-avatar"><BrainCircuit /></div><div><b>Supernova AI</b><small>ENTC learning companion</small></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
            <div className="mode-tabs">{MODES.map(([k, l]) => <button key={k} className={mode === k ? "active" : ""} onClick={() => setMode(k)}>{l}</button>)}</div>
            <div className="ai-context"><Sparkles size={14} /> Context: Digital Electronics{app.page === "Code" ? " · Blink the LED" : ""}</div>
            {mode === "explain" && <div className="level-tabs">{[["simple", "Simple"], ["standard", "Standard"], ["interview", "Interview"]].map(([k, l]) => <button key={k} className={level === k ? "active" : ""} onClick={() => setLevel(k)}>{l}</button>)}</div>}
            {mode === "debug" && <div className="level-tabs wrap">{RUNGS.map(([r, l]) => <button key={r} className={rung === r ? "active" : ""} disabled={r === 4 && app.attempts < 1} onClick={() => setRung(r)}>{l}</button>)}</div>}
            {mode === "interview" && <div className="iv-setup"><select value={jobType} onChange={(e) => setJobType(e.target.value)}>{["core electronics", "embedded/firmware", "VLSI/verification", "telecom/networking", "IT services"].map((j) => <option key={j}>{j}</option>)}</select><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>{["easy", "medium", "hard"].map((j) => <option key={j}>{j}</option>)}</select></div>}
            {!app.user ? (
              <div className="chat-body"><div className="chat-bubble bot">{intro}</div><SignInCard app={app} title="Sign in to chat with the AI" text="Sign-in keeps the AI free from abuse and saves your progress." /></div>
            ) : (
              <>
                <div className="chat-body">
                  <div className="chat-bubble bot">{intro}</div>
                  {list.length === 0 && starters.length > 0 && <div className="quick-prompts">{starters.map((p) => <button key={p} onClick={() => send(p)}>{p}</button>)}</div>}
                  {list.length === 0 && mode === "interview" && <button className="primary full" onClick={() => send("Start the interview.")}>Start interview</button>}
                  {list.map((m, k) => <div key={k} className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>{m.content}</div>)}
                  {busy && <div className="chat-bubble bot small">Thinking…</div>}
                  <div ref={endRef} />
                </div>
                <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "debug" ? "Describe the bug or paste code…" : "Ask a doubt…"} />
                  <button className="primary" aria-label="Send" disabled={busy}><ChevronRight /></button>
                </form>
              </>
            )}
            <div className="drawer-note"><LockKeyhole size={13} /> AI can make mistakes. Check important answers against your lesson. Never share passwords or API keys.</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
