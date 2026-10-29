import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { TYPES, TYPE_LABEL, upcomingWeekdays, weekday, type QType, type Question, type Quiz, type QuizStatus, type QuizSummary } from "../src/shared";
import { api, frDay, resizeImage, toast } from "./lib";
import { AdminGate, Shape, Visual } from "./ui";

export function EditorPage() {
  return <AdminGate><Editor /></AdminGate>;
}

type Draft = { theme: string; status: QuizStatus; questions: Question[] };
const STYLES = ["Piano instru", "Guitare", "Chanté", "Kazoo", "Version opéra", "Fredonné", "À l'envers"];
const TIMES = [10, 15, 20, 30, 45, 60];
const tmpId = () => Math.random().toString(36).slice(2, 10);

const defaultTheme = (day: string) => ({ 3: "Mercredi musical", 5: "Vendredi fou" } as Record<number, string>)[weekday(day)] ?? "Quiz du matin";

function blankQuestion(type: QType, day: string): Question {
  const base = { id: tmpId(), type, prompt: "", emoji: "❓", imageId: null, timeLimit: 20, speedBonus: true, doublePoints: weekday(day) === 5 };
  if (type === "music") return { ...base, emoji: "🎹", prompt: "Devine la toune que je joue", timeLimit: 60, data: { title: "", artist: "", alts: [], year: null, hints: ["", "", ""], mode: "live", style: "Piano instru", audioId: null } };
  if (type === "closest") return { ...base, data: { answer: 5, min: 0, max: 10 } };
  if (type === "tf") return { ...base, timeLimit: 15, data: { choices: ["Vrai", "Faux"], correct: 0 } };
  if (type === "majority") return { ...base, data: { choices: ["", "", "", ""] } };
  return { ...base, data: { choices: ["", "", "", ""], correct: 0 } };
}

/** Change le type en gardant ce qui peut l'être (question, image, choix). */
function retype(q: Question, type: QType, day: string): Question {
  const b = blankQuestion(type, day);
  const keepChoices = q.data.choices && b.data.choices && type !== "tf" && q.type !== "tf";
  return { ...b, id: q.id, prompt: q.prompt || b.prompt, emoji: q.emoji, imageId: q.imageId, data: keepChoices ? { ...b.data, choices: [...q.data.choices!] } : b.data };
}

