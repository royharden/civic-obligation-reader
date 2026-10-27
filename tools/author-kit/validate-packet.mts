/**
 * validate-packet.mts — S46 author kit (standalone).
 *
 * Validates one or more packet.json files against the s46.packet.v1 rules (docs/PACKET-FORMAT.md,
 * schema/packet.schema.json), re-implemented by hand so this file needs nothing but Node built-ins.
 * It imports nothing from the application (no src/, no eval/, no relative imports). The small
 * helpers below (strict JSON, Gregorian dates) are duplicated in every author-kit tool on purpose.
 *
 * Usage (Node >= 22.6):
 *   node --experimental-strip-types tools/author-kit/validate-packet.mts <packet.json | enactmentDir> [...] [--json]
 * An enactmentDir argument means <enactmentDir>/packet.json.
 * Exit code: 0 all valid, 1 at least one invalid, 2 usage error.
 *
 * Checks: size <= 131072 bytes; strict UTF-8 without BOM; strict JSON (duplicate keys, trailing
 * content, control characters, depth <= 8, lone surrogates); unknown and missing keys at every level;
 * schemaVersion; id patterns; real Gregorian dates; license CC0-1.0; caps (12 sections base + added,
 * 6 amendments, 7 states); unique section and amendment ids; sunsetExclusive > commencesOn;
 * per amendment: enactedOn >= enactment.enactedOn, effectiveOn >= commencesOn, effectiveOn <
 * sunsetExclusive, affectedSectionIds non-empty, unique and known, every op target listed in
 * affectedSectionIds, every afterSectionId known, op field rules (old/anchor/text non-empty,
 * preimageSha256 lowercase hex), operations "unstructured" or a non-empty array.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TOOL = "validate-packet";
const KIT_VERSION = "s46.author-kit.v1";
const SCHEMA_VERSION = "s46.packet.v1";
const MAX_BYTES = 128 * 1024;
const MAX_DEPTH = 8;
const MAX_SECTIONS = 12;
const MAX_AMENDMENTS = 6;
const MAX_STATES = 7;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SECTION_ID_RE = /^sec-[0-9]+$/;
const SECTION_PATH_RE = /^Sec\. [0-9]+$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

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
// Gregorian dates (duplicated on purpose)
// ---------------------------------------------------------------------------------------------

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
// Validation
// ---------------------------------------------------------------------------------------------

interface Stats {
  bytes: number;
  sections: number;
  amendments: number;
  states: number;
}

interface FileResult {
  file: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: Stats;
}

interface Ctx {
  errors: string[];
  warnings: string[];
}

function checkKeys(o: JsonObject, path: string, required: string[], optional: string[], ctx: Ctx): void {
  for (const k of required) if (!(k in o)) ctx.errors.push(`${path}: missing required key "${k}"`);
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) ctx.errors.push(`${path}: unknown key "${k}"`);
  }
}

function checkString(o: JsonObject, key: string, path: string, ctx: Ctx, nonEmpty: boolean): string | null {
  if (!(key in o)) return null;
  const v = o[key];
  if (typeof v !== "string") {
    ctx.errors.push(`${path}.${key}: must be a string`);
    return null;
  }
  if (nonEmpty && v.length === 0) {
    ctx.errors.push(`${path}.${key}: must not be empty`);
    return null;
  }
  return v;
}

function checkPattern(o: JsonObject, key: string, path: string, re: RegExp, ctx: Ctx): string | null {
  const v = checkString(o, key, path, ctx, true);
  if (v === null) return null;
  if (!re.test(v)) {
    ctx.errors.push(`${path}.${key}: "${v}" does not match ${String(re)}`);
    return null;
  }
  return v;
}

function checkDate(o: JsonObject, key: string, path: string, ctx: Ctx): string | null {
  if (!(key in o)) return null;
  const v = o[key];
  if (!isValidDate(v)) {
    ctx.errors.push(`${path}.${key}: must be a real Gregorian date YYYY-MM-DD (got ${JSON.stringify(v)})`);
    return null;
  }
  return v;
}

/** Validates one section object; returns its sectionId when well-formed. */
function checkSection(s: Json | undefined, path: string, ctx: Ctx): string | null {
  if (!isObj(s)) {
    ctx.errors.push(`${path}: section must be an object`);
    return null;
  }
  checkKeys(s, path, ["sectionId", "path", "heading", "text"], [], ctx);
  const id = checkPattern(s, "sectionId", path, SECTION_ID_RE, ctx);
  const p = checkPattern(s, "path", path, SECTION_PATH_RE, ctx);
  checkString(s, "heading", path, ctx, false);
  const text = checkString(s, "text", path, ctx, true);
  if (id !== null && p !== null && id.slice(4) !== p.slice(5)) {
    ctx.warnings.push(`${path}: sectionId "${id}" and path "${p}" carry different numbers`);
  }
  if (text !== null && text.includes("\r")) {
    ctx.warnings.push(`${path}.text: contains a carriage return (text is kept byte-exact; LF expected)`);
  }
  return id;
}

