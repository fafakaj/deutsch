// Merging two progress copies (laptop and phone, site tab and trainer tab): nothing done on one side is lost.
// Run: node --test tests/merge.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProgress } from "../js/merge.js";

const empty = () => ({ version: 1, steps: {}, quiz: {}, checklist: {}, notes: {}, review: {}, words: {}, events: [] });

test("a step done on either side stays done", () => {
  const laptop = empty();
  laptop.steps.a = { status: "done", done_at: "2026-11-02T10:00:00Z" };
  laptop.steps.b = { status: "todo" };
  const phone = empty();
  phone.steps.b = { status: "done", done_at: "2026-11-02T11:00:00Z" };
  phone.steps.c = { status: "done", done_at: "2026-11-02T12:00:00Z" };
  const stepB = laptop.steps.b;
  assert.equal(mergeProgress(laptop, phone), true);
  assert.deepEqual(Object.keys(laptop.steps).sort(), ["a", "b", "c"]);
  assert.equal(laptop.steps.b.status, "done");
  assert.equal(laptop.steps.b, stepB, "views keep their reference to the record");
});

test("quiz answers: a right answer wins, the reference stays", () => {
  const a = empty();
  a.quiz.s = { 0: { ok: true }, 1: { tried: 1, ok: false } };
  const b = empty();
  b.quiz.s = { 0: { tried: 2, ok: false }, 1: { ok: true, value: "bin" }, 2: { ok: true } };
  const saved = a.quiz.s;
  mergeProgress(a, b);
  assert.equal(a.quiz.s, saved);
  assert.equal(a.quiz.s[0].ok, true);
  assert.equal(a.quiz.s[1].ok, true);
  assert.equal(a.quiz.s[2].ok, true);
});

test("words: learned words are joined, best tests are the maximum, the rest follows the newer record", () => {
  const laptop = empty();
  laptop.words.w1d1 = { learnedIds: [0, 1], testBest: 90, wordTestBest: 70, studyIndex: 2, updatedAt: 100 };
  const phone = empty();
  phone.words.w1d1 = { learnedIds: [1, 5], testBest: 60, wordTestBest: 95, studyIndex: 7, updatedAt: 200 };
  phone.words.w1d2 = { learnedIds: [3], testBest: 0, updatedAt: 50 };
  mergeProgress(laptop, phone);
  assert.deepEqual(laptop.words.w1d1.learnedIds, [0, 1, 5]);
  assert.equal(laptop.words.w1d1.testBest, 90);
  assert.equal(laptop.words.w1d1.wordTestBest, 95);
  assert.equal(laptop.words.w1d1.studyIndex, 7);
  assert.equal(laptop.words.w1d1.updatedAt, 200);
  assert.deepEqual(laptop.words.w1d2.learnedIds, [3]);
});

test("review boxes: the card with more reviews wins", () => {
  const a = empty();
  a.review["a:1"] = { box: 1, seen: 1, due: 5 };
  const b = empty();
  b.review["a:1"] = { box: 3, seen: 4, due: 9 };
  b.review["a:2"] = { box: 0, seen: 1, due: 1 };
  mergeProgress(a, b);
  assert.equal(a.review["a:1"].seen, 4);
  assert.equal(a.review["a:2"].seen, 1);
});

test("checklist, notes, events and saved_at", () => {
  const a = empty();
  a.checklist.p = { 0: { ok: false } };
  a.notes["p:0"] = "Ich";
  a.events = [{ t: "2026-11-02T10:00:00Z", type: "done", step: "a" }];
  a.saved_at = "2026-11-02T10:00:00Z";
  const b = empty();
  b.checklist.p = { 0: { ok: true }, 1: { ok: true } };
  b.notes["p:0"] = "Ich heiße Max.";
  b.events = [{ t: "2026-11-02T09:00:00Z", type: "open", step: "a" }, { t: "2026-11-02T10:00:00Z", type: "done", step: "a" }];
  b.saved_at = "2026-11-02T11:00:00Z";
  mergeProgress(a, b);
  assert.equal(a.checklist.p[0].ok, true);
  assert.equal(a.checklist.p[1].ok, true);
  assert.equal(a.notes["p:0"], "Ich heiße Max.");
  assert.deepEqual(a.events.map((e) => e.type), ["open", "done"]);
  assert.equal(a.saved_at, "2026-11-02T11:00:00Z");
});

test("merging the same copy changes nothing; an empty or missing copy is harmless", () => {
  const a = empty();
  a.steps.a = { status: "done", done_at: "x" };
  a.events = [{ t: "1", type: "done", step: "a" }];
  assert.equal(mergeProgress(a, structuredClone(a)), false);
  assert.equal(mergeProgress(a, null), false);
  assert.equal(mergeProgress(a, {}), false);
  assert.equal(a.steps.a.status, "done");
});
