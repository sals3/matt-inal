import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { REACTIONS, TYPE_LABEL, type Player, type PublicState, type Question } from "../src/shared";
import { api, auth, fmt, signed, toast, useToasts, type ReactFn } from "./lib";

export const SHAPE_NAMES = ["Triangle", "Cercle", "Carré", "Losange"];
export function Shape({ k }: { k: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {k === 0 && <path d="M12 3 22 20H2z" />}
      {k === 1 && <circle cx="12" cy="12" r="9" />}
      {k === 2 && <rect x="4" y="4" width="16" height="16" rx="2" />}
      {k === 3 && <path d="M12 2 22 12 12 22 2 12z" />}
    </svg>
  );
}

export function Avatar({ p, size = "" }: { p?: Player; size?: "" | "sm" | "lg" | "xl" }) {
  if (!p) return null;
  return <span className={`av ${size}`} style={{ "--av": p.color } as CSSProperties} title={p.name} aria-hidden="true">{p.emoji}</span>;
}

const MIC = (
  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
    <path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1a7 7 0 0 0 6-6.9z" />
  </svg>
);
const BG: Record<string, string> = { mc: "bg-sky", zoom: "bg-sun", closest: "bg-mug", majority: "bg-sky", rebus: "bg-sun", tf: "bg-sky", music: "bg-stage" };
const EQ_H = [60, 85, 40, 95, 70, 50, 88, 35, 75, 92, 55, 68, 45, 80, 62, 90, 38, 72, 58, 86, 48, 78, 66, 52];

