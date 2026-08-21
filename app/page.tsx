"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { deriveTargetShares } from "../lib/compute";
import { signIn, testConnection } from "../lib/supabase";

type Tab = "log" | "intent" | "drift";
type Category = { id: string; name: string; color: string; inPie: boolean };
type Entry = { id: string; label: string; start: string; end: string; category: string; category2?: string; weight: number; note?: string };

const DEFAULT_CATEGORIES: Category[] = [
  ["career", "Career", "#D55D42", true], ["community", "Community", "#D49A38", true],
  ["parenting", "Parenting", "#C2A93B", true], ["romance", "Romance", "#C96B76", true],
  ["family", "Family", "#A86B8E", true], ["friends", "Friends", "#6D75A8", true],
  ["recreation", "Recreation", "#357F91", true], ["physical", "Physical health", "#4E9273", true],
  ["spiritual", "Spiritual", "#7A9161", true], ["growth", "Personal growth", "#8C755B", true],
  ["maintenance", "Maintenance", "#898780", false],
].map(([id, name, color, inPie]) => ({ id: String(id), name: String(name), color: String(color), inPie: Boolean(inPie) }));

const DEMO_ENTRIES: Entry[] = [
  { id: "1", label: "Project planning", start: "2026-08-21T09:05", end: "2026-08-21T10:35", category: "career", weight: 1 },
  { id: "2", label: "Lunch & walk", start: "2026-08-21T12:20", end: "2026-08-21T13:10", category: "physical", category2: "friends", weight: .8 },
  { id: "3", label: "Reading", start: "2026-08-20T20:10", end: "2026-08-20T21:05", category: "growth", weight: 1 },
  { id: "4", label: "Groceries", start: "2026-08-20T18:15", end: "2026-08-20T19:00", category: "maintenance", weight: 1 },
];

