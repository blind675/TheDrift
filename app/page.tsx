"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { deriveTargetShares } from "../lib/compute";
import { clearRunningTimer, createEntry, createProject, deleteEntry, loadDriftData, requestMagicLink, saveIntent, saveRunningTimer, signOut, subscribeToAuth, type AuthSession, type DriftEntry, type DriftProject, type DriftTimer } from "../lib/supabase";

type Tab = "log" | "intent" | "drift";
type Category = { id: string; name: string; color: string; inPie: boolean };
type Entry = DriftEntry;

const DEFAULT_CATEGORIES: Category[] = [
  ["career", "Career", "#D55D42", true], ["community", "Community", "#D49A38", true],
  ["parenting", "Parenting", "#C2A93B", true], ["romance", "Romance", "#C96B76", true],
  ["family", "Family", "#A86B8E", true], ["friends", "Friends", "#6D75A8", true],
  ["recreation", "Recreation", "#357F91", true], ["physical", "Physical health", "#4E9273", true],
  ["spiritual", "Spiritual", "#7A9161", true], ["growth", "Personal growth", "#8C755B", true],
  ["maintenance", "Maintenance", "#898780", false],
].map(([id, name, color, inPie]) => ({ id: String(id), name: String(name), color: String(color), inPie: Boolean(inPie) }));

const DEMO_ENTRIES: Entry[] = [
  { id: "1", label: "Project planning", start: "2026-08-21T09:05:00+03:00", end: "2026-08-21T10:35:00+03:00", category: "career", weight: 1 },
  { id: "2", label: "Lunch & walk", start: "2026-08-21T12:20:00+03:00", end: "2026-08-21T13:10:00+03:00", category: "physical", category2: "friends", weight: .8 },
  { id: "3", label: "Reading", start: "2026-08-20T20:10:00+03:00", end: "2026-08-20T21:05:00+03:00", category: "growth", weight: 1 },
  { id: "4", label: "Groceries", start: "2026-08-20T18:15:00+03:00", end: "2026-08-20T19:00:00+03:00", category: "maintenance", weight: 1 },
];

