/**
 * check-offsets.mts — S46 author kit (standalone).
 *
 * For each enactment folder (packet.json, gold.jsonl, states/<stateId>/<sectionId>.txt) this checks
 * that every gold line has the s46.gold.v1 shape (schema/gold.schema.json, re-implemented by hand)
 * and that every span slices the HAND-WRITTEN state text exactly. Node built-ins only; imports nothing
 * from the application and has no relative imports. Helpers are duplicated in each tool on purpose.
 *
 * Usage (Node >= 22.6):
 *   node --experimental-strip-types tools/author-kit/check-offsets.mts <enactmentDir> [...] [--json]
 *   node --experimental-strip-types tools/author-kit/check-offsets.mts --gold <gold.jsonl> --states <statesDir> [--json]
 * Exit code: 0 clean, 1 errors found, 2 usage error.
 *
 * Checks:
 *  - gold.jsonl: strict UTF-8 (no BOM), LF only, no blank lines, each line strict JSON (no duplicate keys).
 *  - line shape: required/unknown keys, enums, patterns, real dates, per-kind required/forbidden fields
 *    (obligation and negative lines both need sectionId, subdivision, clauseSpan, clauseText; guide section 12),
 *    field values {known, evidenceSpan} | {unknown: <reason>} where <reason> is one of the THIRTEEN gold reasons
 *    (guide section 8; quote_not_found, not_in_force, version_unknown, model_invalid and screen_blocked are
 *    system-only and rejected here), deadline value per kind, spans [s, e] with 0 <= s <= e, action
 *    evidenceSpan === action.known.predicateSpan (guide 6.2), a none_stated deadline's evidenceSpan ===
 *    clauseSpan (guide 6.4), split/provenance pairing (dev -> dev-builder-authored; hidden -> hidden-author-A,
 *    or hidden-relabeller-R for R's blind labels, which must carry triggerDates {}), contested === false.
 *  - cross-line: (queryId, slotId) unique; queryId === enactmentId + "@" + asOf; one enactmentId, split,
 *    provenance and goldSchemaVersion per file; ONE triggerDates map and ONE stateId per query; a no_rows
 *    line is the only line of its query and has stateId null and slotId <enactmentId>/none/0; slotId
 *    starts with <enactmentId>/<sectionId>/.
 *  - offsets (UTF-16 code units, half-open): clauseText === text.slice(clauseSpan); every evidenceSpan and
 *    predicateSpan lies inside the section text, is non-empty and does not split a surrogate pair;
 *    actor.known.raw === text.slice(actor.evidenceSpan); object.known === text.slice(object.evidenceSpan);
 *    deadline anchorText occurs inside text.slice(deadline.evidenceSpan); every evidenceSpan and predicateSpan
 *    lies inside clauseSpan (docs/LABELLING-GUIDE.md section 12).
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TOOL = "check-offsets";
const KIT_VERSION = "s46.author-kit.v1";
const GOLD_SCHEMA_VERSION = "s46.gold.v1";
const MAX_DEPTH = 8;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SECTION_ID_RE = /^sec-[0-9]+$/;
const STATE_ID_RE = /^S[0-6]$/;
const SLOT_RE = /^([A-Za-z][A-Za-z0-9_-]{0,63})\/(?:(sec-[0-9]+)\/([0-9]+)|(none)\/0)$/;
const SUBDIVISION_RE = /^(\([a-z]+\))?(\([0-9]+\))?$/;
const TRAP_RE = /^T([1-9]|1[0-9]|20)$/;
/** The thirteen reasons gold (and R's blind labels) may use: docs/LABELLING-GUIDE.md section 8. */
const REASONS = new Set([
  "actor_undefined",
  "actor_unstated",
  "actor_ambiguous",
  "deadline_anchor_unresolved",
  "deadline_unsupported",
  "conflicting_figures",
  "crossref_unresolved",
  "crossref_repealed",
  "reference_depth",
  "amendment_unapplied",
  "amendment_conflict",
  "retroactive_unsupported",
  "dependency_tainted",
]);
/** The five reasons that describe system outputs only and never appear in gold (guide section 8). */
const SYSTEM_ONLY_REASONS = new Set(["quote_not_found", "not_in_force", "version_unknown", "model_invalid", "screen_blocked"]);
const MODALITIES = new Set(["must", "must_not", "may", "need_not"]);
const KINDS = new Set(["obligation", "negative", "no_rows"]);
const NEGATIVE_REASONS = new Set(["definition", "purpose", "non_operative", "injection"]);
const DEADLINE_KINDS = new Set(["absolute", "relative_calendar_days", "before_event", "none_stated"]);
const REQUIRED_KEYS = [
  "goldSchemaVersion",
  "split",
  "provenance",
  "labeller",
  "enactmentId",
  "queryId",
  "asOf",
  "stateId",
  "triggerDates",
  "slotId",
  "kind",
  "traps",
  "contested",
];
const OPTIONAL_KEYS = [
  "sectionId",
  "subdivision",
  "clauseSpan",
  "clauseText",
  "actor",
  "modality",
  "action",
  "object",
  "deadline",
  "negativeReason",
];
const FIELD_KEYS = ["actor", "modality", "action", "object", "deadline"] as const;
type FieldName = (typeof FIELD_KEYS)[number];

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
// Files and dates (duplicated on purpose)
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

function isValidDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0;
  return d <= dim;
}

// ---------------------------------------------------------------------------------------------
// Gold line shape
// ---------------------------------------------------------------------------------------------

type Span = [number, number];

function isSpan(v: unknown): v is Span {
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

function sameSpan(a: Span, b: Span): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function checkKeys(o: JsonObject, path: string, required: readonly string[], optional: readonly string[], errors: string[]): void {
  for (const k of required) if (!(k in o)) errors.push(`${path}: missing required key "${k}"`);
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) errors.push(`${path}: unknown key "${k}"`);
  }
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function checkDeadlineValue(v: Json | undefined, path: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${path}: deadline value must be an object`);
    return;
  }
  checkKeys(v, path, ["kind", "dueDate"], ["n", "unit", "anchorText", "eventKey", "date"], errors);
  const kind = v.kind;
  if (typeof kind !== "string" || !DEADLINE_KINDS.has(kind)) {
    errors.push(`${path}.kind: must be one of ${[...DEADLINE_KINDS].join(", ")}`);
    return;
  }
  if ("n" in v && (typeof v.n !== "number" || !Number.isSafeInteger(v.n) || v.n < 0 || v.n > 366)) {
    errors.push(`${path}.n: must be an integer 0..366`);
  }
  if ("unit" in v && v.unit !== "calendar_days") errors.push(`${path}.unit: must be "calendar_days"`);
  if ("anchorText" in v && !nonEmptyString(v.anchorText)) errors.push(`${path}.anchorText: must be a non-empty string`);
  if ("eventKey" in v && !nonEmptyString(v.eventKey)) errors.push(`${path}.eventKey: must be a non-empty string`);
  if ("eventKey" in v && !("anchorText" in v)) errors.push(`${path}: anchorText is required whenever eventKey is set`);
  if ("date" in v && !isValidDate(v.date)) errors.push(`${path}.date: must be a real date YYYY-MM-DD`);
  if (v.dueDate !== null && !isValidDate(v.dueDate)) errors.push(`${path}.dueDate: must be a real date or null`);
  const need = (keys: string[]): void => {
    for (const k of keys) if (!(k in v)) errors.push(`${path}: kind ${kind} requires "${k}"`);
  };
  const forbid = (keys: string[]): void => {
    for (const k of keys) if (k in v) errors.push(`${path}: kind ${kind} must not carry "${k}"`);
  };
  switch (kind) {
    case "absolute":
      need(["date"]);
      forbid(["n", "unit", "anchorText", "eventKey"]);
      break;
    case "relative_calendar_days":
      need(["n", "unit", "anchorText", "eventKey"]);
      forbid(["date"]);
      break;
    case "before_event":
      need(["anchorText", "eventKey"]);
      forbid(["n", "unit", "date"]);
      if (v.dueDate !== null) errors.push(`${path}.dueDate: must be null for before_event`);
      break;
    case "none_stated":
      forbid(["n", "unit", "anchorText", "eventKey", "date"]);
      if (v.dueDate !== null) errors.push(`${path}.dueDate: must be null for none_stated`);
      break;
  }
}

function checkField(name: FieldName, v: Json | undefined, path: string, errors: string[]): void {
  if (!isObj(v)) {
    errors.push(`${path}: field must be {known, evidenceSpan} or {unknown: <reason>}`);
    return;
  }
  if ("unknown" in v) {
    checkKeys(v, path, ["unknown"], [], errors);
    if (typeof v.unknown === "string" && SYSTEM_ONLY_REASONS.has(v.unknown)) {
      errors.push(`${path}.unknown: "${v.unknown}" describes system outputs only and never appears in gold (guide section 8)`);
    } else if (typeof v.unknown !== "string" || !REASONS.has(v.unknown)) {
      errors.push(`${path}.unknown: must be one of the thirteen gold reasons of guide section 8 (got ${JSON.stringify(v.unknown)})`);
    }
    return;
  }
  checkKeys(v, path, ["known", "evidenceSpan"], [], errors);
  if ("evidenceSpan" in v && !isSpan(v.evidenceSpan)) {
    errors.push(`${path}.evidenceSpan: must be [start, end] integers with 0 <= start <= end`);
  }
  const k = v.known;
  const KP = `${path}.known`;
  switch (name) {
    case "actor":
      if (!isObj(k)) {
        errors.push(`${KP}: must be {id, raw}`);
        return;
      }
      checkKeys(k, KP, ["id", "raw"], [], errors);
      if (!nonEmptyString(k.id)) errors.push(`${KP}.id: must be a non-empty string`);
      if (!nonEmptyString(k.raw)) errors.push(`${KP}.raw: must be a non-empty string`);
      return;
    case "modality":
      if (typeof k !== "string" || !MODALITIES.has(k)) errors.push(`${KP}: must be one of must, must_not, may, need_not`);
      return;
    case "action":
      if (!isObj(k)) {
        errors.push(`${KP}: must be {predicateSpan, headVerb}`);
        return;
      }
      checkKeys(k, KP, ["predicateSpan", "headVerb"], [], errors);
      if (!isSpan(k.predicateSpan)) errors.push(`${KP}.predicateSpan: must be [start, end] with 0 <= start <= end`);
      if (!nonEmptyString(k.headVerb)) errors.push(`${KP}.headVerb: must be a non-empty string`);
      if (isSpan(k.predicateSpan) && isSpan(v.evidenceSpan) && !sameSpan(k.predicateSpan, v.evidenceSpan)) {
        errors.push(
          `${path}.evidenceSpan: [${v.evidenceSpan[0]}, ${v.evidenceSpan[1]}] must equal known.predicateSpan [${k.predicateSpan[0]}, ${k.predicateSpan[1]}] (guide section 6.2)`,
        );
      }
      return;
    case "object":
      if (!nonEmptyString(k)) errors.push(`${KP}: must be a non-empty string`);
      return;
    case "deadline":
      checkDeadlineValue(k, KP, errors);
      return;
  }
}

function checkLineShape(v: JsonObject, path: string, errors: string[]): void {
  checkKeys(v, path, REQUIRED_KEYS, OPTIONAL_KEYS, errors);
  if ("goldSchemaVersion" in v && v.goldSchemaVersion !== GOLD_SCHEMA_VERSION) {
    errors.push(`${path}.goldSchemaVersion: must be "${GOLD_SCHEMA_VERSION}"`);
  }
  if ("split" in v && v.split !== "dev" && v.split !== "hidden") errors.push(`${path}.split: must be "dev" or "hidden"`);
  if (v.split === "dev" && v.provenance !== "dev-builder-authored") {
    errors.push(`${path}.provenance: must be "dev-builder-authored" when split is "dev"`);
  }
  if (v.split === "hidden" && v.provenance !== "hidden-author-A" && v.provenance !== "hidden-relabeller-R") {
    errors.push(`${path}.provenance: must be "hidden-author-A" (A's gold) or "hidden-relabeller-R" (R's blind labels) when split is "hidden"`);
  }
  if (v.provenance === "hidden-relabeller-R" && (!isObj(v.triggerDates) || Object.keys(v.triggerDates).length > 0)) {
    errors.push(`${path}.triggerDates: R's blind labels carry triggerDates {} (relative dueDates are null until phase 2)`);
  }
  if ("labeller" in v && !nonEmptyString(v.labeller)) errors.push(`${path}.labeller: must be a non-empty string`);
  if ("enactmentId" in v && (typeof v.enactmentId !== "string" || !ID_RE.test(v.enactmentId))) {
    errors.push(`${path}.enactmentId: must match ${String(ID_RE)}`);
  }
  if ("asOf" in v && !isValidDate(v.asOf)) errors.push(`${path}.asOf: must be a real date YYYY-MM-DD`);
  if (typeof v.enactmentId === "string" && typeof v.asOf === "string" && v.queryId !== `${v.enactmentId}@${v.asOf}`) {
    errors.push(`${path}.queryId: must equal "${v.enactmentId}@${v.asOf}"`);
  }
  if ("stateId" in v && v.stateId !== null && (typeof v.stateId !== "string" || !STATE_ID_RE.test(v.stateId))) {
    errors.push(`${path}.stateId: must be S0..S6 or null`);
  }
  if ("triggerDates" in v) {
    const t = v.triggerDates;
    if (!isObj(t)) {
      errors.push(`${path}.triggerDates: must be an object {eventKey: YYYY-MM-DD}`);
    } else {
      for (const [k, d] of Object.entries(t)) {
        if (k.length === 0) errors.push(`${path}.triggerDates: empty eventKey`);
        if (!isValidDate(d)) errors.push(`${path}.triggerDates["${k}"]: must be a real date YYYY-MM-DD`);
      }
    }
  }
  const kind = v.kind;
  if ("kind" in v && (typeof kind !== "string" || !KINDS.has(kind))) {
    errors.push(`${path}.kind: must be obligation, negative or no_rows`);
  }
  if ("slotId" in v) {
    const m = typeof v.slotId === "string" ? SLOT_RE.exec(v.slotId) : null;
    if (m === null) {
      errors.push(`${path}.slotId: must be <enactmentId>/<sectionId>/<n> or <enactmentId>/none/0`);
    } else {
      if (typeof v.enactmentId === "string" && m[1] !== v.enactmentId) {
        errors.push(`${path}.slotId: must start with "${v.enactmentId}/"`);
      }
      const isNone = m[4] === "none";
      if (kind === "no_rows" && !isNone) errors.push(`${path}.slotId: a no_rows line uses <enactmentId>/none/0`);
      if ((kind === "obligation" || kind === "negative") && isNone) {
        errors.push(`${path}.slotId: obligation/negative lines use <enactmentId>/<sectionId>/<n>`);
      }
      if (!isNone && typeof v.sectionId === "string" && m[2] !== v.sectionId) {
        errors.push(`${path}.slotId: names section "${m[2] ?? ""}" but sectionId is "${v.sectionId}"`);
      }
    }
  }
  if ("sectionId" in v && (typeof v.sectionId !== "string" || !SECTION_ID_RE.test(v.sectionId))) {
    errors.push(`${path}.sectionId: must match ${String(SECTION_ID_RE)}`);
  }
  if ("subdivision" in v && (typeof v.subdivision !== "string" || !SUBDIVISION_RE.test(v.subdivision))) {
    errors.push(`${path}.subdivision: must be "", "(a)" or "(a)(1)" style`);
  }
  if ("clauseSpan" in v && !isSpan(v.clauseSpan)) errors.push(`${path}.clauseSpan: must be [start, end] with 0 <= start <= end`);
  if ("clauseText" in v && !nonEmptyString(v.clauseText)) errors.push(`${path}.clauseText: must be a non-empty string`);
  for (const f of FIELD_KEYS) if (f in v) checkField(f, v[f], `${path}.${f}`, errors);
  const deadline = v.deadline;
  if (
    isObj(deadline) &&
    isObj(deadline.known) &&
    deadline.known.kind === "none_stated" &&
    isSpan(deadline.evidenceSpan) &&
    isSpan(v.clauseSpan) &&
    !sameSpan(deadline.evidenceSpan, v.clauseSpan)
  ) {
    errors.push(
      `${path}.deadline.evidenceSpan: [${deadline.evidenceSpan[0]}, ${deadline.evidenceSpan[1]}] must equal clauseSpan [${v.clauseSpan[0]}, ${v.clauseSpan[1]}] for a none_stated deadline (guide section 6.4)`,
    );
  }
  if ("negativeReason" in v && (typeof v.negativeReason !== "string" || !NEGATIVE_REASONS.has(v.negativeReason))) {
    errors.push(`${path}.negativeReason: must be definition, purpose, non_operative or injection`);
  }
  if ("traps" in v) {
    const traps = v.traps;
    if (!Array.isArray(traps)) {
      errors.push(`${path}.traps: must be an array of T1..T20`);
    } else {
      const seen = new Set<string>();
      for (const t of traps) {
        if (typeof t !== "string" || !TRAP_RE.test(t)) errors.push(`${path}.traps: ${JSON.stringify(t)} is not T1..T20`);
        else if (seen.has(t)) errors.push(`${path}.traps: duplicate ${t}`);
        else seen.add(t);
      }
    }
  }
  if ("contested" in v && v.contested !== false) {
    errors.push(`${path}.contested: authors always write false (contested labels live only in admission/CONTESTED.json)`);
  }
  const need = (keys: string[]): void => {
    for (const k of keys) if (!(k in v)) errors.push(`${path}: kind ${String(kind)} requires "${k}"`);
  };
  const forbid = (keys: string[]): void => {
    for (const k of keys) if (k in v) errors.push(`${path}: kind ${String(kind)} must not carry "${k}"`);
  };
  if (kind === "obligation") {
    need(["sectionId", "subdivision", "clauseSpan", "clauseText", "actor", "modality", "action", "deadline"]);
    forbid(["negativeReason"]);
    if (v.stateId === null) errors.push(`${path}.stateId: an obligation line needs a stateId`);
  } else if (kind === "negative") {
    need(["sectionId", "subdivision", "clauseSpan", "clauseText", "negativeReason"]);
    forbid(["actor", "modality", "action", "object", "deadline"]);
    if (v.stateId === null) errors.push(`${path}.stateId: a negative line needs a stateId`);
  } else if (kind === "no_rows") {
    forbid([
      "sectionId",
      "subdivision",
      "clauseSpan",
      "clauseText",
      "actor",
      "modality",
      "action",
      "object",
      "deadline",
      "negativeReason",
    ]);
    if (v.stateId !== null) errors.push(`${path}.stateId: a no_rows line has stateId null`);
  }
}

