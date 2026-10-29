// Partie complète de bout en bout contre un serveur LOCAL : Matt + 3 joueurs robots,
// stickers, sortie d'onglet, gravure de la Coupe. Ne jamais lancer contre la production
// (le test termine la saison en cours).
// Usage : ADMIN_PIN=… TEAM_CODE=MATIN bun scripts/smoke.ts   (base de données vierge recommandée)
import type { Performance, Player, PowerInventory, PublicState, Season, ServerMsg, Submission, WeekDistribution, WeekTrophies } from "../src/shared";
import { addDays, dayStr } from "../src/shared";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PIN = process.env.ADMIN_PIN ?? "1234";
const TEAM = process.env.TEAM_CODE ?? "MATIN";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) { console.error("Ce test termine la saison : seulement contre un serveur local."); process.exit(1); }

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}
const assert = (ok: unknown, msg: string) => { if (!ok) { console.error("❌", msg); process.exit(1); } console.log("✓", msg); };

function client(query: string) {
  const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws?${query}`);
  let last: PublicState | null = null;
  const reacts: Extract<ServerMsg, { t: "react" }>[] = [];
  const powers: Extract<ServerMsg, { t: "power" }>[] = [];
  const errors: string[] = [];
  const waiters: { pred: (s: PublicState) => boolean; resolve: (s: PublicState) => void }[] = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as ServerMsg;
    if (m.t === "error") errors.push(m.msg);
    if (m.t === "react") reacts.push(m);
    if (m.t === "power") powers.push(m);
    if (m.t !== "state") return;
    last = m.s;
    for (const w of [...waiters]) if (w.pred(m.s)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m.s); }
  };
  const until = (pred: (s: PublicState) => boolean, ms = 8000) =>
    new Promise<PublicState>((resolve, reject) => {
      if (last && pred(last)) return resolve(last);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error("délai dépassé")), ms);
    });
  const open = new Promise((r) => (ws.onopen = r));
  return { ws, until, open, reacts, powers, errors, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

const admin = (await call<{ token: string }>("/api/admin/login", { method: "POST", json: { pin: PIN } })).token;
const A = { "x-admin": admin };

const seasons0 = await call<Season[]>("/api/seasons", { headers: A });
assert(seasons0.filter((s) => s.status === "legacy").length === 2 && seasons0.some((s) => s.status === "open" && s.num === 3), "les saisons 1 et 2 attendent leur gravure, la saison 3 est ouverte");

const quiz = await call<{ id: string; questions: { id: string }[] }>(`/api/quizzes/${dayStr()}`, {
  method: "PUT", headers: A, json: {
    theme: "Test de fumée", status: "ready", questions: [
      { type: "zoom", prompt: "C'est quoi?", emoji: "🍩", timeLimit: 15, data: { choices: ["Beigne", "Bagel", "Bouée", "Pneu"], correct: 0 } },
      { type: "closest", prompt: "Combien de cafés?", emoji: "☕", timeLimit: 15, data: { answer: 3, min: 0, max: 8 } },
      { type: "music", prompt: "Devine la toune", timeLimit: 30, data: { title: "Ode à la joie", artist: "Beethoven", year: 1824, hints: ["Allemand", "Europe", "Neuvième"], strict: true } },
    ],
  },
});
assert(quiz.questions.length === 3, "Matt enregistre un quiz de 3 questions");

const names = ["Robot Julie", "Robot Kevin", "Robot Émilie"];
const bots: (ReturnType<typeof client> & { id: string; token: string })[] = [];
for (const name of names) {
  const r = await call<{ token: string; player: { id: string } }>("/api/join", { method: "POST", json: { teamCode: TEAM, name, emoji: "🤖", color: "#4655C8" } });
  bots.push({ ...client(`token=${r.token}`), id: r.player.id, token: r.token });
}
const [julie, kevin, emilie] = bots as [typeof bots[0], typeof bots[0], typeof bots[0]];
const P = (b: typeof julie) => ({ authorization: `Bearer ${b.token}` });

// Code de récupération : on se reconnecte sur un « autre appareil ».
const { code } = await call<{ code: string }>("/api/me/recovery", { headers: P(kevin) });
const back = await call<{ player: Player; token: string }>("/api/recover", { method: "POST", json: { code: code.toUpperCase().replaceAll("-", " ") } });
assert(back.player.id === kevin.id && back.token === kevin.token, `code de récupération (${code.split("-").length} morceaux) : Kevin retrouve son compte`);

// Caricature et sticker téléversés par un joueur (un PNG 1×1).
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const media = await call<{ id: string }>("/api/media", { method: "POST", headers: { authorization: `Bearer ${kevin.token}`, "content-type": "image/png" }, body: png });
const me = await call<Player>("/api/me", { method: "PATCH", headers: { authorization: `Bearer ${kevin.token}` }, json: { name: "Robot Kevin", emoji: "🤖", color: "#4655C8", avatarId: media.id } });
assert(me.avatarId === media.id, "un joueur téléverse sa caricature");
const sticker = await call<{ id: string }>("/api/stickers", { method: "POST", headers: { authorization: `Bearer ${kevin.token}` }, json: { mediaId: media.id, name: "Face de Matt" } });

const host = client(`admin=${admin}`);
await Promise.all([host.open, ...bots.map((b) => b.open)]);
await host.until((s) => s.presence.length >= 3);
kevin.send({ t: "react", sticker: sticker.id, target: julie.id });
await Bun.sleep(300);
assert(host.reacts.some((r) => r.sticker === sticker.id && r.target === julie.id && r.playerId === kevin.id), "Kevin lance un sticker sur Julie, tout le monde le voit");

host.send({ t: "host", action: "open", quizId: quiz.id });
await host.until((s) => s.phase === "lobby");

// Q1 : zoom.
host.send({ t: "host", action: "next" });
let s = await julie.until((x) => x.phase === "question" && x.qIndex === 0);
assert(s.question?.data.correct === undefined, "la bonne réponse n'est pas envoyée aux joueurs avant la révélation");
julie.send({ t: "answer", qid: s.question!.id, value: 0 });
kevin.send({ t: "answer", qid: s.question!.id, value: 3 });
emilie.send({ t: "answer", qid: s.question!.id, value: 0 });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 0);
assert(s.reveal!.points[julie.id]! > 1100 && s.reveal!.points[kevin.id] === 0, "révélation automatique, bonne réponse + vitesse + prime cerveau");

// Q2 : Émilie quitte l'onglet avant de répondre.
host.send({ t: "host", action: "next" });
s = await emilie.until((x) => x.phase === "question" && x.qIndex === 1);
emilie.send({ t: "away" });
await host.until((x) => x.away.includes(emilie.id));
julie.send({ t: "answer", qid: s.question!.id, value: 5 });
kevin.send({ t: "answer", qid: s.question!.id, value: 3 });
emilie.send({ t: "answer", qid: s.question!.id, value: 2 });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 1);
assert(s.reveal!.away.includes(emilie.id) && s.reveal!.points[emilie.id] === 600, "🤖 sortie d'onglet : pas de bonus vitesse ni de prime cerveau (600 pts)");
assert(s.reveal!.points[kevin.id]! >= 1100, "le plus proche : réponse exacte récompensée");

// Q3 : Mercredi musical en mode cerveau strict.
host.send({ t: "host", action: "next" });
s = await julie.until((x) => x.phase === "question" && x.qIndex === 2);
assert(s.question!.data.title === undefined && s.question!.data.strict === true, "le titre est caché, le mode strict est annoncé");
julie.send({ t: "away" });
await host.until((x) => x.away.includes(julie.id));
julie.send({ t: "answer", qid: s.question!.id, value: { title: "Ode à la joie", artist: "Beethoven", year: 1824 } });
emilie.send({ t: "answer", qid: s.question!.id, value: { title: "ode a la joi", artist: "bethoven", year: 1820 } });
await host.until((x) => x.answered.length === 2);
host.send({ t: "host", action: "reveal" });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 2);
assert(s.reveal!.points[emilie.id] === 1300, "orthographe approximative acceptée + prime cerveau (1 300 pts)");
assert(s.reveal!.points[julie.id] === 0, "mode cerveau strict : Julie a quitté l'onglet, 0 point");

host.send({ t: "host", action: "next" });
s = await host.until((x) => x.phase === "podium");
console.log("   Podium :", Object.entries(s.totals).map(([id, p]) => `${s.players[id]?.name} ${p}`).join(" · "));
assert(Object.entries(s.totals).sort((a, b) => b[1] - a[1])[0]![0] === emilie.id, "Robot Émilie gagne la journée");
host.send({ t: "host", action: "close" });
await host.until((x) => x.phase === "idle");

// ---------- Deuxième partie : power-ups, question de l'équipe, applaudimètre ----------
const dist = await call<WeekDistribution>("/api/powers/redistribute", { method: "POST", headers: A });
const tierOf = (id: string) => dist.rows.find((r) => r.player.id === id)?.tier;
assert(tierOf(emilie.id) === "crown" && tierOf(kevin.id) === "last" && tierOf(julie.id) === "middle", "boîtes à items : couronne pour Émilie (1re), carapace pour Kevin (dernier)");
const invK = await call<PowerInventory>("/api/powers", { headers: P(kevin) });
assert(["fifty", "freeze", "double", "shell"].every((k) => invK.items.some((i) => i.kind === k && i.left === 1)), "Kevin reçoit 50/50, Gel, Double ou rien et la carapace bleue");

await call("/api/submissions", { method: "POST", headers: P(julie), json: { question: { type: "mc", prompt: "Capitale de l'Australie?", emoji: "🦘", data: { choices: ["Sydney", "Canberra", "Melbourne", "Perth"], correct: 1 } } } });
const inbox = await call<Submission[]>("/api/submissions", { headers: A });
assert(inbox.length === 1 && inbox[0]!.player.id === julie.id, "Matt reçoit la question de Julie dans sa boîte");
const accepted = await call<Submission>(`/api/submissions/${inbox[0]!.id}`, { method: "PATCH", headers: A, json: { status: "accepted" } });
const day2 = addDays(dayStr(), 1);
const quiz2 = await call<{ id: string }>(`/api/quizzes/${day2}`, {
  method: "PUT", headers: A, json: {
    theme: "Power-ups", status: "ready", questions: [
      { ...accepted.question, id: "", authorId: julie.id },
      { type: "mc", prompt: "Combien de pattes a une araignée?", emoji: "🕷️", timeLimit: 15, data: { choices: ["6", "8", "10", "12"], correct: 1 } },
      { type: "music", prompt: "Devine la toune", timeLimit: 20, data: { title: "Alouette", artist: "Traditionnel", hints: [] } },
    ],
  },
});
host.send({ t: "host", action: "open", quizId: quiz2.id });
await host.until((x) => x.phase === "lobby" && x.crownId === emilie.id);

// Q1 : la question de Julie. Elle ne peut pas répondre ; Kevin joue Double ou rien et se trompe.
host.send({ t: "host", action: "next" });
s = await kevin.until((x) => x.phase === "question" && x.qIndex === 0);
assert(s.question!.authorId === julie.id, "la question est signée Julie");
julie.send({ t: "answer", qid: s.question!.id, value: 1 });
kevin.send({ t: "power", kind: "double" });
await host.until((x) => x.powers[kevin.id] === "double");
kevin.send({ t: "power", kind: "shell" });
await Bun.sleep(200);
assert(julie.errors.some((e) => e.includes("ta question")) && kevin.errors.some((e) => e.includes("Un seul power-up")), "Julie ne peut pas répondre à sa question ; un seul power-up par question");
kevin.send({ t: "answer", qid: s.question!.id, value: 0 });
emilie.send({ t: "answer", qid: s.question!.id, value: 1 });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 0);
assert(s.reveal!.points[kevin.id] === -300, "🍄 Double ou rien… rien : Kevin perd 300");
assert(s.reveal!.author?.id === julie.id && s.reveal!.author.bonus === 300, "question bien dosée (50 %) : Julie gagne 300");
const e1 = s.reveal!.points[emilie.id]!;
assert(e1 > 1100 && e1 <= 1200, `👑 couronne lourde : bonus vitesse d'Émilie divisé par deux (${e1})`);

// Q2 : carapace bleue sur Émilie, 50/50 pour Julie.
host.send({ t: "host", action: "next" });
s = await julie.until((x) => x.phase === "question" && x.qIndex === 1);
kevin.send({ t: "power", kind: "shell" });
s = await host.until((x) => x.shell?.to === emilie.id);
assert(s.shell?.from === kevin.id, "💙 Kevin lance la carapace bleue sur Émilie (1re)");
julie.send({ t: "power", kind: "fifty" });
await Bun.sleep(200);
const removed = julie.powers.find((p) => p.kind === "fifty")?.removed ?? [];
assert(removed.length === 2 && !removed.includes(1), "🎯 50/50 : deux mauvaises réponses retirées, en privé pour Julie");
for (const b of bots) b.send({ t: "answer", qid: s.question!.id, value: 1 });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 1);
assert(s.reveal!.points[emilie.id] === 1100, "Émilie touchée : plus de bonus vitesse (1 100)");