const fmtDuration = (minutes: number) => minutes < 60 ? `${Math.round(minutes)}m` : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
const fmtTimerElapsed = (milliseconds: number) => { const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000)); const days = Math.floor(totalSeconds / 86400); const hours = Math.floor(totalSeconds % 86400 / 3600); const minutes = Math.floor(totalSeconds % 3600 / 60); const seconds = totalSeconds % 60; const clock = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":"); return days ? `${days}d ${clock}` : clock; };
const minutes = (entry: Entry) => Math.max(0, (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000);
const todayLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const timeLocal = (offset = 0) => { const d = new Date(Date.now() + offset * 60000); return d.toTimeString().slice(0, 5); };

function Dot({ category, small = false }: { category?: Category; small?: boolean }) {
  return <span className={small ? "dot small" : "dot"} style={{ background: category?.color }} />;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("log");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [projects, setProjects] = useState<DriftProject[]>([]);
  const [entries, setEntries] = useState<Entry[]>(DEMO_ENTRIES);
  const [steepness, setSteepness] = useState(1);
  const [timer, setTimer] = useState<DriftTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [windowDays, setWindowDays] = useState<0 | 7 | 30 | 99999>(7);
  const [online, setOnline] = useState(true);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"local" | "loading" | "synced" | "error">("local");
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("drift-state");
    if (saved) { try { const state = JSON.parse(saved); setEntries(state.entries || DEMO_ENTRIES); setCategories(state.categories || DEFAULT_CATEGORIES); setProjects(state.projects || []); setSteepness(state.steepness ?? 1); setTimer(state.timer || null); } catch {} }
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { if (!userId) localStorage.setItem("drift-state", JSON.stringify({ entries, categories, projects, steepness, timer })); }, [entries, categories, projects, steepness, timer, userId]);
  useEffect(() => { if (!timer) return; const tick = () => setElapsed(Date.now() - timer.startedAt); tick(); const id = setInterval(tick, 1000); return () => clearInterval(id); }, [timer]);
  useEffect(() => {
    const applySession = async (session: AuthSession | null) => {
      setSignedInEmail(session?.user.email || null); setUserId(session?.user.id || null);
      if (!session) { setSyncState("local"); setDataReady(false); return; }
      setSyncState("loading");
      try {
        const data = await loadDriftData(session.user.id);
        if (data.categories.length) setCategories(data.categories);
        setProjects(data.projects);
        setEntries(data.entries); setSteepness(data.steepness); setTimer(data.timer); setSyncState("synced"); setDataReady(true);
      } catch (error) {
        setSyncState("error"); setToast(error instanceof Error ? `Could not load Supabase data: ${error.message}` : "Could not load Supabase data");
      }
    };
    return subscribeToAuth(applySession);
  }, []);

  const inPie = categories.filter(c => c.inPie);
  const shares = deriveTargetShares(inPie.map(c => c.id), steepness);
  const category = (id: string) => {
    const direct = categories.find(c => c.id === id);
    if (direct) return direct;
    const legacyName = DEFAULT_CATEGORIES.find(c => c.id === id)?.name;
    return legacyName ? categories.find(c => c.name === legacyName) : undefined;
  };
  const project = (id?: string) => id ? projects.find(item => item.id === id) : undefined;
  const getOrCreateProject = async (rawName: string): Promise<string | undefined> => {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name) return undefined;
    const existing = projects.find(item => !item.archived && item.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0);
    if (existing) return existing.id;
    const created = userId ? await createProject(userId, name) : { id: crypto.randomUUID(), name, archived: false };
    setProjects(current => current.some(item => item.id === created.id) ? current : [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created.id;
  };
  const startTimer = async (label: string, categoryId: string, projectId?: string) => { const next: DriftTimer = { label, category: categoryId, projectId, startedAt: Date.now() }; setTimer(next); try { if (userId) await saveRunningTimer(userId, next); setToast("Timer started"); } catch (error) { setSyncState("error"); setToast(error instanceof Error ? error.message : "Timer could not sync"); } setTimeout(() => setToast(""), 1800); };
  const stopTimer = async () => {
    if (!timer) return;
    const resolvedCategory = category(timer.category);
    if (!resolvedCategory) { setSyncState("error"); setToast("This timer's category is no longer available. Start a new timer."); setTimeout(() => setToast(""), 3200); return; }
    const entry = { id: crypto.randomUUID(), label: timer.label || "Untitled", start: new Date(timer.startedAt).toISOString(), end: new Date().toISOString(), category: resolvedCategory.id, weight: 1, projectId: timer.projectId };
    try { const saved = userId ? await createEntry(userId, entry, "timer") : entry; if (userId) await clearRunningTimer(userId); setEntries([saved, ...entries]); setTimer(null); setElapsed(0); setSyncState(userId ? "synced" : "local"); setToast(userId ? "Saved to Supabase" : "Saved on this device"); } catch (error) { setSyncState("error"); setToast(error instanceof Error ? error.message : "Entry could not be saved"); } setTimeout(() => setToast(""), 2600);
  };
  const persistIntent = async (nextCategories: Category[], nextSteepness: number) => { if (!userId || !dataReady) return; try { setSyncState("loading"); await saveIntent(userId, nextCategories, nextSteepness); setSyncState("synced"); } catch (error) { setSyncState("error"); setToast(error instanceof Error ? error.message : "Intent could not be saved"); } };
  const move = (index: number, direction: -1 | 1) => { const next = [...categories]; const target = index + direction; if (target < 0 || target >= inPie.length) return; const a = next.findIndex(c => c.id === inPie[index].id), b = next.findIndex(c => c.id === inPie[target].id); [next[a], next[b]] = [next[b], next[a]]; setCategories(next); void persistIntent(next, steepness); };
  const updateSteepness = (value: number) => { setSteepness(value); void persistIntent(categories, value); };
  const addEntry = async (entry: Entry) => { try { const saved = userId ? await createEntry(userId, entry) : entry; setEntries([saved, ...entries]); setShowForm(false); setSyncState(userId ? "synced" : "local"); setToast(userId ? "Saved to Supabase" : "Saved on this device"); } catch (error) { setSyncState("error"); setToast(error instanceof Error ? error.message : "Entry could not be saved"); } setTimeout(() => setToast(""), 2600); };
  const removeEntry = async (entry: Entry) => { if (!window.confirm(`Delete “${entry.label}”? This cannot be undone.`)) return; try { if (userId) await deleteEntry(userId, entry.id); setEntries(current => current.filter(item => item.id !== entry.id)); setSyncState(userId ? "synced" : "local"); setToast("Record deleted"); } catch (error) { setSyncState("error"); setToast(error instanceof Error ? error.message : "Record could not be deleted"); } setTimeout(() => setToast(""), 2600); };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setTab("log")} aria-label="The Drift home"><span className="mark">D</span><span>The Drift</span></button>
        <div className="top-actions"><span className={`sync ${!online || syncState === "error" ? "offline" : ""}`}><i />{!online ? "Offline" : syncState === "loading" ? "Syncing…" : syncState === "error" ? "Sync issue" : syncState === "synced" ? "Synced" : "Local only"}</span><button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Open settings">•••</button></div>
      </header>

      {tab === "log" && <LogScreen {...{ categories, projects, entries, timer, elapsed, showForm, setShowForm, startTimer, stopTimer, addEntry, removeEntry, category, project, getOrCreateProject }} />}
      {tab === "intent" && <IntentScreen {...{ inPie, shares, steepness, setSteepness: updateSteepness, move }} />}
      {tab === "drift" && <DriftScreen {...{ categories, projects, entries, shares, windowDays, setWindowDays, category }} />}

      <nav className="tabbar" aria-label="Main navigation">
        {(["log", "intent", "drift"] as Tab[]).map(name => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}><span className={`nav-icon ${name}`} />{name[0].toUpperCase() + name.slice(1)}</button>)}
      </nav>

      {showSettings && <Settings signedInEmail={signedInEmail} onClose={() => setShowSettings(false)} onConnected={(message: string) => { setShowSettings(false); setToast(message); setTimeout(() => setToast(""), 2600); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function LogScreen({ categories, projects, entries, timer, elapsed, showForm, setShowForm, startTimer, stopTimer, addEntry, removeEntry, category, project, getOrCreateProject }: any) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const recent = [
    ["Project planning", "career"], ["Walk outside", "physical"], ["Reading", "growth"], ["Call family", "family"], ["Dinner together", "romance"],
  ];
  const grouped = entries.reduce((acc: Record<string, Entry[]>, e: Entry) => { const key = new Date(e.start).toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric", timeZone: "Europe/Bucharest" }); (acc[key] ||= []).push(e); return acc; }, {});
  const startConfiguredTimer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("timer-label") || "").trim();
    const categoryId = String(form.get("timer-category") || "");
    const projectId = await getOrCreateProject(String(form.get("timer-project") || ""));
    if (label && categoryId) await startTimer(label, categoryId, projectId);
  };
  return <section className="screen log-screen">
    <div className="screen-heading"><div><p className="eyebrow">Today · {new Date().toLocaleDateString("en-GB", { month: "long", day: "numeric", timeZone: "Europe/Bucharest" })}</p><h1>Where did your time go?</h1></div><p className="quiet intro">Log what happened. No targets, no verdicts.</p></div>
    {timer ? <div className="timer-card active-timer"><div className="timer-copy"><span className="live"><i /> Now</span><h2>{timer.label}</h2><p><Dot category={category(timer.category)} />{category(timer.category)?.name}{timer.projectId && <span className="project-tag">◆ {project(timer.projectId)?.name}</span>}</p></div><div className="clock">{fmtTimerElapsed(elapsed)}</div><button className="stop-button" onClick={stopTimer}>Stop</button></div> : <div className="timer-card timer-ready">
      <div><p className="eyebrow">Start a timer</p><h2>What are you doing now?</h2></div>
      <form className="timer-setup" onSubmit={startConfiguredTimer}>
        <label>Activity title<input name="timer-label" placeholder="e.g. Project planning" required autoComplete="off" /></label>
        <label>Category<select key={categories.map((item: Category) => item.id).join("|")} name="timer-category" defaultValue={category("career")?.id || categories[0]?.id || ""} required disabled={!categories.length}>{categories.map((item: Category) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <ProjectField projects={projects} name="timer-project" compact />
        <button className="primary-button" type="submit" disabled={!categories.length}><span>▶</span> Start timer</button>
      </form>
    </div>}
    <div className="section-row"><h2>Recent activities</h2><span>Tap to start</span></div>
    <div className="chips">{recent.map(([label, cat]) => { const resolved = category(cat); return <button key={label} onClick={() => resolved && startTimer(label, resolved.id)} disabled={!resolved}><Dot category={resolved} small />{label}</button>; })}</div>
    <button className="add-block" onClick={() => setShowForm(!showForm)}><span>＋</span><span><strong>Add a finished block</strong><small>Log something that already happened</small></span><b>{showForm ? "−" : "+"}</b></button>
    {showForm && <EntryForm categories={categories} projects={projects} getOrCreateProject={getOrCreateProject} onAdd={addEntry} />}
    <div className="entries-head"><h2>Recent log</h2><button>View all</button></div>
    {Object.entries(grouped).map(([day, dayEntries]: any) => <div className="day" key={day}><div className="day-head"><h3>{day}</h3><span>{fmtDuration(dayEntries.reduce((n: number, e: Entry) => n + minutes(e), 0))} logged</span></div>{dayEntries.map((e: Entry) => <article className="entry" key={e.id}><div className="entry-line" style={{ background: category(e.category)?.color }} /><div className="entry-main"><strong>{e.label}</strong><span>{new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" })}–{new Date(e.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" })} · {fmtDuration(minutes(e))}</span></div><div className="entry-tags"><span><Dot category={category(e.category)} small />{category(e.category)?.name}</span>{e.category2 && <span><Dot category={category(e.category2)} small />{category(e.category2)?.name}</span>}{e.projectId && <span className="project-tag">◆ {project(e.projectId)?.name || "Archived project"}</span>}</div><div className="entry-actions"><button className="entry-menu-trigger" aria-label={`Actions for ${e.label}`} aria-haspopup="menu" aria-expanded={openMenu === e.id} onClick={() => setOpenMenu(openMenu === e.id ? null : e.id)}>•••</button>{openMenu === e.id && <div className="entry-menu" role="menu"><button role="menuitem" onClick={() => { setOpenMenu(null); void removeEntry(e); }}>Delete record</button></div>}</div></article>)}</div>)}
  </section>;
}

function ProjectField({ projects, name, className = "", compact = false }: { projects: DriftProject[]; name: string; className?: string; compact?: boolean }) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const active = projects.filter(item => !item.archived);
  const matches = active.filter(item => item.name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())).slice(0, 6);
  const exact = active.some(item => item.name.localeCompare(value.trim(), undefined, { sensitivity: "accent" }) === 0);
  return <div className={`project-field ${compact ? "compact" : ""} ${className}`}>
    <label htmlFor={inputId}>Project <span>(optional)</span></label>
    <div className="project-combobox">
      <input id={inputId} name={name} value={value} maxLength={120} onChange={event => { setValue(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} placeholder="Search or create a project" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open} />
      {open && <div id={listId} className="project-options" role="listbox">
        {matches.map(item => <button type="button" role="option" aria-selected={item.name === value} key={item.id} onMouseDown={event => event.preventDefault()} onClick={() => { setValue(item.name); setOpen(false); }}>{item.name}</button>)}
        {value.trim() && !exact && <button type="button" className="create-project" onMouseDown={event => event.preventDefault()} onClick={() => setOpen(false)}>＋ Create “{value.trim()}” when saved</button>}
        {!matches.length && !value.trim() && <span className="project-empty">No projects yet — type a name to create one.</span>}
      </div>}
    </div>
  </div>;
}

function EntryForm({ categories, projects, getOrCreateProject, onAdd }: { categories: Category[]; projects: DriftProject[]; getOrCreateProject: (name: string) => Promise<string | undefined>; onAdd: (e: Entry) => void }) {
  const [split, setSplit] = useState(false); const [weight, setWeight] = useState(80);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const f = new FormData(event.currentTarget); const date = String(f.get("date")), start = String(f.get("start")), end = String(f.get("end")); let ended = new Date(`${date}T${end}`); const started = new Date(`${date}T${start}`); if (ended <= started) ended.setDate(ended.getDate() + 1); const projectId = await getOrCreateProject(String(f.get("project") || "")); onAdd({ id: crypto.randomUUID(), label: String(f.get("label") || "Untitled"), start: started.toISOString(), end: ended.toISOString(), category: String(f.get("category")), category2: split ? String(f.get("category2")) : undefined, weight: split ? weight / 100 : 1, note: String(f.get("note") || ""), projectId }); };
  return <form className="entry-form" onSubmit={submit}><div className="form-grid"><label className="activity-field">What happened?<input name="label" placeholder="e.g. Park with the kids" required /></label><label className="category-field">Category<select name="category">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><ProjectField projects={projects} name="project" className="project-form-field" /><label className="time-field">Date<input name="date" type="date" defaultValue={todayLocal()} required /></label><label className="time-field">From<input name="start" type="time" defaultValue={timeLocal(-60)} required /></label><label className="time-field">To<input name="end" type="time" defaultValue={timeLocal()} required /></label></div><button type="button" className="text-button" onClick={() => setSplit(!split)}>{split ? "Remove split" : "＋ Split between two categories"}</button>{split && <div className="split-box"><select name="category2">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><label>{weight}/{100-weight}<input type="range" min="10" max="90" step="10" value={weight} onChange={e => setWeight(Number(e.target.value))} /></label>{weight === 50 && <small>Even splits often mean one activity rather than two.</small>}</div>}<label>Note <span>(optional)</span><textarea name="note" placeholder="Anything worth remembering?" /></label><button className="primary-button save" type="submit">Add to log</button></form>;
}

