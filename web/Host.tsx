import { useEffect, useRef, useState } from "react";
import { dayStr, type Player, type QuizSummary } from "../src/shared";
import { api, confetti, frDay, sfx, toast, useCountdown, useGame } from "./lib";
import { AdminGate, Avatar, FloatingReactions, Podium, QHead, RevealPanel, Shape, Timer, Visual } from "./ui";

export function HostPage() {
  return <AdminGate><Host /></AdminGate>;
}

function Host() {
  const g = useGame("host");
  const s = g.state;
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [quizId, setQuizId] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [bonusFor, setBonusFor] = useState("");
  const prevPhase = useRef("");
  const today = dayStr();

  useEffect(() => {
    const from = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
    api<QuizSummary[]>(`/api/quizzes?from=${from}`).then((list) => {
      const usable = list.filter((q) => q.count > 0);
      setQuizzes(usable);
      const pick = usable.find((q) => q.day === today) ?? usable.find((q) => q.day >= today && q.status === "ready") ?? usable.at(-1);
      if (pick) setQuizId(pick.id);
    }).catch((e) => toast(e.message));
    api<Player[]>("/api/players").then((p) => { setPlayers(p); setBonusFor(p[0]?.id ?? ""); }).catch(() => {});
  }, [today]);

  useEffect(() => {
    if (!s || s.phase === prevPhase.current) return;
    prevPhase.current = s.phase;
    if (s.phase === "reveal") sfx(s.reveal?.nobody ? "bad" : "good");
    if (s.phase === "podium") { sfx("fanfare"); confetti(180); }
    if (s.phase === "question") sfx("count");
  }, [s]);

  const host = (action: "open" | "next" | "reveal" | "close", extra: { quizId?: string } = {}) => g.send({ t: "host", action, ...extra });
  const bonus = async () => {
    try { await api("/api/bonus", { body: { playerId: bonusFor, points: 100, reason: "parce que c'était drôle" } }); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="host">
      <div className="host-bar card">
        <div className="row grow">
          <span className="pill">{g.connected ? "En direct" : "Reconnexion…"}</span>
          {s?.phase === "idle" || !s ? (
            <>
              <label className="sr" htmlFor="quiz-pick">Quiz à jouer</label>
              <select id="quiz-pick" className="input" value={quizId} onChange={(e) => setQuizId(e.target.value)}>
                {!quizzes.length && <option value="">Aucun quiz prêt</option>}
                {quizzes.map((q) => <option key={q.id} value={q.id}>{frDay(q.day, { weekday: "short", day: "numeric", month: "short" })} · {q.theme || "Quiz"} · {q.count} q.{q.status === "played" ? " · déjà joué" : ""}</option>)}
              </select>
              <button className="btn primary" disabled={!quizId} onClick={() => host("open", { quizId })}>Ouvrir la partie</button>
              <a className="btn ghost" href="#/matt">Préparer un quiz</a>
            </>
          ) : (
            <>
              {s.phase === "lobby" && <button className="btn primary" onClick={() => host("next")}>Lancer la question 1</button>}
              {s.phase === "question" && <button className="btn primary" onClick={() => host("reveal")}>Révéler maintenant ({s.answered.length}/{s.presence.length})</button>}
              {s.phase === "reveal" && <button className="btn primary" onClick={() => host("next")}>{s.qIndex + 1 < s.qCount ? `Question ${s.qIndex + 2}` : "Voir le podium"}</button>}
              <button className="btn ghost" onClick={() => host("close")}>{s.phase === "podium" ? "Terminer" : "Fermer la partie"}</button>
            </>
          )}
        </div>
        <div className="row">
          <label className="sr" htmlFor="bonus-who">Bonus arbitraire</label>
          <select id="bonus-who" className="input" value={bonusFor} onChange={(e) => setBonusFor(e.target.value)}>
            {players.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>
          <button className="btn sm" disabled={!bonusFor} onClick={bonus}>+100, c'était drôle</button>
        </div>
      </div>

      <div className={`screen stage${s?.question?.type === "music" && (s.phase === "question" || s.phase === "reveal") ? " music" : ""}`}>
        {!s || s.phase === "idle" ? <IdleScreen />
          : s.phase === "lobby" ? <LobbyScreen s={s} />
          : s.phase === "question" ? <QuestionScreen s={s} offset={g.offset} />
          : s.phase === "reveal" ? (
            <>
              <QHead s={s} right={<span className="eyebrow">Réponse révélée</span>} />
              <div className="reveal-top"><Visual q={s.question!} small /><h2 className="prompt">{s.question!.prompt}</h2></div>
              <RevealPanel s={s} />
            </>
          )
          : (
            <div className="podium-screen">
              <p className="eyebrow">Podium du {s.quiz ? frDay(s.quiz.day) : "jour"}</p>
              <h2 className="display title-xl sun">Le podium du Matt'inal</h2>
              <Podium s={s} />
            </div>
          )}
      </div>
      <FloatingReactions onReact={g.onReact} players={s?.players ?? {}} />
    </div>
  );
}

function IdleScreen() {
  return (
    <div className="lobby">
      <p className="eyebrow">Le quiz du standup</p>
      <h1 className="display title-xl sun">Le Matt'inal</h1>
      <p className="muted">Choisis un quiz en haut, puis ouvre la partie. Partage cet onglet dans Teams pour la grosse révélation.</p>
    </div>
  );
}

function LobbyScreen({ s }: { s: NonNullable<ReturnType<typeof useGame>["state"]> }) {
  return (
    <div className="lobby">
      <p className="eyebrow">{s.quiz ? frDay(s.quiz.day) : ""} · {s.quiz?.theme || "Quiz du matin"}</p>
      <h2 className="display title-xl">Rejoins la partie</h2>
      <p className="join-url mono">{location.host}</p>
      <p className="muted">Ouvre le lien sur ton cell ou ton laptop. {s.qCount} question{s.qCount > 1 ? "s" : ""} ce matin.</p>
      <div className="lobby-avs">{s.presence.map((p) => <div key={p.id} className="lobby-av"><Avatar p={p} size="xl" /><span>{p.name}</span></div>)}</div>
      <p className="muted mono">{s.presence.length} connecté{s.presence.length > 1 ? "s" : ""}</p>
    </div>
  );
}

function QuestionScreen({ s, offset }: { s: NonNullable<ReturnType<typeof useGame>["state"]>; offset: { current: number } }) {
  const q = s.question!;
  const { left, frac } = useCountdown(s, offset);
  return (
    <>
      <QHead s={s} right={<Timer left={left} frac={frac} />} />
      <Visual q={q} zoom={q.type === "zoom" ? 1 + 6 * frac : 1} blur={q.type === "zoom" ? 7 * frac : 0} tag={q.type === "music" ? "Matt · en direct" : undefined} />
      <h2 className="prompt big-prompt">{q.prompt}</h2>
      {q.type === "music" ? (
        <div className="hints">
          {[0, 1, 2].map((i) => q.data.hints?.[i]
            ? <div key={i} className="hint on"><b>Indice {i + 1}</b><span>{q.data.hints[i]}</span></div>
            : <div key={i} className="hint"><b>Indice {i + 1}</b><span>Bientôt…</span></div>)}
        </div>
      ) : q.type === "closest" ? (
        <p className="lede">Entre {q.data.min} et {q.data.max}. Le plus proche gagne.</p>
      ) : (
        <div className="tiles static">{(q.data.choices ?? []).map((c, k) => <div key={k} className={`tile t${k}`}><Shape k={k} /><span>{c}</span></div>)}</div>
      )}
      {q.type === "music" && q.data.mode === "rec" && q.data.audioId && <audio className="audio" controls src={`/media/${q.data.audioId}`} />}
      <div className="answered">
        <span className="muted small">{s.answered.length} / {s.presence.length} ont répondu</span>
        <span className="row" style={{ gap: 6 }}>{s.answered.map((id) => <Avatar key={id} p={s.players[id]} size="sm" />)}</span>
      </div>
    </>
  );
}
