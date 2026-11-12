import { expect, test } from "bun:test";
import { shuffleChoices } from "./game";
import { scoreQuestion } from "./scoring";
import { SCENES } from "./scenes";
import { nameKey, spotHit, type Question } from "./shared";

test("pseudos sosies : même clé", () => {
  const k = nameKey("Kevin");
  for (const n of ["kévin", "KEVIN", " K.e.v.i.n ", "Кevin", "Kev1n", "Kevin 🙂"]) expect(nameKey(n)).toBe(k);
  expect(nameKey("Kevin2")).not.toBe(k);
  expect(nameKey("Julie")).not.toBe(k);
});

const q = (type: Question["type"], correct?: number): Question =>
  ({ id: "q", type, prompt: "?", timeLimit: 20, speedBonus: true, doublePoints: false, data: { choices: ["A", "B", "C", "D"], correct } }) as Question;

test("le mélange garde la bonne réponse", () => {
  for (let i = 0; i < 50; i++) {
    const s = shuffleChoices(q("mc", 0));
    expect([...s.data.choices!].sort()).toEqual(["A", "B", "C", "D"]);
    expect(s.data.choices![s.data.correct!]).toBe("A");
  }
});

test("le mélange change vraiment l'ordre", () => {
  const firsts = new Set(Array.from({ length: 60 }, () => shuffleChoices(q("mc", 0)).data.choices![0]));
  expect(firsts.size).toBeGreaterThan(2);
});

test("vrai ou faux garde son ordre, majorité se mélange sans bonne réponse", () => {
  const tf = { ...q("tf", 0), data: { choices: ["Vrai", "Faux"], correct: 0 } } as Question;
  expect(shuffleChoices(tf)).toBe(tf);
  const m = shuffleChoices(q("majority"), () => 0);
  expect(m.data.correct).toBeUndefined();
  expect(m.data.choices).toEqual(["B", "C", "D", "A"]);
});

test("chasse : un clic touche l'objet le plus proche, pas celui déjà trouvé", () => {
  const spots = [{ label: "A", x: 0.2, y: 0.5, r: 0.03 }, { label: "B", x: 0.22, y: 0.5, r: 0.03 }];
  expect(spotHit(spots, 1.5, 0.21, 0.5)).toBe(0);
  expect(spotHit(spots, 1.5, 0.215, 0.5)).toBe(1);
  expect(spotHit(spots, 1.5, 0.21, 0.5, [0])).toBe(1);
  expect(spotHit(spots, 1.5, 0.5, 0.5)).toBeNull();
  // Image en largeur : un écart vertical de 0,06 de la hauteur vaut 0,04 de la largeur (hors de r + tolérance).
  expect(spotHit(spots, 1.5, 0.2, 0.56)).toBeNull();
  expect(spotHit(spots, 1.5, 0.2, 0.54)).toBe(0);
});

test("chasse : tout trouver vaut 1 000 + vitesse, sinon une part de 700", () => {
  const h = { ...q("mc"), type: "hunt", timeLimit: 60, data: { spots: SCENES.recif!.spots } } as Question;
  const n = h.data.spots!.length;
  const r = scoreQuestion(h, [
    { playerId: "a", value: { found: Array.from({ length: n }, (_, k) => k) }, at: 30_000 },
    { playerId: "b", value: { found: [0, 1] }, at: 50_000 },
    { playerId: "c", value: { found: [3] }, at: 10_000, away: true },
  ]);
  expect(r.points.a).toBe(1000 + 100 + 100);
  expect(r.points.b).toBe(Math.round((700 * 2) / n) + 100);
  expect(r.points.c).toBe(Math.round(700 / n));
  expect(r.detail.a).toContain("Tout trouvé");
});

test("décors maison : cachettes dans l'image, noms uniques", () => {
  for (const sc of Object.values(SCENES)) {
    expect(sc.spots.length).toBeGreaterThanOrEqual(5);
    expect(new Set(sc.spots.map((s) => s.label)).size).toBe(sc.spots.length);
    for (const s of sc.spots) for (const v of [s.x, s.y]) expect(v > 0 && v < 1).toBe(true);
    expect(sc.svg.startsWith("<svg")).toBe(true);
  }
});