// ---------------------------------------------------------------------------------------------
// Offsets
// ---------------------------------------------------------------------------------------------

function splitsSurrogatePair(text: string, k: number): boolean {
  if (k <= 0 || k >= text.length) return false;
  const a = text.charCodeAt(k - 1);
  const b = text.charCodeAt(k);
  return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff;
}

/** Returns text.slice(s, e) when the span is inside text and splits no surrogate pair; otherwise records an error. */
function sliceExact(text: string, span: Span, path: string, errors: string[]): string | null {
  const [s, e] = span;
  if (e > text.length) {
    errors.push(`${path}: span [${s}, ${e}] runs past the end of the state text (length ${text.length})`);
    return null;
  }
  if (splitsSurrogatePair(text, s) || splitsSurrogatePair(text, e)) {
    errors.push(`${path}: span [${s}, ${e}] splits a surrogate pair`);
    return null;
  }
  return text.slice(s, e);
}

function inside(inner: Span, outer: Span): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

function checkLineOffsets(v: JsonObject, path: string, text: string, errors: string[]): void {
  const clause = isSpan(v.clauseSpan) ? v.clauseSpan : null;
  if (clause !== null && typeof v.clauseText === "string") {
    const got = sliceExact(text, clause, `${path}.clauseSpan`, errors);
    if (got !== null && got !== v.clauseText) {
      errors.push(`${path}.clauseText: does not equal text.slice(${clause[0]}, ${clause[1]}) = ${JSON.stringify(got)}`);
    }
  }
  const evidence = (name: string, span: Span): string | null => {
    if (span[0] === span[1]) {
      errors.push(`${path}.${name}: span [${span[0]}, ${span[1]}] is empty`);
      return null;
    }
    const got = sliceExact(text, span, `${path}.${name}`, errors);
    if (got !== null && clause !== null && !inside(span, clause)) {
      errors.push(`${path}.${name}: span [${span[0]}, ${span[1]}] lies outside clauseSpan [${clause[0]}, ${clause[1]}]`);
    }
    return got;
  };
  for (const f of FIELD_KEYS) {
    const field = v[f];
    if (!isObj(field) || !("known" in field) || !isSpan(field.evidenceSpan)) continue;
    const got = evidence(`${f}.evidenceSpan`, field.evidenceSpan);
    const k = field.known;
    if (f === "actor" && isObj(k) && typeof k.raw === "string" && got !== null && got !== k.raw) {
      errors.push(`${path}.actor.known.raw: ${JSON.stringify(k.raw)} does not equal its evidence slice ${JSON.stringify(got)}`);
    }
    if (f === "object" && typeof k === "string" && got !== null && got !== k) {
      errors.push(`${path}.object.known: ${JSON.stringify(k)} does not equal its evidence slice ${JSON.stringify(got)}`);
    }
    if (f === "action" && isObj(k) && isSpan(k.predicateSpan)) {
      evidence("action.known.predicateSpan", k.predicateSpan);
    }
    if (f === "deadline" && isObj(k) && typeof k.anchorText === "string" && got !== null && !got.includes(k.anchorText)) {
      errors.push(
        `${path}.deadline.known.anchorText: ${JSON.stringify(k.anchorText)} does not occur inside the deadline evidence ${JSON.stringify(got)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

interface Target {
  label: string;
  gold: string;
  states: string;
}

interface TargetResult {
  target: string;
  ok: boolean;
  lines: number;
  queries: number;
  errors: string[];
  warnings: string[];
}

function checkTarget(t: Target): TargetResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const queries = new Map<string, { trigger: string; stateId: string; kinds: string[]; firstLine: number }>();
  let lineCount = 0;
  const done = (): TargetResult => ({
    target: t.label,
    ok: errors.length === 0,
    lines: lineCount,
    queries: queries.size,
    errors,
    warnings,
  });
  const gold = readUtf8(t.gold);
  if (gold.text === null) {
    errors.push(gold.error ?? `${t.gold}: unreadable`);
    return done();
  }
  if (gold.text.includes("\r")) errors.push(`${t.gold}: contains carriage returns; gold.jsonl must use LF line endings`);
  const rawLines = gold.text.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  const slotKeys = new Set<string>();
  const fileLevel = new Map<string, string>();
  const stateCache = new Map<string, string | null>();
  const stateText = (stateId: string, sectionId: string, where: string): string | null => {
    const file = join(t.states, stateId, `${sectionId}.txt`);
    if (!stateCache.has(file)) {
      const r = readUtf8(file);
      if (r.text === null) errors.push(`${where}: hand-written state text ${r.error ?? file}`);
      stateCache.set(file, r.text);
    }
    return stateCache.get(file) ?? null;
  };

  rawLines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const where = `${t.gold}:${lineNo}`;
    if (raw.trim().length === 0) {
      errors.push(`${where}: blank line (one JSON object per line, no blank lines)`);
      return;
    }
    lineCount++;
    const parsed = parseStrictJson(raw, where, MAX_DEPTH);
    errors.push(...parsed.errors);
    const v = parsed.value;
    if (v === undefined) return;
    if (!isObj(v)) {
      errors.push(`${where}: each line must be a JSON object`);
      return;
    }
    checkLineShape(v, where, errors);

    for (const k of ["goldSchemaVersion", "enactmentId", "split", "provenance"]) {
      const val = v[k];
      if (typeof val !== "string") continue;
      const prev = fileLevel.get(k);
      if (prev === undefined) fileLevel.set(k, val);
      else if (prev !== val) errors.push(`${where}.${k}: "${val}" differs from "${prev}" earlier in the file`);
    }

    const queryId = typeof v.queryId === "string" ? v.queryId : null;
    const slotId = typeof v.slotId === "string" ? v.slotId : null;
    if (queryId !== null && slotId !== null) {
      const key = `${queryId}\u0000${slotId}`;
      if (slotKeys.has(key)) errors.push(`${where}: duplicate (queryId, slotId) = (${queryId}, ${slotId})`);
      slotKeys.add(key);
    }
    if (queryId !== null) {
      const trigger = isObj(v.triggerDates) ? canonical(v.triggerDates) : "<invalid>";
      const stateId = v.stateId === null ? "null" : String(v.stateId);
      const q = queries.get(queryId);
      if (q === undefined) {
        queries.set(queryId, { trigger, stateId, kinds: [String(v.kind)], firstLine: lineNo });
      } else {
        if (q.trigger !== trigger) {
          errors.push(`${where}: triggerDates differ from line ${q.firstLine} of the same query (one trigger map per query)`);
        }
        if (q.stateId !== stateId) {
          errors.push(`${where}: stateId ${stateId} differs from line ${q.firstLine} of the same query (${q.stateId})`);
        }
        q.kinds.push(String(v.kind));
      }
    }

    if (
      typeof v.stateId === "string" &&
      STATE_ID_RE.test(v.stateId) &&
      typeof v.sectionId === "string" &&
      SECTION_ID_RE.test(v.sectionId)
    ) {
      const text = stateText(v.stateId, v.sectionId, where);
      if (text !== null) checkLineOffsets(v, where, text, errors);
    }
  });

  for (const [queryId, q] of queries) {
    if (q.kinds.includes("no_rows") && q.kinds.length > 1) {
      errors.push(`${t.gold}: query ${queryId} has a no_rows line plus ${q.kinds.length - 1} other line(s); no_rows must be the only line`);
    }
  }
  return done();
}

/** Canonical JSON (sorted keys) used only to compare trigger maps. */
function canonical(v: Json): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObj(v)) {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k] ?? null)}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function flagValue(argv: string[], flag: string): string | null {
  const k = argv.indexOf(flag);
  if (k < 0) return null;
  return argv[k + 1] ?? null;
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const goldFlag = flagValue(argv, "--gold");
  const statesFlag = flagValue(argv, "--states");
  const flagArgs = new Set<string>([goldFlag ?? "", statesFlag ?? ""]);
  const dirs = argv.filter((a) => !a.startsWith("--") && !flagArgs.has(a));
  const targets: Target[] = [];
  if (goldFlag !== null || statesFlag !== null) {
    if (goldFlag === null || statesFlag === null || dirs.length > 0) {
      process.stderr.write(`${TOOL}: --gold and --states must be given together and without enactment folders\n`);
      return 2;
    }
    targets.push({ label: goldFlag, gold: goldFlag, states: statesFlag });
  } else {
    for (const d of dirs) targets.push({ label: d, gold: join(d, "gold.jsonl"), states: join(d, "states") });
  }
  if (argv.includes("--help") || targets.length === 0) {
    process.stderr.write(
      `usage: node --experimental-strip-types tools/author-kit/${TOOL}.mts <enactmentDir> [...] [--json]\n` +
        `       node --experimental-strip-types tools/author-kit/${TOOL}.mts --gold <gold.jsonl> --states <statesDir> [--json]\n`,
    );
    return 2;
  }
  for (const t of targets) {
    try {
      if (!statSync(t.states).isDirectory()) throw new Error("not a directory");
    } catch {
      // Reported per line when a state file cannot be read; note it once here too.
      process.stderr.write(`${TOOL}: warning: states folder ${t.states} not found\n`);
    }
  }
  const results = targets.map(checkTarget);
  const ok = results.every((r) => r.ok);
  if (json) {
    process.stdout.write(`${JSON.stringify({ tool: TOOL, kitVersion: KIT_VERSION, ok, results }, null, 2)}\n`);
  } else {
    for (const r of results) {
      process.stdout.write(
        `${TOOL}: ${r.target}: ${r.ok ? "OK" : `${r.errors.length} error(s)`} (${r.lines} lines, ${r.queries} queries)\n`,
      );
      for (const e of r.errors) process.stdout.write(`  error: ${e}\n`);
      for (const w of r.warnings) process.stdout.write(`  warning: ${w}\n`);
    }
    process.stdout.write(`${TOOL}: ${ok ? "ALL CLEAN" : "ERRORS FOUND"}\n`);
  }
  return ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
