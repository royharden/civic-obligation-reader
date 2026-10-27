/**
 * query-dates.mts — S46 author kit (standalone).
 *
 * Computes the required query dates for one enactment from its packet metadata alone and, when a
 * gold.jsonl is present, compares them with the queries the gold actually contains. Node built-ins
 * only; imports nothing from the application and has no relative imports. Helpers are duplicated in
 * each tool on purpose.
 *
 * Usage (Node >= 22.6):
 *   node --experimental-strip-types tools/author-kit/query-dates.mts <enactmentDir> [...] [--json]
 *   node --experimental-strip-types tools/author-kit/query-dates.mts --packet <packet.json> [--gold <gold.jsonl>] [--json]
 * An enactmentDir means <enactmentDir>/packet.json and, if it exists, <enactmentDir>/gold.jsonl.
 * Exit code: 0 dates computed and (if gold given) gold matches, 1 mismatch or bad packet, 2 usage error.
 *
 * States: boundaries are commencesOn, every distinct amendment effectiveOn (applied, failed,
 * unstructured or retroactive alike) and sunsetExclusive. A state is the half-open interval between
 * consecutive boundaries inside [commencesOn, sunsetExclusive); states are numbered S0 (from
 * commencesOn), S1, ... in date order. With no sunset the last state is open-ended.
 *
 * Query-date rule (deduplicated, ascending):
 *   1. commencesOn;
 *   2. for each state [a, b): its first day a, and its midpoint a + floor((b - a) / 2) days
 *      (a last state ended by sunsetExclusive counts as bounded); for an open-ended last state, a + 30 days;
 *   3. for each amendment with effectiveOn > enactedOn + 1 day: enactedOn + 1 day (a true pending day);
 *   4. the day before commencesOn;
 *   5. sunsetExclusive itself, when not null.
 * Each date's expected stateId is S<k> when commencesOn <= date < sunsetExclusive, else null (not in force).
 *
 * Gold comparison: the set of asOf values (queryId = <enactmentId>@<asOf>) must equal the computed set,
 * and every line's stateId must equal the expected stateId for its asOf.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TOOL = "query-dates";
const KIT_VERSION = "s46.author-kit.v1";
const MAX_DEPTH = 8;

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

function dayNumber(date: string): number {
  const p = parseDate(date);
  if (p === null) throw new Error(`invalid date ${date}`);
  return daysFromCivil(p[0], p[1], p[2]);
}

// ---------------------------------------------------------------------------------------------
// States and query dates
// ---------------------------------------------------------------------------------------------

interface StateInterval {
  stateId: string;
  from: string;
  /** Exclusive end; null when open-ended. */
  to: string | null;
}

interface QueryDate {
  asOf: string;
  stateId: string | null;
  because: string[];
}

interface Computed {
  enactmentId: string;
  states: StateInterval[];
  dates: QueryDate[];
}