function IntentScreen({ inPie, shares, steepness, setSteepness, move }: any) {
  const labels = ["Flat", "Gentle", "Linear", "Steep", "Concentrated"];
  return <section className="screen intent-screen"><div className="screen-heading"><div><p className="eyebrow">Your stated preference</p><h1>What matters most?</h1></div><p className="quiet intro">An ordering, not a promise. Change it when life changes.</p></div><div className="intent-layout"><div className="panel ordering"><div className="panel-title"><div><h2>Your ordering</h2><p>Move each domain until it feels honest.</p></div><span>Changed 3 times</span></div>{inPie.map((c: Category, i: number) => <div className="rank-row" key={c.id}><b>{i + 1}</b><Dot category={c} /><strong>{c.name}</strong><button aria-label={`About ${c.name}`}>i</button><span>{Math.round((shares[c.id] || 0) * 100)}%</span><small>≈ {Math.round((shares[c.id] || 0) * 84)}h</small><div className="arrows"><button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`}>↑</button><button onClick={() => move(i, 1)} disabled={i === inPie.length - 1} aria-label={`Move ${c.name} down`}>↓</button></div></div>)}</div><aside className="panel dial"><p className="eyebrow">The only dial</p><h2>How strongly should rank shape your time?</h2><div className="dial-readout"><strong>{labels[Math.round(steepness * 2)]}</strong><span>{steepness.toFixed(1)}</span></div><input type="range" min="0" max="2" step="0.5" value={steepness} onChange={e => setSteepness(Number(e.target.value))} /><div className="ticks">{labels.map(l => <span key={l}>{l}</span>)}</div><p>{steepness === 0 ? "Every domain receives the same intended share." : steepness <= .5 ? "Higher ranks matter a little more." : steepness <= 1 ? "A clear, balanced slope from first to last." : "Your highest ranks carry much more weight."}</p><div className="note-box">This dial changes the intended shares shown in Drift. It never changes your logged time.</div></aside></div></section>;
}

function DriftScreen({ categories, projects, entries, shares, windowDays, setWindowDays, category }: any) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const cutoff = windowDays === 0 ? todayStart.getTime() : Date.now() - windowDays * 86400000; const visible = windowDays === 99999 ? entries : entries.filter((e: Entry) => new Date(e.start).getTime() >= cutoff);
  const totals: Record<string, number> = {}; visible.forEach((e: Entry) => { const m = minutes(e); totals[e.category] = (totals[e.category] || 0) + m * e.weight; if (e.category2) totals[e.category2] = (totals[e.category2] || 0) + m * (1 - e.weight); });
  const pieCats = categories.filter((c: Category) => c.inPie); const totalPie = pieCats.reduce((n: number, c: Category) => n + (totals[c.id] || 0), 0); const actual = Object.fromEntries(pieCats.map((c: Category) => [c.id, totalPie ? (totals[c.id] || 0) / totalPie : 0]));
  const ranked = [...pieCats].filter(c => actual[c.id] > 0).sort((a, b) => actual[b.id] - actual[a.id]); const rows = pieCats.map((c: Category, i: number) => ({ c, intended: i + 1, actualRank: ranked.findIndex(x => x.id === c.id) + 1, gap: actual[c.id] - (shares[c.id] || 0), hours: (totals[c.id] || 0) / 60 }));
  const daysWithEntries = new Set(visible.map((e: Entry) => new Date(e.start).toDateString())).size;
  const averagingDays = Math.max(1, daysWithEntries);
  const pieCategoryIds = new Set(pieCats.map((c: Category) => c.id));
  const valueEntries = visible.filter((e: Entry) => pieCategoryIds.has(e.category) || Boolean(e.category2 && pieCategoryIds.has(e.category2)));
  const maintenanceId = category("maintenance")?.id;
  const maint = maintenanceId ? totals[maintenanceId] || 0 : 0;
  const firstValueDay = valueEntries.length ? new Date(Math.min(...valueEntries.map((e: Entry) => new Date(e.start).getTime()))) : todayStart;
  firstValueDay.setHours(0, 0, 0, 0);
  const allActivityDays = Math.max(1, Math.round((todayStart.getTime() - firstValueDay.getTime()) / 86400000) + 1);
  const coverageDays = windowDays === 0 ? 1 : windowDays === 99999 ? allActivityDays : windowDays;
  const coverage = Math.min(100, Math.round(totalPie / (coverageDays * 720) * 100));
  const projectTotals: Record<string, number> = {};
  visible.forEach((entry: Entry) => { if (entry.projectId) projectTotals[entry.projectId] = (projectTotals[entry.projectId] || 0) + minutes(entry); });
  const totalProjectMinutes = Object.values(projectTotals).reduce((sum, value) => sum + value, 0);
  const projectRows = projects.map((item: DriftProject) => ({ project: item, minutes: projectTotals[item.id] || 0 })).filter((item: { minutes: number }) => item.minutes > 0).sort((a: { minutes: number }, b: { minutes: number }) => b.minutes - a.minutes);
  const coverageMessage = coverage < 25
    ? `You have logged ${coverage}% of the 12 discretionary hours available per day. The separate 12-hour Maintenance allocation is excluded. With partial logs, rank movement is more reliable than exact hour comparisons.`
    : coverage < 70
      ? `You have logged ${coverage}% of the 12 discretionary hours available per day. The separate 12-hour Maintenance allocation is excluded. Share gaps are useful, but some discretionary time is still untracked.`
      : `You have logged ${coverage}% of the 12 discretionary hours available per day, excluding the separate 12-hour Maintenance allocation, giving this comparison strong coverage.`;
  return <section className="screen drift-screen"><div className="screen-heading"><div><p className="eyebrow">Intent, meet reality</p><h1>Your drift</h1></div><div className="segmented">{[[0,"Today"],[7,"7 days"],[30,"30 days"],[99999,"All activity"]].map(([n,l]) => <button key={n} className={windowDays === n ? "active" : ""} onClick={() => setWindowDays(n)}>{l}</button>)}</div></div><div className="summary-grid"><div><span>Discretionary logged</span><strong>{(totalPie/60).toFixed(1)}h</strong></div><div><span>Days with entries</span><strong>{daysWithEntries}</strong></div><div><span>Coverage</span><strong>{coverage}%</strong></div><div><span>Maintenance</span><strong>{(maint/60/averagingDays).toFixed(1)}h/day</strong></div></div><p className="coverage-note">{coverageMessage}</p><div className="drift-layout"><div className="panel rank-table"><div className="panel-title"><div><h2>Rank movement</h2><p>The clearest comparison when logging is patchy.</p></div><span>Intent → Actual</span></div>{rows.map(({c,intended,actualRank}: any) => <div className="movement" key={c.id}><Dot category={c}/><strong>{c.name}</strong><span>{intended}</span><i>→</i><span>{actualRank || "—"}</span><b className={!actualRank ? "unlogged" : actualRank < intended ? "up" : actualRank > intended ? "down" : "held"}>{!actualRank ? "Unlogged" : actualRank < intended ? `↑${intended-actualRank}` : actualRank > intended ? `↓${actualRank-intended}` : "Held"}</b></div>)}</div><div className="panel bars"><div className="panel-title"><div><h2>Share gaps</h2><p>Actual share against intended marker.</p></div><div className="legend"><span className="fill-key"/>Actual <span className="mark-key"/>Intent</div></div>{rows.map(({c,gap,hours}: any) => <div className="bar-row" key={c.id}><strong>{c.name}</strong><div className="bar-track"><span className="bar-fill" style={{width:`${Math.min(100, actual[c.id]*300)}%`,background:c.color}}/><i style={{left:`${Math.min(100,(shares[c.id]||0)*300)}%`}}/></div><b className={gap >= 0 ? "positive" : "negative"}>{gap >= 0 ? "+" : ""}{Math.round(gap*100)}pp <span>· {hours.toFixed(1)}h</span></b></div>)}</div></div><div className="panel project-stats"><div className="panel-title"><div><h2>Project time</h2><p>Hours by project for the selected period.</p></div><span>{(totalProjectMinutes / 60).toFixed(1)}h assigned</span></div>{projectRows.length ? projectRows.map(({project,minutes: projectMinutes}: { project: DriftProject; minutes: number }) => <div className="project-stat-row" key={project.id}><strong>{project.name}</strong><div className="project-stat-track"><span style={{width:`${totalProjectMinutes ? projectMinutes / totalProjectMinutes * 100 : 0}%`}}/></div><b>{(projectMinutes / 60).toFixed(1)}h</b><small>{totalProjectMinutes ? Math.round(projectMinutes / totalProjectMinutes * 100) : 0}%</small></div>) : <p className="empty-projects">No project time logged in this period yet.</p>}</div><div className="caveat"><strong>How to read this</strong><p>Intended shares come from your ordering and steepness dial, so moving the dial changes every gap. Treat gaps as direction and rough magnitude; use rank movement for anything sharper.</p></div></section>;
}

function Settings({ signedInEmail, onClose, onConnected }: { signedInEmail: string | null; onClose: () => void; onConnected: (message: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const connect = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { await requestMagicLink(String(data.get("email")), window.location.origin); onConnected("Magic link sent — check your email"); } catch (e) { setError(e instanceof Error ? e.message : "Could not send the magic link"); setBusy(false); } };
  const disconnect = async () => { setBusy(true); setError(""); try { await signOut(); onConnected("Signed out"); } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out"); setBusy(false); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><aside className="settings" onMouseDown={e => e.stopPropagation()}><div className="settings-head"><div><p className="eyebrow">Settings</p><h2>Connect your data</h2></div><button onClick={onClose} aria-label="Close settings">×</button></div>{signedInEmail ? <div className="auth-card"><span>Signed in as</span><strong>{signedInEmail}</strong><button className="text-button" onClick={disconnect} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>{error && <p className="form-error">{error}</p>}</div> : <><p>Sign in with the email address you added to Supabase. We’ll send you a secure, one-time link—no password needed.</p><form onSubmit={connect}><label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button save" disabled={busy}>{busy ? "Sending…" : "Send magic link"}</button></form></>}<hr/><h3>Install on your phone</h3><p><strong>iPhone:</strong> open in Safari, tap Share, then “Add to Home Screen”.<br/><strong>Android:</strong> open in Chrome and choose “Install app”.</p><div className="note-box">The app reads its Supabase project details automatically from the environment configuration.</div></aside></div>;
}
