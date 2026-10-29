import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  POWERS, powerFits, TIERS, TYPE_LABEL,
  type Performance, type Player, type PowerInventory, type PowerKind, type PublicState, type QType, type Question,
  type Submission, type WeekDistribution, type WeekTrophies,
} from "../src/shared";
import { api, auth, copyText, frDay, sfx, toast, uploadImage } from "./lib";
import { Avatar, Shape } from "./ui";

/* ======================= Boîte à items ======================= */

export function useInventory(refreshKey: unknown) {
  const [inv, setInv] = useState<PowerInventory | null>(null);
  useEffect(() => { api<PowerInventory>("/api/powers").then(setInv).catch(() => {}); }, [refreshKey]);
  return [inv, setInv] as const;
}

/** La boîte du lundi : une roulette façon Mario Kart, puis les items de la semaine. */
export function ItemBoxReveal({ inv, onClose }: { inv: PowerInventory; onClose: () => void }) {
  const [spinning, setSpinning] = useState(true);
  const [face, setFace] = useState(0);
  const kinds = Object.keys(POWERS) as PowerKind[];
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setSpinning(false); return; }
    const i = setInterval(() => { setFace((f) => f + 1); sfx("tick"); }, 90);
    const t = setTimeout(() => { clearInterval(i); setSpinning(false); sfx("fanfare"); }, 1800);
    return () => { clearInterval(i); clearTimeout(t); };
  }, []);
  const close = () => { void api("/api/powers/seen", { method: "POST" }).catch(() => {}); onClose(); };
  const tier = TIERS[inv.tier];
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Ta boîte à items de la semaine">
      <div className="modal itembox">
        <p className="eyebrow">Boîte à items · semaine du {frDay(inv.week, { day: "numeric", month: "long" })}</p>
        {spinning ? (
          <div className="roulette"><span className="qbox">?</span><span className="slot">{POWERS[kinds[face % kinds.length]!].emoji}</span></div>
        ) : (
          <>
            <h2 className="display title-lg sun">{tier.label}</h2>
            <p className="muted">{inv.rank ? `T'es ${inv.rank === 1 ? "1er" : `${inv.rank}e`} au classement de la saison.` : "Nouveau dans la course : on t'arme pour la remontée."} Plus t'es bas, plus ta boîte est garnie.</p>
            {inv.tier === "crown" ? (
              <div className="crown-note"><span className="big-emoji">👑</span><p><b>Couronne lourde.</b> T'es premier : cette semaine, ton bonus vitesse est divisé par deux. Et le dernier a une carapace bleue avec ton nom dessus.</p></div>
            ) : (
              <div className="items-grid">
                {inv.items.map((it) => (
                  <div key={it.kind} className="item-card pop"><span className="big-emoji">{POWERS[it.kind].emoji}</span><b>{POWERS[it.kind].name}{it.total > 1 ? ` ×${it.total}` : ""}</b><span className="small muted">{POWERS[it.kind].desc}</span></div>
                ))}
              </div>
            )}
            <button className="btn primary" onClick={close} autoFocus>Let's go!</button>
          </>
        )}
      </div>
    </div>
  );
}

export function ItemsCard({ inv, crownId, meId, onOpen }: { inv: PowerInventory | null; crownId?: string | null; meId: string; onOpen: () => void }) {
  if (!inv) return null;
  const crowned = inv.tier === "crown" || crownId === meId;
  return (
    <div className="card">
      <h3>Ta boîte à items <button className="linkish" onClick={onOpen}>Revoir</button></h3>
      <p className="muted small" style={{ marginTop: 6 }}>{TIERS[inv.tier].label} · se recharge lundi selon le classement.</p>
      {crowned && <p className="crown-line">👑 Couronne lourde : ton bonus vitesse est divisé par deux cette semaine.</p>}
      <div className="inv">
        {inv.items.map((it) => (
          <span key={it.kind} className={`inv-item${it.left ? "" : " empty"}`} title={POWERS[it.kind].desc}>
            <span aria-hidden="true">{POWERS[it.kind].emoji}</span>{POWERS[it.kind].name}<b className="mono">{it.left}/{it.total}</b>
          </span>
        ))}
        {!inv.items.length && !crowned && <span className="muted small">Boîte vide pour cette semaine.</span>}
      </div>
    </div>
  );
}