const fmtDuration = (minutes: number) => minutes < 60 ? `${Math.round(minutes)}m` : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
const minutes = (entry: Entry) => Math.max(0, (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000);
const todayLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const timeLocal = (offset = 0) => { const d = new Date(Date.now() + offset * 60000); return d.toTimeString().slice(0, 5); };

function Dot({ category, small = false }: { category?: Category; small?: boolean }) {
  return <span className={small ? "dot small" : "dot"} style={{ background: category?.color }} />;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("log");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [entries, setEntries] = useState<Entry[]>(DEMO_ENTRIES);
  const [steepness, setSteepness] = useState(1);
  const [timer, setTimer] = useState<{ label: string; category: string; startedAt: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [windowDays, setWindowDays] = useState<7 | 30 | 99999>(7);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("drift-state");
    if (saved) { try { const state = JSON.parse(saved); setEntries(state.entries || DEMO_ENTRIES); setCategories(state.categories || DEFAULT_CATEGORIES); setSteepness(state.steepness ?? 1); setTimer(state.timer || null); } catch {} }
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { localStorage.setItem("drift-state", JSON.stringify({ entries, categories, steepness, timer })); }, [entries, categories, steepness, timer]);
  useEffect(() => { if (!timer) return; const tick = () => setElapsed(Date.now() - timer.startedAt); tick(); const id = setInterval(tick, 1000); return () => clearInterval(id); }, [timer]);

  const inPie = categories.filter(c => c.inPie);
  const shares = deriveTargetShares(inPie.map(c => c.id), steepness);
  const category = (id: string) => categories.find(c => c.id === id);
  const startTimer = (label: string, categoryId: string) => { setTimer({ label, category: categoryId, startedAt: Date.now() }); setToast("Timer started"); setTimeout(() => setToast(""), 1800); };
  const stopTimer = () => {
    if (!timer) return;
    setEntries([{ id: crypto.randomUUID(), label: timer.label || "Untitled", start: new Date(timer.startedAt).toISOString(), end: new Date().toISOString(), category: timer.category, weight: 1 }, ...entries]);
    setTimer(null); setElapsed(0); setToast(online ? "Saved" : "Saved offline — will sync later"); setTimeout(() => setToast(""), 2200);
  };
  const move = (index: number, direction: -1 | 1) => { const next = [...categories]; const target = index + direction; if (target < 0 || target >= inPie.length) return; const a = next.findIndex(c => c.id === inPie[index].id), b = next.findIndex(c => c.id === inPie[target].id); [next[a], next[b]] = [next[b], next[a]]; setCategories(next); };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setTab("log")} aria-label="The Drift home"><span className="mark">D</span><span>The Drift</span></button>
        <div className="top-actions"><span className={`sync ${online ? "" : "offline"}`}><i />{online ? "Synced" : "Offline"}</span><button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Open settings">•••</button></div>
      </header>

      {tab === "log" && <LogScreen {...{ categories, entries, timer, elapsed, showForm, setShowForm, startTimer, stopTimer, setEntries, category }} />}
      {tab === "intent" && <IntentScreen {...{ inPie, shares, steepness, setSteepness, move }} />}
      {tab === "drift" && <DriftScreen {...{ categories, entries, shares, windowDays, setWindowDays, category }} />}

      <nav className="tabbar" aria-label="Main navigation">
        {(["log", "intent", "drift"] as Tab[]).map(name => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}><span className={`nav-icon ${name}`} />{name[0].toUpperCase() + name.slice(1)}</button>)}
      </nav>

      {showSettings && <Settings onClose={() => setShowSettings(false)} onConnected={(message: string) => { setShowSettings(false); setToast(message); setTimeout(() => setToast(""), 2600); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function LogScreen({ categories, entries, timer, elapsed, showForm, setShowForm, startTimer, stopTimer, setEntries, category }: any) {
  const recent = [
    ["Project planning", "career"], ["Walk outside", "physical"], ["Reading", "growth"], ["Call family", "family"], ["Dinner together", "romance"],
  ];
  const grouped = entries.reduce((acc: Record<string, Entry[]>, e: Entry) => { const key = new Date(e.start).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); (acc[key] ||= []).push(e); return acc; }, {});
  return <section className="screen log-screen">
    <div className="screen-heading"><div><p className="eyebrow">Today · {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p><h1>Where did your time go?</h1></div><p className="quiet intro">Log what happened. No targets, no verdicts.</p></div>
    {timer ? <div className="timer-card active-timer"><div className="timer-copy"><span className="live"><i /> Now</span><h2>{timer.label}</h2><p><Dot category={category(timer.category)} />{category(timer.category)?.name}</p></div><div className="clock">{new Date(elapsed).toISOString().slice(11, 19)}</div><button className="stop-button" onClick={stopTimer}>Stop</button></div> : <div className="timer-card">
      <div><p className="eyebrow">Start a timer</p><h2>What are you doing now?</h2></div>
      <button className="primary-button" onClick={() => startTimer("Focused time", "career")}><span>▶</span> Start timer</button>
    </div>}
    <div className="section-row"><h2>Recent activities</h2><span>Tap to start</span></div>
    <div className="chips">{recent.map(([label, cat]) => <button key={label} onClick={() => startTimer(label, cat)}><Dot category={category(cat)} small />{label}</button>)}</div>
    <button className="add-block" onClick={() => setShowForm(!showForm)}><span>＋</span><span><strong>Add a finished block</strong><small>Log something that already happened</small></span><b>{showForm ? "−" : "+"}</b></button>
    {showForm && <EntryForm categories={categories} onAdd={(e: Entry) => { setEntries([e, ...entries]); setShowForm(false); }} />}
    <div className="entries-head"><h2>Recent log</h2><button>View all</button></div>
    {Object.entries(grouped).map(([day, dayEntries]: any) => <div className="day" key={day}><div className="day-head"><h3>{day}</h3><span>{fmtDuration(dayEntries.reduce((n: number, e: Entry) => n + minutes(e), 0))} logged</span></div>{dayEntries.map((e: Entry) => <article className="entry" key={e.id}><div className="entry-line" style={{ background: category(e.category)?.color }} /><div className="entry-main"><strong>{e.label}</strong><span>{new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(e.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {fmtDuration(minutes(e))}</span></div><div className="entry-tags"><span><Dot category={category(e.category)} small />{category(e.category)?.name}</span>{e.category2 && <span><Dot category={category(e.category2)} small />{category(e.category2)?.name}</span>}</div><button aria-label={`Edit ${e.label}`}>•••</button></article>)}</div>)}
  </section>;
}

function EntryForm({ categories, onAdd }: { categories: Category[]; onAdd: (e: Entry) => void }) {
  const [split, setSplit] = useState(false); const [weight, setWeight] = useState(80);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const f = new FormData(event.currentTarget); const date = String(f.get("date")), start = String(f.get("start")), end = String(f.get("end")); let ended = new Date(`${date}T${end}`); const started = new Date(`${date}T${start}`); if (ended <= started) ended.setDate(ended.getDate() + 1); onAdd({ id: crypto.randomUUID(), label: String(f.get("label") || "Untitled"), start: started.toISOString(), end: ended.toISOString(), category: String(f.get("category")), category2: split ? String(f.get("category2")) : undefined, weight: split ? weight / 100 : 1, note: String(f.get("note") || "") }); };
  return <form className="entry-form" onSubmit={submit}><div className="form-grid"><label className="wide">What happened?<input name="label" placeholder="e.g. Park with the kids" required /></label><label>Date<input name="date" type="date" defaultValue={todayLocal()} required /></label><label>From<input name="start" type="time" defaultValue={timeLocal(-60)} required /></label><label>To<input name="end" type="time" defaultValue={timeLocal()} required /></label><label className="wide">Category<select name="category">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><button type="button" className="text-button" onClick={() => setSplit(!split)}>{split ? "Remove split" : "＋ Split between two categories"}</button>{split && <div className="split-box"><select name="category2">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><label>{weight}/{100-weight}<input type="range" min="10" max="90" step="10" value={weight} onChange={e => setWeight(Number(e.target.value))} /></label>{weight === 50 && <small>Even splits often mean one activity rather than two.</small>}</div>}<label>Note <span>(optional)</span><textarea name="note" placeholder="Anything worth remembering?" /></label><button className="primary-button save" type="submit">Add to log</button></form>;
}

function IntentScreen({ inPie, shares, steepness, setSteepness, move }: any) {
  const labels = ["Flat", "Gentle", "Linear", "Steep", "Concentrated"];
  return <section className="screen intent-screen"><div className="screen-heading"><div><p className="eyebrow">Your stated preference</p><h1>What matters most?</h1></div><p className="quiet intro">An ordering, not a promise. Change it when life changes.</p></div><div className="intent-layout"><div className="panel ordering"><div className="panel-title"><div><h2>Your ordering</h2><p>Move each domain until it feels honest.</p></div><span>Changed 3 times</span></div>{inPie.map((c: Category, i: number) => <div className="rank-row" key={c.id}><b>{i + 1}</b><Dot category={c} /><strong>{c.name}</strong><button aria-label={`About ${c.name}`}>i</button><span>{Math.round((shares[c.id] || 0) * 100)}%</span><small>≈ {Math.round((shares[c.id] || 0) * 84)}h</small><div className="arrows"><button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`}>↑</button><button onClick={() => move(i, 1)} disabled={i === inPie.length - 1} aria-label={`Move ${c.name} down`}>↓</button></div></div>)}</div><aside className="panel dial"><p className="eyebrow">The only dial</p><h2>How strongly should rank shape your time?</h2><div className="dial-readout"><strong>{labels[Math.round(steepness * 2)]}</strong><span>{steepness.toFixed(1)}</span></div><input type="range" min="0" max="2" step="0.5" value={steepness} onChange={e => setSteepness(Number(e.target.value))} /><div className="ticks">{labels.map(l => <span key={l}>{l}</span>)}</div><p>{steepness === 0 ? "Every domain receives the same intended share." : steepness <= .5 ? "Higher ranks matter a little more." : steepness <= 1 ? "A clear, balanced slope from first to last." : "Your highest ranks carry much more weight."}</p><div className="note-box">This dial changes the intended shares shown in Drift. It never changes your logged time.</div></aside></div></section>;
}

function DriftScreen({ categories, entries, shares, windowDays, setWindowDays, category }: any) {
  const cutoff = Date.now() - windowDays * 86400000; const visible = windowDays === 99999 ? entries : entries.filter((e: Entry) => new Date(e.start).getTime() >= cutoff);
  const totals: Record<string, number> = {}; visible.forEach((e: Entry) => { const m = minutes(e); totals[e.category] = (totals[e.category] || 0) + m * e.weight; if (e.category2) totals[e.category2] = (totals[e.category2] || 0) + m * (1 - e.weight); });
  const pieCats = categories.filter((c: Category) => c.inPie); const totalPie = pieCats.reduce((n: number, c: Category) => n + (totals[c.id] || 0), 0); const actual = Object.fromEntries(pieCats.map((c: Category) => [c.id, totalPie ? (totals[c.id] || 0) / totalPie : 0]));
  const ranked = [...pieCats].filter(c => actual[c.id] > 0).sort((a, b) => actual[b.id] - actual[a.id]); const rows = pieCats.map((c: Category, i: number) => ({ c, intended: i + 1, actualRank: ranked.findIndex(x => x.id === c.id) + 1, gap: actual[c.id] - (shares[c.id] || 0) }));
  const days = Math.max(1, new Set(visible.map((e: Entry) => new Date(e.start).toDateString())).size); const logged = visible.reduce((n: number, e: Entry) => n + minutes(e), 0); const maint = totals.maintenance || 0;
  return <section className="screen drift-screen"><div className="screen-heading"><div><p className="eyebrow">Intent, meet reality</p><h1>Your drift</h1></div><div className="segmented">{[[7,"7 days"],[30,"30 days"],[99999,"All"]].map(([n,l]) => <button key={n} className={windowDays === n ? "active" : ""} onClick={() => setWindowDays(n)}>{l}</button>)}</div></div><div className="summary-grid"><div><span>Discretionary logged</span><strong>{(totalPie/60).toFixed(1)}h</strong></div><div><span>Days with entries</span><strong>{days}</strong></div><div><span>Coverage</span><strong>{Math.round(logged/(Math.min(windowDays, days)*960)*100)}%</strong></div><div><span>Maintenance</span><strong>{(maint/60/days).toFixed(1)}h/day</strong></div></div><p className="coverage-note">Coverage is still light. Read rank movement and direction before absolute hours.</p><div className="drift-layout"><div className="panel rank-table"><div className="panel-title"><div><h2>Rank movement</h2><p>The clearest comparison when logging is patchy.</p></div><span>Intent → Actual</span></div>{rows.map(({c,intended,actualRank}: any) => <div className="movement" key={c.id}><Dot category={c}/><strong>{c.name}</strong><span>{intended}</span><i>→</i><span>{actualRank || "—"}</span><b className={!actualRank ? "unlogged" : actualRank < intended ? "up" : actualRank > intended ? "down" : "held"}>{!actualRank ? "Unlogged" : actualRank < intended ? `↑${intended-actualRank}` : actualRank > intended ? `↓${actualRank-intended}` : "Held"}</b></div>)}</div><div className="panel bars"><div className="panel-title"><div><h2>Share gaps</h2><p>Actual share against intended marker.</p></div><div className="legend"><span className="fill-key"/>Actual <span className="mark-key"/>Intent</div></div>{[...rows].sort((a,b)=>b.gap-a.gap).map(({c,gap}: any) => <div className="bar-row" key={c.id}><strong>{c.name}</strong><div className="bar-track"><span className="bar-fill" style={{width:`${Math.min(100, actual[c.id]*300)}%`,background:c.color}}/><i style={{left:`${Math.min(100,(shares[c.id]||0)*300)}%`}}/></div><b className={gap >= 0 ? "positive" : "negative"}>{gap >= 0 ? "+" : ""}{Math.round(gap*100)}pp</b></div>)}</div></div><div className="caveat"><strong>How to read this</strong><p>Intended shares come from your ordering and steepness dial, so moving the dial changes every gap. Treat gaps as direction and rough magnitude; use rank movement for anything sharper.</p></div></section>;
}

function Settings({ onClose, onConnected }: { onClose: () => void; onConnected: (message: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const connect = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { const session = await signIn(String(data.get("url")), String(data.get("key")), String(data.get("email")), String(data.get("password"))); const count = await testConnection(session); localStorage.setItem("drift-supabase", JSON.stringify(session)); onConnected(`Supabase connected · ${count} categories found`); } catch (e) { setError(e instanceof Error ? e.message : "Connection failed"); setBusy(false); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><aside className="settings" onMouseDown={e => e.stopPropagation()}><div className="settings-head"><div><p className="eyebrow">Settings</p><h2>Connect your data</h2></div><button onClick={onClose} aria-label="Close settings">×</button></div><p>The app works locally now. Add your Supabase project details when you are ready to sync across devices.</p><form onSubmit={connect}><label>Supabase project URL<input name="url" type="url" placeholder="https://your-project.supabase.co" required /></label><label>Publishable / anon key<input name="key" type="password" placeholder="eyJ…" required /></label><label>Email<input name="email" type="email" placeholder="you@example.com" required /></label><label>Password<input name="password" type="password" required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button save" disabled={busy}>{busy ? "Connecting…" : "Connect Supabase"}</button></form><hr/><h3>Install on your phone</h3><p><strong>iPhone:</strong> open in Safari, tap Share, then “Add to Home Screen”.<br/><strong>Android:</strong> open in Chrome and choose “Install app”.</p><div className="note-box">Your Supabase service-role key never belongs here. Only use the publishable/anon key.</div></aside></div>;
}
