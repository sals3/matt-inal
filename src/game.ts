import type { Store } from "./db";
import { hintTimes, scoreQuestion, validAnswer, type RawAnswer } from "./scoring";
import { REACTIONS, type Phase, type Player, type PublicState, type Question, type Quiz, type Reveal, type ServerMsg } from "./shared";

/** Délai de grâce après le chrono, pour la latence réseau. */
const GRACE_MS = 600;

/** Retire ce qui donnerait la réponse avant la révélation. */
function sanitize(q: Question, hintsShown: number, revealed: boolean): Question {
  if (revealed) return q;
  const { correct, answer, title, alts, artist, year, hints, ...safe } = q.data;
  return { ...q, data: { ...safe, hints: (hints ?? []).filter((h) => h && h.trim()).slice(0, hintsShown) } };
}

/**
 * Une seule partie en direct à la fois (une équipe, un standup).
 * L'état vit en mémoire ; les réponses notées sont écrites dans SQLite à chaque révélation.
 */
export class Game {
  phase: Phase = "idle";
  gameId: string | null = null;
  quiz: Quiz | null = null;
  qIndex = -1;
  startedAt = 0;
  deadline = 0;
  hintsShown = 0;
  answers = new Map<string, RawAnswer>();
  reveal: Reveal | null = null;
  totals: Record<string, number> = {};
  participants = new Map<string, Player>();
  presence = new Map<string, { player: Player; sockets: number }>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private lastReact = new Map<string, number>();

  constructor(private store: Store, private publish: (msg: ServerMsg) => void) {}

  get question(): Question | null {
    return this.quiz?.questions[this.qIndex] ?? null;
  }

  state(): PublicState {
    const q = this.question;
    const showQ = q && (this.phase === "question" || this.phase === "reveal");
    const players: Record<string, Player> = {};
    for (const p of this.participants.values()) players[p.id] = p;
    for (const { player } of this.presence.values()) players[player.id] = player;
    return {
      phase: this.phase,
      gameId: this.gameId,
      quiz: this.quiz && { id: this.quiz.id, day: this.quiz.day, theme: this.quiz.theme },
      qIndex: this.qIndex,
      qCount: this.quiz?.questions.length ?? 0,
      question: showQ ? sanitize(q, this.hintsShown, this.phase === "reveal") : null,
      startedAt: this.startedAt,
      deadline: this.deadline,
      serverNow: Date.now(),
      answered: [...this.answers.keys()],
      presence: [...this.presence.values()].map((p) => p.player),
      reveal: this.phase === "reveal" ? this.reveal : null,
      totals: this.totals,
      players,
    };
  }

  private broadcast() {
    this.publish({ t: "state", s: this.state() });
  }
  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /* ----- Présence ----- */
  join(player: Player) {
    const p = this.presence.get(player.id);
    this.presence.set(player.id, { player, sockets: (p?.sockets ?? 0) + 1 });
    if (this.phase !== "idle") this.participants.set(player.id, player);
    this.broadcast();
  }
  leave(playerId: string) {
    const p = this.presence.get(playerId);
    if (!p) return;
    if (p.sockets <= 1) this.presence.delete(playerId);
    else p.sockets--;
    this.broadcast();
  }
  rename(player: Player) {
    const p = this.presence.get(player.id);
    if (p) p.player = player;
    if (this.participants.has(player.id)) this.participants.set(player.id, player);
    this.broadcast();
  }

  /* ----- Actions de Matt ----- */
  open(quizId: string): string | null {
    const quiz = this.store.quizById(quizId);
    if (!quiz) return "Quiz introuvable.";
    if (!quiz.questions.length) return "Ce quiz n'a pas encore de questions.";
    this.clearTimers();
    Object.assign(this, { quiz, phase: "lobby", qIndex: -1, totals: {}, reveal: null, answers: new Map(), startedAt: 0, deadline: 0 });
    this.participants = new Map([...this.presence.values()].map((p) => [p.player.id, p.player]));
    this.gameId = this.store.createGame(quiz.id, quiz.day);
    this.broadcast();
    return null;
  }

