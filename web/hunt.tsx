// 🔎 La chasse aux trésors : fouiller le décor (joueur), la course en direct (écran de Matt),
// la révélation des cachettes et l'éditeur où Matt cache ses objets.
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { huntSrc, SCENES } from "../src/scenes";
import type { ClientMsg, PublicState, Question, Spot } from "../src/shared";
import { sfx, signed, useNow, type TapFn } from "./lib";
import { Avatar } from "./ui";

/** Position d'un clic dans l'image, en fractions de sa largeur et de sa hauteur. */
function where(e: MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
const at = (x: number, y: number) => ({ left: `${x * 100}%`, top: `${y * 100}%` });
/** Cercle d'une cachette : son diamètre est en fraction de la largeur de l'image. */
const ring = (s: Spot) => ({ ...at(s.x, s.y), width: `${s.r * 200}%` }) as CSSProperties;

function Checklist({ q, got }: { q: Question; got: (k: number) => boolean }) {
  return (
    <ul className="hunt-list">
      {(q.data.spots ?? []).map((s, k) => <li key={k} className={got(k) ? "got" : ""}><span aria-hidden="true">{got(k) ? "✓" : k + 1}</span>{s.label}</li>)}
    </ul>
  );
}

/** Le joueur fouille le décor. Un clic dans le vide l'étourdit un moment. */
export function HuntBoard({ q, done, send, onTap }: { q: Question; done: boolean; send: (m: ClientMsg) => void; onTap: (f: TapFn) => () => void }) {
  const [found, setFound] = useState<{ k: number; x: number; y: number }[]>([]);
  const [misses, setMisses] = useState<{ id: number; x: number; y: number }[]>([]);
  const [stunUntil, setStunUntil] = useState(0);
  const [zoom, setZoom] = useState(false);
  const now = useNow(150);
  const n = q.data.spots?.length ?? 0;

  useEffect(() => onTap((t) => {
    if (t.hit !== null) {
      const k = t.hit;
      setFound((f) => (f.some((m) => m.k === k) ? f : [...f, { k, x: t.x, y: t.y }]));
      sfx("good");
    } else {
      const id = Math.random();
      setMisses((m) => [...m, { id, x: t.x, y: t.y }]);
      setTimeout(() => setMisses((m) => m.filter((z) => z.id !== id)), 900);
      setStunUntil(Date.now() + (t.stunMs ?? 1500));
      sfx("bad");
    }
  }), [onTap]);

  const stunned = now < stunUntil;
  const click = (e: MouseEvent<HTMLElement>) => {
    if (done || stunned) return;
    send({ t: "tap", qid: q.id, ...where(e) });
  };

  return (
    <div className="hunt-wrap">
      <div className={`hunt${zoom ? " zoomed" : ""}${done ? " over" : ""}`}>
        <div className="hunt-in">
          <img src={huntSrc(q) ?? ""} alt="Le décor de la chasse aux trésors" draggable={false} onClick={click} />
          {found.map((m) => <span key={m.k} className="hmark" style={at(m.x, m.y)} aria-hidden="true">✓</span>)}
          {misses.map((m) => <span key={m.id} className="hmiss" style={at(m.x, m.y)} aria-hidden="true">bloop!</span>)}
        </div>
      </div>
      {stunned && <div className="hstun" role="status">😵 Étourdi! Pas de clics au hasard…</div>}
      <div className="row hunt-tools">
        <button className="btn sm ghost" onClick={() => setZoom((z) => !z)}>{zoom ? "🔍 Vue d'ensemble" : "🔍 Loupe ×2"}</button>
        <span className="mono">{found.length} / {n} trouvés</span>
      </div>
      <Checklist q={q} got={(k) => found.some((m) => m.k === k)} />
    </div>
  );
}

/** Écran de Matt : le décor, la liste des objets et la course de l'équipe. */
export function HuntLive({ s }: { s: PublicState }) {
  const q = s.question!;
  const n = q.data.spots?.length ?? 0;
  const racers = s.presence.filter((p) => p.id !== q.authorId).sort((a, b) => (s.hunt[b.id] ?? 0) - (s.hunt[a.id] ?? 0));
  return (
    <div className="hunt-host">
      <div className="hunt"><div className="hunt-in"><img src={huntSrc(q) ?? ""} alt="Le décor de la chasse aux trésors" /></div></div>
      <div className="hunt-side">
        <Checklist q={q} got={() => false} />
        <div className="race">
          {racers.map((p) => {
            const f = s.hunt[p.id] ?? 0;
            return (
              <div key={p.id} className={`racer${f >= n && n ? " done" : ""}`}>
                <Avatar p={p} size="sm" away={s.away.includes(p.id)} />
                <span className="rname">{p.name}</span>
                <span className="rbar"><i style={{ width: `${n ? (f / n) * 100 : 0}%` }} /></span>
                <b className="mono">{f}/{n}</b>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** La révélation : toutes les cachettes, puis le classement de la chasse. */
export function HuntReveal({ s, meId }: { s: PublicState; meId?: string }) {
  const q = s.question!, r = s.reveal!;
  const n = q.data.spots?.length ?? 0;
  return (
    <div className="hunt-reveal">
      <div className="hunt"><div className="hunt-in">
        <img src={huntSrc(q) ?? ""} alt="Le décor, avec les cachettes encerclées" />
        {(q.data.spots ?? []).map((sp, k) => <span key={k} className="hring" style={ring(sp)}><b>{k + 1}</b></span>)}
      </div></div>
      <ol className="hunt-legend">{(q.data.spots ?? []).map((sp, k) => <li key={k}>{sp.label}</li>)}</ol>
      <div className="music-answers">
        {Object.entries(r.picks).sort((a, b) => (r.points[b[0]] ?? 0) - (r.points[a[0]] ?? 0)).map(([id, v]) => (
          <div key={id} className={`ma-row${id === meId ? " me" : ""}`}>
            <Avatar p={s.players[id]} size="sm" away={r.away.includes(id)} />
            <span className="ma-txt"><b>{s.players[id]?.name}</b> {Number(v)} / {n} objets<span className="meta">{r.detail[id]}</span></span>
            <b className="mono">{signed(r.points[id] ?? 0)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Aperçu téléphone dans l'éditeur. */
export function HuntPreview({ q }: { q: Question }) {
  const src = huntSrc(q);
  return (
    <>
      {src ? <img className="hunt-thumb" src={src} alt="" /> : <div className="pv-in">Choisis un décor…</div>}
      <Checklist q={q} got={() => false} />
    </>
  );
}

/** Matt choisit un décor (ou son image) et clique pour cacher ses objets. */
export function HuntEditor({ q, patchData, onPickImage }: { q: Question; patchData: (d: Partial<Question["data"]>) => void; onPickImage: (f: File) => void }) {
  const spots = q.data.spots ?? [];
  const src = huntSrc(q);
  const scene = q.data.scene ? SCENES[q.data.scene] : undefined;
  const setSpots = (next: Spot[]) => patchData({ spots: next });
  const add = (e: MouseEvent<HTMLElement>) => {
    if (spots.length >= 8) return;
    setSpots([...spots, { label: `Objet ${spots.length + 1}`, ...where(e), r: 0.035 }]);
  };
  return (
    <div className="field"><span className="flabel">Le décor</span>
      <div className="scene-pick">
        {Object.entries(SCENES).map(([id, sc]) => (
          <button key={id} className="scene-card" aria-pressed={q.data.scene === id} title={sc.blurb}
            onClick={() => patchData({ scene: id, ratio: sc.ratio, spots: sc.spots.map((x) => ({ ...x })) })}>
            <img src={huntSrc({ imageId: null, data: { scene: id } }) ?? ""} alt="" /><span>{sc.name}</span>
          </button>
        ))}
        <label className={`scene-card own${q.data.scene ? "" : " on"}`}>
          {q.imageId ? <img src={`/media/${q.imageId}`} alt="" /> : <span className="big-emoji" aria-hidden="true">🖼️</span>}
          <span>{q.imageId ? "Mon image" : "Ton image…"}</span>
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { onPickImage(f); patchData({ scene: undefined, spots: [] }); } e.target.value = ""; }} />
        </label>
        {q.imageId && q.data.scene && <button className="btn sm ghost" onClick={() => patchData({ scene: undefined, spots: [] })}>Utiliser mon image</button>}
      </div>
      {scene && <p className="muted small">{scene.blurb}</p>}

      {src && (
        <>
          <span className="muted small">Clique dans l'image pour cacher un objet (8 au maximum), puis nomme-le. Le cercle, c'est la zone qui compte comme trouvée.</span>
          <div className="hunt edit"><div className="hunt-in">
            <img src={src} alt="Le décor : clique pour cacher un objet" draggable={false} onClick={add}
              onLoad={(e) => {
                const img = e.currentTarget, ratio = img.naturalWidth / img.naturalHeight;
                if (!q.data.scene && ratio && Math.abs((q.data.ratio ?? 0) - ratio) > 0.001) patchData({ ratio });
              }} />
            {spots.map((sp, k) => <span key={k} className="hring" style={ring(sp)}><b>{k + 1}</b></span>)}
          </div></div>
          <div className="spot-list">
            {spots.map((sp, k) => (
              <div key={k} className="spot-row">
                <b className="spot-n">{k + 1}</b>
                <input className="input" aria-label={`Nom de l'objet ${k + 1}`} value={sp.label} maxLength={40} onChange={(e) => setSpots(spots.map((x, i) => (i === k ? { ...x, label: e.target.value } : x)))} />
                <label className="small muted spot-size">Taille
                  <input type="range" min={0.015} max={0.12} step={0.005} value={sp.r} onChange={(e) => setSpots(spots.map((x, i) => (i === k ? { ...x, r: Number(e.target.value) } : x)))} /></label>
                <button className="btn sm ghost" aria-label={`Retirer l'objet ${k + 1}`} onClick={() => setSpots(spots.filter((_, i) => i !== k))}>✕</button>
              </div>
            ))}
            {!spots.length && <p className="muted small">Aucun objet caché pour l'instant.</p>}
            {scene && spots.length !== scene.spots.length && <button className="btn sm ghost" onClick={() => setSpots(scene.spots.map((x) => ({ ...x })))}>Remettre les objets du décor</button>}
          </div>
        </>
      )}
      <span className="muted small">Tout trouver : 1 000 pts + bonus vitesse. Sinon, une part de 700 selon les objets trouvés. Un clic dans le vide étourdit 1,5 s.</span>
    </div>
  );
}