function compute(packet: Json, errors: string[]): Computed | null {
  const en = isObj(packet) ? packet.enactment : undefined;
  if (!isObj(en)) {
    errors.push("packet has no enactment object (run validate-packet.mts first)");
    return null;
  }
  const enactmentId = typeof en.id === "string" ? en.id : "?";
  const commencesOn = en.commencesOn;
  if (parseDate(commencesOn) === null) {
    errors.push("enactment.commencesOn is not a real date (run validate-packet.mts first)");
    return null;
  }
  const commences = commencesOn as string;
  let sunset: string | null = null;
  if (en.sunsetExclusive !== null) {
    if (parseDate(en.sunsetExclusive) === null) {
      errors.push("enactment.sunsetExclusive is neither null nor a real date");
      return null;
    }
    sunset = en.sunsetExclusive as string;
    if (dayNumber(sunset) <= dayNumber(commences)) {
      errors.push("enactment.sunsetExclusive must be later than commencesOn");
      return null;
    }
  }
  const amendments = Array.isArray(en.amendments) ? en.amendments : [];
  const inForce = (d: string): boolean =>
    dayNumber(d) >= dayNumber(commences) && (sunset === null || dayNumber(d) < dayNumber(sunset));

  // Boundaries inside [commencesOn, sunsetExclusive).
  const boundarySet = new Set<string>([commences]);
  const pendingDays: { date: string; amendmentId: string }[] = [];
  amendments.forEach((a, k) => {
    if (!isObj(a)) {
      errors.push(`amendments[${k}] is not an object`);
      return;
    }
    const id = typeof a.amendmentId === "string" ? a.amendmentId : `amendments[${k}]`;
    const eff = a.effectiveOn;
    const enacted = a.enactedOn;
    if (parseDate(eff) === null || parseDate(enacted) === null) {
      errors.push(`${id}: enactedOn/effectiveOn are not real dates`);
      return;
    }
    const effDate = eff as string;
    const enactedDate = enacted as string;
    if (inForce(effDate)) boundarySet.add(effDate);
    else errors.push(`${id}: effectiveOn ${effDate} lies outside [commencesOn, sunsetExclusive) (packet is invalid)`);
    if (dayNumber(effDate) > dayNumber(enactedDate) + 1) {
      pendingDays.push({ date: civilFromDays(dayNumber(enactedDate) + 1), amendmentId: id });
    }
  });
  const boundaries = [...boundarySet].sort((x, y) => dayNumber(x) - dayNumber(y));
  const states: StateInterval[] = boundaries.map((from, k) => ({
    stateId: `S${k}`,
    from,
    to: boundaries[k + 1] ?? sunset,
  }));
  const stateOf = (d: string): string | null => {
    if (!inForce(d)) return null;
    let id: string | null = null;
    for (const s of states) if (dayNumber(s.from) <= dayNumber(d)) id = s.stateId;
    return id;
  };

  const reasons = new Map<string, string[]>();
  const add = (d: string, why: string): void => {
    const list = reasons.get(d);
    if (list === undefined) reasons.set(d, [why]);
    else list.push(why);
  };
  add(commences, "commencement");
  for (const s of states) {
    add(s.from, `${s.stateId} first day`);
    const a = dayNumber(s.from);
    if (s.to !== null) {
      add(civilFromDays(a + Math.floor((dayNumber(s.to) - a) / 2)), `${s.stateId} midpoint`);
    } else {
      add(civilFromDays(a + 30), `${s.stateId} open-ended: first day + 30`);
    }
  }
  for (const p of pendingDays) add(p.date, `pending day after enactment of ${p.amendmentId}`);
  add(civilFromDays(dayNumber(commences) - 1), "day before commencement");
  if (sunset !== null) add(sunset, "sunsetExclusive");

  const dates = [...reasons.keys()]
    .sort((x, y) => dayNumber(x) - dayNumber(y))
    .map((asOf) => ({ asOf, stateId: stateOf(asOf), because: reasons.get(asOf) ?? [] }));
  return { enactmentId, states, dates };
}

interface TargetResult {
  target: string;
  ok: boolean;
  enactmentId: string | null;
  states: StateInterval[];
  dates: QueryDate[];
  goldChecked: boolean;
  errors: string[];
}

function checkTarget(label: string, packetPath: string, goldPath: string | null): TargetResult {
  const errors: string[] = [];
  const result = (c: Computed | null, goldChecked: boolean): TargetResult => ({
    target: label,
    ok: errors.length === 0,
    enactmentId: c?.enactmentId ?? null,
    states: c?.states ?? [],
    dates: c?.dates ?? [],
    goldChecked,
    errors,
  });
  const p = readUtf8(packetPath);
  if (p.text === null) {
    errors.push(p.error ?? `${packetPath}: unreadable`);
    return result(null, false);
  }
  const parsed = parseStrictJson(p.text, packetPath, MAX_DEPTH);
  errors.push(...parsed.errors);
  if (parsed.value === undefined) return result(null, false);
  const c = compute(parsed.value, errors);
  if (c === null || goldPath === null) return result(c, false);

  const g = readUtf8(goldPath);
  if (g.text === null) {
    errors.push(g.error ?? `${goldPath}: unreadable`);
    return result(c, false);
  }
  const expected = new Map(c.dates.map((d) => [d.asOf, d.stateId] as const));
  const seen = new Set<string>();
  g.text.split("\n").forEach((raw, idx) => {
    if (raw.trim().length === 0) return;
    const where = `${goldPath}:${idx + 1}`;
    const line = parseStrictJson(raw, where, MAX_DEPTH);
    const v = line.value;
    if (v === undefined || !isObj(v)) {
      errors.push(`${where}: not a JSON object (run check-offsets.mts)`);
      return;
    }
    const asOf = typeof v.asOf === "string" ? v.asOf : null;
    if (asOf === null) {
      errors.push(`${where}: missing asOf`);
      return;
    }
    if (v.queryId !== `${c.enactmentId}@${asOf}`) {
      errors.push(`${where}: queryId ${JSON.stringify(v.queryId)} is not "${c.enactmentId}@${asOf}"`);
    }
    if (!expected.has(asOf)) {
      if (!seen.has(asOf)) errors.push(`${where}: query date ${asOf} is not produced by the query-date rule (extra query)`);
    } else {
      const want = expected.get(asOf) ?? null;
      const got = v.stateId === null ? null : typeof v.stateId === "string" ? v.stateId : "<invalid>";
      if (got !== want) errors.push(`${where}: stateId ${String(got)} but ${asOf} falls in ${String(want ?? "no state (not in force)")}`);
    }
    seen.add(asOf);
  });
  for (const d of c.dates) {
    if (!seen.has(d.asOf)) errors.push(`${goldPath}: missing query ${c.enactmentId}@${d.asOf} (${d.because.join("; ")})`);
  }
  return result(c, true);
}