function validatePacketValue(root: Json, ctx: Ctx, stats: Stats): void {
  if (!isObj(root)) {
    ctx.errors.push("$: packet must be a JSON object");
    return;
  }
  checkKeys(root, "$", ["schemaVersion", "enactment"], [], ctx);
  if ("schemaVersion" in root && root.schemaVersion !== SCHEMA_VERSION) {
    ctx.errors.push(`$.schemaVersion: must be "${SCHEMA_VERSION}"`);
  }
  const en = root.enactment;
  if (!isObj(en)) {
    ctx.errors.push("$.enactment: must be an object");
    return;
  }
  const P = "$.enactment";
  checkKeys(
    en,
    P,
    ["id", "title", "fictionalProvenance", "enactedOn", "commencesOn", "sunsetExclusive", "sections", "amendments"],
    [],
    ctx,
  );
  checkPattern(en, "id", P, ID_RE, ctx);
  checkString(en, "title", P, ctx, true);
  const fp = en.fictionalProvenance;
  if ("fictionalProvenance" in en) {
    if (!isObj(fp)) {
      ctx.errors.push(`${P}.fictionalProvenance: must be an object`);
    } else {
      const FP = `${P}.fictionalProvenance`;
      checkKeys(fp, FP, ["author", "attestation", "license"], [], ctx);
      checkString(fp, "author", FP, ctx, true);
      checkString(fp, "attestation", FP, ctx, true);
      if ("license" in fp && fp.license !== "CC0-1.0") ctx.errors.push(`${FP}.license: must be "CC0-1.0"`);
    }
  }
  const enactedOn = checkDate(en, "enactedOn", P, ctx);
  const commencesOn = checkDate(en, "commencesOn", P, ctx);
  let sunset: string | null = null;
  if ("sunsetExclusive" in en && en.sunsetExclusive !== null) {
    sunset = checkDate(en, "sunsetExclusive", P, ctx);
  }
  if (commencesOn !== null && sunset !== null && sunset <= commencesOn) {
    ctx.errors.push(`${P}.sunsetExclusive: ${sunset} must be later than commencesOn ${commencesOn}`);
  }

  // Sections: base ids, then ids added by addSection ops.
  const known = new Set<string>();
  let total = 0;
  if ("sections" in en) {
    const sections = en.sections;
    if (!Array.isArray(sections)) {
      ctx.errors.push(`${P}.sections: must be an array`);
    } else {
      if (sections.length === 0) ctx.errors.push(`${P}.sections: must contain at least one section`);
      sections.forEach((s, k) => {
        const id = checkSection(s, `${P}.sections[${k}]`, ctx);
        total++;
        if (id === null) return;
        if (known.has(id)) ctx.errors.push(`${P}.sections[${k}].sectionId: duplicate section id "${id}"`);
        known.add(id);
      });
    }
  }

  const amendmentsRaw = "amendments" in en ? en.amendments : [];
  const amendments: Json[] = Array.isArray(amendmentsRaw) ? amendmentsRaw : [];
  if (!Array.isArray(amendmentsRaw)) ctx.errors.push(`${P}.amendments: must be an array`);
  if (amendments.length > MAX_AMENDMENTS) {
    ctx.errors.push(`${P}.amendments: ${amendments.length} amendments; cap is ${MAX_AMENDMENTS}`);
  }

  amendments.forEach((a, k) => {
    if (!isObj(a) || !Array.isArray(a.operations)) return;
    a.operations.forEach((op, j) => {
      if (!isObj(op) || op.op !== "addSection" || !isObj(op.section)) return;
      const id = op.section.sectionId;
      total++;
      if (typeof id !== "string" || !SECTION_ID_RE.test(id)) return;
      if (known.has(id)) {
        ctx.errors.push(`${P}.amendments[${k}].operations[${j}].section.sectionId: duplicate section id "${id}"`);
      }
      known.add(id);
    });
  });
  if (total > MAX_SECTIONS) ctx.errors.push(`${P}: ${total} sections (base + added); cap is ${MAX_SECTIONS}`);

  // Amendments.
  const amendmentIds = new Set<string>();
  const boundaries = new Set<string>();
  if (commencesOn !== null) boundaries.add(commencesOn);
  amendments.forEach((a, k) => {
    const A = `${P}.amendments[${k}]`;
    if (!isObj(a)) {
      ctx.errors.push(`${A}: amendment must be an object`);
      return;
    }
    checkKeys(
      a,
      A,
      ["amendmentId", "enactedOn", "effectiveOn", "instructionText", "affectedSectionIds", "operations"],
      ["order"],
      ctx,
    );
    const aid = checkPattern(a, "amendmentId", A, ID_RE, ctx);
    if (aid !== null) {
      if (amendmentIds.has(aid)) ctx.errors.push(`${A}.amendmentId: duplicate amendment id "${aid}"`);
      amendmentIds.add(aid);
    }
    const aEnacted = checkDate(a, "enactedOn", A, ctx);
    const aEffective = checkDate(a, "effectiveOn", A, ctx);
    if ("order" in a) {
      const o = a.order;
      if (typeof o !== "number" || !Number.isSafeInteger(o) || o < 0) {
        ctx.errors.push(`${A}.order: must be a non-negative integer`);
      }
    }
    checkString(a, "instructionText", A, ctx, true);
    if (aEnacted !== null && enactedOn !== null && aEnacted < enactedOn) {
      ctx.errors.push(`${A}.enactedOn: ${aEnacted} is earlier than the enactment's enactedOn ${enactedOn}`);
    }
    if (aEffective !== null && commencesOn !== null && aEffective < commencesOn) {
      ctx.errors.push(`${A}.effectiveOn: ${aEffective} is earlier than commencesOn ${commencesOn}`);
    }
    if (aEffective !== null && sunset !== null && aEffective >= sunset) {
      ctx.errors.push(`${A}.effectiveOn: ${aEffective} is not earlier than sunsetExclusive ${sunset}`);
    }
    if (aEffective !== null && aEnacted !== null && aEffective < aEnacted) {
      ctx.warnings.push(
        `${A}: retroactive (effectiveOn ${aEffective} < enactedOn ${aEnacted}); it is never applied and taints its targets retroactive_unsupported`,
      );
    }
    if (
      aEffective !== null &&
      (commencesOn === null || aEffective >= commencesOn) &&
      (sunset === null || aEffective < sunset)
    ) {
      boundaries.add(aEffective);
    }

    // Target set.
    const affected = new Set<string>();
    if ("affectedSectionIds" in a) {
      const ids = a.affectedSectionIds;
      if (!Array.isArray(ids)) {
        ctx.errors.push(`${A}.affectedSectionIds: must be an array`);
      } else {
        if (ids.length === 0) ctx.errors.push(`${A}.affectedSectionIds: must not be empty`);
        ids.forEach((id, j) => {
          if (typeof id !== "string" || !SECTION_ID_RE.test(id)) {
            ctx.errors.push(`${A}.affectedSectionIds[${j}]: must be a section id matching ${String(SECTION_ID_RE)}`);
            return;
          }
          if (affected.has(id)) ctx.errors.push(`${A}.affectedSectionIds[${j}]: duplicate "${id}"`);
          affected.add(id);
          if (!known.has(id)) {
            ctx.errors.push(
              `${A}.affectedSectionIds[${j}]: "${id}" is neither a base section nor added by any addSection in the packet`,
            );
          }
        });
      }
    }

    // Operations.
    if (!("operations" in a)) return;
    const ops = a.operations;
    if (ops === "unstructured") return;
    if (!Array.isArray(ops)) {
      ctx.errors.push(`${A}.operations: must be "unstructured" or a non-empty array of operations`);
      return;
    }
    if (ops.length === 0) ctx.errors.push(`${A}.operations: must not be an empty array (use "unstructured")`);
    ops.forEach((op, j) => checkOperation(op, `${A}.operations[${j}]`, affected, known, ctx));
  });

  stats.sections = total;
  stats.amendments = amendments.length;
  stats.states = boundaries.size;
  if (boundaries.size > MAX_STATES) ctx.errors.push(`${P}: ${boundaries.size} states; cap is ${MAX_STATES}`);
}