// Q3 : Mercredi musical et applaudimètre.
host.send({ t: "host", action: "next" });
s = await julie.until((x) => x.phase === "question" && x.qIndex === 2);
for (const b of bots) b.send({ t: "answer", qid: s.question!.id, value: { title: "alouette", artist: "", year: null } });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 2);
kevin.send({ t: "rate", stars: 5 });
julie.send({ t: "rate", stars: 4 });
s = await host.until((x) => x.applause?.count === 2);
assert(s.applause!.avg === 4.5, "applaudimètre : 4,5 ★ pour Matt");
host.send({ t: "host", action: "next" });
await host.until((x) => x.phase === "podium");
host.send({ t: "host", action: "close" });
await host.until((x) => x.phase === "idle");

const palm = await call<Performance[]>("/api/palmares", { headers: A });
assert(palm[0]?.title === "Alouette" && palm[0].avg === 4.5, "la performance entre au palmarès de Matt");
const tro = await call<{ current: WeekTrophies }>("/api/trophies", { headers: A });
console.log("   Trophées :", tro.current.trophies.map((t) => `${t.emoji} ${t.name} → ${t.winners.map((w) => w.name).join(", ")}`).join(" · "));
assert(tro.current.trophies.some((t) => t.id === "saboteur" && t.winners[0]?.id === kevin.id), "trophées de la semaine : Kevin est Le Saboteur");
const used = (await call<WeekDistribution>("/api/powers/week", { headers: A })).rows.find((r) => r.player.id === kevin.id)!.used;
assert(used.includes("double") && used.includes("shell"), "les items utilisés sont barrés dans la distribution");

