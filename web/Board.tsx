import { useEffect, useState } from "react";
import type { Leaderboard } from "../src/shared";
import { api, auth, fmt, frDay } from "./lib";
import { Avatar, Cup } from "./ui";

export function BoardPage() {
  const [seasonId, setSeasonId] = useState("");
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState("");
  const [meId, setMeId] = useState("");

  useEffect(() => { if (auth.token) api<{ id: string }>("/api/me").then((p) => setMeId(p.id)).catch(() => {}); }, []);
  useEffect(() => {
    api<Leaderboard>(`/api/leaderboard${seasonId ? `?season=${seasonId}` : ""}`).then(setLb).catch((e) => setErr(e.status === 401 ? "join" : e.message));
  }, [seasonId]);

  if (err === "join") return <div className="card center-card"><h2 className="display title-lg">Rejoins l'équipe d'abord</h2><p className="muted">Le classement est réservé à l'équipe.</p><a className="btn primary" href="#/">Rejoindre</a></div>;
  if (err) return <p className="muted">{err}</p>;
  if (!lb) return <div className="loading">Chargement…</div>;

  const s = lb.season;
  const open = lb.seasons.find((x) => x.status === "open");
  const since = s.startDay ? frDay(s.startDay, { day: "numeric", month: "long" }) : null;

  return (
    <div className="board">
      <div className="card">
        <div className="board-head">
          <div>
            <p className="eyebrow">{s.status === "open" ? `En cours${since ? ` depuis le ${since}` : ""}` : `Terminée${s.endDay ? ` le ${frDay(s.endDay, { day: "numeric", month: "long", year: "numeric" })}` : ""}`} · {lb.games} partie{lb.games > 1 ? "s" : ""}</p>
            <h2 className="display title-lg sun">{s.name}</h2>
          </div>
          {lb.seasons.length > 1 && (
            <div className="field"><label htmlFor="season-pick">Saison</label>
              <select id="season-pick" className="input" value={s.id} onChange={(e) => setSeasonId(e.target.value)}>
                {lb.seasons.map((x) => <option key={x.id} value={x.id}>{x.name}{x.status === "open" ? " (en cours)" : ""}</option>)}
              </select></div>
          )}
        </div>
        {s.status === "closed" && s.championName && <p className="champ-banner">🏆 Champion de la saison : <b>{s.championName}</b></p>}
        {!lb.standings.length ? (
          <div className="empty"><p className="eyebrow">Saison vierge</p><p>Aucune partie jouée pour l'instant. Le premier standup donne le ton!</p></div>
        ) : (
          <div className="rank">
            {lb.standings.map((st) => {
              const mv = st.prevRank == null ? 0 : st.prevRank - st.rank;
              const meta = [`🔥 ${st.streak} de suite`, `${st.played} partie${st.played > 1 ? "s" : ""}`];
              if (st.brainPct !== null) meta.push(`🧠 ${st.brainPct} % cerveau`);
              if (st.lastGame) meta.push(`+${fmt(st.lastGame)} au dernier quiz`);
              return (
                <div key={st.player.id} className={`rrow${st.player.id === meId ? " me" : ""}`}>
                  <span className="rn">{st.rank}</span>
                  <Avatar p={st.player} />
                  <span className="nm">{st.player.name}{st.player.champ && <span className="champ-tag">👑 Champion en titre</span>}<span className="meta">{meta.join(" · ")}</span></span>
                  <span className={`mv ${mv > 0 ? "up" : mv < 0 ? "down" : "muted"}`}>{mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : "–"}</span>
                  <span className="tot">{fmt(st.points)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 12 }}>🧠 % cerveau : la part des réponses données sans quitter l'onglet. L'IA est permise, mais elle coûte le bonus vitesse et la prime cerveau.</p>
      </div>

      <div className="col">
        <div className="card cup-card">
          <h3>La Coupe du Matt'inal</h3>
          <Cup seasons={lb.cup} current={open} />
        </div>
        {lb.lastPodium && lb.lastPodium.entries.length > 0 && (
          <div className="card"><h3>Dernier podium <span className="pill">{frDay(lb.lastPodium.day, { weekday: "short", day: "numeric", month: "short" })}</span></h3>
            <div className="hall">{lb.lastPodium.entries.map((e, i) => <div key={e.player.id}><span className="row" style={{ gap: 8 }}><b className="mono">{i + 1}</b><Avatar p={e.player} size="sm" />{e.player.name}</span><span className="mono">{fmt(e.points)}</span></div>)}</div>
          </div>
        )}
        <div className="card"><h3>Matt contre l'équipe</h3>
          <div className="vs">
            <div><div className="n matt-n">{lb.mattVsTeam.matt}</div><div className="lbl">Matt</div></div>
            <span className="muted">vs</span>
            <div><div className="n">{lb.mattVsTeam.team}</div><div className="lbl">L'équipe</div></div>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>Matt marque un point chaque fois que personne ne trouve la bonne réponse.</p>
        </div>
      </div>
    </div>
  );
}
