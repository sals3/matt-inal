import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { type Player, type PublicState } from "../src/shared";
import { api, auth, AVATARS, COLORS, confetti, frDay, fmt, ord, sfx, signed, toast, useCountdown, useGame } from "./lib";
import { Avatar, FloatingReactions, Podium, QHead, Reactions, RevealPanel, Shape, SHAPE_NAMES, Timer, Visual } from "./ui";

export function PlayerPage() {
  const [me, setMe] = useState<Player | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!auth.token) { setChecked(true); return; }
    api<Player>("/api/me").then(setMe).catch((e) => { if (e.status === 401) auth.token = ""; }).finally(() => setChecked(true));
  }, []);
  if (!checked) return <div className="loading">Chargement…</div>;
  if (!me) return <ProfileForm onDone={setMe} />;
  return <PlayerGame me={me} setMe={setMe} />;
}

/** Première visite (code d'équipe + profil) ou modification du profil. */
export function ProfileForm({ me, onDone, onCancel }: { me?: Player; onDone: (p: Player) => void; onCancel?: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(me?.name ?? "");
  const [emoji, setEmoji] = useState(me?.emoji ?? AVATARS[(Math.random() * AVATARS.length) | 0]!);
  const [color, setColor] = useState(me?.color ?? COLORS[(Math.random() * COLORS.length) | 0]!);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (me) onDone(await api<Player>("/api/me", { method: "PATCH", body: { name, emoji, color } }));
      else {
        const r = await api<{ player: Player; token: string }>("/api/join", { body: { teamCode: code, name, emoji, color } });
        auth.token = r.token;
        onDone(r.player);
        toast(`Bienvenue dans l'équipe, ${r.player.name}!`);
      }
    } catch (err) { toast((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <form className="card center-card" onSubmit={submit}>
      <p className="eyebrow">{me ? "Ton profil" : "Bienvenue au Matt'inal"}</p>
      <h2 className="display title-lg">{me ? "Change ton look" : "Rejoins l'équipe"}</h2>
      {!me && (
        <div className="field"><label htmlFor="team">Code d'équipe</label>
          <input id="team" className="input code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} required autoFocus />
          <span className="muted small">Matt te le donne dans le chat Teams.</span></div>
      )}
      <div className="field"><label htmlFor="name">Ton nom</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required /></div>
      <div className="field"><span className="flabel">Ton avatar</span>
        <div className="emoji-grid" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => <button type="button" key={a} role="radio" aria-checked={a === emoji} className="emoji-opt" onClick={() => setEmoji(a)}>{a}</button>)}
        </div></div>
      <div className="field"><span className="flabel">Ta couleur</span>
        <div className="color-row" role="radiogroup" aria-label="Couleur">
          {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={c} className="color-opt" style={{ "--c": c } as CSSProperties} onClick={() => setColor(c)} />)}
        </div></div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 8 }}><Avatar p={{ id: "", name, emoji, color }} size="lg" /><b>{name || "Toi"}</b></span>
        <span className="row">{onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>}<button className="btn primary" disabled={busy}>{me ? "Enregistrer" : "C'est parti"}</button></span>
      </div>
    </form>
  );
}

