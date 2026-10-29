import type { ServerWebSocket } from "bun";
import index from "../web/index.html";
import { openStore } from "./db";
import { Game } from "./game";
import { addDays, dayStr, mondayOf, TYPES, type ClientMsg, type Player, type PowerKind, type Question, type QuizStatus, type ServerMsg } from "./shared";

const PORT = Number(process.env.PORT ?? 3000);
const TEAM_CODE = (process.env.TEAM_CODE ?? "MATIN").trim().toUpperCase();
const ADMIN_PIN = (process.env.ADMIN_PIN ?? "1234").trim();
const DB_PATH = process.env.DB_PATH ?? "./data/matt-inal.db";
const PROD = process.env.NODE_ENV === "production";
const MAX_MEDIA = 8 * 1024 * 1024;
/** Les joueurs peuvent téléverser leur photo et des stickers, mais pas de gros fichiers. */
const MAX_PLAYER_MEDIA = 3 * 1024 * 1024;

if (PROD && ADMIN_PIN === "1234") console.warn("⚠️  ADMIN_PIN est encore la valeur par défaut. Définis-le dans les variables d'environnement.");

const store = openStore(DB_PATH, dayStr());

type WsData = { player: Player | null; isAdmin: boolean };
let server: ReturnType<typeof Bun.serve<WsData, any>>;
const game = new Game(store, (msg) => server?.publish("game", JSON.stringify(msg)));

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (error: string, status = 400) => json({ error }, status);
async function body<T>(req: Request): Promise<Partial<T>> {
  try { return (await req.json()) as Partial<T>; } catch { return {}; }
}
const bearer = (req: Request) => (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
const playerOf = (req: Request) => store.playerByToken(bearer(req));
const isAdmin = (req: Request) => store.isAdmin(req.headers.get("x-admin") ?? "");
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function profile(b: Partial<{ name: string; emoji: string; color: string; avatarId: string | null }>) {
  const name = clean(b.name, 24);
  const emoji = clean(b.emoji, 8) || "🙂";
  const color = /^#[0-9a-f]{6}$/i.test(String(b.color)) ? String(b.color) : "#D94E16";
  const avatarId = b.avatarId && store.media(clean(b.avatarId, 32)) ? clean(b.avatarId, 32) : null;
  return name ? { name, emoji, color, avatarId } : null;
}
const optNum = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
const linkedPlayer = (id: unknown) => (id && store.player(String(id)) ? String(id) : null);

const TYPE_IDS = new Set(TYPES.map((t) => t.id));
function cleanQuestion(raw: any): Question | null {
  if (!raw || !TYPE_IDS.has(raw.type)) return null;
  const d = raw.data ?? {};
  const strs = (a: unknown, n: number) => (Array.isArray(a) ? a.slice(0, n).map((s) => clean(s, 80)) : []);
  const num = (v: unknown, dflt: number) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
  const data: Question["data"] = {};
  if (raw.type === "closest") Object.assign(data, { answer: num(d.answer, 0), min: num(d.min, 0), max: num(d.max, 10) });
  else if (raw.type === "music") {
    Object.assign(data, {
      title: clean(d.title, 120), artist: clean(d.artist, 120), alts: strs(d.alts, 10).filter(Boolean),
      year: Number.isInteger(Number(d.year)) && Number(d.year) > 0 ? Number(d.year) : null,
      hints: strs(d.hints, 3), mode: d.mode === "rec" ? "rec" : "live", style: clean(d.style, 40), audioId: d.audioId ? clean(d.audioId, 32) : null,
    });
  } else {
    const n = raw.type === "tf" ? 2 : 4;
    const choices = strs(d.choices, n);
    while (choices.length < n) choices.push("");
    Object.assign(data, { choices });
    if (raw.type !== "majority") data.correct = Math.min(n - 1, Math.max(0, Math.trunc(num(d.correct, 0))));
  }
  if (d.strict) data.strict = true;
  return {
    id: clean(raw.id, 32),
    type: raw.type,
    prompt: clean(raw.prompt, 300),
    emoji: clean(raw.emoji, 24),
    imageId: raw.imageId ? clean(raw.imageId, 32) : null,
    timeLimit: Math.min(120, Math.max(5, Math.trunc(num(raw.timeLimit, 20)))),
    speedBonus: raw.speedBonus !== false,
    doublePoints: !!raw.doublePoints,
    data,
    authorId: linkedPlayer(raw.authorId),
  };
}

server = Bun.serve<WsData, any>({
  port: PORT,
  development: PROD ? false : { hmr: true, console: true },
  routes: {
    "/": index,
    "/api/health": () => json({ ok: true }),

    "/api/join": {
      POST: async (req) => {
        const b = await body<{ teamCode: string; name: string; emoji: string; color: string }>(req);
        if (clean(b.teamCode, 40).toUpperCase() !== TEAM_CODE) { await sleep(400); return fail("Ce n'est pas le bon code d'équipe.", 403); }
        const p = profile(b);
        if (!p) return fail("Choisis un nom.");
        return json(store.createPlayer(p.name, p.emoji, p.color));
      },
    },
    "/api/me": {
      GET: (req) => { const p = playerOf(req); return p ? json(p) : fail("Non connecté.", 401); },
      PATCH: async (req) => {
        const me = playerOf(req);
        if (!me) return fail("Non connecté.", 401);
        const p = profile(await body(req));
        if (!p) return fail("Choisis un nom.");
        const updated = store.updatePlayer(me.id, p)!;
        game.rename(updated);
        return json(updated);
      },
    },

    "/api/me/recovery": (req) => {
      const me = playerOf(req);
      return me ? json({ code: store.recoveryOf(me.id) }) : fail("Non connecté.", 401);
    },
    "/api/recover": {
      POST: async (req) => {
        const b = await body<{ code: string }>(req);
        const r = store.recover(clean(b.code, 80));
        if (!r) { await sleep(500); return fail("Code de récupération introuvable. Vérifie l'orthographe, ou demande-le à Matt."); }
        return json(r);
      },
    },

    "/api/powers": (req) => {
      const me = playerOf(req);
      return me ? json(store.inventory(me.id, mondayOf(dayStr()))) : fail("Non connecté.", 401);
    },
    "/api/powers/seen": {
      POST: (req) => {
        const me = playerOf(req);
        if (!me) return fail("Non connecté.", 401);
        store.markSeen(me.id, mondayOf(dayStr()));
        return json({ ok: true });
      },
    },
    "/api/powers/redistribute": {
      POST: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        if (game.phase !== "idle") return fail("Attends la fin de la partie en cours.");
        store.redistributeWeek(mondayOf(dayStr()));
        game.toast("🎁 Matt vient de redistribuer les boîtes à items de la semaine!");
        return json(store.weekDistribution(mondayOf(dayStr())));
      },
    },
    "/api/powers/week": (req) => (playerOf(req) || isAdmin(req) ? json(store.weekDistribution(mondayOf(dayStr()))) : fail("Non connecté.", 401)),
    "/api/trophies": (req) => {
      if (!playerOf(req) && !isAdmin(req)) return fail("Non connecté.", 401);
      const week = mondayOf(dayStr());
      return json({ current: store.trophies(week), previous: store.trophies(addDays(week, -7)) });
    },
    "/api/palmares": (req) => (playerOf(req) || isAdmin(req) ? json(store.palmares()) : fail("Non connecté.", 401)),

    "/api/submissions": {
      GET: (req) => (isAdmin(req) ? json(store.submissions({ status: "pending" })) : fail("Réservé à Matt.", 401)),
      POST: async (req) => {
        const me = playerOf(req);
        if (!me) return fail("Non connecté.", 401);
        const b = await body<{ question: unknown }>(req);
        const q = cleanQuestion(b.question);
        if (!q || q.type === "music") return fail("Question invalide.");
        if (!q.prompt) return fail("Écris ta question.");
        if (q.data.choices && q.data.choices.filter(Boolean).length < 2) return fail("Il faut au moins deux réponses.");
        if (store.submissions({ playerId: me.id, status: "pending" }).length >= 10) return fail("T'as déjà 10 questions en attente. Laisse Matt souffler!");
        store.addSubmission(me.id, { ...q, id: "", authorId: me.id });
        game.toast(`📬 ${me.name} a glissé une question dans la boîte de Matt.`);
        return json({ ok: true });
      },
    },
    "/api/submissions/mine": (req) => {
      const me = playerOf(req);
      return me ? json(store.submissions({ playerId: me.id })) : fail("Non connecté.", 401);
    },
    "/api/submissions/:id": {
      PATCH: async (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        const b = await body<{ status: string }>(req);
        if (b.status !== "accepted" && b.status !== "rejected") return fail("Statut invalide.");
        const s = store.decideSubmission(req.params.id, b.status);
        return s ? json(s) : fail("Question introuvable.", 404);
      },
    },

    "/api/admin/login": {
      POST: async (req) => {
        const b = await body<{ pin: string }>(req);
        if (clean(b.pin, 40) !== ADMIN_PIN) { await sleep(600); return fail("NIP invalide.", 403); }
        return json({ token: store.createAdminSession() });
      },
    },
    "/api/admin/check": (req) => (isAdmin(req) ? json({ ok: true }) : fail("Réservé à Matt.", 401)),

    "/api/today": (req) => {
      if (!playerOf(req) && !isAdmin(req)) return fail("Non connecté.", 401);
      const quiz = store.quizByDay(dayStr());
      return json({ day: dayStr(), quiz: quiz && { theme: quiz.theme, count: quiz.questions.length, status: quiz.status } });
    },

    "/api/quizzes": (req) => {
      if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
      const url = new URL(req.url);
      const from = url.searchParams.get("from") ?? dayStr();
      const to = url.searchParams.get("to") ?? "9999-12-31";
      return json(store.quizzes(from, to));
    },
    "/api/quizzes/:day": {
      DELETE: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        if (!isDay(req.params.day)) return fail("Date invalide.");
        if (game.quiz?.day === req.params.day) return fail("Ce quiz est en cours : ferme la partie d'abord.");
        store.deleteQuiz(req.params.day);
        return json({ ok: true });
      },
      GET: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        return isDay(req.params.day) ? json(store.quizByDay(req.params.day)) : fail("Date invalide.");
      },
      PUT: async (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        const day = req.params.day;
        if (!isDay(day)) return fail("Date invalide.");
        const b = await body<{ theme: string; status: QuizStatus; questions: unknown[] }>(req);
        const questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, 20).map(cleanQuestion).filter((q): q is Question => !!q);
        const status: QuizStatus = b.status === "ready" || b.status === "played" ? b.status : "draft";
        return json(store.saveQuiz(day, clean(b.theme, 80), status, questions));
      },
    },

    "/api/media": {
      POST: async (req) => {
        const admin = isAdmin(req);
        if (!admin && !playerOf(req)) return fail("Non connecté.", 401);
        const mime = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
        if (admin ? !/^(image|audio)\//.test(mime) : !/^image\/(png|jpeg|webp|gif)$/.test(mime)) return fail("Format de fichier non accepté.");
        const bytes = new Uint8Array(await req.arrayBuffer());
        const max = admin ? MAX_MEDIA : MAX_PLAYER_MEDIA;
        if (!bytes.length || bytes.length > max) return fail(`Fichier vide ou trop gros (${max / 1024 / 1024} Mo max).`);
        return json({ id: store.saveMedia(mime, bytes) });
      },
    },
    "/media/:id": (req) => {
      const m = store.media(req.params.id);
      if (!m) return new Response("Introuvable", { status: 404 });
      return new Response(new Blob([m.bytes as Uint8Array<ArrayBuffer>]), { headers: { "content-type": m.mime, "cache-control": "public, max-age=31536000, immutable" } });
    },

    "/api/leaderboard": (req) => {
      if (!playerOf(req) && !isAdmin(req)) return fail("Non connecté.", 401);
      return json(store.leaderboard(new URL(req.url).searchParams.get("season")));
    },
    "/api/players": (req) => (isAdmin(req) ? json(store.players()) : fail("Réservé à Matt.", 401)),
    "/api/players/:id/recovery": (req) => (isAdmin(req) ? json({ code: store.recoveryOf(req.params.id) }) : fail("Réservé à Matt.", 401)),
    "/api/games": (req) => (isAdmin(req) ? json(store.games()) : fail("Réservé à Matt.", 401)),
    "/api/games/:id": {
      DELETE: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        if (game.gameId === req.params.id) return fail("Cette partie est en cours : ferme-la d'abord.");
        store.deleteGame(req.params.id);
        return json({ ok: true });
      },
    },
    "/api/players/:id": {
      DELETE: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        if (game.phase !== "idle") return fail("Attends la fin de la partie en cours.");
        if (!store.player(req.params.id)) return fail("Joueur introuvable.", 404);
        store.deletePlayer(req.params.id);
        return json({ ok: true });
      },
      // Matt peut téléverser les caricatures de toute l'équipe.
      PATCH: async (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        if (!store.player(req.params.id)) return fail("Joueur introuvable.", 404);
        const p = profile(await body(req));
        if (!p) return fail("Choisis un nom.");
        const updated = store.updatePlayer(req.params.id, p)!;
        game.rename(updated);
        return json(updated);
      },
    },

    "/api/seasons": {
      GET: (req) => (playerOf(req) || isAdmin(req) ? json(store.seasons()) : fail("Non connecté.", 401)),
      // Une ancienne saison (jouée avant l'app) à graver sur la Coupe.
      POST: async (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        const b = await body<{ num: number; name: string; championName: string; championId: string; championPoints: number }>(req);
        const num = optNum(b.num);
        if (num === null || num < 1) return fail("Numéro de saison invalide.");
        return json(store.addLegacySeason(num, clean(b.name, 60) || `Saison ${num}`, clean(b.championName, 40), linkedPlayer(b.championId), optNum(b.championPoints)));
      },
    },
    "/api/seasons/close": {
      POST: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        const r = store.closeSeason(dayStr());
        if (typeof r === "string") return fail(r);
        game.toast(`🏆 ${r.closed.championName} est gravé·e sur la Coupe! ${r.opened.name} commence.`);
        return json(r);
      },
    },
    "/api/seasons/:id": {
      PATCH: async (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        const s = store.season(req.params.id);
        if (!s) return fail("Saison introuvable.", 404);
        const b = await body<{ num: number; name: string; championName: string; championId: string; championPoints: number; startDay: string }>(req);
        const startDay = s.status === "open" && typeof b.startDay === "string" && isDay(b.startDay) ? b.startDay : s.startDay;
        return json(store.updateSeason(s.id, {
          num: optNum(b.num) ?? s.num, name: clean(b.name, 60) || s.name, championName: clean(b.championName, 40),
          championId: linkedPlayer(b.championId), championPoints: optNum(b.championPoints), startDay,
        }));
      },
      DELETE: (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        store.deleteLegacySeason(req.params.id);
        return json({ ok: true });
      },
    },

    "/api/stickers": {
      GET: (req) => (playerOf(req) || isAdmin(req) ? json(store.stickers()) : fail("Non connecté.", 401)),
      POST: async (req) => {
        const me = playerOf(req);
        if (!me && !isAdmin(req)) return fail("Non connecté.", 401);
        const b = await body<{ mediaId: string; name: string }>(req);
        const mediaId = clean(b.mediaId, 32);
        if (!store.media(mediaId)) return fail("Téléverse d'abord l'image du sticker.");
        if (store.stickers().length >= 120) return fail("La boîte à stickers est pleine. Demande à Matt de faire le ménage.");
        const s = store.addSticker(mediaId, clean(b.name, 30) || "Sticker", me?.id ?? null);
        server.publish("game", JSON.stringify({ t: "stickers" } satisfies ServerMsg));
        if (me) game.toast(`${me.name} a ajouté un nouveau sticker : « ${s.name} »`);
        return json(s);
      },
    },
    "/api/stickers/:id": {
      DELETE: (req) => {
        const me = playerOf(req);
        const s = store.sticker(req.params.id);
        if (!s) return fail("Sticker introuvable.", 404);
        if (!isAdmin(req) && (!me || me.id !== s.playerId)) return fail("Seulement Matt ou l'auteur du sticker peut le retirer.", 403);
        store.removeSticker(s.id);
        server.publish("game", JSON.stringify({ t: "stickers" } satisfies ServerMsg));
        return json({ ok: true });
      },
    },
    "/api/bonus": {
      POST: async (req) => {
        if (!isAdmin(req)) return fail("Réservé à Matt.", 401);
        const b = await body<{ playerId: string; points: number; reason: string }>(req);
        const p = store.players().find((x) => x.id === b.playerId);
        const points = Math.trunc(Number(b.points));
        if (!p || !Number.isFinite(points) || Math.abs(points) > 1000) return fail("Bonus invalide.");
        const reason = clean(b.reason, 80) || "parce que c'était drôle";
        store.addBonus(p.id, dayStr(), points, reason);
        game.toast(`${p.emoji} ${p.name} reçoit ${points > 0 ? "+" : ""}${points} pts : ${reason}`);
        return json({ ok: true });
      },
    },
  },

  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const player = store.playerByToken(url.searchParams.get("token") ?? "");
      const admin = store.isAdmin(url.searchParams.get("admin") ?? "");
      if (!player && !admin) return fail("Non connecté.", 401);
      if (srv.upgrade(req, { data: { player, isAdmin: admin } })) return;
      return fail("Connexion WebSocket impossible.", 500);
    }
    return fail("Introuvable.", 404);
  },

  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      ws.subscribe("game");
      if (ws.data.player) game.join(ws.data.player);
      ws.send(JSON.stringify({ t: "state", s: game.state() } satisfies ServerMsg));
    },
    message(ws: ServerWebSocket<WsData>, raw) {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const reply = (err: string | null) => { if (err) ws.send(JSON.stringify({ t: "error", msg: err } satisfies ServerMsg)); };
      const me = ws.data.player;
      if (msg.t === "answer" && me) reply(game.answer(me, String(msg.qid), msg.value));
      else if (msg.t === "react" && me) game.react(me.id, msg);
      else if (msg.t === "away" && me) game.markAway(me);
      else if (msg.t === "power" && me) {
        const kind = String(msg.kind) as PowerKind;
        const r = game.usePower(me, kind);
        if (r.error) reply(r.error);
        else ws.send(JSON.stringify({ t: "power", kind, removed: r.removed } satisfies ServerMsg));
      }
      else if (msg.t === "rate" && me) reply(game.rate(me, Number(msg.stars)));
      else if (msg.t === "host") {
        if (!ws.data.isAdmin) return reply("Réservé à Matt.");
        if (msg.action === "open") reply(game.open(String(msg.quizId ?? "")));
        else if (msg.action === "next") reply(game.next());
        else if (msg.action === "reveal") reply(game.doReveal());
        else if (msg.action === "close") reply(game.close());
      }
    },
    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.player) game.leave(ws.data.player.id);
    },
  },
});

console.log(`🌅 Le Matt'inal roule sur http://localhost:${server.port}${PROD ? "" : ` (code d'équipe : ${TEAM_CODE}, NIP de Matt : ${ADMIN_PIN})`}`);