function checkPreimage(op: JsonObject, path: string, ctx: Ctx): void {
  if (!("preimageSha256" in op)) return;
  const v = op.preimageSha256;
  if (typeof v !== "string" || !SHA256_RE.test(v)) {
    ctx.errors.push(`${path}.preimageSha256: must be 64 lowercase hex characters`);
  }
}

function checkOperation(op: Json, path: string, affected: Set<string>, known: Set<string>, ctx: Ctx): void {
  if (!isObj(op)) {
    ctx.errors.push(`${path}: operation must be an object`);
    return;
  }
  let target: string | null = null;
  let mustExist = true;
  switch (op.op) {
    case "replaceText":
      checkKeys(op, path, ["op", "sectionId", "old", "new"], ["preimageSha256"], ctx);
      target = checkPattern(op, "sectionId", path, SECTION_ID_RE, ctx);
      checkString(op, "old", path, ctx, true);
      checkString(op, "new", path, ctx, false);
      checkPreimage(op, path, ctx);
      break;
    case "insertAfter":
      checkKeys(op, path, ["op", "sectionId", "anchor", "text"], ["preimageSha256"], ctx);
      target = checkPattern(op, "sectionId", path, SECTION_ID_RE, ctx);
      checkString(op, "anchor", path, ctx, true);
      checkString(op, "text", path, ctx, true);
      checkPreimage(op, path, ctx);
      break;
    case "addSection": {
      checkKeys(op, path, ["op", "afterSectionId", "section"], [], ctx);
      const after = checkPattern(op, "afterSectionId", path, SECTION_ID_RE, ctx);
      if ("section" in op) target = checkSection(op.section, `${path}.section`, ctx);
      if (after !== null && !known.has(after)) {
        ctx.errors.push(
          `${path}.afterSectionId: "${after}" is neither a base section nor added by any addSection in the packet`,
        );
      }
      if (after !== null && target !== null && after === target) {
        ctx.errors.push(`${path}.afterSectionId: must differ from the added section's own id`);
      }
      mustExist = false;
      break;
    }
    case "repealSection":
      checkKeys(op, path, ["op", "sectionId"], ["preimageSha256"], ctx);
      target = checkPattern(op, "sectionId", path, SECTION_ID_RE, ctx);
      checkPreimage(op, path, ctx);
      break;
    default:
      ctx.errors.push(`${path}.op: must be one of replaceText, insertAfter, addSection, repealSection`);
      return;
  }
  if (target === null) return;
  if (!affected.has(target)) {
    ctx.errors.push(`${path}: op target "${target}" is not listed in the amendment's affectedSectionIds`);
  }
  if (mustExist && !known.has(target)) {
    ctx.errors.push(`${path}: op target "${target}" is neither a base section nor added by any addSection`);
  }
}