function Editor() {
  const days = useMemo(() => upcomingWeekdays(10), []);
  const [list, setList] = useState<QuizSummary[]>([]);
  const [day, setDay] = useState(days[0]!);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [qi, setQi] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshList = useCallback(() => api<QuizSummary[]>(`/api/quizzes?from=${days[0]}&to=${days.at(-1)}`).then(setList).catch((e) => toast(e.message)), [days]);
  useEffect(() => { void refreshList(); }, [refreshList]);
  useEffect(() => {
    setDraft(null);
    api<Quiz | null>(`/api/quizzes/${day}`).then((q) => {
      setDraft(q ? { theme: q.theme, status: q.status, questions: q.questions } : { theme: defaultTheme(day), status: "draft", questions: [] });
      setQi(0); setDirty(false);
    }).catch((e) => toast(e.message));
  }, [day]);

  const q = draft?.questions[qi];
  const patch = (fn: (d: Draft) => Draft) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true); };
  const patchQ = (fn: (q: Question) => Question) => patch((d) => ({ ...d, questions: d.questions.map((x, i) => (i === qi ? fn(x) : x)) }));
  const patchData = (data: Partial<Question["data"]>) => patchQ((x) => ({ ...x, data: { ...x.data, ...data } }));

  const switchDay = (d: string) => {
    if (dirty && !confirm("Tu as des changements non enregistrés. Les abandonner?")) return;
    setDay(d);
  };
  const addQuestion = () => {
    const type: QType = weekday(day) === 3 && !draft?.questions.length ? "music" : "mc";
    patch((d) => ({ ...d, questions: [...d.questions, blankQuestion(type, day)] }));
    setQi(draft?.questions.length ?? 0);
  };
  const move = (dir: -1 | 1) => {
    const j = qi + dir;
    if (!draft || j < 0 || j >= draft.questions.length) return;
    patch((d) => { const qs = [...d.questions]; [qs[qi], qs[j]] = [qs[j]!, qs[qi]!]; return { ...d, questions: qs }; });
    setQi(j);
  };
  const remove = () => {
    if (!confirm("Retirer cette question?")) return;
    patch((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== qi) }));
    setQi(Math.max(0, qi - 1));
  };
  const save = async (status?: QuizStatus) => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api<Quiz>(`/api/quizzes/${day}`, { method: "PUT", body: { ...draft, status: status ?? draft.status } });
      setDraft({ theme: saved.theme, status: saved.status, questions: saved.questions });
      setDirty(false);
      void refreshList();
      toast(status === "ready" ? `Quiz du ${frDay(day, { weekday: "long", day: "numeric" })} prêt à jouer!` : "Enregistré");
    } catch (e) { toast((e as Error).message); }
    finally { setSaving(false); }
  };

  const upload = async (file: File | Blob, kind: "image" | "audio") => {
    try {
      const blob = kind === "image" ? await resizeImage(file) : file;
      const { id } = await api<{ id: string }>("/api/media", { raw: blob });
      if (kind === "image") patchQ((x) => ({ ...x, imageId: id }));
      else patchData({ audioId: id });
      toast(kind === "image" ? "Image de fond ajoutée" : "Extrait audio ajouté");
    } catch (e) { toast((e as Error).message); }
  };

  // Coller une image (Ctrl+V) n'importe où dans l'éditeur.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!q || q.type === "music") return;
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); void upload(f, "image"); }
    };
    addEventListener("paste", onPaste);
    return () => removeEventListener("paste", onPaste);
  });
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("over");
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
    if (f) void upload(f, "image"); else toast("Glisse un fichier image (JPG, PNG, GIF).");
  };

  const summary = (d: string) => list.find((x) => x.day === d);

  return (
    <div className="matt">
      <div className="col">
        <div className="card"><h3>Mes prochains quiz</h3>
          <div className="daylist">
            {days.map((d) => {
              const s = summary(d);
              return (
                <button key={d} className="dayrow" aria-pressed={d === day} onClick={() => switchDay(d)}>
                  <span className="dn">{frDay(d, { weekday: "short", day: "numeric", month: "short" })}</span>
                  {s?.status === "ready" ? <span className="pill good">Prêt</span> : s?.status === "played" ? <span className="pill">Joué</span> : s?.count ? <span className="pill warn">Brouillon</span> : <span className="pill">À préparer</span>}
                  <span className="dt">{s?.theme || defaultTheme(d)} · {s?.count ?? 0} question{(s?.count ?? 0) > 1 ? "s" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
        <a className="btn primary" href="#/animer">Animer la partie</a>
      </div>

      <div className="col">
        <div className="card">
          <div className="ed-head">
            <div><p className="eyebrow">{frDay(day)}</p><h2 className="ed-title">Préparer le quiz</h2></div>
            {draft && <div className="field" style={{ minWidth: 200 }}><label htmlFor="theme">Thème du jour</label><input id="theme" className="input" value={draft.theme} onChange={(e) => patch((d) => ({ ...d, theme: e.target.value }))} /></div>}
          </div>
          {!draft ? <p className="muted">Chargement…</p> : (
            <>
              <div className="qtabs" role="group" aria-label="Questions du jour">
                {draft.questions.map((x, i) => <button key={x.id} className="qtab" aria-pressed={i === qi} onClick={() => setQi(i)}>Q{i + 1}</button>)}
                <button className="qtab add" onClick={addQuestion}>+ Ajouter</button>
              </div>
              {!q ? (
                <div className="empty"><p className="eyebrow">Rien encore</p><p>Aucune question pour ce jour-là. {weekday(day) === 3 ? "C'est mercredi : la première sera musicale!" : "Trois questions, c'est parfait pour un standup."}</p><button className="btn primary" onClick={addQuestion}>Ajouter une question</button></div>
              ) : (
                <div className="form">
                  <div className="field"><span className="flabel">Type de question</span>
                    <div className="types">{TYPES.map((t) => <button key={t.id} className="type" aria-pressed={q.type === t.id} title={t.hint} onClick={() => patchQ((x) => retype(x, t.id, day))}>{t.label}</button>)}</div>
                    <span className="muted small">{TYPES.find((t) => t.id === q.type)?.hint}</span>
                  </div>
                  <div className="field"><label htmlFor="prompt">Question</label><textarea id="prompt" className="input" rows={2} value={q.prompt} placeholder="Écris ta question ici" onChange={(e) => patchQ((x) => ({ ...x, prompt: e.target.value }))} /></div>

                  {q.type !== "music" && (
                    <div className="field"><span className="flabel">Image de fond</span>
                      <div className="drop" onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("over"); }} onDragLeave={(e) => e.currentTarget.classList.remove("over")} onDrop={onDrop}>
                        <div className="thumb" style={q.imageId ? { backgroundImage: `url(/media/${q.imageId})` } : undefined}>{q.imageId ? "" : q.emoji || "🖼️"}</div>
                        <div className="grow"><b style={{ fontSize: 14 }}>Glisse ton image ici ou colle-la (Ctrl+V)</b>
                          <div className="row">
                            <label className="btn sm">Choisir une image<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "image"); e.target.value = ""; }} /></label>
                            {q.imageId && <button className="btn sm ghost" onClick={() => patchQ((x) => ({ ...x, imageId: null }))}>Retirer l'image</button>}
                          </div></div>
                        <div className="field emo"><label htmlFor="emoji">Ou un emoji</label><input id="emoji" className="input" value={q.emoji} maxLength={24} onChange={(e) => patchQ((x) => ({ ...x, emoji: e.target.value }))} /></div>
                      </div>
                    </div>
                  )}

                  <Answers q={q} patchData={patchData} upload={upload} />

                  <div className="field"><span className="flabel">Chrono</span>
                    <div className="types">{TIMES.map((t) => <button key={t} className="type" aria-pressed={q.timeLimit === t} onClick={() => patchQ((x) => ({ ...x, timeLimit: t }))}>{t} s</button>)}</div></div>
                  <div className="row">
                    {q.type !== "music" && <label className="toggle"><input type="checkbox" checked={q.speedBonus} onChange={(e) => patchQ((x) => ({ ...x, speedBonus: e.target.checked }))} /> Bonus vitesse (200 pts max)</label>}
                    <label className="toggle"><input type="checkbox" checked={q.doublePoints} onChange={(e) => patchQ((x) => ({ ...x, doublePoints: e.target.checked }))} /> Points doubles</label>
                  </div>
                  <div className="row ed-actions">
                    <button className="btn ghost sm" onClick={() => move(-1)} disabled={qi === 0}>Monter</button>
                    <button className="btn ghost sm" onClick={() => move(1)} disabled={qi === draft.questions.length - 1}>Descendre</button>
                    <button className="btn ghost sm" onClick={remove}>Retirer</button>
                  </div>
                </div>
              )}
              <div className="row save-row">
                <span className="muted small">{dirty ? "Changements non enregistrés" : draft.status === "ready" ? "Prêt à jouer" : draft.status === "played" ? "Déjà joué" : "Brouillon"}</span>
                <span className="row">
                  <button className="btn" disabled={saving} onClick={() => save()}>Enregistrer</button>
                  <button className="btn primary" disabled={saving || !draft.questions.length} onClick={() => save("ready")}>Marquer prêt</button>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="col col-3">
        <div className="card"><h3>Aperçu joueur <span className="pill">en direct</span></h3><div className="phone">{q ? <Preview q={q} /> : <p className="muted small" style={{ textAlign: "center", padding: "40px 0" }}>Ajoute une question pour voir l'aperçu.</p>}</div></div>
        <div className="card tips"><h3>Trucs de Matt</h3>
          <ul>
            <li>Une capture d'écran se colle directement avec Ctrl+V.</li>
            <li>« Majorité l'emporte » met tout le monde à égalité : parfait pour casser une série.</li>
            <li>Si personne ne trouve, c'est toi qui marques un point dans « Matt contre l'équipe ».</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Answers({ q, patchData, upload }: { q: Question; patchData: (d: Partial<Question["data"]>) => void; upload: (f: File, kind: "image" | "audio") => Promise<void> }) {
  const d = q.data;
  if (q.type === "closest") {
    return (
      <div className="field"><span className="flabel">Réponse numérique</span>
        <div className="num-grid">
          <div className="field"><label htmlFor="ans">Bonne réponse</label><input id="ans" className="input" type="number" value={d.answer ?? 0} onChange={(e) => patchData({ answer: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="min">Minimum</label><input id="min" className="input" type="number" value={d.min ?? 0} onChange={(e) => patchData({ min: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="max">Maximum</label><input id="max" className="input" type="number" value={d.max ?? 10} onChange={(e) => patchData({ max: Number(e.target.value) })} /></div>
        </div>
        <span className="muted small">Exacte : 1 000 pts. Proche : 600 ou 300 selon l'écart. Le plus proche de l'équipe a toujours au moins 500.</span>
      </div>
    );
  }
  if (q.type === "music") {
    return (
      <>
        <div className="field"><span className="flabel">La toune</span>
          <div className="num-grid two">
            <div className="field"><label htmlFor="m-title">Titre</label><input id="m-title" className="input" value={d.title ?? ""} onChange={(e) => patchData({ title: e.target.value })} /></div>
            <div className="field"><label htmlFor="m-artist">Artiste ou compositeur</label><input id="m-artist" className="input" value={d.artist ?? ""} onChange={(e) => patchData({ artist: e.target.value })} /></div>
            <div className="field"><label htmlFor="m-alts">Autres titres acceptés</label><input id="m-alts" className="input" value={(d.alts ?? []).join(", ")} placeholder="Séparés par des virgules" onChange={(e) => patchData({ alts: e.target.value.split(",").map((s) => s.trim()) })} /></div>
            <div className="field"><label htmlFor="m-year">Année (bonus à 10 ans près)</label><input id="m-year" className="input" type="number" value={d.year ?? ""} onChange={(e) => patchData({ year: e.target.value ? Number(e.target.value) : null })} /></div>
          </div></div>
        <div className="field"><span className="flabel">Indices qui apparaissent pendant le chrono (chacun enlève 150 pts)</span>
          <div className="hint-grid">{[0, 1, 2].map((i) => <input key={i} className="input" aria-label={`Indice ${i + 1}`} placeholder={`Indice ${i + 1}`} value={d.hints?.[i] ?? ""} onChange={(e) => { const h = [...(d.hints ?? ["", "", ""])]; h[i] = e.target.value; patchData({ hints: h }); }} />)}</div></div>
        <div className="field"><span className="flabel">Comment tu joues?</span>
          <div className="row">
            <label className="toggle"><input type="radio" name="mode" checked={d.mode !== "rec"} onChange={() => patchData({ mode: "live" })} /> En direct dans Teams</label>
            <label className="toggle"><input type="radio" name="mode" checked={d.mode === "rec"} onChange={() => patchData({ mode: "rec" })} /> Extrait enregistré</label>
          </div>
          {d.mode === "rec" && (
            <div className="row">
              <label className="btn sm">Choisir un fichier audio<input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "audio"); e.target.value = ""; }} /></label>
              {d.audioId ? <audio controls src={`/media/${d.audioId}`} /> : <span className="muted small">Aucun extrait. Il jouera sur l'écran que tu partages.</span>}
            </div>
          )}
        </div>
        <div className="field"><label htmlFor="m-style">Style de la performance</label>
          <select id="m-style" className="input" value={d.style ?? STYLES[0]} onChange={(e) => patchData({ style: e.target.value })}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select></div>
      </>
    );
  }
  const maj = q.type === "majority";
  const choices = d.choices ?? [];
  return (
    <div className="field"><span className="flabel">{maj ? "Choix · pas de bonne réponse, la majorité gagne" : "Réponses · coche la bonne"}</span>
      <div className="ans-grid">
        {choices.map((c, k) => (
          <div key={k} className="ans" style={{ "--tc": `var(--c${k + 1})` } as CSSProperties}>
            <span className="sw"><Shape k={k} /></span>
            <input type="text" value={c} placeholder={`Réponse ${k + 1}`} aria-label={`Réponse ${k + 1}`} onChange={(e) => { const cs = [...choices]; cs[k] = e.target.value; patchData({ choices: cs }); }} />
            {!maj && <label className="ok"><input type="radio" name="correct" checked={d.correct === k} onChange={() => patchData({ correct: k })} /> Bonne</label>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Preview({ q }: { q: Question }) {
  return (
    <>
      <div className="notch" />
      <div className="pv-head"><span className="pill">{TYPE_LABEL[q.type]}</span><span className="mono small">{q.timeLimit} s{q.doublePoints ? " · ×2" : ""}</span></div>
      <Visual q={q} zoom={q.type === "zoom" ? 2.6 : 1} blur={q.type === "zoom" ? 2 : 0} tag={q.type === "music" ? "Matt · en direct" : undefined} />
      <p className="prompt">{q.prompt || "Ta question ici"}</p>
      {q.type === "closest" ? (
        <div className="guess"><div className="guess-num sm">{Math.round(((q.data.min ?? 0) + (q.data.max ?? 10)) / 2)}</div><input className="range" type="range" disabled aria-label="Aperçu" /></div>
      ) : q.type === "music" ? (
        <><div className="pv-in">Titre…</div><div className="pv-in">Artiste…</div>{q.data.hints?.[0] && <p className="small muted">Indice 1 : {q.data.hints[0]}</p>}</>
      ) : (
        <div className="tiles">{(q.data.choices ?? []).map((c, k) => <div key={k} className={`tile t${k}`}><Shape k={k} /><span>{c || "…"}</span></div>)}</div>
      )}
    </>
  );
}
