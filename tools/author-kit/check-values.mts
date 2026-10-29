/**
 * check-values.mts — S46 author kit (standalone).
 *
 * Recomputes the derived gold values from their inputs and reports every mismatch (value forms in
 * docs/LABELLING-GUIDE.md and docs/PACKET-FORMAT.md). Node built-ins only; imports nothing from the
 * application and has no relative imports. Helpers are duplicated in each tool on purpose.
 *
 * Usage (Node >= 22.6):
 *   node --experimental-strip-types tools/author-kit/check-values.mts <enactmentDir> [...] [--json]
 * An enactmentDir holds gold.jsonl and states/<stateId>/<sectionId>.txt.
 * Exit code: 0 no mismatches, 1 mismatches found, 2 usage error.
 *
 * normKey(text): lowercase; collapse every run of whitespace to one space; trim; strip trailing
 * ".", ",", ";", ":" characters; trim again; strip ONE leading article ("the ", "a ", "an ").
 *
 * Checks:
 *  - triggerDates: every key is already normalised (key === normKey(key)); every value a real date; ONE map per
 *    query (every line of a queryId carries the identical map; check-offsets.mts checks this too).
 *    R's blind labels (provenance hidden-relabeller-R) carry {}, so their relative dueDates must be null.
 *  - deadline (known): anchorText required whenever eventKey is set; eventKey === normKey(anchorText);
 *    relative_calendar_days and before_event carry eventKey; n is an integer 0..366;
 *    dueDate rule: absolute -> dueDate === date; relative_calendar_days -> trigger + n calendar days
 *    (trigger day excluded) when triggerDates[eventKey] exists, else null; before_event, none_stated -> null.
 *  - actor (known), recomputed per guide section 6.1. The subject key is normKey(raw) (which strips one leading
 *    article) minus ONE further leading determiner: each, every, any, all, no or such. If that key equals a term
 *    defined in the same state (a definition `"<term>" means` in any of that state's section files, compared as
 *    normKey(<term>)), or that term + "s" or + "es", the actor is a defined-term actor and id must be
 *    normKey(<term>) (the term as written in its definition). Otherwise id must be normKey(raw) (explicit noun
 *    phrase). So "A licensed vendor" must have id "licensed vendor" even when "vendor" is defined, and "Each
 *    vendor" / "Vendors" must have id "vendor" when it is.
 *    NOT checked (they need the packet's taint computation, which the kit does not perform): whether the
 *    defining section is tainted (the actor would be dependency_tainted) and whether the term is defined only
 *    in another state (actor_undefined); whether an elliptical subject ("Such person") should be actor_ambiguous.
 *  - action (known): headVerb is one token and occurs as a token of the predicate text
 *    (text.slice(predicateSpan)). Tokens are the maximal runs of [a-z0-9] after lowercasing, so hyphens and
 *    apostrophes split tokens (guide section 6.2). The first-verb rule itself is NOT checked (it needs
 *    part-of-speech knowledge); a NOTE (not a mismatch) is printed when a token before the first occurrence of
 *    headVerb is neither an -ly token nor one of also, only, then, thereafter, forthwith, again, and no comma
 *    precedes headVerb (a leading comma-set parenthetical), so the author can confirm headVerb is the first verb.
 *  - modality (known): one of must, must_not, may, need_not.
 * Shape problems (including action evidenceSpan === predicateSpan and the none_stated evidenceSpan ===
 * clauseSpan rule) are reported by check-offsets.mts; lines too malformed to evaluate are skipped here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TOOL = "check-values";
const KIT_VERSION = "s46.author-kit.v1";
const MAX_DEPTH = 8;
const STATE_ID_RE = /^S[0-6]$/;
const SECTION_ID_RE = /^sec-[0-9]+$/;
const MODALITIES = new Set(["must", "must_not", "may", "need_not"]);
const DEFINITION_RE = /["“]([^"“”]+)["”]\s+means\b/g;
/** Determiners stripped once (after normKey's article strip) before comparing a subject with a defined term (guide 6.1). */
const DETERMINERS = ["each ", "every ", "any ", "all ", "no ", "such "];
/** Leading adverbs the guide's headVerb rule skips besides tokens ending in -ly (guide 6.2). */
const SKIPPED_ADVERBS = new Set(["also", "only", "then", "thereafter", "forthwith", "again"]);
const TOKEN_RE = /[a-z0-9]+/g;
const ONE_TOKEN_RE = /^[a-z0-9]+$/;

