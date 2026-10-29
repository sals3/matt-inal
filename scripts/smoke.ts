// Partie complète de bout en bout contre un serveur qui roule : Matt + 3 joueurs robots.
// Usage : BASE=http://localhost:3000 ADMIN_PIN=4242 TEAM_CODE=MATIN bun scripts/smoke.ts
import type { PublicState, ServerMsg } from "../src/shared";
import { dayStr } from "../src/shared";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PIN = process.env.ADMIN_PIN ?? "1234";
const TEAM = process.env.TEAM_CODE ?? "MATIN";

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
  const waiters: { pred: (s: PublicState) => boolean; resolve: (s: PublicState) => void }[] = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as ServerMsg;
    if (m.t === "error") console.log("   (serveur)", m.msg);
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
  return { ws, until, open, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

const admin = (await call<{ token: string }>("/api/admin/login", { method: "POST", json: { pin: PIN } })).token;
const A = { "x-admin": admin };
const day = dayStr();
const quiz = await call<{ id: string; questions: { id: string }[] }>(`/api/quizzes/${day}`, {
  method: "PUT", headers: A, json: {
    theme: "Test de fumée", status: "ready", questions: [
      { type: "zoom", prompt: "C'est quoi?", emoji: "🍩", timeLimit: 15, data: { choices: ["Beigne", "Bagel", "Bouée", "Pneu"], correct: 0 } },
      { type: "closest", prompt: "Combien de cafés?", emoji: "☕", timeLimit: 15, data: { answer: 3, min: 0, max: 8 } },
      { type: "music", prompt: "Devine la toune", timeLimit: 30, data: { title: "Ode à la joie", artist: "Beethoven", year: 1824, hints: ["Allemand", "Europe", "Neuvième"] } },
    ],
  },
});
assert(quiz.questions.length === 3, "Matt enregistre un quiz de 3 questions");

const names = ["Robot Julie", "Robot Kevin", "Robot Émilie"];
const bots = [];
for (const name of names) {
  const r = await call<{ token: string; player: { id: string } }>("/api/join", { method: "POST", json: { teamCode: TEAM, name, emoji: "🤖", color: "#4655C8" } });
  bots.push({ ...client(`token=${r.token}`), id: r.player.id, name });
}
let refused = false;
try { await call("/api/join", { method: "POST", json: { teamCode: "MAUVAIS", name: "Intrus" } }); } catch { refused = true; }
assert(refused, "un mauvais code d'équipe est refusé");

const host = client(`admin=${admin}`);
await Promise.all([host.open, ...bots.map((b) => b.open)]);
await host.until((s) => s.presence.length >= 3);
host.send({ t: "host", action: "open", quizId: quiz.id });
await host.until((s) => s.phase === "lobby");
assert(true, "la partie s'ouvre et les 3 joueurs sont présents");

// Q1 : zoom. Julie et Émilie ont raison, Kevin non.
host.send({ t: "host", action: "next" });
let s = await bots[0]!.until((x) => x.phase === "question" && x.qIndex === 0);
assert(s.question?.data.correct === undefined, "la bonne réponse n'est pas envoyée aux joueurs avant la révélation");
bots[0]!.send({ t: "answer", qid: s.question!.id, value: 0 });
bots[1]!.send({ t: "answer", qid: s.question!.id, value: 3 });
bots[2]!.send({ t: "answer", qid: s.question!.id, value: 0 });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 0);
assert(s.reveal!.points[bots[0]!.id]! > 1000 && s.reveal!.points[bots[1]!.id] === 0, "révélation automatique quand tout le monde a répondu, points corrects");

// Q2 : le plus proche.
host.send({ t: "host", action: "next" });
s = await bots[0]!.until((x) => x.phase === "question" && x.qIndex === 1);
bots[0]!.send({ t: "answer", qid: s.question!.id, value: 5 });
bots[1]!.send({ t: "answer", qid: s.question!.id, value: 3 });
bots[2]!.send({ t: "answer", qid: s.question!.id, value: 2 });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 1);
assert(s.reveal!.points[bots[1]!.id]! >= 1000 && s.reveal!.answer === 3, "le plus proche : réponse exacte récompensée");

// Q3 : Mercredi musical, révélée par Matt sans attendre tout le monde.
host.send({ t: "host", action: "next" });
s = await bots[0]!.until((x) => x.phase === "question" && x.qIndex === 2);
assert(s.question!.data.title === undefined && (s.question!.data.hints ?? []).length === 0, "le titre et les indices sont cachés au départ");
bots[2]!.send({ t: "answer", qid: s.question!.id, value: { title: "ode a la joi", artist: "bethoven", year: 1820 } });
await host.until((x) => x.answered.length === 1);
host.send({ t: "host", action: "reveal" });
s = await host.until((x) => x.phase === "reveal" && x.qIndex === 2);
assert(s.reveal!.points[bots[2]!.id] === 1200, "orthographe approximative acceptée au Mercredi musical (1 200 pts)");

host.send({ t: "host", action: "next" });
s = await host.until((x) => x.phase === "podium");
const winner = Object.entries(s.totals).sort((a, b) => b[1] - a[1])[0]!;
console.log("   Podium :", Object.entries(s.totals).map(([id, p]) => `${s.players[id]?.name} ${p}`).join(" · "));
assert(winner[0] === bots[2]!.id, "Robot Émilie gagne la journée");

const lb = await call<{ standings: { player: { name: string }; points: number }[]; mattVsTeam: { matt: number; team: number } }>(`/api/leaderboard`, { headers: A });
assert(lb.standings.length >= 3, "le classement de la saison inclut la partie");
host.send({ t: "host", action: "close" });
await host.until((x) => x.phase === "idle");
assert(true, "Matt ferme la partie");
for (const c of [host, ...bots]) c.ws.close();
console.log("🎉 Partie de test complète réussie");
process.exit(0);