// Coupe : Matt grave la saison 2, puis termine la saison 3.
const s2 = seasons0.find((x) => x.num === 2)!;
await call(`/api/seasons/${s2.id}`, { method: "PATCH", headers: A, json: { num: 2, name: "Saison 2", championName: "Robot Julie", championId: julie.id, championPoints: 42000 } });
let players = await call<Player[]>("/api/players", { headers: A });
assert(players.find((p) => p.id === julie.id)?.champ, "Julie, championne de la saison 2, porte l'anneau");
const closed = await call<{ closed: Season; opened: Season }>("/api/seasons/close", { method: "POST", headers: A });
assert(closed.closed.championId === emilie.id && closed.opened.num === 4, "fin de la saison 3 : Émilie gravée sur la Coupe, la saison 4 commence");
players = await call<Player[]>("/api/players", { headers: A });
assert(players.find((p) => p.id === emilie.id)?.champ && !players.find((p) => p.id === julie.id)?.champ, "l'anneau passe à la nouvelle championne");
// (La 2e partie a été jouée sur le quiz de demain : elle compte donc dans la saison 4.)
const lb = await call<{ cup: Season[]; season: Season }>(`/api/leaderboard`, { headers: A });
assert(lb.cup.length === 3 && lb.season.num === 4, "la Coupe a 3 plaques et la saison 4 est ouverte");

for (const c of [host, ...bots]) c.ws.close();
console.log("🎉 Partie de test complète réussie");
process.exit(0);
