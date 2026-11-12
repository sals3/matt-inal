import type { Store } from "./db";
import { authorBonus, HELP_BONUS, HUNT_STUN_MS, hintTimes, scoreQuestion, validAnswer, type RawAnswer } from "./scoring";
import {
  dayStr, mondayOf, POWERS, powerFits, REACTIONS, spotHit,
  type Phase, type Player, type PowerKind, type PublicState, type Question, type Quiz, type Reveal, type ServerMsg,
} from "./shared";

/** Délai de grâce après le chrono, pour la latence réseau. */
const GRACE_MS = 600;

/** Retire ce qui donnerait la réponse avant la révélation. */
function sanitize(q: Question, hintsShown: number, revealed: boolean): Question {
  if (revealed) return q;
  const { correct, answer, title, alts, artist, year, hints, spots, ...safe } = q.data;
  return {
    ...q,
    data: {
      ...safe,
      hints: (hints ?? []).filter((h) => h && h.trim()).slice(0, hintsShown),
      // La chasse : on montre la liste des objets, pas leur cachette.
      ...(spots ? { spots: spots.map((s) => ({ label: s.label, x: -1, y: -1, r: 0 })) } : {}),
    },
  };
}

/** Types dont on mélange les choix à chaque partie (vrai ou faux garde son ordre). */
const SHUFFLED = new Set(["mc", "zoom", "rebus", "majority"]);