// ---------------------------------------------------------------------------------------------
// Strict JSON (duplicated on purpose in each author-kit tool)
// ---------------------------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface StrictJsonResult {
  value: Json | undefined;
  errors: string[];
}

function parseStrictJson(text: string, where: string, maxDepth: number): StrictJsonResult {
  const errors: string[] = [];
  const n = text.length;
  let i = 0;
  const lineCol = (k: number): string => {
    let line = 1;
    let col = 1;
    for (let j = 0; j < k && j < n; j++) {
      if (text.charCodeAt(j) === 10) {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return `${where}:${line}:${col}`;
  };
  const err = (message: string): Error => new Error(`${lineCol(i)}: ${message}`);
  const skipWs = (): void => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };
  const hasLoneSurrogate = (s: string): boolean => {
    for (let j = 0; j < s.length; j++) {
      const c = s.charCodeAt(j);
      if (c >= 0xd800 && c <= 0xdbff) {
        const d = j + 1 < s.length ? s.charCodeAt(j + 1) : 0;
        if (d >= 0xdc00 && d <= 0xdfff) {
          j++;
          continue;
        }
        return true;
      }
      if (c >= 0xdc00 && c <= 0xdfff) return true;
    }
    return false;
  };
  const ESCAPES: Record<string, string> = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
  };
  const parseString = (): string => {
    const start = i;
    i++;
    let out = "";
    let chunk = i;
    for (;;) {
      if (i >= n) throw err("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        out += text.slice(chunk, i);
        i++;
        break;
      }
      if (c < 0x20) throw err("unescaped control character in string");
      if (c === 0x5c) {
        out += text.slice(chunk, i);
        const e = text.charAt(i + 1);
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) throw err("invalid \\u escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          const rep = Object.hasOwn(ESCAPES, e) ? ESCAPES[e] : undefined;
          if (rep === undefined) throw err(`invalid escape \\${e}`);
          out += rep;
          i += 2;
        }
        chunk = i;
        continue;
      }
      i++;
    }
    if (hasLoneSurrogate(out)) errors.push(`${lineCol(start)}: string contains a lone surrogate`);
    return out;
  };
  const NUM_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const parseNumber = (): number => {
    NUM_RE.lastIndex = i;
    const m = NUM_RE.exec(text);
    if (m === null) throw err("invalid number");
    i += m[0].length;
    const v = Number(m[0]);
    if (!Number.isFinite(v)) throw err("number out of range");
    return v;
  };
  const parseValue = (depth: number): Json => {
    skipWs();
    if (i >= n) throw err("unexpected end of input");
    const c = text.charAt(i);
    if (c === "{") {
      if (depth + 1 > maxDepth) throw err(`nesting depth exceeds ${maxDepth}`);
      i++;
      const obj = Object.create(null) as JsonObject;
      const seen = new Set<string>();
      skipWs();
      if (text.charAt(i) === "}") {
        i++;
        return obj;
      }
      for (;;) {
        skipWs();
        if (text.charAt(i) !== '"') throw err("expected a string key");
        const keyAt = i;
        const key = parseString();
        const duplicate = seen.has(key);
        if (duplicate) errors.push(`${lineCol(keyAt)}: duplicate key "${key}"`);
        seen.add(key);
        skipWs();
        if (text.charAt(i) !== ":") throw err("expected ':'");
        i++;
        const v = parseValue(depth + 1);
        if (!duplicate) obj[key] = v;
        skipWs();
        const d = text.charAt(i);
        if (d === ",") {
          i++;
          continue;
        }
        if (d === "}") {
          i++;
          return obj;
        }
        throw err("expected ',' or '}'");
      }
    }
    if (c === "[") {
      if (depth + 1 > maxDepth) throw err(`nesting depth exceeds ${maxDepth}`);
      i++;
      const arr: Json[] = [];
      skipWs();
      if (text.charAt(i) === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(parseValue(depth + 1));
        skipWs();
        const d = text.charAt(i);
        if (d === ",") {
          i++;
          continue;
        }
        if (d === "]") {
          i++;
          return arr;
        }
        throw err("expected ',' or ']'");
      }
    }
    if (c === '"') return parseString();
    if (text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    return parseNumber();
  };
  try {
    const value = parseValue(0);
    skipWs();
    if (i < n) throw err("unexpected trailing content");
    return { value, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { value: undefined, errors };
  }
}

function isObj(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------------------------
// Files, dates, normKey (duplicated on purpose)
// ---------------------------------------------------------------------------------------------

function readUtf8(path: string): { text: string | null; error: string | null } {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (e) {
    return { text: null, error: `${path}: cannot read (${e instanceof Error ? e.message : String(e)})` };
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: null, error: `${path}: UTF-8 byte order mark is not allowed` };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), error: null };
  } catch {
    return { text: null, error: `${path}: not valid UTF-8` };
  }
}

