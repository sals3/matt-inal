// Types et utilitaires partagés entre le serveur et le navigateur.

export type QType = "mc" | "tf" | "zoom" | "rebus" | "majority" | "closest" | "music";

export const TYPES: { id: QType; label: string; hint: string }[] = [
  { id: "mc", label: "Choix multiple", hint: "Une bonne réponse parmi quatre." },
  { id: "zoom", label: "Zoom mystère", hint: "L'image dézoome pendant le chrono. Répondre tôt rapporte plus." },
  { id: "closest", label: "Le plus proche", hint: "On devine un nombre. Le plus proche gagne au moins 500 pts." },
  { id: "majority", label: "Majorité l'emporte", hint: "Pas de bonne réponse : on gagne en choisissant comme la majorité." },
  { id: "rebus", label: "Rébus emoji", hint: "Des emojis à décoder." },
  { id: "tf", label: "Vrai ou faux", hint: "Deux choix, une seule vérité." },
  { id: "music", label: "Mercredi musical", hint: "Matt joue, l'équipe devine le titre et l'artiste." },
];
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label])) as Record<QType, string>;

export interface Player {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Photo ou caricature téléversée (sinon on affiche l'emoji). */
  avatarId?: string | null;
  /** Champion en titre : gagnant de la dernière saison gravée sur la Coupe. */
  champ?: boolean;
}

/** Données propres à chaque type de question (forme plate pour rester simple). */
export interface QData {
  choices?: string[];
  correct?: number;
  answer?: number;
  min?: number;
  max?: number;
  title?: string;
  alts?: string[];
  artist?: string;
  year?: number | null;
  hints?: string[];
  mode?: "live" | "rec";
  style?: string;
  audioId?: string | null;
  /** Mode cerveau strict : quitter l'onglet pendant la question donne 0 point. */
  strict?: boolean;
}

export interface Question {
  id: string;
  type: QType;
  prompt: string;
  emoji: string;
  imageId: string | null;
  timeLimit: number;
  speedBonus: boolean;
  doublePoints: boolean;
  data: QData;
  /** Proposée par un joueur (boîte à questions) : il ne peut pas y répondre. */
  authorId?: string | null;
}

/* ---------- Power-ups « Mario Kart » ---------- */

export type PowerKind = "fifty" | "freeze" | "double" | "shell";

export const POWERS: Record<PowerKind, { emoji: string; name: string; desc: string }> = {
  fifty: { emoji: "🎯", name: "50/50", desc: "Enlève deux mauvaises réponses." },
  freeze: { emoji: "⏸️", name: "Gel du chrono", desc: "Ton bonus vitesse reste au maximum pendant 10 secondes." },
  double: { emoji: "🍄", name: "Double ou rien", desc: "×2 si t'as raison, −300 sinon." },
  shell: { emoji: "💙", name: "Carapace bleue", desc: "Le premier du classement perd son bonus vitesse pour la question." },
};

/** Les power-ups qui ont du sens pour chaque type de question. */
export function powerFits(kind: PowerKind, q: Pick<Question, "type" | "speedBonus" | "data">): boolean {
  if (kind === "fifty") return ["mc", "zoom", "rebus"].includes(q.type) && (q.data.choices?.length ?? 0) >= 4;
  if (kind === "freeze") return q.type !== "music" && q.speedBonus;
  return true;
}

export type PowerTier = "start" | "crown" | "top" | "middle" | "bottom" | "last";

export const TIERS: Record<PowerTier, { label: string; items: PowerKind[] }> = {
  start: { label: "Départ de saison", items: ["fifty"] },
  crown: { label: "👑 Couronne lourde", items: [] },
  top: { label: "Le peloton de tête", items: ["fifty"] },
  middle: { label: "Le milieu du peloton", items: ["fifty", "freeze"] },
  bottom: { label: "La remontée", items: ["fifty", "freeze", "double"] },
  last: { label: "Lanterne rouge… armée", items: ["fifty", "freeze", "double", "shell"] },
};

export interface PowerInventory {
  week: string;
  tier: PowerTier;
  rank: number | null;
  seen: boolean;
  items: { kind: PowerKind; total: number; left: number }[];
}

export interface WeekDistribution {
  week: string;
  crownId: string | null;
  rows: { player: Player; tier: PowerTier; rank: number | null; used: PowerKind[] }[];
}

export interface Trophy {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  winners: Player[];
  value: string;
}

export interface WeekTrophies {
  week: string;
  games: number;
  trophies: Trophy[];
}

export interface Performance {
  questionId: string;
  day: string;
  title: string;
  style: string;
  avg: number;
  count: number;
}

export type SubmissionStatus = "pending" | "accepted" | "rejected";

export interface Submission {
  id: string;
  player: Player;
  question: Question;
  status: SubmissionStatus;
  createdAt: number;
}

export type QuizStatus = "draft" | "ready" | "played";

export interface Quiz {
  id: string;
  day: string;
  theme: string;
  status: QuizStatus;
  questions: Question[];
}

export interface QuizSummary {
  id: string;
  day: string;
  theme: string;
  status: QuizStatus;
  count: number;
}

export interface Reveal {
  questionId: string;
  /** Index des bonnes réponses (plusieurs en cas d'égalité pour « Majorité l'emporte »). */
  correct: number[];
  answer?: number;
  music?: { title: string; artist: string; year: number | null };
  counts: number[];
  picks: Record<string, unknown>;
  points: Record<string, number>;
  detail: Record<string, string>;
  nobody: boolean;
  /** Joueurs qui ont quitté l'onglet avant de répondre (🤖). */
  away: string[];
  /** Question proposée par un joueur : son bonus si elle est bien dosée (30 à 70 % de bonnes réponses). */
  author?: { id: string; bonus: number; rate: number } | null;
}

export type Phase = "idle" | "lobby" | "question" | "reveal" | "podium";

export interface PublicState {
  phase: Phase;
  gameId: string | null;
  quiz: { id: string; day: string; theme: string } | null;
  qIndex: number;
  qCount: number;
  question: Question | null;
  startedAt: number;
  deadline: number;
  serverNow: number;
  answered: string[];
  away: string[];
  /** Power-ups utilisés à la question en cours, par joueur. */
  powers: Record<string, PowerKind>;
  /** Carapace bleue lancée à la question en cours. */
  shell: { from: string; to: string } | null;
  /** Porteur de la couronne lourde cette semaine (bonus vitesse divisé par deux). */
  crownId: string | null;
  /** Applaudimètre en direct (révélation d'un Mercredi musical). */
  applause: { avg: number; count: number } | null;
  presence: Player[];
  reveal: Reveal | null;
  totals: Record<string, number>;
  players: Record<string, Player>;
}

export interface Standing {
  player: Player;
  points: number;
  played: number;
  streak: number;
  rank: number;
  prevRank: number | null;
  lastGame: number;
  /** Part des réponses données sans quitter l'onglet (null si aucune réponse). */
  brainPct: number | null;
}

export type SeasonStatus = "open" | "closed" | "legacy";

export interface Season {
  id: string;
  num: number;
  name: string;
  startDay: string | null;
  endDay: string | null;
  status: SeasonStatus;
  championId: string | null;
  championName: string;
  championPoints: number | null;
  /** Le joueur lié au champion, s'il a un compte (pour sa photo). */
  champion?: Player | null;
}

export interface Leaderboard {
  season: Season;
  seasons: Season[];
  standings: Standing[];
  mattVsTeam: { matt: number; team: number };
  games: number;
  lastPodium: { day: string; entries: { player: Player; points: number }[] } | null;
  /** Les plaques de la Coupe : saisons terminées, dans l'ordre. */
  cup: Season[];
}

export interface Sticker {
  id: string;
  mediaId: string;
  name: string;
  playerId: string | null;
}

export type ClientMsg =
  | { t: "answer"; qid: string; value: unknown }
  | { t: "react"; e?: string; sticker?: string; target?: string }
  | { t: "away" }
  | { t: "power"; kind: PowerKind }
  | { t: "rate"; stars: number }
  | { t: "host"; action: "open" | "next" | "reveal" | "close"; quizId?: string };

export type ServerMsg =
  | { t: "state"; s: PublicState }
  | { t: "toast"; msg: string }
  | { t: "power"; kind: PowerKind; removed?: number[] }
  | { t: "react"; playerId: string; e?: string; sticker?: string; target?: string }
  | { t: "stickers" }
  | { t: "error"; msg: string };

export const REACTIONS = ["😂", "🔥", "😱", "👏", "☕", "🎉"];

/* ---------- Correspondance approximative (titres, artistes) ---------- */

export function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(l|la|le|les|the|un|une|de|du|des|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lev(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

export function fuzzyMatch(input: unknown, accepted: (string | undefined)[]): { ok: boolean; exact: boolean } {
  const n = norm(input);
  if (!n) return { ok: false, exact: false };
  for (const t of accepted) {
    const nt = norm(t);
    if (!nt) continue;
    if (n === nt) return { ok: true, exact: true };
    if (1 - lev(n, nt) / Math.max(n.length, nt.length) >= 0.75) return { ok: true, exact: false };
    if (n.length >= 5 && (nt.includes(n) || n.includes(nt))) return { ok: true, exact: false };
    // « bethoven » pour « Ludwig van Beethoven » : un seul mot distinctif mal orthographié.
    const words = nt.split(" ").filter((w) => w.length >= 5);
    if (!n.includes(" ") && n.length >= 5 && words.some((w) => 1 - lev(n, w) / Math.max(n.length, w.length) >= 0.75)) return { ok: true, exact: false };
  }
  return { ok: false, exact: false };
}

/* ---------- Dates (heure de l'Est, comme le standup) ---------- */

export const TZ = "America/Toronto";

export function dayStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const monthOf = (day: string) => day.slice(0, 7);

/** Jours de semaine à partir d'aujourd'hui (lundi au vendredi). */
export function upcomingWeekdays(count: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(`${dayStr(from)}T12:00:00Z`);
  while (out.length < count) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le lundi de la semaine du jour donné : la clé de la boîte à items. */
export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7));
