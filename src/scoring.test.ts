import { describe, expect, test } from "bun:test";
import { closestStep, hintsAt, scoreQuestion, speedBonus, validAnswer } from "./scoring";
import { fuzzyMatch, upcomingWeekdays, type Question } from "./shared";

const q = (over: Partial<Question>): Question => ({
  id: "q1", type: "mc", prompt: "?", emoji: "", imageId: null, timeLimit: 20,
  speedBonus: true, doublePoints: false, data: { choices: ["a", "b", "c", "d"], correct: 1 }, ...over,
});

describe("bonus vitesse", () => {
  test("plafonné à 200 et nul à la fin", () => {
    expect(speedBonus(0, 20000)).toBe(200);
    expect(speedBonus(10000, 20000)).toBe(100);
    expect(speedBonus(25000, 20000)).toBe(0);
  });
});

describe("choix multiple", () => {
  test("bonne réponse + vitesse, mauvaise réponse = 0", () => {
    const r = scoreQuestion(q({}), [
      { playerId: "a", value: 1, at: 0 },
      { playerId: "b", value: 2, at: 0 },
    ]);
    expect(r.points).toEqual({ a: 1200, b: 0 });
    expect(r.counts).toEqual([0, 1, 1, 0]);
    expect(r.correct).toEqual([1]);
    expect(r.nobody).toBe(false);
  });
  test("points doubles", () => {
    const r = scoreQuestion(q({ doublePoints: true, speedBonus: false }), [{ playerId: "a", value: 1, at: 5000 }]);
    expect(r.points.a).toBe(2000);
  });
  test("personne ne trouve : Matt marque", () => {
    const r = scoreQuestion(q({}), [{ playerId: "a", value: 0, at: 0 }]);
    expect(r.nobody).toBe(true);
  });
});

describe("majorité l'emporte", () => {
  test("égalité : les deux choix majoritaires gagnent", () => {
    const r = scoreQuestion(q({ type: "majority", data: { choices: ["a", "b", "c"] } }), [
      { playerId: "a", value: 0, at: 20000 },
      { playerId: "b", value: 1, at: 20000 },
      { playerId: "c", value: 2, at: 20000 },
      { playerId: "d", value: 0, at: 20000 },
      { playerId: "e", value: 1, at: 20000 },
    ]);
    expect(r.correct).toEqual([0, 1]);
    expect(r.points).toEqual({ a: 1000, b: 1000, c: 0, d: 1000, e: 1000 });
  });
});

describe("le plus proche", () => {
  const cq = q({ type: "closest", speedBonus: false, data: { answer: 3, min: 0, max: 8 } });
  test("paliers et minimum garanti pour le plus proche", () => {
    const r = scoreQuestion(cq, [
      { playerId: "exact", value: 3, at: 0 },
      { playerId: "un", value: 4, at: 0 },
      { playerId: "deux", value: 1, at: 0 },
      { playerId: "loin", value: 8, at: 0 },
    ]);
    expect(r.points).toEqual({ exact: 1000, un: 600, deux: 300, loin: 0 });
    expect(r.answer).toBe(3);
  });
  test("si personne n'est exact, le plus proche reçoit au moins 500", () => {
    const r = scoreQuestion(q({ type: "closest", speedBonus: false, data: { answer: 100, min: 0, max: 300 } }), [
      { playerId: "a", value: 160, at: 0 },
      { playerId: "b", value: 250, at: 0 },
    ]);
    expect(r.points.a).toBe(500);
    expect(r.points.b).toBe(0);
  });
  test("tolérance proportionnelle à l'étendue", () => {
    expect(closestStep(0, 8)).toBe(1);
    expect(closestStep(0, 300)).toBe(15);
  });
  test("une estimation hors bornes est ramenée dans l'intervalle", () => {
    expect(validAnswer(cq, 99)).toBe(8);
    expect(validAnswer(cq, "abc")).toBeUndefined();
  });
});

describe("mercredi musical", () => {
  const mq = q({
    type: "music", timeLimit: 60, speedBonus: false,
    data: { title: "Ode à la joie", alts: ["Hymne à la joie"], artist: "Ludwig van Beethoven", year: 1824, hints: ["a", "b", "c"] },
  });
  test("orthographe approximative acceptée", () => {
    expect(fuzzyMatch("ode a la joi", ["Ode à la joie"]).ok).toBe(true);
    expect(fuzzyMatch("bethoven", ["Ludwig van Beethoven"]).ok).toBe(true);
    expect(fuzzyMatch("la macarena", ["Ode à la joie"]).ok).toBe(false);
  });
  test("titre 70 %, artiste 30 %, année +200", () => {
    const r = scoreQuestion(mq, [
      { playerId: "tout", value: { title: "Hymne à la joie", artist: "Beethoven", year: 1830 }, at: 1000 },
      { playerId: "titre", value: { title: "ode a la joie", artist: "", year: null }, at: 1000 },
    ]);
    expect(r.points.tout).toBe(1200);
    expect(r.points.titre).toBe(700);
  });
  test("chaque indice débloqué enlève 150 pts", () => {
    expect(hintsAt(mq, 14000)).toBe(0);
    expect(hintsAt(mq, 15000)).toBe(1);
    expect(hintsAt(mq, 46000)).toBe(3);
    const r = scoreQuestion(mq, [{ playerId: "a", value: { title: "Ode à la joie", artist: "Beethoven", year: null }, at: 31000 }]);
    expect(r.points.a).toBe(700);
  });
});

describe("dates", () => {
  test("seulement des jours de semaine", () => {
    const days = upcomingWeekdays(6, new Date("2026-10-30T15:00:00Z"));
    expect(days).toEqual(["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
});