export function Equalizer({ bars = 24, playing = true, mini = false }: { bars?: number; playing?: boolean; mini?: boolean }) {
  return (
    <div className={`eq${playing ? " playing" : ""}${mini ? " mini" : ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} style={{ "--h": `${EQ_H[i % EQ_H.length]}%`, animationDelay: `${(i * 53) % 400}ms` } as CSSProperties} />)}
    </div>
  );
}

/** Le visuel façon tuile vidéo Teams : l'image de fond de Matt, avec Matt devant. */
export function Visual({ q, zoom = 1, blur = 0, small = false, tag = "Matt · organisateur" }: {
  q: Pick<Question, "type" | "emoji" | "imageId">; zoom?: number; blur?: number; small?: boolean; tag?: string;
}) {
  const style = { "--z": zoom, "--b": `${blur}px` } as CSSProperties;
  const img = q.type !== "music" && q.imageId;
  return (
    <div className={`qv ${img ? "" : BG[q.type]}${small ? " small" : ""}`}>
      {q.type === "music" ? <Equalizer bars={small ? 14 : 22} mini={small} />
        : img ? <div className="bgimg" style={{ ...style, backgroundImage: `url(/media/${q.imageId})` }} />
        : <span className="big" style={style}>{q.emoji}</span>}
      <svg className="matt" viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="38" r="22" /><path d="M12 110c4-28 24-44 48-44s44 16 48 44z" /></svg>
      <span className="tag">{MIC} {tag}</span>
    </div>
  );
}

export function Timer({ left, frac }: { left: number; frac: number }) {
  return (
    <>
      <span className="timer" aria-label={`${Math.ceil(left / 1000)} secondes`}>{Math.ceil(left / 1000)}</span>
      <div className={`timebar${frac < 0.3 ? " low" : ""}`}><i style={{ width: `${frac * 100}%` }} /></div>
    </>
  );
}

export function QHead({ s, right }: { s: PublicState; right?: ReactNode }) {
  const q = s.question!;
  return (
    <div className="qhead">
      <span className="row" style={{ gap: 6 }}>
        <span className="pill">Question {s.qIndex + 1} / {s.qCount} · {TYPE_LABEL[q.type]}</span>
        {q.doublePoints && <span className="pill warn">Points ×2</span>}
      </span>
      {right}
    </div>
  );
}

/** Ce qui se passe à la révélation : votes, estimations ou réponses musicales, puis les points. */
export function RevealPanel({ s, meId }: { s: PublicState; meId?: string }) {
  const q = s.question!, r = s.reveal!;
  const name = (id: string) => s.players[id];
  let detail: ReactNode = null;

  if (q.type === "closest") {
    const min = q.data.min ?? 0, max = q.data.max ?? 10, span = Math.max(1, max - min);
    const pos = (v: number) => ((v - min) / span) * 100;
    const stack: Record<number, number> = {};
    const ticks = span <= 12 ? Array.from({ length: span + 1 }, (_, i) => min + i) : [min, Math.round(min + span / 2), max];
    detail = (
      <div className="nl-wrap">
        <div className="nl">
          <div className="axis" />
          <div className="ans" style={{ left: `${pos(r.answer ?? 0)}%` }}><span>{r.answer}</span></div>
          {Object.entries(r.picks).map(([id, v]) => {
            const k = (stack[v as number] = (stack[v as number] ?? -1) + 1);
            return <div key={id} className={`pin${id === meId ? " me" : ""}`} style={{ left: `${pos(v as number)}%`, top: 62 - k * 30 }} title={`${name(id)?.name} : ${v}`}><Avatar p={name(id)} size="sm" /></div>;
          })}
          {ticks.map((t) => <span key={t} className="tick" style={{ left: `${pos(t)}%` }}>{t}</span>)}
        </div>
        <p className="muted small">Les estimations de l'équipe. Le trait doré, c'est la vraie réponse : <b>{r.answer}</b>.</p>
      </div>
    );
  } else if (q.type === "music") {
    detail = (
      <div className="music-answers">
        {Object.entries(r.picks).sort((a, b) => (r.points[b[0]] ?? 0) - (r.points[a[0]] ?? 0)).map(([id, v]) => {
          const m = v as { title: string; artist: string; year: number | null };
          return (
            <div key={id} className="ma-row">
              <Avatar p={name(id)} size="sm" />
              <span className="ma-txt"><b>{name(id)?.name}</b> « {m.title || "…"} » · {m.artist || "…"}{m.year ? ` · ${m.year}` : ""}<span className="meta">{r.detail[id]}</span></span>
              <b className="mono">{signed(r.points[id] ?? 0)}</b>
            </div>
          );
        })}
      </div>
    );
  } else {
    const total = r.counts.reduce((a, b) => a + b, 0) || 1;
    const who = (k: number) => Object.entries(r.picks).filter(([, v]) => v === k).map(([id]) => id);
    detail = (
      <div className="dist">
        {(q.data.choices ?? []).map((c, k) => (
          <div key={k} className={`drow${r.correct.includes(k) ? " win" : ""}`} style={{ "--tc": `var(--c${k + 1})` } as CSSProperties}>
            <span className="sh"><Shape k={k} /></span>
            <div className="dbar">
              <i style={{ width: `${(r.counts[k]! / total) * 100}%` }} />
              <span>{r.correct.includes(k) ? "✓ " : ""}{c}</span>
              <span className="who">{who(k).map((id) => <Avatar key={id} p={name(id)} size="sm" />)}</span>
            </div>
            <span className="cnt mono">{r.counts[k]}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="reveal-panel">
      {q.type === "music" && r.music && (
        <div className="music-answer"><span className="eyebrow">C'était</span><h3 className="display">{r.music.title}</h3><p>{r.music.artist}{r.music.year ? ` · ${r.music.year}` : ""}</p></div>
      )}
      {detail}
      {q.type !== "music" && !r.nobody && (
        <div className="winners">
          {Object.entries(r.points).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).map(([id, p]) => (
            <span key={id} className={`winner${id === meId ? " me" : ""}`}><Avatar p={name(id)} size="sm" />{name(id)?.name}<b className="mono">{signed(p)}</b></span>
          ))}
        </div>
      )}
      {r.nobody && <p className="nobody">Personne n'a trouvé : <b>Matt marque un point</b>.</p>}
    </div>
  );
}

export function Podium({ s, meId }: { s: PublicState; meId?: string }) {
  const order = Object.entries(s.totals).sort((a, b) => b[1] - a[1]);
  const top = order.slice(0, 3);
  const step = (entry: [string, number] | undefined, place: number) =>
    entry && (
      <div key={place} className={`step p${place}${entry[0] === meId ? " me" : ""}`}>
        <Avatar p={s.players[entry[0]]} size="lg" />
        <div className="nm">{s.players[entry[0]]?.name}</div>
        <div className="pts">{fmt(entry[1])} pts</div>
        <div className="blk">{place}</div>
      </div>
    );
  return (
    <div className="podium-wrap">
      <div className="podium">{step(top[1], 2)}{step(top[0], 1)}{step(top[2], 3)}</div>
      {order.length > 3 && (
        <ol className="rest">
          {order.slice(3).map(([id, p], i) => <li key={id} className={id === meId ? "me" : ""}><span className="mono muted">{i + 4}</span><Avatar p={s.players[id]} size="sm" /> {s.players[id]?.name} <span className="mono">{fmt(p)}</span></li>)}
        </ol>
      )}
    </div>
  );
}

export function Reactions({ onSend }: { onSend: (e: string) => void }) {
  return (
    <div className="reacts">
      <span className="muted small">Réagis :</span>
      {REACTIONS.map((e) => <button key={e} className="react" onClick={() => onSend(e)} aria-label={`Réagir avec ${e}`}>{e}</button>)}
    </div>
  );
}

/** Les réactions de l'équipe qui flottent à l'écran. */
export function FloatingReactions({ onReact, players }: { onReact: (f: ReactFn) => () => void; players: Record<string, Player> }) {
  const [items, setItems] = useState<{ id: number; e: string; x: number; who?: string }[]>([]);
  useEffect(() => onReact((playerId, e) => {
    const it = { id: Math.random(), e, x: 8 + Math.random() * 84, who: players[playerId]?.name };
    setItems((l) => [...l.slice(-20), it]);
    setTimeout(() => setItems((l) => l.filter((x) => x !== it)), 2200);
  }), [onReact, players]);
  return (
    <div className="float-layer" aria-hidden="true">
      {items.map((it) => <span key={it.id} className="floaty" style={{ left: `${it.x}%` }}>{it.e}{it.who && <small>{it.who}</small>}</span>)}
    </div>
  );
}

export function Toasts() {
  const list = useToasts();
  return <div className="toasts" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}</div>;
}

/** Accès réservé à Matt : un NIP, puis un jeton gardé dans le navigateur. */
export function AdminGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  useEffect(() => {
    if (!auth.admin) { setOk(false); return; }
    api("/api/admin/check").then(() => setOk(true)).catch(() => { auth.admin = ""; setOk(false); });
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { auth.admin = (await api<{ token: string }>("/api/admin/login", { body: { pin } })).token; setOk(true); }
    catch (err) { toast((err as Error).message); }
  };
  if (ok === null) return <div className="loading">Chargement…</div>;
  if (ok) return <>{children}</>;
  return (
    <form className="card center-card" onSubmit={submit}>
      <p className="eyebrow">Espace Matt</p>
      <h2 className="display title-lg">Juste pour l'animateur</h2>
      <p className="muted">Entre ton NIP pour préparer les quiz et animer la partie.</p>
      <div className="field"><label htmlFor="pin">NIP</label><input id="pin" className="input code-input" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus /></div>
      <button className="btn primary">Entrer</button>
    </form>
  );
}
