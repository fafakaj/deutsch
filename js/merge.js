// Merge two copies of the progress: laptop and phone share one gist, and the site tab and the word
// trainer tab share one localStorage. Instead of "the newest copy wins" (which drops what the other
// side did meanwhile), every part is merged so that work done anywhere stays done.
// The merge writes into `into` and keeps its nested objects: open views hold references to them.

const keyOf = (e) => `${e.t}|${e.type}|${e.step ?? ""}|${e.card ?? ""}|${e.q ?? ""}`;
const MAX_EVENTS = 4000;

function eachKey(into, from, part, fn) {
  const src = from?.[part];
  if (!src || typeof src !== "object") return false;
  const dst = (into[part] ||= {});
  let changed = false;
  for (const [k, b] of Object.entries(src)) {
    if (!(k in dst)) {
      dst[k] = structuredClone(b);
      changed = true;
    } else if (fn(dst, k, b)) changed = true;
  }
  return changed;
}

/** Put b's fields into a (a keeps its identity). True when something changed. */
function adopt(a, b) {
  const before = JSON.stringify(a);
  Object.assign(a, structuredClone(b));
  return JSON.stringify(a) !== before;
}

const rules = {
  steps: (dst, k, b) => {
    const a = dst[k];
    if (b?.status === "done" && a.status !== "done") return adopt(a, b);
    if (b?.rating && !a.rating) return adopt(a, { rating: b.rating });
    return false;
  },
  // quiz[step][question] and checklist[step][item]: an answer counted on one side counts.
  quiz: (dst, k, b) => eachKey(dst, { [k]: b }, k, (q, i, bq) => {
    const a = q[i];
    if (bq?.ok && !a.ok) return adopt(a, bq);
    if (!a.ok && (bq?.tried || 0) > (a.tried || 0)) return adopt(a, { tried: bq.tried });
    return false;
  }),
  checklist: (dst, k, b) => eachKey(dst, { [k]: b }, k, (c, i, bc) => (bc?.ok && !c[i].ok ? adopt(c[i], bc) : false)),
  // A written answer: the longer text is the later draft.
  notes: (dst, k, b) => {
    if (typeof b === "string" && b.length > (dst[k] || "").length) {
      dst[k] = b;
      return true;
    }
    return false;
  },
  // Leitner box of a card: the copy that has seen more reviews is the later one.
  review: (dst, k, b) => {
    const a = dst[k];
    const more = (b?.seen || 0) > (a.seen || 0) || ((b?.seen || 0) === (a.seen || 0) && (b?.last || "") > (a.last || ""));
    return more ? adopt(a, b) : false;
  },
  // A trainer deck: learned words are joined, the best test is the maximum, the position follows the newer record.
  words: (dst, k, b) => {
    const a = dst[k];
    if (!b || typeof b !== "object") return false;
    const before = JSON.stringify(a);
    if ((b.updatedAt || 0) > (a.updatedAt || 0)) {
      const { learnedIds, testBest, ...rest } = structuredClone(b);
      Object.assign(a, rest);
    }
    a.learnedIds = [...new Set([...(a.learnedIds || []), ...(b.learnedIds || [])])].sort((x, y) => x - y);
    a.testBest = Math.max(a.testBest || 0, b.testBest || 0);
    return JSON.stringify(a) !== before;
  },
};

/** Merge copy `from` into `into` (mutates it). Returns true when `into` changed. */
export function mergeProgress(into, from) {
  if (!from || typeof from !== "object") return false;
  let changed = false;
  for (const [part, rule] of Object.entries(rules)) if (eachKey(into, from, part, rule)) changed = true;

  if (Array.isArray(from.events) && from.events.length) {
    into.events ||= [];
    const seen = new Set(into.events.map(keyOf));
    const fresh = from.events.filter((e) => !seen.has(keyOf(e)));
    if (fresh.length) {
      into.events.push(...structuredClone(fresh));
      into.events.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
      if (into.events.length > MAX_EVENTS) into.events.splice(0, into.events.length - MAX_EVENTS);
      changed = true;
    }
  }
  if (from.saved_at && (!into.saved_at || Date.parse(from.saved_at) > Date.parse(into.saved_at))) {
    into.saved_at = from.saved_at;
    // A newer stamp alone is not a change of content.
  }
  return changed;
}