function flagValue(argv: string[], flag: string): string | null {
  const k = argv.indexOf(flag);
  if (k < 0) return null;
  return argv[k + 1] ?? null;
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const packetFlag = flagValue(argv, "--packet");
  const goldFlag = flagValue(argv, "--gold");
  const flagArgs = new Set<string>([packetFlag ?? "", goldFlag ?? ""]);
  const dirs = argv.filter((a) => !a.startsWith("--") && !flagArgs.has(a));
  const jobs: { label: string; packet: string; gold: string | null }[] = [];
  if (packetFlag !== null) {
    if (dirs.length > 0) {
      process.stderr.write(`${TOOL}: use either enactment folders or --packet [--gold], not both\n`);
      return 2;
    }
    jobs.push({ label: packetFlag, packet: packetFlag, gold: goldFlag });
  } else {
    if (goldFlag !== null) {
      process.stderr.write(`${TOOL}: --gold needs --packet\n`);
      return 2;
    }
    for (const d of dirs) {
      let isDir = false;
      try {
        isDir = statSync(d).isDirectory();
      } catch {
        isDir = false;
      }
      const packet = isDir ? join(d, "packet.json") : d;
      const gold = isDir && existsSync(join(d, "gold.jsonl")) ? join(d, "gold.jsonl") : null;
      jobs.push({ label: d, packet, gold });
    }
  }
  if (argv.includes("--help") || jobs.length === 0) {
    process.stderr.write(
      `usage: node --experimental-strip-types tools/author-kit/${TOOL}.mts <enactmentDir> [...] [--json]\n` +
        `       node --experimental-strip-types tools/author-kit/${TOOL}.mts --packet <packet.json> [--gold <gold.jsonl>] [--json]\n`,
    );
    return 2;
  }
  const results = jobs.map((j) => checkTarget(j.label, j.packet, j.gold));
  const ok = results.every((r) => r.ok);
  if (json) {
    process.stdout.write(`${JSON.stringify({ tool: TOOL, kitVersion: KIT_VERSION, ok, results }, null, 2)}\n`);
  } else {
    for (const r of results) {
      process.stdout.write(`${TOOL}: ${r.target} (${r.enactmentId ?? "?"})\n`);
      for (const s of r.states) process.stdout.write(`  state ${s.stateId}: [${s.from}, ${s.to ?? "open"})\n`);
      for (const d of r.dates) {
        process.stdout.write(`  query ${r.enactmentId ?? "?"}@${d.asOf} -> ${d.stateId ?? "not in force"}  (${d.because.join("; ")})\n`);
      }
      process.stdout.write(`  gold: ${r.goldChecked ? (r.ok ? "matches the rule" : "DOES NOT match") : "not checked"}\n`);
      for (const e of r.errors) process.stdout.write(`  error: ${e}\n`);
    }
    process.stdout.write(`${TOOL}: ${ok ? "OK" : "ERRORS FOUND"}\n`);
  }
  return ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