/** Les power-ups utilisables pendant la question. */
export function PowerBar({ inv, q, used, answered, onUse }: { inv: PowerInventory | null; q: Question; used?: PowerKind; answered: boolean; onUse: (k: PowerKind) => void }) {
  if (!inv || !inv.items.some((i) => i.left > 0)) return null;
  return (
    <div className="powers" role="group" aria-label="Power-ups">
      <span className="eyebrow">Power-ups</span>
      {inv.items.filter((i) => i.left > 0).map((it) => {
        const fits = powerFits(it.kind, q);
        const late = it.kind !== "shell" && answered;
        const on = used === it.kind;
        return (
          <button key={it.kind} className={`power${on ? " on" : ""}${it.kind === "shell" ? " shell" : ""}`} disabled={!!used || !fits || late}
            title={fits ? POWERS[it.kind].desc : "Pas sur ce type de question"} onClick={() => onUse(it.kind)}>
            {POWERS[it.kind].emoji} {POWERS[it.kind].name} <span className="mono">×{it.left}</span>
          </button>
        );
      })}
      {used && <span className="small muted">{POWERS[used].emoji} utilisé pour cette question</span>}
    </div>
  );
}

/** La carapace bleue traverse l'écran. */
export function ShellBanner({ s }: { s: PublicState }) {
  if (!s.shell) return null;
  const from = s.players[s.shell.from], to = s.players[s.shell.to];
  return (
    <div className="shell-banner" role="status">
      <span className="shell-fly" aria-hidden="true">💙</span>
      <Avatar p={from} size="sm" /><b>{from?.name}</b> lance la carapace bleue sur <Avatar p={to} size="sm" /><b>{to?.name}</b>!
    </div>
  );
}

/** Qui a sorti quoi, pendant la question. */
export function PowerLine({ s }: { s: PublicState }) {
  const used = Object.entries(s.powers);
  if (!used.length) return null;
  return (
    <div className="power-line">
      {used.map(([id, k]) => <span key={id} className="pill"><span aria-hidden="true">{POWERS[k].emoji}</span>{s.players[id]?.name}</span>)}
    </div>
  );
}