function validateFile(file: string): FileResult {
  const ctx: Ctx = { errors: [], warnings: [] };
  const stats: Stats = { bytes: 0, sections: 0, amendments: 0, states: 0 };
  const result = (): FileResult => ({ file, ok: ctx.errors.length === 0, errors: ctx.errors, warnings: ctx.warnings, stats });
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch (e) {
    ctx.errors.push(`cannot read file: ${e instanceof Error ? e.message : String(e)}`);
    return result();
  }
  stats.bytes = buf.length;
  if (buf.length > MAX_BYTES) ctx.errors.push(`file is ${buf.length} bytes; cap is ${MAX_BYTES} (128 KiB)`);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    ctx.errors.push("UTF-8 byte order mark is not allowed");
    return result();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    ctx.errors.push("file is not valid UTF-8");
    return result();
  }
  const parsed = parseStrictJson(text, file, MAX_DEPTH);
  ctx.errors.push(...parsed.errors);
  if (parsed.value !== undefined) validatePacketValue(parsed.value, ctx, stats);
  return result();
}

function resolvePacketPath(arg: string): string {
  try {
    if (statSync(arg).isDirectory()) return join(arg, "packet.json");
  } catch {
    // Missing paths are reported by validateFile.
  }
  return arg;
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const targets = argv.filter((a) => !a.startsWith("--"));
  if (argv.includes("--help") || targets.length === 0) {
    process.stderr.write(
      `usage: node --experimental-strip-types tools/author-kit/${TOOL}.mts <packet.json | enactmentDir> [...] [--json]\n`,
    );
    return 2;
  }
  const results = targets.map((t) => validateFile(resolvePacketPath(t)));
  const ok = results.every((r) => r.ok);
  if (json) {
    process.stdout.write(`${JSON.stringify({ tool: TOOL, kitVersion: KIT_VERSION, ok, results }, null, 2)}\n`);
  } else {
    for (const r of results) {
      const s = r.stats;
      const caps = `sections ${s.sections}/${MAX_SECTIONS}, amendments ${s.amendments}/${MAX_AMENDMENTS}, states ${s.states}/${MAX_STATES}, bytes ${s.bytes}/${MAX_BYTES}`;
      process.stdout.write(`${TOOL}: ${r.file}: ${r.ok ? "OK" : `INVALID (${r.errors.length} errors)`} (${caps})\n`);
      for (const e of r.errors) process.stdout.write(`  error: ${e}\n`);
      for (const w of r.warnings) process.stdout.write(`  warning: ${w}\n`);
    }
    process.stdout.write(`${TOOL}: ${ok ? "ALL VALID" : "INVALID"}\n`);
  }
  return ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