/** Mélange les choix : Matt entre la bonne réponse où il veut, sans créer de pattern. */
export function shuffleChoices(q: Question, rand = Math.random): Question {
  const choices = q.data.choices;
  if (!SHUFFLED.has(q.type) || !choices || choices.length < 2) return q;
  const order = choices.map((_, k) => k);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const correct = q.data.correct === undefined ? undefined : order.indexOf(q.data.correct);
  return { ...q, data: { ...q.data, choices: order.map((k) => choices[k]!), ...(correct === undefined ? {} : { correct }) } };
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
  /** Joueurs qui ont quitté le quiz pendant la question en cours, avant de répondre. */
  away = new Set<string>();
  /** Un seul power-up par joueur et par question. */
  powerUse = new Map<string, PowerKind>();
  shell: { from: string; to: string } | null = null;
  /** 🤝 Coups de main de la question en cours : demandeur → aidant. */
  helps = new Map<string, string>();
  /** Un coup de main par joueur et par partie. */
  helpUsed = new Set<string>();
  /** 🔎 Chasse en cours : objets trouvés, moment du dernier, et fin de l'étourdissement après un clic raté. */
  hunts = new Map<string, { found: number[]; lastAt: number; stunUntil: number }>();
  week = "";
  crownId: string | null = null;
  applause: { avg: number; count: number } | null = null;
  reveal: Reveal | null = null;
  totals: Record<string, number> = {};
  participants = new Map<string, Player>();
  presence = new Map<string, { player: Player; sockets: number }>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private lastReact = new Map<string, number>();

  constructor(
    private store: Store,
    private publish: (msg: ServerMsg) => void,
    /** Message privé à un joueur (tous ses onglets). */
    private publishTo: (playerId: string, msg: ServerMsg) => void = () => {},
  ) {}

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
      away: [...this.away],
      powers: Object.fromEntries(this.powerUse),
      shell: this.shell,
      helps: Object.fromEntries(this.helps),
      helpUsed: [...this.helpUsed],
      crownId: this.crownId,
      applause: this.phase === "reveal" && q?.type === "music" ? this.applause : null,
      hunt: Object.fromEntries([...this.hunts].map(([id, h]) => [id, h.found.length])),
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
    const stored = this.store.quizById(quizId);
    if (!stored) return "Quiz introuvable.";
    // Même ordre pour tout le monde (et l'écran d'animation) pendant la partie.
    const quiz = { ...stored, questions: stored.questions.map((q) => shuffleChoices(q)) };
    if (!quiz.questions.length) return "Ce quiz n'a pas encore de questions.";
    this.clearTimers();
    Object.assign(this, { quiz, phase: "lobby", qIndex: -1, totals: {}, reveal: null, answers: new Map(), startedAt: 0, deadline: 0 });
    this.participants = new Map([...this.presence.values()].map((p) => [p.player.id, p.player]));
    this.week = mondayOf(dayStr());
    this.crownId = this.store.crownId(this.week);
    this.helpUsed = new Set();
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
    Object.assign(this, { qIndex: i, phase: "question", answers: new Map(), away: new Set(), powerUse: new Map(), helps: new Map(), hunts: new Map(), shell: null, applause: null, reveal: null, hintsShown: 0 });
    if (q.data.sudden) this.toast("💀 Mort subite! Bonne réponse ×1,5, mauvaise réponse −300.");
    if (q.data.stake) this.toast("🎰 Question à enjeu! Fais ta mise avant de répondre.");
    this.startedAt = Date.now();
    this.deadline = this.startedAt + q.timeLimit * 1000;
    this.timers.push(setTimeout(() => this.doReveal(), q.timeLimit * 1000 + GRACE_MS));
    if (q.type === "music") {
      hintTimes(q).forEach((t, k) => this.timers.push(setTimeout(() => { this.hintsShown = k + 1; this.broadcast(); }, t)));
    }
    if (q.authorId) {
      const author = this.store.player(q.authorId);
      if (author) { this.participants.set(author.id, author); this.toast(`📬 Question proposée par ${author.name}. Lui, il regarde les autres suer.`); }
    }
    this.broadcast();
  }

  answer(player: Player, qid: string, value: unknown, stake?: unknown): string | null {
    const q = this.question;
    if (this.phase !== "question" || !q || q.id !== qid) return "Trop tard pour cette question.";
    if (q.authorId === player.id) return "C'est ta question! Tu regardes les autres suer.";
    if (this.answers.has(player.id)) return "Ta réponse est déjà verrouillée.";
    if (q.type === "hunt") return "Clique dans le décor pour trouver les objets.";
    const at = Date.now() - this.startedAt;
    if (at > q.timeLimit * 1000 + GRACE_MS) return "Le temps est écoulé.";
    const v = validAnswer(q, value);
    if (v === undefined) return "Réponse invalide.";
    const s = Number(stake);
    this.answers.set(player.id, { playerId: player.id, value: v, at, away: this.away.has(player.id), stake: q.data.stake && Number.isFinite(s) ? s : undefined });
    this.participants.set(player.id, player);
    // Ceux qui ont appelé ce joueur à l'aide voient sa réponse tout de suite.
    for (const [req, helper] of this.helps) {
      if (helper === player.id) this.publishTo(req, { t: "help", helper: player.id, answered: true, pick: v });
    }
    this.revealIfAllDone(q);
    this.broadcast();
    return null;
  }

  /** Tout le monde a répondu (sauf l'auteur de la question) : on révèle sans attendre la fin du chrono. */
  private revealIfAllDone(q: Question) {
    const expected = [...this.presence.keys()].filter((id) => id !== q.authorId);
    if (expected.length > 0 && expected.every((id) => this.answers.has(id))) this.timers.push(setTimeout(() => this.doReveal(), 900));
  }

  /** 🔎 Un clic dans le décor de la chasse. La réponse (trouvé ou raté) ne va qu'au joueur. */
  tap(player: Player, qid: string, x: number, y: number): string | null {
    const q = this.question;
    if (this.phase !== "question" || !q || q.id !== qid || q.type !== "hunt") return "Trop tard pour cette chasse.";
    if (q.authorId === player.id) return "C'est ta chasse! Tu regardes les autres chercher.";
    if (this.answers.has(player.id) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const now = Date.now();
    const at = now - this.startedAt;
    if (at > q.timeLimit * 1000 + 600) return "Le temps est écoulé.";
    const h = this.hunts.get(player.id) ?? { found: [], lastAt: 0, stunUntil: 0 };
    this.hunts.set(player.id, h);
    this.participants.set(player.id, player);
    if (now < h.stunUntil) return null;
    const spots = q.data.spots ?? [];
    const hit = spotHit(spots, q.data.ratio ?? 1.5, x, y, h.found);
    if (hit === null) {
      h.stunUntil = now + HUNT_STUN_MS;
      this.publishTo(player.id, { t: "tap", hit: null, x, y, stunMs: HUNT_STUN_MS });
      return null;
    }
    h.found.push(hit);
    h.lastAt = at;
    this.publishTo(player.id, { t: "tap", hit, x, y });
    if (h.found.length >= spots.length) {
      this.answers.set(player.id, { playerId: player.id, value: { found: h.found }, at, away: this.away.has(player.id) });
      this.toast(`🔎 ${player.name} a tout trouvé en ${Math.round(at / 1000)} s!`);
      this.revealIfAllDone(q);
    }
    this.broadcast();
    return null;
  }

  doReveal(): string | null {
    const q = this.question;
    if (this.phase !== "question" || !q || !this.gameId) return "Aucune question en cours.";
    this.clearTimers();
    // 🔎 Ceux qui n'ont pas tout trouvé gardent leurs trouvailles.
    for (const [id, h] of this.hunts) {
      if (!this.answers.has(id) && h.found.length) this.answers.set(id, { playerId: id, value: { found: h.found }, at: h.lastAt, away: this.away.has(id) });
    }
    const answers = [...this.answers.values()].map((a) => ({
      ...a,
      double: this.powerUse.get(a.playerId) === "double",
      freeze: this.powerUse.get(a.playerId) === "freeze",
      shelled: this.shell?.to === a.playerId,
      crowned: this.crownId === a.playerId,
    }));
    const reveal = scoreQuestion(q, answers);
    // 🤝 Coup de main réussi : les deux ont raison, l'aidant gagne +100.
    for (const [req, helper] of this.helps) {
      const helperName = this.participants.get(helper)?.name ?? "un coéquipier";
      const reqName = this.participants.get(req)?.name ?? "un coéquipier";
      if (reveal.detail[req] !== undefined) reveal.detail[req] += ` · 🤝 Aidé par ${helperName}`;
      if ((reveal.points[req] ?? 0) > 0 && (reveal.points[helper] ?? 0) > 0) {
        reveal.points[helper]! += HELP_BONUS;
        reveal.detail[helper] += ` · 🤝 Coup de main à ${reqName} (+${HELP_BONUS})`;
      }
    }
    if (q.authorId && this.quiz) {
      const { bonus, rate } = authorBonus(reveal.points);
      reveal.author = { id: q.authorId, bonus, rate };
      if (bonus) {
        this.store.addBonus(q.authorId, this.quiz.day, bonus, "Question bien dosée");
        this.totals[q.authorId] = (this.totals[q.authorId] ?? 0) + bonus;
      }
    }
    this.reveal = reveal;
    for (const [id, p] of Object.entries(reveal.points)) this.totals[id] = (this.totals[id] ?? 0) + p;
    for (const id of this.participants.keys()) this.totals[id] ??= 0;
    this.store.saveAnswers(this.gameId, q.id, answers.map((a) => ({ playerId: a.playerId, value: a.value, ms: a.at, points: reveal.points[a.playerId] ?? 0, away: !!a.away })));
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
    Object.assign(this, { phase: "idle", gameId: null, quiz: null, qIndex: -1, reveal: null, totals: {}, answers: new Map(), powerUse: new Map(), shell: null });
    this.participants = new Map();
    this.broadcast();
    return null;
  }

  /* ----- Power-ups ----- */
  usePower(player: Player, kind: PowerKind): { error?: string; removed?: number[] } {
    const q = this.question;
    if (!POWERS[kind]) return { error: "Power-up inconnu." };
    if (this.phase !== "question" || !q || !this.gameId) return { error: "Les power-ups s'utilisent pendant une question." };
    if (q.authorId === player.id) return { error: "Pas de power-up sur ta propre question!" };
    if (this.powerUse.has(player.id)) return { error: "Un seul power-up par question." };
    if (kind !== "shell" && this.answers.has(player.id)) return { error: "Trop tard : ta réponse est déjà verrouillée." };
    if (!powerFits(kind, q)) return { error: `${POWERS[kind].name} ne marche pas sur ce type de question.` };

    let target: Player | null = null;
    if (kind === "shell") {
      target = this.store.leaderboard().standings[0]?.player ?? null;
      if (!target) return { error: "Personne n'est encore premier : rien à viser." };
      if (target.id === player.id) return { error: "T'es premier : tu peux pas te lancer une carapace à toi-même 😄" };
      if (this.shell) return { error: "Une carapace vole déjà sur cette question." };
    }
    if (!this.store.consumePower(player.id, this.week, kind, this.gameId, q.id, target?.id ?? null)) return { error: `T'as plus de ${POWERS[kind].name} cette semaine.` };

    this.powerUse.set(player.id, kind);
    this.participants.set(player.id, player);
    let removed: number[] | undefined;
    if (kind === "fifty") {
      removed = (q.data.choices ?? []).map((_, k) => k).filter((k) => k !== q.data.correct).sort(() => Math.random() - 0.5).slice(0, 2).sort();
      this.toast(`🎯 ${player.name} sort son 50/50.`);
    } else if (kind === "double") {
      this.toast(`🍄 ${player.name} joue Double ou rien! Ça passe ou ça casse.`);
    } else if (kind === "freeze") {
      this.toast(`⏸️ ${player.name} gèle son chrono.`);
    } else if (target) {
      this.shell = { from: player.id, to: target.id };
      this.participants.set(target.id, target);
      this.toast(`💙 ${player.name} lance la carapace bleue sur ${target.name}!`);
    }
    this.broadcast();
    return { removed };
  }

  /* ----- Coup de main en duo (l'appel à un ami) ----- */
  help(player: Player, targetId: string): string | null {
    const q = this.question;
    if (this.phase !== "question" || !q) return "Le coup de main se demande pendant une question.";
    if (q.type === "music") return "Pas de coup de main au Mercredi musical : c'est entre toi et ton oreille.";
    if (q.type === "hunt") return "Pas de coup de main à la chasse : chacun ses lunettes!";
    if (q.authorId === player.id) return "C'est ta question!";
    if (this.answers.has(player.id)) return "Ta réponse est déjà verrouillée.";
    if (this.helpUsed.has(player.id)) return "T'as déjà utilisé ton coup de main dans cette partie.";
    const target = this.presence.get(targetId)?.player;
    if (!target || target.id === player.id) return "Choisis un coéquipier connecté.";
    if (q.authorId === target.id) return `${target.name} ne peut pas répondre : c'est sa question!`;
    this.helpUsed.add(player.id);
    this.helps.set(player.id, target.id);
    this.participants.set(player.id, player);
    const done = this.answers.get(target.id);
    this.publishTo(player.id, { t: "help", helper: target.id, answered: !!done, pick: done?.value });
    this.toast(`🤝 ${player.name} appelle ${target.name} à l'aide!`);
    this.broadcast();
    return null;
  }

  /* ----- Applaudimètre ----- */
  rate(player: Player, stars: number): string | null {
    const q = this.question;
    if (this.phase !== "reveal" || q?.type !== "music" || !this.gameId) return "L'applaudimètre s'ouvre à la révélation du Mercredi musical.";
    const n = Math.round(stars);
    if (n < 1 || n > 5) return "Entre 1 et 5 étoiles.";
    this.store.rate(this.gameId, q.id, player.id, n);
    this.applause = this.store.applause(this.gameId, q.id);
    this.broadcast();
    return null;
  }

  /* ----- Ambiance ----- */
  toast(msg: string) {
    this.publish({ t: "toast", msg });
  }

  /** Un emoji ou un sticker de l'équipe, lancé à tout le monde ou sur quelqu'un en particulier. */
  react(playerId: string, msg: { e?: string; sticker?: string; target?: string }) {
    const e = msg.e && REACTIONS.includes(msg.e) ? msg.e : undefined;
    const sticker = msg.sticker && this.store.sticker(String(msg.sticker)) ? String(msg.sticker) : undefined;
    if (!e && !sticker) return;
    const target = msg.target && msg.target !== playerId && this.store.player(String(msg.target)) ? String(msg.target) : undefined;
    const now = Date.now();
    if (now - (this.lastReact.get(playerId) ?? 0) < 700) return;
    this.lastReact.set(playerId, now);
    this.publish({ t: "react", playerId, e, sticker, target });
  }

  /** Quelqu'un a quitté le quiz pendant une question : l'équipe le sait tout de suite. */
  markAway(player: Player) {
    if (this.phase !== "question" || this.answers.has(player.id) || this.away.has(player.id)) return;
    this.away.add(player.id);
    this.toast(`🤖 ${player.name} vient de quitter le quiz… on dit ça de même.`);
    this.broadcast();
  }
}
