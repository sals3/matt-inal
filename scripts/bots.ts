// Des joueurs robots pour répéter un quiz sans l'équipe.
// Usage : BASE=http://localhost:3000 TEAM_CODE=MATIN bun scripts/bots.ts 5
import type { PublicState, ServerMsg } from "../src/shared";

const BASE = process.env.BASE ?? "http://localhost:3000";
const TEAM = process.env.TEAM_CODE ?? "MATIN";
const COUNT = Number(process.argv[2] ?? 5);
const CREW = [["Bot Ginette", "🐌"], ["Bot Réjean", "🦝"], ["Bot Josée", "🦉"], ["Bot Steve", "🐸"], ["Bot Linda", "🐙"], ["Bot Gaétan", "🐢"], ["Bot Nathalie", "🦊"], ["Bot Denis", "🐻"]];
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0]!;

for (let i = 0; i < Math.min(COUNT, CREW.length); i++) {
  const [name, emoji] = CREW[i]!;
  const res = await fetch(`${BASE}/api/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ teamCode: TEAM, name, emoji, color: "#5F5887" }) });
  const { token, error } = (await res.json()) as { token?: string; error?: string };
  if (!token) { console.error(name, error); process.exit(1); }
  const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws?token=${token}`);
  let answered = "";
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as ServerMsg;
    if (m.t !== "state") return;
    const s: PublicState = m.s;
    const q = s.question;
    if (s.phase === "question" && q && answered !== q.id) {
      answered = q.id;
      const delay = 1500 + Math.random() * (q.timeLimit * 1000 * 0.6);
      setTimeout(() => {
        const value = q.type === "closest" ? Math.round((q.data.min ?? 0) + Math.random() * ((q.data.max ?? 10) - (q.data.min ?? 0)))
          : q.type === "music" ? { title: pick(["Ode à la joie", "La Macarena", "ode a la joi", ""]), artist: pick(["Beethoven", "Céline Dion", ""]), year: pick([1824, 1999, null]) }
          : (Math.random() * (q.data.choices?.length ?? 4)) | 0;
        ws.send(JSON.stringify({ t: "answer", qid: q.id, value }));
        if (Math.random() < 0.3) ws.send(JSON.stringify({ t: "react", e: pick(["😂", "🔥", "😱", "👏"]) }));
      }, delay);
    }
    if (s.phase === "reveal" && Math.random() < 0.4) setTimeout(() => ws.send(JSON.stringify({ t: "react", e: pick(["😂", "🔥", "😱", "👏", "☕"]) })), Math.random() * 2000);
  };
  console.log(`${emoji} ${name} est connecté`);
}
console.log("Robots prêts. Ctrl+C pour arrêter.");