  next(): string | null {
    if (!this.quiz) return "Aucune partie ouverte.";
    if (this.phase === "question") return "Révèle d'abord la réponse.";
    if (this.phase === "podium") return "La partie est terminée.";
    if (this.qIndex + 1 >= this.quiz.questions.length) return this.podium();
    this.startQuestion(this.qIndex + 1);
    return null;
  }

  private startQuestion(i: number) {
    this.clearTimers();
    const q = this.quiz!.questions[i]!;
    this.qIndex = i;
    this.phase = "question";
    this.answers = new Map();
    this.reveal = null;
    this.hintsShown = 0;
    this.startedAt = Date.now();
    this.deadline = this.startedAt + q.timeLimit * 1000;
    this.timers.push(setTimeout(() => this.doReveal(), q.timeLimit * 1000 + GRACE_MS));
    if (q.type === "music") {
      hintTimes(q).forEach((t, k) => this.timers.push(setTimeout(() => { this.hintsShown = k + 1; this.broadcast(); }, t)));
    }
    this.broadcast();
  }

  answer(player: Player, qid: string, value: unknown): string | null {
    const q = this.question;
    if (this.phase !== "question" || !q || q.id !== qid) return "Trop tard pour cette question.";
    if (this.answers.has(player.id)) return "Ta réponse est déjà verrouillée.";
    const at = Date.now() - this.startedAt;
    if (at > q.timeLimit * 1000 + GRACE_MS) return "Le temps est écoulé.";
    const v = validAnswer(q, value);
    if (v === undefined) return "Réponse invalide.";
    this.answers.set(player.id, { playerId: player.id, value: v, at });
    this.participants.set(player.id, player);
    // Tout le monde a répondu : on révèle sans attendre la fin du chrono.
    const everyone = [...this.presence.keys()].every((id) => this.answers.has(id));
    if (everyone && this.presence.size > 0) this.timers.push(setTimeout(() => this.doReveal(), 900));
    this.broadcast();
    return null;
  }

  doReveal(): string | null {
    const q = this.question;
    if (this.phase !== "question" || !q || !this.gameId) return "Aucune question en cours.";
    this.clearTimers();
    const answers = [...this.answers.values()];
    this.reveal = scoreQuestion(q, answers);
    for (const [id, p] of Object.entries(this.reveal.points)) this.totals[id] = (this.totals[id] ?? 0) + p;
    for (const id of this.participants.keys()) this.totals[id] ??= 0;
    this.store.saveAnswers(this.gameId, q.id, answers.map((a) => ({ playerId: a.playerId, value: a.value, ms: a.at, points: this.reveal!.points[a.playerId] ?? 0 })));
    this.phase = "reveal";
    this.broadcast();
    return null;
  }

  private podium(): null {
    this.clearTimers();
    this.phase = "podium";
    if (this.gameId) this.store.endGame(this.gameId);
    if (this.quiz) this.store.setQuizStatus(this.quiz.id, "played");
    this.broadcast();
    return null;
  }

  close(): null {
    this.clearTimers();
    if (this.gameId && this.phase !== "podium" && this.phase !== "idle") this.store.endGame(this.gameId);
    Object.assign(this, { phase: "idle", gameId: null, quiz: null, qIndex: -1, reveal: null, totals: {}, answers: new Map() });
    this.participants = new Map();
    this.broadcast();
    return null;
  }

  /* ----- Ambiance ----- */
  toast(msg: string) {
    this.publish({ t: "toast", msg });
  }

  react(playerId: string, e: string) {
    if (!REACTIONS.includes(e)) return;
    const now = Date.now();
    if (now - (this.lastReact.get(playerId) ?? 0) < 700) return;
    this.lastReact.set(playerId, now);
    this.publish({ t: "react", playerId, e });
  }
}