function PlayerGame({ me, setMe }: { me: Player; setMe: (p: Player) => void }) {
  const g = useGame("player");
  const s = g.state;
  const [editing, setEditing] = useState(false);
  const send = (e: string) => g.send({ t: "react", e });
  const prevPhase = useRef<string>("");

  // Sons et confettis aux changements de phase.
  useEffect(() => {
    if (!s || s.phase === prevPhase.current) return;
    prevPhase.current = s.phase;
    if (s.phase === "reveal") { const p = s.reveal?.points[me.id]; if (p && p > 0) { sfx("good"); confetti(60); } else if (p !== undefined) sfx("bad"); }
    if (s.phase === "podium") { sfx("fanfare"); confetti(); }
    if (s.phase === "question") sfx("count");
  }, [s, me.id]);

  if (editing) return <ProfileForm me={me} onDone={(p) => { setMe(p); setEditing(false); }} onCancel={() => setEditing(false)} />;

  return (
    <div className="player">
      <div className={`stage${s?.question?.type === "music" && (s.phase === "question" || s.phase === "reveal") ? " music" : ""}`}>
        {!s ? <div className="lobby"><p className="muted">Connexion à la partie…</p></div>
          : s.phase === "idle" ? <Idle me={me} />
          : s.phase === "lobby" ? <Lobby s={s} />
          : s.phase === "question" ? <QuestionView key={s.question!.id} s={s} me={me} g={g} />
          : s.phase === "reveal" ? <RevealView s={s} me={me} onReact={send} />
          : <PodiumView s={s} me={me} onReact={send} />}
        {!g.connected && s && <p className="offline">Connexion perdue. On se reconnecte…</p>}
      </div>
      <aside className="side">
        <div className="card">
          <div className="profile"><Avatar p={me} size="lg" /><div><b style={{ fontSize: 18 }}>{me.name}</b><br /><button className="linkish" onClick={() => setEditing(true)}>Modifier mon profil</button></div></div>
        </div>
        <div className="card">
          <h3>Points du jour</h3>
          {s && s.phase !== "idle" ? (
            <div className="plist">
              {Object.entries(s.totals).sort((a, b) => b[1] - a[1]).map(([id, p], i) => (
                <div key={id} className={`prow${id === me.id ? " me" : ""}`}><span className="r">{i + 1}</span><Avatar p={s.players[id]} size="sm" /><span>{s.players[id]?.name}</span><span className="p">{fmt(p)}</span></div>
              ))}
              {!Object.keys(s.totals).length && <p className="muted small">Les points s'afficheront après la première question.</p>}
            </div>
          ) : <p className="muted small" style={{ marginTop: 8 }}>Pas de partie en cours. Les points du jour s'affichent ici en direct.</p>}
        </div>
      </aside>
      <FloatingReactions onReact={g.onReact} players={s?.players ?? {}} />
    </div>
  );
}

function Idle({ me }: { me: Player }) {
  const [today, setToday] = useState<{ day: string; quiz: { theme: string; count: number; status: string } | null } | null>(null);
  useEffect(() => { api<typeof today>("/api/today").then(setToday).catch(() => {}); }, []);
  return (
    <>
      <div><p className="eyebrow">{today ? frDay(today.day) : " "}</p><h1 className="hello">Bon matin, <em>{me.name}!</em></h1></div>
      <p className="lede">
        {today?.quiz && today.quiz.status !== "played"
          ? <>Matt a préparé <strong>{today.quiz.count} question{today.quiz.count > 1 ? "s" : ""}</strong>{today.quiz.theme ? <> ({today.quiz.theme})</> : null}. La partie s'ouvre ici dès qu'il la lance au standup : garde cette page ouverte.</>
          : today?.quiz?.status === "played" ? <>Le quiz de ce matin est déjà joué. Va voir le classement, et à demain!</>
          : <>Pas encore de quiz pour aujourd'hui. Dès que Matt lance une partie, elle apparaît ici automatiquement.</>}
      </p>
      <div className="how">
        <div><b>Tout le monde répond en même temps</b><span>Sur ton écran, sans lever la main.</span></div>
        <div><b>La bonne réponse avant la vitesse</b><span>1 000 pts pour avoir raison, 200 max pour la vitesse.</span></div>
        <div><b>Une nouvelle saison chaque mois</b><span>Le classement repart à zéro le 1er.</span></div>
      </div>
      <a className="btn" href="#/classement" style={{ alignSelf: "flex-start" }}>Voir le classement</a>
    </>
  );
}

function Lobby({ s }: { s: PublicState }) {
  return (
    <div className="lobby">
      <p className="eyebrow">{s.quiz?.theme || "Quiz du matin"}</p>
      <h2 className="display title-lg">T'es dans la partie!</h2>
      <p className="muted">Matt va lancer la première question dans un instant.</p>
      <div className="lobby-avs">{s.presence.map((p) => <div key={p.id} className="lobby-av"><Avatar p={p} size="lg" /><span>{p.name}</span></div>)}</div>
      <p className="muted mono">{s.presence.length} connecté{s.presence.length > 1 ? "s" : ""} · {s.qCount} question{s.qCount > 1 ? "s" : ""}</p>
    </div>
  );
}

function QuestionView({ s, me, g }: { s: PublicState; me: Player; g: ReturnType<typeof useGame> }) {
  const q = s.question!;
  const { left, frac } = useCountdown(s, g.offset);
  const answered = s.answered.includes(me.id);
  const [pick, setPick] = useState<number | null>(null);
  const [guess, setGuess] = useState(Math.round(((q.data.min ?? 0) + (q.data.max ?? 10)) / 2));
  const [music, setMusic] = useState({ title: "", artist: "", year: "" });
  const lastSec = useRef(99);
  const done = answered || left <= 0;

  const sec = Math.ceil(left / 1000);
  useEffect(() => { if (sec !== lastSec.current) { lastSec.current = sec; if (sec <= 5 && sec > 0 && !done) sfx("tick"); } }, [sec, done]);

  const answer = (value: unknown) => { if (done) return; g.send({ t: "answer", qid: q.id, value }); sfx("lock"); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, textarea, select")) return;
      const k = Number(e.key) - 1;
      if (q.data.choices && k >= 0 && k < q.data.choices.length && !done) { setPick(k); answer(k); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const zoom = q.type === "zoom" && !answered ? 1 + 6 * frac : 1;
  const blur = q.type === "zoom" && !answered ? 7 * frac : 0;
  const tip = { zoom: "L'image dézoome avec le temps : plus tu réponds tôt, plus le bonus est gros.", majority: "Pas de bonne réponse : tu gagnes si tu choisis comme la majorité.", closest: "Le plus proche gagne au moins 500 pts.", music: "Matt joue en direct. Chaque indice débloqué enlève 150 pts. L'orthographe approximative est acceptée." }[q.type as string];

  return (
    <>
      <QHead s={s} right={<Timer left={left} frac={frac} />} />
      <Visual q={q} zoom={zoom} blur={blur} tag={q.type === "music" ? "Matt · en direct" : undefined} />
      <h2 className="prompt">{q.prompt}</h2>
      {tip && <p className="muted small">{tip}</p>}

      {q.type === "closest" ? (
        <div className="guess">
          <div className="guess-num">{guess}</div>
          <input className="range" type="range" min={q.data.min} max={q.data.max} value={guess} disabled={done} onChange={(e) => setGuess(Number(e.target.value))} aria-label="Ton estimation" />
          <div className="row"><span className="mono muted">{q.data.min}</span>
            <input className="input num-in" type="number" min={q.data.min} max={q.data.max} value={guess} disabled={done} onChange={(e) => setGuess(Number(e.target.value))} aria-label="Ton estimation (nombre)" />
            <button className="btn primary" disabled={done} onClick={() => answer(guess)}>Valider</button><span className="mono muted">{q.data.max}</span></div>
        </div>
      ) : q.type === "music" ? (
        <form className="music-form" onSubmit={(e) => { e.preventDefault(); answer({ ...music, year: Number(music.year) || null }); }}>
          <div className="hints">
            {(q.data.hints ?? []).map((h, i) => <div key={i} className="hint on"><b>Indice {i + 1}</b><span>{h}</span></div>)}
            {!q.data.hints?.length && <div className="hint"><b>Indices</b><span>Ils apparaissent pendant le chrono.</span></div>}
          </div>
          <div className="mgrid">
            <div className="field"><label htmlFor="m-title">Titre</label><input id="m-title" className="input" value={music.title} disabled={done} onChange={(e) => setMusic({ ...music, title: e.target.value })} autoComplete="off" /></div>
            <div className="field"><label htmlFor="m-artist">Artiste ou compositeur</label><input id="m-artist" className="input" value={music.artist} disabled={done} onChange={(e) => setMusic({ ...music, artist: e.target.value })} autoComplete="off" /></div>
            <div className="field"><label htmlFor="m-year">Année (bonus)</label><input id="m-year" className="input" type="number" inputMode="numeric" value={music.year} disabled={done} onChange={(e) => setMusic({ ...music, year: e.target.value })} /></div>
          </div>
          <button className="btn primary" disabled={done}>Envoyer ma réponse</button>
        </form>
      ) : (
        <div className={`tiles${done ? " locked" : ""}`}>
          {(q.data.choices ?? []).map((c, k) => (
            <button key={k} className={`tile t${k}${pick === k ? " picked" : ""}`} disabled={done} onClick={() => { setPick(k); answer(k); }} aria-label={`${SHAPE_NAMES[k]} : ${c}`}>
              <Shape k={k} /><span>{c}</span><span className="k">{k + 1}</span>
            </button>
          ))}
        </div>
      )}

      {done && (
        <div className="lockmsg">
          {answered ? "Réponse verrouillée." : "Temps écoulé!"} En attente des autres…
          <span className="mono">{s.answered.length} / {s.presence.length}</span>
          <span className="row" style={{ gap: 4 }}>{s.answered.map((id) => <Avatar key={id} p={s.players[id]} size="sm" />)}</span>
        </div>
      )}
    </>
  );
}

function RevealView({ s, me, onReact }: { s: PublicState; me: Player; onReact: (e: string) => void }) {
  const r = s.reveal!, q = s.question!;
  const pts = r.points[me.id];
  const didAnswer = pts !== undefined;
  const ok = (pts ?? 0) > 0;
  const title = !didAnswer ? "Trop tard!" : q.type === "majority" ? (ok ? "Tu penses comme la gang!" : "Esprit libre!") : q.type === "closest" ? (r.detail[me.id] === "Dans le mille" ? "Dans le mille!" : ok ? "Pas loin!" : "Matt t'a eu.") : ok ? "Bonne réponse!" : "Oups!";
  const last = s.qIndex === s.qCount - 1;
  return (
    <>
      <QHead s={s} right={<span className="eyebrow">Réponse révélée</span>} />
      <div className="reveal-top">
        <Visual q={q} small tag={q.type === "music" ? "Matt · en direct" : undefined} />
        <div className="verdict-box">
          <h2 className={`verdict${ok ? " ok" : ""}`}>{title}</h2>
          <div className={`gain${(pts ?? 0) < 0 ? " neg" : !pts ? " zero" : ""}`}>{signed(pts ?? 0)} pts</div>
          {didAnswer && <p className="muted">{r.detail[me.id]}</p>}
        </div>
      </div>
      <RevealPanel s={s} meId={me.id} />
      <Reactions onSend={onReact} />
      <p className="muted small next-row">{last ? "Dernière question! Matt va dévoiler le podium." : "Matt lance la prochaine question quand tout le monde a fini de rire."}</p>
    </>
  );
}

function PodiumView({ s, me, onReact }: { s: PublicState; me: Player; onReact: (e: string) => void }) {
  const order = Object.entries(s.totals).sort((a, b) => b[1] - a[1]);
  const mine = order.findIndex(([id]) => id === me.id) + 1;
  const winner = order[0] && s.players[order[0][0]];
  return (
    <div className="podium-screen">
      <p className="eyebrow">Podium du {s.quiz ? frDay(s.quiz.day, { weekday: "long", day: "numeric", month: "long" }) : "jour"}</p>
      <h2 className="display title-lg sun">{winner ? (winner.id === me.id ? "Tu gagnes la journée!" : `${winner.name} gagne la journée!`) : "Fin de la partie"}</h2>
      <Podium s={s} meId={me.id} />
      {mine > 0 && <p className="summary">Toi : <b>{ord(mine)}</b> aujourd'hui avec <b className="mono">{fmt(s.totals[me.id] ?? 0)}</b> pts.</p>}
      <Reactions onSend={onReact} />
      <a className="btn primary" href="#/classement">Voir le classement de la saison</a>
    </div>
  );
}
