import { expect, test } from "bun:test";
import { shuffleChoices } from "./game";
import { nameKey, type Question } from "./shared";

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
