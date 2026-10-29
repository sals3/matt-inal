import { useCallback, useEffect, useState } from "react";
import type { Player, Season } from "../src/shared";
import { api, refreshStickers, toast, uploadImage, useStickers } from "./lib";
import { AdminGate, Avatar, Cup } from "./ui";

export function TeamPage() {
  return <AdminGate><Team /></AdminGate>;
}

function Team() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const load = useCallback(() => {
    api<Player[]>("/api/players").then(setPlayers).catch((e) => toast(e.message));
    api<Season[]>("/api/seasons").then(setSeasons).catch((e) => toast(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="team">
      <div className="col">
        <div className="card">
          <h3>Les caricatures de l'équipe</h3>
          <p className="muted small" style={{ marginTop: 6 }}>Téléverse la caricature de chacun. Les PNG détourés rendent super bien. Chaque joueur peut aussi changer la sienne dans son profil.</p>
          <div className="roster">
            {players.map((p) => <RosterCard key={p.id} p={p} onSaved={load} />)}
            {!players.length && <p className="muted small">Personne ne s'est encore inscrit. Partage le lien et le code d'équipe dans Teams!</p>}
          </div>
        </div>
        <StickerAdmin />
      </div>
      <div className="col">
        <div className="card cup-card">
          <h3>La Coupe</h3>
          <Cup seasons={seasons.filter((s) => s.status !== "open")} current={seasons.find((s) => s.status === "open")} />
        </div>
        <SeasonAdmin seasons={seasons} players={players} onChange={load} />
      </div>
    </div>
  );
}

function RosterCard({ p, onSaved }: { p: Player; onSaved: () => void }) {
  const [name, setName] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<Player>) => {
    setBusy(true);
    try { await api(`/api/players/${p.id}`, { method: "PATCH", body: { ...p, name, ...patch } }); onSaved(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  const upload = async (f: File) => {
    setBusy(true);
    try { await save({ avatarId: await uploadImage(f, 512, true) }); toast(`Caricature de ${p.name} ajoutée`); }
    catch (e) { toast((e as Error).message); setBusy(false); }
  };
  return (
    <div className="roster-card">
      <Avatar p={p} size="xl" />
      <input className="input" aria-label={`Nom de ${p.name}`} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== p.name && void save({})} />
      <div className="row">
        <label className="btn sm">{busy ? "…" : p.avatarId ? "Changer" : "Caricature"}<input type="file" accept="image/png,image/webp,image/jpeg,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} /></label>
        {p.avatarId && <button className="btn sm ghost" onClick={() => save({ avatarId: null })}>Emoji</button>}
      </div>
    </div>
  );
}

function SeasonAdmin({ seasons, players, onChange }: { seasons: Season[]; players: Player[]; onChange: () => void }) {
  const open = seasons.find((s) => s.status === "open");
  const [confirming, setConfirming] = useState(false);
  const close = async () => {
    try { await api("/api/seasons/close", { method: "POST" }); setConfirming(false); onChange(); }
    catch (e) { toast((e as Error).message); }
  };
  const addLegacy = async () => {
    const num = Math.max(0, ...seasons.filter((s) => s.status === "legacy").map((s) => s.num)) + 1;
    try { await api("/api/seasons", { body: { num, name: `Saison ${num}`, championName: "" } }); onChange(); }
    catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="card">
      <h3>Saisons et gravure</h3>
      <p className="muted small" style={{ marginTop: 6 }}>Inscris les champions des saisons jouées avant l'app. Relie-les à un joueur pour afficher sa photo sur la plaque. Le dernier champion gravé porte l'anneau doré.</p>
      <div className="season-list">
        {seasons.map((s) => <SeasonRow key={s.id} s={s} players={players} onChange={onChange} />)}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={addLegacy}>+ Ancienne saison</button>
      </div>
      {open && (
        <div className="close-season">
          <p><b>{open.name}</b> est en cours. Quand tu la termines, le premier du classement est gravé sur la Coupe, reçoit l'anneau de champion, et la saison suivante commence demain.</p>
          {confirming ? (
            <div className="row"><span className="small">Sûr? Ça ne s'annule pas.</span><button className="btn primary sm" onClick={close}>Oui, graver le champion</button><button className="btn ghost sm" onClick={() => setConfirming(false)}>Annuler</button></div>
          ) : <button className="btn primary sm" onClick={() => setConfirming(true)}>Terminer {open.name}</button>}
        </div>
      )}
    </div>
  );
}

function SeasonRow({ s, players, onChange }: { s: Season; players: Player[]; onChange: () => void }) {
  const [d, setD] = useState({ name: s.name, num: String(s.num), championName: s.championName, championId: s.championId ?? "", championPoints: s.championPoints?.toString() ?? "" });
  const dirty = d.name !== s.name || d.num !== String(s.num) || d.championName !== s.championName || d.championId !== (s.championId ?? "") || d.championPoints !== (s.championPoints?.toString() ?? "");
  const save = async () => {
    try { await api(`/api/seasons/${s.id}`, { method: "PATCH", body: { ...d, championId: d.championId || null, startDay: s.startDay } }); onChange(); toast(`${d.name} enregistrée`); }
    catch (e) { toast((e as Error).message); }
  };
  const remove = async () => {
    try { await api(`/api/seasons/${s.id}`, { method: "DELETE" }); onChange(); } catch (e) { toast((e as Error).message); }
  };
  const pickPlayer = (id: string) => {
    const p = players.find((x) => x.id === id);
    setD({ ...d, championId: id, championName: p ? p.name : d.championName });
  };
  return (
    <div className={`season-row ${s.status}`}>
      <div className="season-top">
        <input className="input num" type="number" aria-label="Numéro" value={d.num} onChange={(e) => setD({ ...d, num: e.target.value })} />
        <input className="input" aria-label="Nom de la saison" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <span className={`pill${s.status === "open" ? " good" : ""}`}>{s.status === "open" ? "En cours" : s.status === "closed" ? "Terminée" : "Avant l'app"}</span>
      </div>
      {s.status !== "open" && (
        <div className="season-champ">
          <input className="input" placeholder="Nom gravé sur la Coupe" aria-label="Champion" value={d.championName} onChange={(e) => setD({ ...d, championName: e.target.value })} />
          <select className="input" aria-label="Relier à un joueur" value={d.championId} onChange={(e) => pickPlayer(e.target.value)}>
            <option value="">Relier à un joueur…</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="input pts" type="number" placeholder="Points" aria-label="Points du champion" value={d.championPoints} onChange={(e) => setD({ ...d, championPoints: e.target.value })} />
        </div>
      )}
      {(dirty || s.status === "legacy") && (
        <div className="row">
          {dirty && <button className="btn sm primary" onClick={save}>Graver</button>}
          {s.status === "legacy" && <button className="btn sm ghost" onClick={remove}>Retirer</button>}
        </div>
      )}
    </div>
  );
}

function StickerAdmin() {
  const stickers = useStickers();
  const [busy, setBusy] = useState(false);
  const add = async (f: File) => {
    setBusy(true);
    try { await api("/api/stickers", { body: { mediaId: await uploadImage(f, 400, true), name: f.name.replace(/\.[^.]+$/, "").slice(0, 30) } }); await refreshStickers(); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await api(`/api/stickers/${id}`, { method: "DELETE" }); await refreshStickers(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="card">
      <h3>Stickers de l'équipe <span className="pill">{stickers.length}</span></h3>
      <p className="muted small" style={{ marginTop: 6 }}>Tout le monde peut en ajouter depuis le jeu. Ici, tu fais le ménage si un sticker dépasse les bornes.</p>
      <div className="sticker-grid admin">
        {stickers.map((s) => (
          <div key={s.id} className="sticker-admin"><img src={`/media/${s.mediaId}`} alt={s.name} /><span className="small">{s.name}</span><button className="btn sm ghost" onClick={() => remove(s.id)}>Retirer</button></div>
        ))}
        <label className={`sticker add${busy ? " busy" : ""}`} title="Ajouter un sticker">{busy ? "…" : "+"}<input type="file" accept="image/png,image/webp,image/gif,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(f); e.target.value = ""; }} /></label>
      </div>
    </div>
  );
}
