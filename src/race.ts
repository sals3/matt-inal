// 🏁 La grande course : un parcours tiré d'une graine, le même pour toute l'équipe.
// Chaque joueur nage dans son navigateur ; le serveur reçoit la distance et les vies, et vérifie la vitesse.

export type RaceLevel = "calme" | "agite" | "tempete";
export type ObstacleKind = "net" | "shark" | "jelly" | "boost";
export interface Obstacle {
  /** Position en mètres au départ de la course (les requins foncent ensuite vers la gauche). */
  at: number;
  lane: number;
  kind: ObstacleKind;
}

export const RACE = {
  /** Décompte 3, 2, 1 avant le départ. */
  countdownMs: 3000,
  lanes: 3,
  lives: 3,
  /** Vitesses en mètres par seconde. */
  speed: 20,
  boost: 32,
  stunned: 8,
  /** Au-delà, c'est de la téléportation : le serveur plafonne. */
  vmax: 34,
  sharkSpeed: 6,
  netMs: 1600,
  stunMs: 900,
  invulnMs: 1500,
  invertMs: 3000,
  boostMs: 2000,
  /** Mètres visibles à l'écran. */
  view: 70,
};

export const LEVELS: Record<RaceLevel, { name: string; length: number; gap: [number, number]; blurb: string }> = {
  calme: { name: "Mer calme", length: 600, gap: [34, 48], blurb: "Pour se réchauffer : quelques filets, des requins paresseux." },
  agite: { name: "Mer agitée", length: 800, gap: [26, 38], blurb: "Le bon dosage : ça bouge, mais ça se fait." },
  tempete: { name: "Tempête", length: 1000, gap: [19, 28], blurb: "Pour les braves : des requins partout. Mets 90 s au chrono." },
};

export const raceLevel = (v: unknown): RaceLevel => (v === "calme" || v === "tempete" ? v : "agite");
export const raceLength = (level: unknown) => LEVELS[raceLevel(level)].length;

/** Petit générateur pseudo-aléatoire : même graine, même parcours partout. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le parcours : une rangée d'obstacles tous les 20 à 50 m, toujours au moins un couloir libre. */
export function makeCourse(seed: number, level: unknown): Obstacle[] {
  const lv = LEVELS[raceLevel(level)];
  const r = rng(seed);
  const out: Obstacle[] = [];
  const pick = (): ObstacleKind => {
    const x = r();
    return x < 0.36 ? "net" : x < 0.66 ? "shark" : x < 0.86 ? "jelly" : "boost";
  };
  for (let at = 70; at < lv.length - 40; at += lv.gap[0] + r() * (lv.gap[1] - lv.gap[0])) {
    const free = Math.floor(r() * RACE.lanes);
    const blocked = [0, 1, 2].filter((l) => l !== free && r() < (raceLevel(level) === "tempete" ? 0.75 : 0.5));
    if (!blocked.length) blocked.push((free + 1 + Math.floor(r() * 2)) % 3);
    for (const lane of blocked) {
      const kind = pick();
      // Un turbo dans un couloir bloqué ne bloque rien : on le met plutôt dans le couloir libre.
      out.push({ at: Math.round(at + (r() - 0.5) * 6), lane: kind === "boost" ? free : lane, kind });
    }
  }
  // Les requins foncent vers la gauche : on les place plus loin pour qu'ils arrivent au bon moment.
  return out.map((o) => (o.kind === "shark" ? { ...o, at: Math.round(o.at * (1 + RACE.sharkSpeed / RACE.speed)) } : o));
}

/** Position d'un obstacle t secondes après le départ. */
export const obstacleX = (o: Obstacle, t: number) => (o.kind === "shark" ? o.at - RACE.sharkSpeed * t : o.at);

/** Ce qu'un joueur envoie au serveur, et ce que le serveur garde. */
export interface RaceRun {
  dist: number;
  lives: number;
  finish?: boolean;
  eaten?: boolean;
}
