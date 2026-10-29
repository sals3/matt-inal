import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Leaderboard, Player, Question, Quiz, QuizStatus, QuizSummary, Season, Standing, Sticker } from "./shared";

export const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
export const newToken = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

const SCHEMA = `
create table if not exists players (
  id text primary key, name text not null, emoji text not null, color text not null,
  token text not null unique, created_at integer not null
);
create table if not exists admin_sessions (token text primary key, created_at integer not null);
create table if not exists quizzes (
  id text primary key, day text not null unique, theme text not null default '',
  status text not null default 'draft', updated_at integer not null
);
create table if not exists questions (
  id text primary key, quiz_id text not null references quizzes(id) on delete cascade,
  pos integer not null, type text not null, prompt text not null, emoji text not null default '',
  image_id text, data text not null, time_limit integer not null,
  speed_bonus integer not null default 1, double_points integer not null default 0
);
create table if not exists media (id text primary key, mime text not null, bytes blob not null, created_at integer not null);
create table if not exists games (id text primary key, quiz_id text not null, day text not null, started_at integer not null, ended_at integer);
create table if not exists answers (
  game_id text not null, question_id text not null, player_id text not null,
  value text, ms integer not null, points integer not null,
  primary key (game_id, question_id, player_id)
);
create table if not exists bonuses (id text primary key, player_id text not null, day text not null, points integer not null, reason text not null, created_at integer not null);
create table if not exists seasons (
  id text primary key, num integer not null, name text not null, start_day text, end_day text,
  status text not null, champion_id text, champion_name text not null default '', champion_points integer, created_at integer not null
);
create table if not exists stickers (id text primary key, media_id text not null, name text not null, player_id text, created_at integer not null);
create index if not exists idx_answers_player on answers(player_id);
create index if not exists idx_games_day on games(day);
`;

type Row = Record<string, any>;

