import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Leaderboard, Player, Question, Quiz, QuizStatus, QuizSummary, Standing } from "./shared";

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
create index if not exists idx_answers_player on answers(player_id);
create index if not exists idx_games_day on games(day);
`;

type Row = Record<string, any>;

const toPlayer = (r: Row): Player => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color });
const toQuestion = (r: Row): Question => ({
  id: r.id, type: r.type, prompt: r.prompt, emoji: r.emoji, imageId: r.image_id,
  timeLimit: r.time_limit, speedBonus: !!r.speed_bonus, doublePoints: !!r.double_points, data: JSON.parse(r.data),
});

export class Store {
  constructor(readonly db: Database) {}

  /* ----- Joueurs ----- */
  createPlayer(name: string, emoji: string, color: string): { player: Player; token: string } {
    const player = { id: newId(), name, emoji, color };
    const token = newToken();
    this.db.query("insert into players (id, name, emoji, color, token, created_at) values (?, ?, ?, ?, ?, ?)")
      .run(player.id, name, emoji, color, token, Date.now());
    return { player, token };
  }
  playerByToken(token: string): Player | null {
    if (!token) return null;
    const r = this.db.query("select * from players where token = ?").get(token) as Row | null;
    return r ? toPlayer(r) : null;
  }
  updatePlayer(id: string, name: string, emoji: string, color: string): void {
    this.db.query("update players set name = ?, emoji = ?, color = ? where id = ?").run(name, emoji, color, id);
  }
  players(): Player[] {
    return (this.db.query("select * from players order by name").all() as Row[]).map(toPlayer);
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
  quizByDay(day: string): Quiz | null {
    const r = this.db.query("select * from quizzes where day = ?").get(day) as Row | null;
    return r ? { id: r.id, day: r.day, theme: r.theme, status: r.status, questions: this.questionsOf(r.id) } : null;
  }
  quizById(id: string): Quiz | null {
    const r = this.db.query("select * from quizzes where id = ?").get(id) as Row | null;
    return r ? { id: r.id, day: r.day, theme: r.theme, status: r.status, questions: this.questionsOf(r.id) } : null;
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

  /* ----- Médias (images de fond, extraits audio) ----- */
  saveMedia(mime: string, bytes: Uint8Array): string {
    const id = newId();
    this.db.query("insert into media (id, mime, bytes, created_at) values (?, ?, ?, ?)").run(id, mime, bytes, Date.now());
    return id;
  }
  media(id: string): { mime: string; bytes: Uint8Array } | null {
    return this.db.query("select mime, bytes from media where id = ?").get(id) as { mime: string; bytes: Uint8Array } | null;
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
  saveAnswers(gameId: string, questionId: string, rows: { playerId: string; value: unknown; ms: number; points: number }[]): void {
    const ins = this.db.query(
      "insert or replace into answers (game_id, question_id, player_id, value, ms, points) values (?, ?, ?, ?, ?, ?)",
    );
    this.db.transaction(() => rows.forEach((r) => ins.run(gameId, questionId, r.playerId, JSON.stringify(r.value), r.ms, r.points)))();
  }
  addBonus(playerId: string, day: string, points: number, reason: string): void {
    this.db.query("insert into bonuses (id, player_id, day, points, reason, created_at) values (?, ?, ?, ?, ?, ?)")
      .run(newId(), playerId, day, points, reason, Date.now());
  }

  /* ----- Classement ----- */
  leaderboard(month: string): Leaderboard {
    const players = new Map(this.players().map((p) => [p.id, p]));
    const games = this.db.query(
      "select id, day from games where substr(day, 1, 7) = ? and ended_at is not null order by started_at",
    ).all(month) as Row[];
    const lastGame = games.at(-1);

    const pts = new Map<string, number>();
    const played = new Map<string, number>();
    const last = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    for (const r of this.db.query(
      `select a.player_id, a.game_id, sum(a.points) as pts from answers a join games g on g.id = a.game_id
       where substr(g.day, 1, 7) = ? and g.ended_at is not null group by a.player_id, a.game_id`,
    ).all(month) as Row[]) {
      add(pts, r.player_id, r.pts);
      add(played, r.player_id, 1);
      if (r.game_id === lastGame?.id) last.set(r.player_id, r.pts);
    }
    for (const r of this.db.query(
      "select player_id, sum(points) as pts from bonuses where substr(day, 1, 7) = ? group by player_id",
    ).all(month) as Row[]) add(pts, r.player_id, r.pts);

    const ids = [...pts.keys()].filter((id) => players.has(id));
    const rankBy = (score: (id: string) => number) => {
      const sorted = [...ids].sort((a, b) => score(b) - score(a));
      return new Map(sorted.map((id, i) => [id, i + 1]));
    };
    const now = rankBy((id) => pts.get(id)!);
    const before = games.length > 1 ? rankBy((id) => pts.get(id)! - (last.get(id) ?? 0)) : null;
    const streaks = this.streaks();

    const standings: Standing[] = ids
      .map((id) => ({
        player: players.get(id)!, points: pts.get(id)!, played: played.get(id) ?? 0, streak: streaks.get(id) ?? 0,
        rank: now.get(id)!, prevRank: before?.get(id) ?? null, lastGame: last.get(id) ?? 0,
      }))
      .sort((a, b) => a.rank - b.rank);

    const mvt = this.db.query(
      `select coalesce(sum(case when mx > 0 then 1 else 0 end), 0) as team, coalesce(sum(case when mx <= 0 then 1 else 0 end), 0) as matt
       from (select max(a.points) as mx from answers a join games g on g.id = a.game_id
             where substr(g.day, 1, 7) = ? group by a.game_id, a.question_id)`,
    ).get(month) as Row;

    let lastPodium: Leaderboard["lastPodium"] = null;
    const lg = this.db.query("select id, day from games where ended_at is not null order by started_at desc limit 1").get() as Row | null;
    if (lg) {
      const rows = this.db.query(
        "select player_id, sum(points) as pts from answers where game_id = ? group by player_id order by pts desc limit 3",
      ).all(lg.id) as Row[];
      lastPodium = { day: lg.day, entries: rows.filter((r) => players.has(r.player_id)).map((r) => ({ player: players.get(r.player_id)!, points: r.pts })) };
    }

    return { month, standings, mattVsTeam: { matt: mvt.matt, team: mvt.team }, games: games.length, lastPodium, hall: this.hall(month, players) };
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
    const alive = new Set(this.players().map((p) => p.id));
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

  /** Champion de chaque saison terminée (mois avant le mois affiché). */
  private hall(currentMonth: string, players: Map<string, Player>): Leaderboard["hall"] {
    const rows = this.db.query(
      `select substr(g.day, 1, 7) as month, a.player_id, sum(a.points) as pts from answers a join games g on g.id = a.game_id
       where g.ended_at is not null and substr(g.day, 1, 7) < ? group by month, a.player_id`,
    ).all(currentMonth) as Row[];
    const best = new Map<string, Row>();
    for (const r of rows) if (!best.has(r.month) || r.pts > best.get(r.month)!.pts) best.set(r.month, r);
    return [...best.values()]
      .filter((r) => players.has(r.player_id))
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, 12)
      .map((r) => ({ month: r.month, player: players.get(r.player_id)!, points: r.pts }));
  }
}

export function openStore(path: string): Store {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  return new Store(db);
}
