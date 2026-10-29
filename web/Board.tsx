import { useEffect, useState } from "react";
import { dayStr, monthOf, type Leaderboard } from "../src/shared";
import { api, auth, fmt, frDay, frMonth, shiftMonth } from "./lib";
import { Avatar } from "./ui";

export function BoardPage() {
  const current = monthOf(dayStr());
  const [month, setMonth] = useState(current);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState("");
  const [meId, setMeId] = useState("");

  useEffect(() => { if (auth.token) api<{ id: string }>("/api/me").then((p) => setMeId(p.id)).catch(() => {}); }, []);
  useEffect(() => {
    setLb(null);
    api<Leaderboard>(`/api/leaderboard?month=${month}`).then(setLb).catch((e) => setErr(e.status === 401 ? "join" : e.message));
  }, [month]);

  if (err === "join") return <div className="card center-card"><h2 className="display title-lg">Rejoins l'équipe d'abord</h2><p className="muted">Le classement est réservé à l'équipe.</p><a className="btn primary" href="#/">Rejoindre</a></div>;
  if (err) return <p className="muted">{err}</p>;

  return (
    <div className="board">
      <div className="card">
        <div className="board-head">
          <div><p className="eyebrow">Saison · remise à zéro le 1er de chaque mois</p><h2 className="display title-lg sun">{frMonth(month)}</h2></div>
          <div className="row">
            <button className="btn sm" onClick={() => setMonth(shiftMonth(month, -1))}>Mois précédent</button>
            <button className="btn sm" disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))}>Mois suivant</button>
          </div>
        </div>
        {!lb ? <p className="muted">Chargement…</p> : !lb.standings.length ? (
          <div className="empty"><p className="eyebrow">Saison vierge</p><p>Aucune partie jouée ce mois-ci. Le premier standup donne le ton!</p></div>
        ) : (
          <div className="rank">
            {lb.standings.map((s) => {
              const mv = s.prevRank == null ? 0 : s.prevRank - s.rank;
              const meta = [`🔥 ${s.streak} de suite`, `${s.played} partie${s.played > 1 ? "s" : ""}`];
              if (s.lastGame) meta.push(`+${fmt(s.lastGame)} au dernier quiz`);
              if (s.rank === 1) meta.push("porte la couronne 👑");
              return (
                <div key={s.player.id} className={`rrow${s.player.id === meId ? " me" : ""}`}>
                  <span className="rn">{s.rank}</span>
                  <Avatar p={s.player} />
                  <span className="nm">{s.player.name}<span className="meta">{meta.join(" · ")}</span></span>
                  <span className={`mv ${mv > 0 ? "up" : mv < 0 ? "down" : "muted"}`}>{mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : "–"}</span>
                  <span className="tot">{fmt(s.points)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="col">
        {lb?.lastPodium && lb.lastPodium.entries.length > 0 && (
          <div className="card"><h3>Dernier podium <span className="pill">{frDay(lb.lastPodium.day, { weekday: "short", day: "numeric", month: "short" })}</span></h3>
            <div className="hall">{lb.lastPodium.entries.map((e, i) => <div key={e.player.id}><span className="row" style={{ gap: 8 }}><b className="mono">{i + 1}</b><Avatar p={e.player} size="sm" />{e.player.name}</span><span className="mono">{fmt(e.points)}</span></div>)}</div>
          </div>
        )}
        <div className="card"><h3>Matt contre l'équipe</h3>
          <div className="vs">
            <div><div className="n matt-n">{lb?.mattVsTeam.matt ?? 0}</div><div className="lbl">Matt</div></div>
            <span className="muted">vs</span>
            <div><div className="n">{lb?.mattVsTeam.team ?? 0}</div><div className="lbl">L'équipe</div></div>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>Matt marque un point chaque fois que personne ne trouve la bonne réponse.</p>
        </div>
        <div className="card"><h3>Temple de la renommée</h3>
          {lb?.hall.length ? (
            <div className="hall">{lb.hall.map((h) => <div key={h.month}><span>{frMonth(h.month)}</span><span className="row" style={{ gap: 6 }}><Avatar p={h.player} size="sm" />{h.player.name}</span></div>)}</div>
          ) : <p className="muted small" style={{ marginTop: 8 }}>Le premier champion du mois y entrera à la fin de la saison.</p>}
        </div>
      </div>
    </div>
  );
}