const DATE_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function parseDate(s: unknown): [number, number, number] | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s);
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return null;
  const dim = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0;
  return d <= dim ? [y, mo, d] : null;
}

/** Days since 1970-01-01 for a proleptic Gregorian civil date (H. Hinnant's days_from_civil). */
function daysFromCivil(y0: number, m: number, d: number): number {
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string | null {
  const p = parseDate(date);
  if (p === null) return null;
  return civilFromDays(daysFromCivil(p[0], p[1], p[2]) + n);
}

function normKey(text: string): string {
  let s = text.toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(/[.,;:]+$/, "").trim();
  for (const article of ["the ", "a ", "an "]) {
    if (s.startsWith(article)) {
      s = s.slice(article.length);
      break;
    }
  }
  return s;
}

function isSpan(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isSafeInteger(v[0]) &&
    Number.isSafeInteger(v[1]) &&
    v[0] >= 0 &&
    v[1] >= v[0]
  );
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

interface TargetResult {
  target: string;
  ok: boolean;
  lines: number;
  mismatches: string[];
  notes: string[];
}

/** Canonical form of a flat {eventKey: date} map (sorted keys) for the one-map-per-query comparison. */
function canonicalMap(m: JsonObject): string {
  return JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k] ?? null]));
}

/** Predicate tokens per guide 6.2: maximal runs of [a-z0-9] after lowercasing, with their offsets in the lowercased text. */
function predicateTokens(text: string): { token: string; at: number }[] {
  return [...text.toLowerCase().matchAll(TOKEN_RE)].map((m) => ({ token: m[0], at: m.index ?? 0 }));
}

/** normKey(raw) minus ONE leading determiner (each, every, any, all, no, such): the subject compared with defined terms. */
function subjectKey(raw: string): string {
  const key = normKey(raw);
  for (const d of DETERMINERS) if (key.startsWith(d)) return key.slice(d.length);
  return key;
}

/** Defined terms (normKey form) that the subject names: the key equals the term, the term + "s" or the term + "es". */
function matchingTerms(raw: string, terms: Set<string>): string[] {
  const key = subjectKey(raw);
  return [...terms].filter((t) => key === t || key === `${t}s` || key === `${t}es`).sort();
}