const toQuestion = (r: Row): Question => ({
  id: r.id, type: r.type, prompt: r.prompt, emoji: r.emoji, imageId: r.image_id,
  timeLimit: r.time_limit, speedBonus: !!r.speed_bonus, doublePoints: !!r.double_points, data: JSON.parse(r.data),
});
const toSeason = (r: Row): Season => ({
  id: r.id, num: r.num, name: r.name, startDay: r.start_day, endDay: r.end_day, status: r.status,
  championId: r.champion_id, championName: r.champion_name, championPoints: r.champion_points,
});
const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export class Store {
  constructor(readonly db: Database) {}

  /** Ajouts de colonnes pour les bases déjà en production. */
  migrate(today: string) {
    const addColumn = (table: string, col: string, def: string) => {
      const cols = (this.db.query(`pragma table_info(${table})`).all() as Row[]).map((c) => c.name);
      if (!cols.includes(col)) this.db.exec(`alter table ${table} add column ${col} ${def}`);
    };
    addColumn("players", "avatar_id", "text");
    addColumn("answers", "away", "integer not null default 0");
    this.ensureSeasons(today);
  }

  /* ----- Joueurs ----- */
  private championId(): string | null {
    const r = this.db.query("select champion_id from seasons where status != 'open' order by num desc limit 1").get() as Row | null;
    return r?.champion_id ?? null;
  }
  private toPlayer(r: Row, champ = this.championId()): Player {
    return { id: r.id, name: r.name, emoji: r.emoji, color: r.color, avatarId: r.avatar_id ?? null, ...(r.id === champ ? { champ: true } : {}) };
  }
  createPlayer(name: string, emoji: string, color: string): { player: Player; token: string } {
    const id = newId();
    const token = newToken();
    this.db.query("insert into players (id, name, emoji, color, token, created_at) values (?, ?, ?, ?, ?, ?)").run(id, name, emoji, color, token, Date.now());
    return { player: this.player(id)!, token };
  }
  player(id: string): Player | null {
    const r = this.db.query("select * from players where id = ?").get(id) as Row | null;
    return r ? this.toPlayer(r) : null;
  }
  playerByToken(token: string): Player | null {
    if (!token) return null;
    const r = this.db.query("select * from players where token = ?").get(token) as Row | null;
    return r ? this.toPlayer(r) : null;
  }
  updatePlayer(id: string, p: { name: string; emoji: string; color: string; avatarId: string | null }): Player | null {
    this.db.query("update players set name = ?, emoji = ?, color = ?, avatar_id = ? where id = ?").run(p.name, p.emoji, p.color, p.avatarId, id);
    return this.player(id);
  }
  players(): Player[] {
    const champ = this.championId();
    return (this.db.query("select * from players order by name").all() as Row[]).map((r) => this.toPlayer(r, champ));
  }

  /* ----- Matt ----- */
  createAdminSession(): string {
    const t = newToken();
    this.db.query("insert into admin_sessions (token, created_at) values (?, ?)").run(t, Date.now());
    return t;
  }
  isAdmin(token: string): boolean {
    return !!token && !!this.db.query("select 1 from admin_sessions where token = ?").get(token);
  }

  /* ----- Quiz ----- */
  private questionsOf(quizId: string): Question[] {
    return (this.db.query("select * from questions where quiz_id = ? order by pos").all(quizId) as Row[]).map(toQuestion);
  }
  private toQuiz(r: Row | null): Quiz | null {
    return r ? { id: r.id, day: r.day, theme: r.theme, status: r.status, questions: this.questionsOf(r.id) } : null;
  }
  quizByDay(day: string): Quiz | null {
    return this.toQuiz(this.db.query("select * from quizzes where day = ?").get(day) as Row | null);
  }
  quizById(id: string): Quiz | null {
    return this.toQuiz(this.db.query("select * from quizzes where id = ?").get(id) as Row | null);
  }
  quizzes(from: string, to: string): QuizSummary[] {
    return this.db.query(
      `select q.id, q.day, q.theme, q.status, count(x.id) as count from quizzes q
       left join questions x on x.quiz_id = q.id where q.day between ? and ? group by q.id order by q.day`,
    ).all(from, to) as QuizSummary[];
  }
  saveQuiz(day: string, theme: string, status: QuizStatus, questions: Question[]): Quiz {
    const tx = this.db.transaction(() => {
      const existing = this.db.query("select id from quizzes where day = ?").get(day) as Row | null;
      const quizId = existing?.id ?? newId();
      if (existing) this.db.query("update quizzes set theme = ?, status = ?, updated_at = ? where id = ?").run(theme, status, Date.now(), quizId);
      else this.db.query("insert into quizzes (id, day, theme, status, updated_at) values (?, ?, ?, ?, ?)").run(quizId, day, theme, status, Date.now());
      this.db.query("delete from questions where quiz_id = ?").run(quizId);
      const ins = this.db.query(
        `insert into questions (id, quiz_id, pos, type, prompt, emoji, image_id, data, time_limit, speed_bonus, double_points)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      questions.forEach((q, i) =>
        ins.run(q.id || newId(), quizId, i, q.type, q.prompt, q.emoji ?? "", q.imageId, JSON.stringify(q.data ?? {}),
          q.timeLimit, q.speedBonus ? 1 : 0, q.doublePoints ? 1 : 0),
      );
      return quizId;
    });
    return this.quizById(tx())!;
  }
  setQuizStatus(id: string, status: QuizStatus): void {
    this.db.query("update quizzes set status = ? where id = ?").run(status, id);
  }

  /* ----- Médias (images de fond, caricatures, stickers, extraits audio) ----- */
  saveMedia(mime: string, bytes: Uint8Array): string {
    const id = newId();
    this.db.query("insert into media (id, mime, bytes, created_at) values (?, ?, ?, ?)").run(id, mime, bytes, Date.now());
    return id;
  }
  media(id: string): { mime: string; bytes: Uint8Array } | null {
    return this.db.query("select mime, bytes from media where id = ?").get(id) as { mime: string; bytes: Uint8Array } | null;
  }

  /* ----- Stickers de l'équipe ----- */
  stickers(): Sticker[] {
    return (this.db.query("select * from stickers order by created_at").all() as Row[]).map((r) => ({ id: r.id, mediaId: r.media_id, name: r.name, playerId: r.player_id }));
  }
  sticker(id: string): Sticker | null {
    return this.stickers().find((s) => s.id === id) ?? null;
  }
  addSticker(mediaId: string, name: string, playerId: string | null): Sticker {
    const id = newId();
    this.db.query("insert into stickers (id, media_id, name, player_id, created_at) values (?, ?, ?, ?, ?)").run(id, mediaId, name, playerId, Date.now());
    return { id, mediaId, name, playerId };
  }
  removeSticker(id: string): void {
    this.db.query("delete from stickers where id = ?").run(id);
  }

  /* ----- Parties ----- */
  createGame(quizId: string, day: string): string {
    const id = newId();
    this.db.query("insert into games (id, quiz_id, day, started_at) values (?, ?, ?, ?)").run(id, quizId, day, Date.now());
    return id;
  }
  endGame(id: string): void {
    this.db.query("update games set ended_at = ? where id = ?").run(Date.now(), id);
  }
  saveAnswers(gameId: string, questionId: string, rows: { playerId: string; value: unknown; ms: number; points: number; away: boolean }[]): void {
    const ins = this.db.query(
      "insert or replace into answers (game_id, question_id, player_id, value, ms, points, away) values (?, ?, ?, ?, ?, ?, ?)",
    );
    this.db.transaction(() => rows.forEach((r) => ins.run(gameId, questionId, r.playerId, JSON.stringify(r.value), r.ms, r.points, r.away ? 1 : 0)))();
  }
  addBonus(playerId: string, day: string, points: number, reason: string): void {
    this.db.query("insert into bonuses (id, player_id, day, points, reason, created_at) values (?, ?, ?, ?, ?, ?)")
      .run(newId(), playerId, day, points, reason, Date.now());
  }

  /* ----- Saisons et Coupe ----- */
  /**
   * L'équipe a joué deux saisons avant l'app : on prépare leurs plaques (à graver par Matt)
   * et on ouvre la saison 3.
   */
  private ensureSeasons(today: string) {
    const count = (this.db.query("select count(*) as n from seasons").get() as Row).n as number;
    const ins = this.db.query("insert into seasons (id, num, name, start_day, end_day, status, champion_name, created_at) values (?, ?, ?, ?, ?, ?, '', ?)");
    if (count === 0) {
      ins.run(newId(), 1, "Saison 1", null, null, "legacy", Date.now());
      ins.run(newId(), 2, "Saison 2", null, null, "legacy", Date.now());
    }
    if (!this.db.query("select 1 from seasons where status = 'open'").get()) {
      const first = (this.db.query("select min(day) as d from games").get() as Row).d as string | null;
      const last = (this.db.query("select max(end_day) as d from seasons where status = 'closed'").get() as Row).d as string | null;
      const num = ((this.db.query("select max(num) as n from seasons").get() as Row).n ?? 0) + 1;
      ins.run(newId(), num, `Saison ${num}`, last ? nextDay(last) : (first ?? today), null, "open", Date.now());
    }
  }
  private withChampion(s: Season): Season {
    return { ...s, champion: s.championId ? this.player(s.championId) : null };
  }
  seasons(): Season[] {
    return (this.db.query("select * from seasons order by num").all() as Row[]).map(toSeason).map((s) => this.withChampion(s));
  }
  season(id: string): Season | null {
    const r = this.db.query("select * from seasons where id = ?").get(id) as Row | null;
    return r ? this.withChampion(toSeason(r)) : null;
  }
  openSeason(): Season {
    return this.withChampion(toSeason(this.db.query("select * from seasons where status = 'open'").get() as Row));
  }
  addLegacySeason(num: number, name: string, championName: string, championId: string | null, championPoints: number | null): Season {
    const id = newId();
    this.db.query("insert into seasons (id, num, name, start_day, end_day, status, champion_id, champion_name, champion_points, created_at) values (?, ?, ?, null, null, 'legacy', ?, ?, ?, ?)")
      .run(id, num, name, championId, championName, championPoints, Date.now());
    return this.season(id)!;
  }
  updateSeason(id: string, p: { num: number; name: string; championName: string; championId: string | null; championPoints: number | null; startDay: string | null }): Season | null {
    this.db.query("update seasons set num = ?, name = ?, champion_name = ?, champion_id = ?, champion_points = ?, start_day = ? where id = ?")
      .run(p.num, p.name, p.championName, p.championId, p.championPoints, p.startDay, id);
    return this.season(id);
  }
  deleteLegacySeason(id: string): void {
    this.db.query("delete from seasons where id = ? and status = 'legacy'").run(id);
  }
  /** Grave le champion de la saison en cours sur la Coupe et ouvre la suivante demain. */
  closeSeason(today: string): { closed: Season; opened: Season } | string {
    const open = this.openSeason();
    const champ = this.leaderboard(open.id).standings[0];
    if (!champ) return "Personne n'a encore de points cette saison.";
    this.db.transaction(() => {
      this.db.query("update seasons set status = 'closed', end_day = ?, champion_id = ?, champion_name = ?, champion_points = ? where id = ?")
        .run(today, champ.player.id, champ.player.name, champ.points, open.id);
      const num = open.num + 1;
      this.db.query("insert into seasons (id, num, name, start_day, end_day, status, champion_name, created_at) values (?, ?, ?, ?, null, 'open', '', ?)")
        .run(newId(), num, `Saison ${num}`, nextDay(today), Date.now());
    })();
    return { closed: this.season(open.id)!, opened: this.openSeason() };
  }

  /* ----- Classement ----- */
  leaderboard(seasonId?: string | null): Leaderboard {
    const season = (seasonId && this.season(seasonId)) || this.openSeason();
    const from = season.startDay ?? "0000-00-00";
    const to = season.endDay ?? "9999-12-31";
    const players = new Map(this.players().map((p) => [p.id, p]));
    const inSeason = "g.day >= ? and g.day <= ? and g.ended_at is not null";
    const games = season.status === "legacy" ? [] : (this.db.query(`select g.id, g.day from games g where ${inSeason} order by g.started_at`).all(from, to) as Row[]);
    const lastGame = games.at(-1);

    const pts = new Map<string, number>();
    const played = new Map<string, number>();
    const last = new Map<string, number>();
    const answersN = new Map<string, number>();
    const awayN = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    if (games.length) {
      for (const r of this.db.query(
        `select a.player_id, a.game_id, sum(a.points) as pts, count(*) as n, sum(a.away) as away
         from answers a join games g on g.id = a.game_id where ${inSeason} group by a.player_id, a.game_id`,
      ).all(from, to) as Row[]) {
        add(pts, r.player_id, r.pts);
        add(played, r.player_id, 1);
        add(answersN, r.player_id, r.n);
        add(awayN, r.player_id, r.away);
        if (r.game_id === lastGame?.id) last.set(r.player_id, r.pts);
      }
      for (const r of this.db.query("select player_id, sum(points) as pts from bonuses where day >= ? and day <= ? group by player_id").all(from, to) as Row[]) {
        add(pts, r.player_id, r.pts);
      }
    }

    const ids = [...pts.keys()].filter((id) => players.has(id));
    const rankBy = (score: (id: string) => number) => new Map([...ids].sort((a, b) => score(b) - score(a)).map((id, i) => [id, i + 1]));
    const now = rankBy((id) => pts.get(id)!);
    const before = games.length > 1 ? rankBy((id) => pts.get(id)! - (last.get(id) ?? 0)) : null;
    const streaks = this.streaks();

    const standings: Standing[] = ids
      .map((id) => {
        const n = answersN.get(id) ?? 0;
        return {
          player: players.get(id)!, points: pts.get(id)!, played: played.get(id) ?? 0, streak: streaks.get(id) ?? 0,
          rank: now.get(id)!, prevRank: before?.get(id) ?? null, lastGame: last.get(id) ?? 0,
          brainPct: n ? Math.round((100 * (n - (awayN.get(id) ?? 0))) / n) : null,
        };
      })
      .sort((a, b) => a.rank - b.rank);

    const mvt = games.length
      ? (this.db.query(
        `select coalesce(sum(case when mx > 0 then 1 else 0 end), 0) as team, coalesce(sum(case when mx <= 0 then 1 else 0 end), 0) as matt
         from (select max(a.points) as mx from answers a join games g on g.id = a.game_id where ${inSeason} group by a.game_id, a.question_id)`,
      ).get(from, to) as Row)
      : { matt: 0, team: 0 };

    let lastPodium: Leaderboard["lastPodium"] = null;
    const lg = this.db.query("select id, day from games where ended_at is not null order by started_at desc limit 1").get() as Row | null;
    if (lg) {
      const rows = this.db.query("select player_id, sum(points) as pts from answers where game_id = ? group by player_id order by pts desc limit 3").all(lg.id) as Row[];
      lastPodium = { day: lg.day, entries: rows.filter((r) => players.has(r.player_id)).map((r) => ({ player: players.get(r.player_id)!, points: r.pts })) };
    }

    const all = this.seasons();
    return {
      season,
      seasons: all.filter((s) => s.status !== "legacy"),
      standings,
      mattVsTeam: { matt: mvt.matt, team: mvt.team },
      games: games.length,
      lastPodium,
      cup: all.filter((s) => s.status !== "open"),
    };
  }

  /** Nombre de parties consécutives (les plus récentes) où chaque joueur a répondu. */
  private streaks(): Map<string, number> {
    const games = (this.db.query("select id from games where ended_at is not null order by started_at desc limit 90").all() as Row[]).map((r) => r.id as string);
    const present = new Map<string, Set<string>>();
    for (const r of this.db.query("select distinct game_id, player_id from answers").all() as Row[]) {
      if (!present.has(r.game_id)) present.set(r.game_id, new Set());
      present.get(r.game_id)!.add(r.player_id);
    }
    const out = new Map<string, number>();
    const alive = new Set((this.db.query("select id from players").all() as Row[]).map((r) => r.id as string));
    for (const g of games) {
      const set = present.get(g) ?? new Set();
      for (const id of [...alive]) {
        if (set.has(id)) out.set(id, (out.get(id) ?? 0) + 1);
        else alive.delete(id);
      }
      if (!alive.size) break;
    }
    return out;
  }
}

export function openStore(path: string, today: string): Store {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  const store = new Store(db);
  store.migrate(today);
  return store;
}
