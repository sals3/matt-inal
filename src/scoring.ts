import { fuzzyMatch, type Question, type Reveal } from "./shared";

export const BASE = 1000;
export const SPEED_MAX = 200;
export const CLOSEST_MIN_FOR_BEST = 500;
/** Prime « 100 % cerveau » : bonne réponse sans quitter l'onglet. */
export const BRAIN_BONUS = 100;
export const FREEZE_MS = 10_000;
export const DOUBLE_PENALTY = 300;
export const AUTHOR_BONUS = 300;

export interface RawAnswer {
  playerId: string;
  value: unknown;
  /** Millisecondes écoulées depuis le début de la question. */
  at: number;
  /** A quitté l'onglet (ChatGPT, Google…) avant de répondre. */
  away?: boolean;
  /** 🍄 Double ou rien. */
  double?: boolean;
  /** ⏸️ Gel du chrono : le bonus vitesse ne descend pas pendant 10 s. */
  freeze?: boolean;
  /** 💙 Touché par la carapace bleue : pas de bonus vitesse. */
  shelled?: boolean;
  /** 👑 Couronne lourde : bonus vitesse divisé par deux. */
  crowned?: boolean;
}

/** Une question de l'équipe est « bien dosée » si 30 à 70 % des joueurs trouvent. */
export function authorBonus(points: Record<string, number>): { bonus: number; rate: number } {
  const vals = Object.values(points);
  if (vals.length < 2) return { bonus: 0, rate: 0 };
  const rate = vals.filter((p) => p > 0).length / vals.length;
  return { bonus: rate >= 0.3 && rate <= 0.7 ? AUTHOR_BONUS : 0, rate };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Bonus vitesse plafonné : la bonne réponse vaut toujours plus que la vitesse. */
export function speedBonus(at: number, limitMs: number): number {
  return Math.round(SPEED_MAX * clamp01(1 - at / limitMs));
}

/** Moments (ms) où chaque indice du Mercredi musical se débloque. */
export function hintTimes(q: Question): number[] {
  const n = (q.data.hints ?? []).filter((h) => h && h.trim()).length;
  return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * q.timeLimit * 1000) / (n + 1)));
}

export const hintsAt = (q: Question, at: number) => hintTimes(q).filter((t) => at >= t).length;

/** Valeur de la toune au moment de la réponse : chaque indice enlève 150 pts. */
export const musicWorth = (q: Question, at: number) => Math.max(250, BASE - 150 * hintsAt(q, at));

/** Tolérance de « Le plus proche », proportionnelle à l'étendue (0 à 8 → 1, 0 à 300 → 15). */
export const closestStep = (min: number, max: number) => Math.max(1, Math.round((max - min) / 20));

export function validAnswer(q: Question, value: unknown): unknown {
  if (q.type === "closest") {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(q.data.max ?? n, Math.max(q.data.min ?? n, n));
  }
  if (q.type === "music") {
    const v = (value ?? {}) as Record<string, unknown>;
    const s = (x: unknown) => String(x ?? "").trim().slice(0, 120);
    const year = Number(v.year);
    return { title: s(v.title), artist: s(v.artist), year: Number.isInteger(year) && year > 0 ? year : null };
  }
  const k = Number(value);
  const n = q.data.choices?.length ?? 0;
  return Number.isInteger(k) && k >= 0 && k < n ? k : undefined;
}