function checkTarget(dir: string): TargetResult {
  const mismatches: string[] = [];
  const notes: string[] = [];
  let lines = 0;
  const done = (): TargetResult => ({ target: dir, ok: mismatches.length === 0, lines, mismatches, notes });
  const goldPath = join(dir, "gold.jsonl");
  const statesDir = join(dir, "states");
  const gold = readUtf8(goldPath);
  if (gold.text === null) {
    mismatches.push(gold.error ?? `${goldPath}: unreadable`);
    return done();
  }
  const sectionCache = new Map<string, string | null>();
  const sectionText = (stateId: string, sectionId: string): string | null => {
    const file = join(statesDir, stateId, `${sectionId}.txt`);
    if (!sectionCache.has(file)) sectionCache.set(file, readUtf8(file).text);
    return sectionCache.get(file) ?? null;
  };
  const definitionCache = new Map<string, Set<string>>();
  const definedTerms = (stateId: string): Set<string> => {
    const cached = definitionCache.get(stateId);
    if (cached !== undefined) return cached;
    const terms = new Set<string>();
    let files: string[] = [];
    try {
      files = readdirSync(join(statesDir, stateId)).filter((f) => f.endsWith(".txt"));
    } catch {
      files = [];
    }
    for (const f of files) {
      const text = readUtf8(join(statesDir, stateId, f)).text;
      if (text === null) continue;
      for (const m of text.matchAll(DEFINITION_RE)) if (m[1] !== undefined) terms.add(normKey(m[1]));
    }
    definitionCache.set(stateId, terms);
    return terms;
  };

  const queryMaps = new Map<string, { canon: string; line: number }>();
  const rawLines = gold.text.split("\n");
  rawLines.forEach((raw, idx) => {
    if (raw.trim().length === 0) return;
    lines++;
    const where = `${goldPath}:${idx + 1}`;
    const parsed = parseStrictJson(raw, where, MAX_DEPTH);
    const v = parsed.value;
    if (v === undefined || !isObj(v) || parsed.errors.length > 0) {
      mismatches.push(`${where}: line is not a well-formed JSON object; run check-offsets.mts for details`);
      return;
    }
    const stateId = typeof v.stateId === "string" && STATE_ID_RE.test(v.stateId) ? v.stateId : null;
    const sectionId = typeof v.sectionId === "string" && SECTION_ID_RE.test(v.sectionId) ? v.sectionId : null;
    const text = stateId !== null && sectionId !== null ? sectionText(stateId, sectionId) : null;

    // Trigger map: one per query.
    const triggers = isObj(v.triggerDates) ? v.triggerDates : null;
    if (typeof v.queryId === "string") {
      const canon = triggers === null ? "<missing>" : canonicalMap(triggers);
      const first = queryMaps.get(v.queryId);
      if (first === undefined) queryMaps.set(v.queryId, { canon, line: idx + 1 });
      else if (first.canon !== canon) {
        mismatches.push(`${where}.triggerDates: differs from line ${first.line} of the same query (one trigger map per query)`);
      }
    }
    if (triggers !== null) {
      for (const [k, d] of Object.entries(triggers)) {
        if (k !== normKey(k)) mismatches.push(`${where}.triggerDates: key ${JSON.stringify(k)} is not normalised (normKey gives ${JSON.stringify(normKey(k))})`);
        if (parseDate(d) === null) mismatches.push(`${where}.triggerDates[${JSON.stringify(k)}]: not a real date`);
      }
    }

    // Deadline.
    const deadline = v.deadline;
    if (isObj(deadline) && isObj(deadline.known)) {
      const d = deadline.known;
      const P = `${where}.deadline.known`;
      const kind = d.kind;
      const eventKey = typeof d.eventKey === "string" ? d.eventKey : null;
      const anchorText = typeof d.anchorText === "string" ? d.anchorText : null;
      if (eventKey !== null && anchorText === null) mismatches.push(`${P}: eventKey is set but anchorText is missing`);
      if (eventKey !== null && anchorText !== null && eventKey !== normKey(anchorText)) {
        mismatches.push(`${P}.eventKey: ${JSON.stringify(eventKey)} != normKey(anchorText) = ${JSON.stringify(normKey(anchorText))}`);
      }
      if ((kind === "relative_calendar_days" || kind === "before_event") && eventKey === null) {
        mismatches.push(`${P}: kind ${String(kind)} needs eventKey (= normKey(anchorText))`);
      }
      let expected: string | null = null;
      let evaluable = true;
      if (kind === "absolute") {
        expected = parseDate(d.date) !== null ? (d.date as string) : null;
        if (expected === null) {
          mismatches.push(`${P}.date: absolute deadline needs a real date`);
          evaluable = false;
        }
      } else if (kind === "relative_calendar_days") {
        const n = d.n;
        if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > 366) {
          mismatches.push(`${P}.n: must be an integer 0..366`);
          evaluable = false;
        } else if (eventKey !== null && triggers !== null && typeof triggers[eventKey] === "string") {
          expected = addDays(triggers[eventKey] as string, n);
        } else {
          expected = null;
        }
      } else if (kind === "before_event" || kind === "none_stated") {
        expected = null;
      } else {
        mismatches.push(`${P}.kind: unknown deadline kind ${JSON.stringify(kind)}`);
        evaluable = false;
      }
      if (evaluable && d.dueDate !== expected) {
        mismatches.push(`${P}.dueDate: ${JSON.stringify(d.dueDate)} but the rule gives ${JSON.stringify(expected)}`);
      }
    }

    // Actor.
    const actor = v.actor;
    if (isObj(actor) && isObj(actor.known)) {
      const { id, raw } = actor.known;
      const P = `${where}.actor.known`;
      if (typeof id !== "string" || typeof raw !== "string") {
        mismatches.push(`${P}: id and raw must be strings`);
      } else {
        // Guide 6.1: a defined-term subject takes the term's id; any other subject takes normKey(raw).
        const terms = stateId !== null ? matchingTerms(raw, definedTerms(stateId)) : [];
        const key = JSON.stringify(subjectKey(raw));
        if (terms.length > 0) {
          if (!terms.includes(id)) {
            mismatches.push(
              `${P}.id: ${JSON.stringify(id)} but the subject ${key} names the term ${terms.map((t) => JSON.stringify(t)).join(" or ")} defined in state ${String(stateId)}; a defined-term actor's id is normKey of the term as written in its definition (guide 6.1)`,
            );
          } else if (id !== normKey(raw)) {
            notes.push(`${P}.id: ${JSON.stringify(id)} accepted as the defined term named by the subject ${key}`);
          }
        } else if (id !== normKey(raw)) {
          mismatches.push(
            `${P}.id: ${JSON.stringify(id)} != normKey(raw) = ${JSON.stringify(normKey(raw))}, and the subject ${key} (without one leading determiner) is not a term defined in state ${String(stateId)} nor that term + "s"/"es" (guide 6.1)`,
          );
        }
      }
    }

    // Action.
    const action = v.action;
    if (isObj(action) && isObj(action.known)) {
      const { headVerb, predicateSpan } = action.known;
      const P = `${where}.action.known`;
      if (typeof headVerb !== "string" || headVerb.length === 0) {
        mismatches.push(`${P}.headVerb: must be a non-empty string`);
      } else {
        if (!ONE_TOKEN_RE.test(headVerb)) {
          mismatches.push(`${P}.headVerb: ${JSON.stringify(headVerb)} must be one token, a maximal run of [a-z0-9] (guide 6.2)`);
        }
        if (text !== null && isSpan(predicateSpan) && predicateSpan[1] <= text.length) {
          const predicate = text.slice(predicateSpan[0], predicateSpan[1]);
          const tokens = predicateTokens(predicate);
          const first = tokens.findIndex((t) => t.token === headVerb);
          if (first < 0) {
            mismatches.push(
              `${P}.headVerb: ${JSON.stringify(headVerb)} is not a token of the predicate ${JSON.stringify(tokens.map((t) => t.token).join(" "))}`,
            );
          } else {
            // Advisory only: the first-verb rule needs part-of-speech knowledge the kit does not have.
            const firstAt = tokens[first]?.at ?? 0;
            const unexpected = tokens
              .slice(0, first)
              .map((t) => t.token)
              .filter((t) => !t.endsWith("ly") && !SKIPPED_ADVERBS.has(t));
            if (unexpected.length > 0 && !predicate.toLowerCase().slice(0, firstAt).includes(",")) {
              notes.push(
                `${P}.headVerb: ${JSON.stringify(unexpected.join(" "))} precede(s) ${JSON.stringify(headVerb)} and is not a skipped adverb; confirm headVerb is the first verb of the predicate (guide 6.2; not checked by the kit)`,
              );
            }
          }
        } else if (text === null && stateId !== null) {
          notes.push(`${P}: predicate text unavailable (state text missing); headVerb token check skipped`);
        }
      }
    }

    // Modality.
    const modality = v.modality;
    if (isObj(modality) && "known" in modality) {
      if (typeof modality.known !== "string" || !MODALITIES.has(modality.known)) {
        mismatches.push(`${where}.modality.known: must be one of must, must_not, may, need_not`);
      }
    }
  });
  return done();
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const dirs = argv.filter((a) => !a.startsWith("--"));
  if (argv.includes("--help") || dirs.length === 0) {
    process.stderr.write(`usage: node --experimental-strip-types tools/author-kit/${TOOL}.mts <enactmentDir> [...] [--json]\n`);
    return 2;
  }
  const results = dirs.map(checkTarget);
  const ok = results.every((r) => r.ok);
  if (json) {
    process.stdout.write(`${JSON.stringify({ tool: TOOL, kitVersion: KIT_VERSION, ok, results }, null, 2)}\n`);
  } else {
    for (const r of results) {
      process.stdout.write(`${TOOL}: ${r.target}: ${r.ok ? "OK" : `${r.mismatches.length} mismatch(es)`} (${r.lines} lines)\n`);
      for (const m of r.mismatches) process.stdout.write(`  mismatch: ${m}\n`);
      for (const note of r.notes) process.stdout.write(`  note: ${note}\n`);
    }
    process.stdout.write(`${TOOL}: ${ok ? "ALL CONSISTENT" : "MISMATCHES FOUND"}\n`);
  }
  return ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