export function WeekItemsCard() {
  const [d, setD] = useState<WeekDistribution | null>(null);
  useEffect(() => { api<WeekDistribution>("/api/powers/week").then(setD).catch(() => {}); }, []);
  if (!d || !d.rows.length) return null;
  return (
    <div className="card">
      <h3>Boîtes à items de la semaine</h3>
      <p className="muted small" style={{ marginTop: 6 }}>Distribuées lundi selon le classement. Plus t'es bas, mieux t'es armé.</p>
      <div className="week-items">
        {d.rows.map((r) => (
          <div key={r.player.id} className="wi-row">
            <span className="mono muted">{r.rank ?? "–"}</span>
            <Avatar p={r.player} size="sm" />
            <span className="wi-name">{r.player.name}<span className="meta">{TIERS[r.tier].label}</span></span>
            <span className="wi-items">
              {r.tier === "crown" ? "👑" : TIERS[r.tier].items.map((k, i) => <span key={i} className={r.used.includes(k) ? "spent" : ""} title={POWERS[k].name}>{POWERS[k].emoji}</span>)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ======================= Applaudimètre ======================= */

export function ApplauseStars({ s, onRate }: { s: PublicState; onRate: (n: number) => void }) {
  const [mine, setMine] = useState(0);
  return (
    <div className="applause">
      <p className="eyebrow">Applaudimètre</p>
      <p className="small">Note la performance de Matt :</p>
      <div className="stars" role="group" aria-label="Note de 1 à 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={`star${n <= mine ? " on" : ""}`} aria-pressed={n <= mine} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} onClick={() => { setMine(n); onRate(n); sfx("pop"); }}>★</button>
        ))}
      </div>
      {s.applause && <p className="small">Moyenne de l'équipe : <b>{s.applause.avg.toFixed(1).replace(".", ",")} ★</b> ({s.applause.count} vote{s.applause.count > 1 ? "s" : ""})</p>}
    </div>
  );
}

export function ApplauseMeter({ s }: { s: PublicState }) {
  const a = s.applause;
  const pct = a ? (a.avg / 5) * 100 : 0;
  return (
    <div className="meter">
      <span className="eyebrow">Applaudimètre</span>
      <div className="meter-stars" style={{ "--pct": `${pct}%` } as CSSProperties} aria-label={a ? `${a.avg} étoiles sur 5` : "Pas encore de votes"}><span>★★★★★</span><span className="fill">★★★★★</span></div>
      <span className="small">{a ? `${a.avg.toFixed(1).replace(".", ",")} / 5 · ${a.count} vote${a.count > 1 ? "s" : ""}` : "L'équipe vote…"}</span>
    </div>
  );
}

export function PalmaresCard() {
  const [list, setList] = useState<Performance[] | null>(null);
  useEffect(() => { api<Performance[]>("/api/palmares").then(setList).catch(() => setList([])); }, []);
  return (
    <div className="card">
      <h3>Palmarès de Matt 🎹</h3>
      {!list?.length ? <p className="muted small" style={{ marginTop: 8 }}>Après chaque Mercredi musical, l'équipe note la performance de Matt. Les meilleures s'affichent ici.</p> : (
        <ol className="palm">
          {list.map((p) => <li key={p.questionId + p.day}><span>{p.title}{p.style ? <span className="muted"> · {p.style.toLowerCase()}</span> : null}</span><b className="mono">{p.avg.toFixed(1).replace(".", ",")} ★</b></li>)}
        </ol>
      )}
    </div>
  );
}

/* ======================= Trophées de la semaine ======================= */

export function TrophiesCard() {
  const [data, setData] = useState<{ current: WeekTrophies; previous: WeekTrophies } | null>(null);
  const [which, setWhich] = useState<"current" | "previous" | null>(null);
  useEffect(() => { api<{ current: WeekTrophies; previous: WeekTrophies }>("/api/trophies").then(setData).catch(() => {}); }, []);
  if (!data) return null;
  const tab = which ?? (data.current.games ? "current" : "previous");
  const w = data[tab];
  return (
    <div className="card">
      <h3>Trophées de la semaine
        <span className="seg mini">
          <button aria-pressed={tab === "current"} onClick={() => setWhich("current")}>Cette semaine</button>
          <button aria-pressed={tab === "previous"} onClick={() => setWhich("previous")}>Semaine passée</button>
        </span>
      </h3>
      {!w.trophies.length ? <p className="muted small" style={{ marginTop: 8 }}>{w.games ? "Pas assez de parties pour remettre des trophées." : "Aucune partie cette semaine-là."}</p> : (
        <div className="troph">
          {w.trophies.map((t) => (
            <div key={t.id} className="tr">
              <span className="ic" aria-hidden="true">{t.emoji}</span>
              <div><b>{t.name}</b><span className="tr-who">{t.winners.slice(0, 3).map((p) => <span key={p.id} className="row" style={{ gap: 4 }}><Avatar p={p} size="sm" />{p.name}</span>)}{t.winners.length > 3 ? <span className="muted small">+{t.winners.length - 3}</span> : null}</span><span className="small muted">{t.desc} · {t.value}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================= Code de récupération ======================= */

export function RecoveryBox() {
  const [code, setCode] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { api<{ code: string }>("/api/me/recovery").then((r) => setCode(r.code)).catch(() => {}); }, []);
  if (!code) return null;
  return (
    <div className="field recovery">
      <span className="flabel">Ton code de récupération</span>
      <div className="row">
        <code className="rcode">{shown ? code : "•••••-•••••-•••••-••"}</code>
        <button type="button" className="btn sm" onClick={() => setShown(!shown)}>{shown ? "Cacher" : "Afficher"}</button>
        <button type="button" className="btn sm" onClick={() => copyText(code, "Code copié. Garde-le dans un endroit sûr!")}>Copier</button>
      </div>
      <span className="muted small">Il te reconnecte sur un autre appareil ou navigateur, avec tous tes points. Garde-le pour toi.</span>
    </div>
  );
}

export function RecoverForm({ onDone, onCancel }: { onDone: (p: Player) => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ player: Player; token: string }>("/api/recover", { body: { code } });
      auth.token = r.token;
      toast(`Re-bonjour ${r.player.name}!`);
      onDone(r.player);
    } catch (err) { toast((err as Error).message); }
  };
  return (
    <form className="card center-card" onSubmit={submit}>
      <p className="eyebrow">Déjà dans l'équipe</p>
      <h2 className="display title-lg">Reprends ta place</h2>
      <p className="muted">Entre ton code de récupération (dans ton profil, sur ton autre appareil). Tu l'as perdu? Matt peut te le redonner.</p>
      <div className="field"><label htmlFor="rec">Code de récupération</label><input id="rec" className="input" placeholder="tuque-bleuet-castor-42" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} autoFocus required /></div>
      <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={onCancel}>Retour</button><button className="btn primary">Me reconnecter</button></div>
    </form>
  );
}

/* ======================= Boîte à questions ======================= */

const SUBMIT_TYPES: QType[] = ["mc", "tf", "closest", "majority", "rebus", "zoom"];

export function SubmitQuestion({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<QType>("mc");
  const [prompt, setPrompt] = useState("");
  const [emoji, setEmoji] = useState("❓");
  const [imageId, setImageId] = useState<string | null>(null);
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [num, setNum] = useState({ answer: "5", min: "0", max: "10" });
  const [mine, setMine] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Submission[]>("/api/submissions/mine").then(setMine).catch(() => {}); }, []);
  const n = type === "tf" ? 2 : 4;
  const cs = type === "tf" ? ["Vrai", "Faux"] : choices;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const data = type === "closest" ? { answer: Number(num.answer), min: Number(num.min), max: Number(num.max) } : { choices: cs.slice(0, n), correct: type === "majority" ? undefined : correct };
    try {
      await api("/api/submissions", { body: { question: { type, prompt, emoji, imageId, timeLimit: 20, speedBonus: true, data } } });
      toast("Question envoyée à Matt! S'il la choisit, tu gagnes 300 pts si elle est bien dosée.");
      onClose();
    } catch (err) { toast((err as Error).message); }
    finally { setBusy(false); }
  };
  const status = { pending: "En attente", accepted: "Choisie par Matt 🎉", rejected: "Pas cette fois" } as const;

  return (
    <form className="submit-q" onSubmit={submit}>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 className="display title-lg">Proposer une question</h2><button type="button" className="btn ghost sm" onClick={onClose}>Fermer</button></div>
      <p className="muted">Si Matt la met dans un quiz, tu ne pourras pas y répondre. Mais si 30 à 70 % de l'équipe trouve, tu gagnes <b>300 pts</b>. Ni trop facile, ni impossible!</p>
      <div className="types">{SUBMIT_TYPES.map((t) => <button type="button" key={t} className="type" aria-pressed={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}</div>
      <div className="field"><label htmlFor="sq-prompt">Ta question</label><textarea id="sq-prompt" className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} required maxLength={300} /></div>
      <div className="row">
        <div className="field" style={{ width: 110 }}><label htmlFor="sq-emoji">Emoji</label><input id="sq-emoji" className="input" value={emoji} maxLength={24} onChange={(e) => setEmoji(e.target.value)} /></div>
        <label className="btn sm">{imageId ? "Changer l'image" : "Ajouter une image"}<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { try { setImageId(await uploadImage(f, 1600)); } catch (err) { toast((err as Error).message); } } }} /></label>
        {imageId && <span className="thumb-sm" style={{ backgroundImage: `url(/media/${imageId})` }} />}
      </div>
      {type === "closest" ? (
        <div className="num-grid">
          {(["answer", "min", "max"] as const).map((k) => <div key={k} className="field"><label htmlFor={`sq-${k}`}>{{ answer: "Bonne réponse", min: "Minimum", max: "Maximum" }[k]}</label><input id={`sq-${k}`} className="input" type="number" value={num[k]} onChange={(e) => setNum({ ...num, [k]: e.target.value })} /></div>)}
        </div>
      ) : (
        <div className="ans-grid">
          {cs.slice(0, n).map((c, k) => (
            <div key={k} className="ans" style={{ "--tc": `var(--c${k + 1})` } as CSSProperties}>
              <span className="sw"><Shape k={k} /></span>
              <input type="text" value={c} disabled={type === "tf"} placeholder={`Réponse ${k + 1}`} aria-label={`Réponse ${k + 1}`} onChange={(e) => { const x = [...choices]; x[k] = e.target.value; setChoices(x); }} />
              {type !== "majority" && <label className="ok"><input type="radio" name="sq-correct" checked={correct === k} onChange={() => setCorrect(k)} /> Bonne</label>}
            </div>
          ))}
        </div>
      )}
      <button className="btn primary" disabled={busy}>Glisser dans la boîte de Matt</button>
      {mine.length > 0 && (
        <div className="mine">
          <p className="eyebrow">Tes questions</p>
          {mine.map((m) => <div key={m.id} className="mine-row"><span>{m.question.prompt}</span><span className={`pill${m.status === "accepted" ? " good" : m.status === "rejected" ? "" : " warn"}`}>{status[m.status]}</span></div>)}
        </div>
      )}
    </form>
  );
}

/** Pour Matt, dans l'éditeur : les questions proposées par l'équipe. */
export function SubmissionInbox({ onAdd }: { onAdd: (q: Question) => void }) {
  const [list, setList] = useState<Submission[]>([]);
  const load = () => api<Submission[]>("/api/submissions").then(setList).catch(() => {});
  useEffect(() => { void load(); }, []);
  const decide = async (s: Submission, status: "accepted" | "rejected") => {
    try {
      await api(`/api/submissions/${s.id}`, { method: "PATCH", body: { status } });
      if (status === "accepted") { onAdd({ ...s.question, id: Math.random().toString(36).slice(2, 10), authorId: s.player.id }); toast(`Question de ${s.player.name} ajoutée. N'oublie pas d'enregistrer!`); }
      void load();
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="card">
      <h3>Boîte à questions {list.length > 0 && <span className="pill warn">{list.length}</span>}</h3>
      <p className="muted small" style={{ marginTop: 6 }}>L'équipe propose, tu choisis. L'auteur ne joue pas sa question, mais gagne 300 pts si 30 à 70 % trouvent.</p>
      <div className="inbox">
        {list.map((s) => (
          <div key={s.id} className="inbox-item">
            <div className="row" style={{ gap: 8 }}><Avatar p={s.player} size="sm" /><b>{s.player.name}</b><span className="pill">{TYPE_LABEL[s.question.type]}</span></div>
            <p className="small">{s.question.emoji} {s.question.prompt}</p>
            {s.question.data.choices && <p className="small muted">{s.question.data.choices.map((c, i) => (i === s.question.data.correct ? `✓ ${c}` : c)).join(" · ")}</p>}
            {s.question.type === "closest" && <p className="small muted">Réponse : {s.question.data.answer} (entre {s.question.data.min} et {s.question.data.max})</p>}
            <div className="row"><button className="btn sm primary" onClick={() => decide(s, "accepted")}>Ajouter à ce quiz</button><button className="btn sm ghost" onClick={() => decide(s, "rejected")}>Pas cette fois</button></div>
          </div>
        ))}
        {!list.length && <p className="muted small" style={{ marginTop: 10 }}>Boîte vide. Les idées de l'équipe arriveront ici.</p>}
      </div>
    </div>
  );
}