export function scoreQuestion(q: Question, answers: RawAnswer[]): Reveal {
  const limitMs = q.timeLimit * 1000;
  const points: Record<string, number> = {};
  const detail: Record<string, string> = {};
  const picks: Record<string, unknown> = {};
  const counts: number[] = Array(q.data.choices?.length ?? 0).fill(0);
  const correct: number[] = [];
  const mult = q.doublePoints ? 2 : 1;
  // L'IA est permise, mais on perd le bonus vitesse en quittant l'onglet.
  const bonus = (a: RawAnswer) => {
    if (!q.speedBonus || a.away || a.shelled) return 0;
    const b = speedBonus(a.freeze ? Math.max(0, a.at - FREEZE_MS) : a.at, limitMs);
    return a.crowned ? Math.round(b / 2) : b;
  };
  const away = answers.filter((a) => a.away).map((a) => a.playerId);
  const reveal: Reveal = { questionId: q.id, correct, counts, picks, points, detail, nobody: false, away };

  if (q.type === "closest") {
    const target = q.data.answer ?? 0;
    const step = closestStep(q.data.min ?? 0, q.data.max ?? 10);
    const diffs = answers.map((a) => Math.abs(Number(a.value) - target));
    const best = diffs.length ? Math.min(...diffs) : Infinity;
    answers.forEach((a, i) => {
      const d = diffs[i]!;
      picks[a.playerId] = Number(a.value);
      let p = d === 0 ? BASE : d <= step ? 600 : d <= 2 * step ? 300 : 0;
      if (d === best) p = Math.max(p, CLOSEST_MIN_FOR_BEST);
      detail[a.playerId] = d === 0 ? "Dans le mille" : d === best ? "Le plus proche" : p ? "Pas loin" : "Trop loin";
      points[a.playerId] = p > 0 ? (p + bonus(a)) * mult : 0;
    });
    reveal.answer = target;
  } else if (q.type === "music") {
    const year = q.data.year ?? null;
    reveal.music = { title: q.data.title ?? "", artist: q.data.artist ?? "", year };
    for (const a of answers) {
      const v = a.value as { title: string; artist: string; year: number | null };
      picks[a.playerId] = v;
      const worth = musicWorth(q, a.at);
      const t = fuzzyMatch(v.title, [q.data.title, ...(q.data.alts ?? [])]);
      const ar = fuzzyMatch(v.artist, [q.data.artist]);
      const y = year != null && v.year != null && Math.abs(v.year - year) <= 10;
      const p = (t.ok ? Math.round(worth * 0.7) : 0) + (ar.ok ? Math.round(worth * 0.3) : 0) + (y ? 200 : 0);
      detail[a.playerId] = [`Titre ${t.ok ? "✓" : "✗"}`, `Artiste ${ar.ok ? "✓" : "✗"}`, ...(year != null ? [`Année ${y ? "✓" : "✗"}`] : [])].join(" · ");
      points[a.playerId] = p * mult;
    }
  } else {
    for (const a of answers) {
      const k = Number(a.value);
      picks[a.playerId] = k;
      if (k >= 0 && k < counts.length) counts[k]!++;
    }
    const majority = q.type === "majority";
    if (majority) {
      const max = Math.max(0, ...counts);
      counts.forEach((c, k) => { if (max > 0 && c === max) correct.push(k); });
    } else if (q.data.correct != null) {
      correct.push(q.data.correct);
    }
    for (const a of answers) {
      const ok = correct.includes(Number(a.value));
      points[a.playerId] = ok ? (BASE + bonus(a)) * mult : 0;
      detail[a.playerId] = ok ? (majority ? "Avec la majorité" : "Bonne réponse") : majority ? "Esprit libre" : "Mauvaise réponse";
    }
  }

  for (const a of answers) {
    const id = a.playerId;
    if (a.away && q.data.strict) {
      points[id] = 0;
      detail[id] = "🤖 A quitté l'onglet en mode cerveau strict";
    } else if (a.away) {
      detail[id] += " · 🤖 A quitté l'onglet (pas de bonus vitesse)";
    } else if ((points[id] ?? 0) > 0) {
      points[id]! += BRAIN_BONUS * mult;
      detail[id] += " · 🧠 Prime cerveau";
    }
    if (a.shelled) detail[id] += " · 💙 Touché par la carapace bleue";
    if (a.freeze) detail[id] += " · ⏸️ Gel du chrono";
    if (a.crowned && q.speedBonus) detail[id] += " · 👑 Couronne lourde";
    if (a.double) {
      if (points[id]! > 0) { points[id]! *= 2; detail[id] += " · 🍄 Double!"; }
      else { points[id] = -DOUBLE_PENALTY; detail[id] += " · 🍄 Double ou rien… rien"; }
    }
  }

  reveal.nobody = !Object.values(points).some((p) => p > 0);
  return reveal;
}
