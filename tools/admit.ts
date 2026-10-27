/**
 * tools/admit.ts — read-only G1 admission checker (PLAN section 7; docs/ADMISSION-PROTOCOL.md section 8).
 *
 * Run later (install deferred):  npm run admit   (= tsx tools/admit.ts)   [--json]
 *   or, with no install:          node --experimental-strip-types tools/admit.ts [--json]
 * Prints GO | NO-GO | PENDING with reasons. Exit code: 0 GO, 1 NO-GO, 2 PENDING.
 *
 * WHAT IT READS — and nothing else (every file read goes through assertReadable below):
 *   - the inner repo (git history via `git -C <repo> log/show/diff-tree/merge-base/rev-parse`, docs/LABELLING-GUIDE.md,
 *     fixtures/MANIFEST.json, files named in a receipt's `materials` (inner-repo-relative only), fixtures/dev/E01..E06
 *     through the author-kit tools run as child processes);
 *   - the AgentNamer registry at <outer>/../.agent-registry (registry.csv);
 *   - from <outer>/admission/ ONLY A-RECEIPT.json, R-SEAL.json and ADMISSION.json.
 * It never opens, lists, stats or hashes admission/CONTESTED.json, heldout-sealed/ or relabel-sealed/: receipt paths
 * under those folders are compared as strings only. It imports nothing from src/ or eval/ (Node built-ins only).
 *
 * VERDICT (protocol section 8): PENDING while any of the three receipts is missing or registry identity/ancestry is unresolved
 * (failed checks are still listed); otherwise NO-GO if any check fails (each failure marked `fixable` or `final`),
 * PENDING if something else cannot be checked yet (for example no manifest), else GO.
 * Output never repeats ids, callsigns, paths or family names taken from receipts: only check numbers, field names,
 * indices, counts, harness names and its own reasons.
 *
 * RECEIPT SHAPES — exactly docs/ADMISSION-PROTOCOL.md section 3 (every listed field required, no other fields):
 *   CheckResult = { ok: boolean, ...content-free counts }   (passes only when ok === true; anything else, including a
 *                 bare true or "pass", counts as failed). Kit tools: { ok, runs, problems }.
 *   Receipts are UTF-8 JSON without a byte order mark (a BOM is rejected, as by the author kit).
 *   FileHash    = { path, sha256 }        KitRun = { tool, args, exitCode, summary }
 *
 *   A-RECEIPT.json { schemaVersion: "s46.a-receipt.v1", authorCallsign, harness, model, registry, writtenAt, appointment,
 *     materials: FileHash[] (inner-repo-relative), guideSha256, node, families: string[10], devFamiliesAvoided: string[6],
 *     enactments: [ { id, family, sections, amendments, states, queries, operativeClauses,
 *                     operativeClausesPerState: { S0: int, ... }, goldLines: { obligation, negative, no_rows },
 *                     traps: string[], files: FileHash[] (heldout-sealed/Hnn/...) } ] (10),
 *     checks: { validatePacket, checkOffsets, checkValues, queryDates: CheckResult },
 *     trapCoverage: { [trapId]: enactmentId[] }, totals: { enactments: 10, files, goldLines },
 *     kitRuns: KitRun[], kitDisagreements: [ { tool, enactmentId, guideSection, note } ],
 *     attestation: { original, fictional, handWrittenStates, noGeneratedText, noBuilderLineage, noRepoAccess: true,
 *                    license: "CC0-1.0", statement: string } }
 *
 *   R-SEAL.json { schemaVersion: "s46.r-seal.v1", relabellerCallsign, harness, model, registry, appointment, sealedAt,
 *     materials: FileHash[], guideSha256, packetsRead: FileHash[10] (heldout-sealed/Hnn/packet.json),
 *     files: FileHash[] (relabel-sealed/...), totals: { enactments: 10, files, labelLines },
 *     attestation: { blindBeforeSeal, noRepoAccess, noBuilderLineage, notAuthorA, handWrittenStates: true, statement } }
 *
 *   ADMISSION.json { schemaVersion: "s46.admission.v1", relabellerCallsign, harness, model, registry, writtenAt,
 *     round: 1 | 2, verdict: "GO" | "NO-GO", reasons: string[], guideSha256,
 *     guideRevision: { revised: boolean, priorGuideSha256: sha256 | null },
 *     bindings: { aReceiptSha256, rSealSha256 },
 *     recheck: { validatePacket, checkOffsets, checkValues, queryDates, hiddenFilesMatchAReceipt, trapFloorsMet,
 *                familiesDisjointFromDev, sizesWithinLimits: CheckResult },
 *     kitRuns: KitRun[],
 *     agreement: { modality >= 0.85, tuple >= 0.70, disputedFieldRatio <= 0.05, unresolvedStateDisagreements == 0,
 *                  alignedObligationPairs > 0, ... other section 4.4 counts },
 *     stateDisagreements: { total, byKind: { state_text, boundary, query_dates, in_force },
 *                           resolved: { a_corrected, r_error, roy_adjudicated } },
 *     thresholds: { modality: 0.85, tuple: 0.70, disputedMax: 0.05, unresolvedStateMax: 0 },
 *     contested: { sha256, count, byField: { actor, modality, action, deadline, kind } },
 *     originalityReview: { ok, flaggedPassages }, denylistScan: { ok, hits, assessment },
 *     noSymlinks: true, maxFileBytes <= 200000,
 *     attestation: { noRepoAccess, rSealBeforeComparison, noBuilderLineage, notAuthorA: true, statement } }
 *
 * EXPECTED fixtures/MANIFEST.json FIELDS (written in M2; read tolerantly):
 *     guide: { path: "docs/LABELLING-GUIDE.md", sha256: <first committed bytes>, revisions?: [ { sha256, ... } ] }
 *       (fallback: guideSha256: string)
 *     enactments: [ { id, family, ... } ]   (fallbacks: devFamilies: string[] or families: string[])
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------------
// Locations and constants
// ---------------------------------------------------------------------------------------------

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTER = resolve(REPO, "..");
const ADMISSION_DIR = join(OUTER, "admission");
const REGISTRY_DIR = resolve(OUTER, "..", ".agent-registry");
const RECEIPT_NAMES = ["A-RECEIPT.json", "R-SEAL.json", "ADMISSION.json"] as const;
const ALLOWED_RECEIPTS = new Set<string>(RECEIPT_NAMES.map((f) => join(ADMISSION_DIR, f)));

/** Cumulative, append-only builder roots: succession never removes an earlier builder. */
export const BUILDER_ROOTS = [
  { id: "0805", name: "0805_Claude_Opus55_S46INT", harness: "Claude" },
  { id: "0914", name: "0914_Codex_GPT-6_N20CodexInt46", harness: "Codex" },
] as const;
const GUIDE_PATH = "docs/LABELLING-GUIDE.md";
const MANIFEST_PATH = "fixtures/MANIFEST.json";
const DEV_IDS = ["E01", "E02", "E03", "E04", "E05", "E06"];
/** The six dev families as listed in docs/AUTHOR-PACKET.md section 3 (used when the manifest is absent). */
const DEV_FAMILIES_DOC = [
  "mobile food vendors",
  "library kiosks",
  "well-water sampling",
  "park permits",
  "dog-licence renewals",
  "short-term parking",
];
const HIDDEN_COUNT = 10;
const CRITICAL_TRAPS = ["T1", "T2", "T3", "T4", "T5", "T9", "T12", "T13", "T15"]; // >= 2 hidden enactments each
const OTHER_TRAPS = ["T6", "T7", "T8", "T10", "T11", "T14", "T18", "T19"]; // >= 1 hidden enactment each
const COVERAGE_TRAPS = [...CRITICAL_TRAPS, ...OTHER_TRAPS];
const MIN_MODALITY_AGREEMENT = 0.85;
const MIN_TUPLE_AGREEMENT = 0.7;
const MAX_DISPUTED_FIELD_RATIO = 0.05;
const FIXED_THRESHOLDS: Record<string, number> = { modality: 0.85, tuple: 0.7, disputedMax: 0.05, unresolvedStateMax: 0 };
const MAX_FILE_BYTES = 200_000;
const AUTHOR_KIT_CHECKS = ["validatePacket", "checkOffsets", "checkValues", "queryDates"] as const;
const RECHECK_KEYS = [
  ...AUTHOR_KIT_CHECKS,
  "hiddenFilesMatchAReceipt",
  "trapFloorsMet",
  "familiesDisjointFromDev",
  "sizesWithinLimits",
] as const;
const CONTESTED_FIELDS = ["actor", "modality", "action", "deadline", "kind"] as const;
const A_ATTESTATION_TRUE = ["original", "fictional", "handWrittenStates", "noGeneratedText", "noBuilderLineage", "noRepoAccess"];
const SEAL_ATTESTATION_TRUE = ["blindBeforeSeal", "noRepoAccess", "noBuilderLineage", "notAuthorA", "handWrittenStates"];
const ADMISSION_ATTESTATION_TRUE = ["noRepoAccess", "rSealBeforeComparison", "noBuilderLineage", "notAuthorA"];
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const TRAP_RE = /^T([1-9]|1[0-9]|20)$/;
const ISO_DATETIME_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$/;

/** Refuses any read outside the inner repo, the registry and the three admission receipts. */
function assertReadable(path: string): string {
  const p = resolve(path);
  const within = (root: string): boolean => p === root || p.startsWith(root + sep);
  if (within(REPO) || within(REGISTRY_DIR) || ALLOWED_RECEIPTS.has(p)) return p;
  throw new Error(`admit.ts refuses to read ${p}: only the inner repo, the AgentNamer registry and three admission receipts are readable`);
}

// ---------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------

type Status = "PASS" | "FAIL" | "PENDING" | "WARN" | "INFO";
type Severity = "fixable" | "final";

interface Finding {
  check: string;
  status: Status;
  severity: Severity | null;
  message: string;
}

const findings: Finding[] = [];
let identityUnresolved = false;
const record = (check: string, status: Status, message: string, severity: Severity | null = null): void => {
  findings.push({ check, status, severity, message });
};
const pass = (check: string, message: string): void => record(check, "PASS", message);
/** A failed check. `final` = a breach the protocol does not let the writer repair (section 8); otherwise `fixable`. */
const fail = (check: string, message: string, severity: Severity = "fixable"): void => record(check, "FAIL", message, severity);
const pending = (check: string, message: string): void => record(check, "PENDING", message);
const warn = (check: string, message: string): void => record(check, "WARN", message);
const info = (check: string, message: string): void => record(check, "INFO", message);

const C0 = "(receipts) shape";
const C1 = "(1) guide first";
const C2 = "(2) dev fixtures";
const C3 = "(3) hidden set (A)";
const C4 = "(4) relabeller (R)";
const C5 = "(5) originality";
const C6 = "(6) files";
const C7 = "(7) isolation and blind order";

// ---------------------------------------------------------------------------------------------
// Strict JSON (receipts may be adversarial: duplicate keys are an error)
// ---------------------------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObj(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseStrictJson(text: string, where: string, maxDepth: number): { value: Json | undefined; errors: string[] } {
  const errors: string[] = [];
  const n = text.length;
  let i = 0;
  const err = (message: string): Error => new Error(`${where}@${i}: ${message}`);
  const skipWs = (): void => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };
  const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
  const parseString = (): string => {
    i++;
    let out = "";
    let chunk = i;
    for (;;) {
      if (i >= n) throw err("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        out += text.slice(chunk, i);
        i++;
        return out;
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
          if (rep === undefined) throw err("invalid escape");
          out += rep;
          i += 2;
        }
        chunk = i;
        continue;
      }
      i++;
    }
  };
  const NUM_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const parseValue = (depth: number): Json => {
    skipWs();
    if (i >= n) throw err("unexpected end of input");
    const c = text.charAt(i);
    if (c === "{" || c === "[") {
      if (depth + 1 > maxDepth) throw err(`nesting depth exceeds ${maxDepth}`);
      i++;
      skipWs();
      if (c === "[") {
        const arr: Json[] = [];
        if (text.charAt(i) === "]") {
          i++;
          return arr;
        }
        for (;;) {
          arr.push(parseValue(depth + 1));
          skipWs();
          const d = text.charAt(i++);
          if (d === "]") return arr;
          if (d !== ",") throw err("expected ',' or ']'");
        }
      }
      const obj = Object.create(null) as JsonObject;
      const seen = new Set<string>();
      if (text.charAt(i) === "}") {
        i++;
        return obj;
      }
      for (;;) {
        skipWs();
        if (text.charAt(i) !== '"') throw err("expected a string key");
        const key = parseString();
        const duplicate = seen.has(key);
        if (duplicate) errors.push(`${where}: duplicate key`);
        seen.add(key);
        skipWs();
        if (text.charAt(i++) !== ":") throw err("expected ':'");
        const v = parseValue(depth + 1);
        if (!duplicate) obj[key] = v;
        skipWs();
        const d = text.charAt(i++);
        if (d === "}") return obj;
        if (d !== ",") throw err("expected ',' or '}'");
      }
    }
    if (c === '"') return parseString();
    for (const [word, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return value;
      }
    }
    NUM_RE.lastIndex = i;
    const m = NUM_RE.exec(text);
    if (m === null) throw err("invalid value");
    i += m[0].length;
    return Number(m[0]);
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

interface LoadedJson {
  value: JsonObject | null;
  sha256: string | null;
  problem: string | null;
}

function readJsonFile(path: string, label: string): LoadedJson {
  let buf: Buffer;
  try {
    buf = readFileSync(assertReadable(path));
  } catch (e) {
    return { value: null, sha256: null, problem: `${label}: cannot read (${e instanceof Error ? e.message : String(e)})` };
  }
  const sha256 = sha256Hex(buf);
  // Plain UTF-8 only (protocol section 3), consistent with the author kit: a byte order mark is rejected, not stripped.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { value: null, sha256, problem: `${label}: UTF-8 byte order mark is not allowed` };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    return { value: null, sha256, problem: `${label}: not valid UTF-8` };
  }
  const parsed = parseStrictJson(text, label, 16);
  if (parsed.errors.length > 0) return { value: null, sha256, problem: parsed.errors.join("; ") };
  if (!isObj(parsed.value)) return { value: null, sha256, problem: `${label}: top level must be a JSON object` };
  return { value: parsed.value, sha256, problem: null };
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** A passing CheckResult (protocol section 3): an object whose `ok` is exactly true. */
function passes(v: unknown): boolean {
  return isObj(v) && v.ok === true;
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

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function isTimestamp(v: unknown): v is string {
  return typeof v === "string" && ISO_DATETIME_RE.test(v) && !Number.isNaN(Date.parse(v));
}

function sameSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const x = new Set(a);
  const y = new Set(b);
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}

type Kind = "string" | "timestamp" | "sha256" | "int" | "number" | "boolean" | "array" | "object" | "checkResult";

function kindOk(kind: Kind, v: unknown): boolean {
  switch (kind) {
    case "string":
      return typeof v === "string" && v.length > 0;
    case "timestamp":
      return isTimestamp(v);
    case "sha256":
      return typeof v === "string" && SHA256_RE.test(v);
    case "int":
      return isNonNegInt(v);
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return isObj(v);
    case "checkResult":
      return isObj(v) && typeof v.ok === "boolean";
  }
}

/** Exact key set and value kinds (protocol section 3: every listed field required, no other fields). */
function checkShape(o: JsonObject, label: string, spec: Record<string, Kind>, check: string = C0): void {
  const missing = Object.keys(spec).filter((k) => !(k in o));
  const unknown = Object.keys(o).filter((k) => !Object.hasOwn(spec, k));
  const wrong = Object.entries(spec)
    .filter(([k, kind]) => k in o && !kindOk(kind, o[k]))
    .map(([k, kind]) => `${k} (${kind})`);
  if (missing.length > 0) fail(check, `${label}: missing field(s) ${missing.join(", ")}`);
  if (unknown.length > 0) fail(check, `${label}: ${unknown.length} field(s) not in the protocol`);
  if (wrong.length > 0) fail(check, `${label}: wrong type for ${wrong.join(", ")}`);
}

/** Validates a FileHash[]; returns the well-formed entries. Never prints paths. */
function fileHashes(v: unknown, label: string, check: string, expectedPrefix: string | null): { path: string; sha256: string }[] {
  if (!Array.isArray(v)) {
    fail(check, `${label}: must be an array of {path, sha256}`);
    return [];
  }
  const out: { path: string; sha256: string }[] = [];
  let badShape = 0;
  let badPrefix = 0;
  const seen = new Set<string>();
  let dup = 0;
  for (const f of v) {
    if (
      !isObj(f) ||
      Object.keys(f).length !== 2 ||
      typeof f.path !== "string" ||
      f.path.length === 0 ||
      typeof f.sha256 !== "string" ||
      !SHA256_RE.test(f.sha256)
    ) {
      badShape++;
      continue;
    }
    if (expectedPrefix !== null && !f.path.startsWith(expectedPrefix)) badPrefix++;
    if (seen.has(f.path)) dup++;
    seen.add(f.path);
    out.push({ path: f.path, sha256: f.sha256 });
  }
  if (badShape > 0) fail(check, `${label}: ${badShape} entr${badShape === 1 ? "y is" : "ies are"} not {path, sha256 (64 lowercase hex)}`);
  if (badPrefix > 0) fail(check, `${label}: ${badPrefix} path(s) do not start with "${expectedPrefix ?? ""}"`);
  if (dup > 0) fail(check, `${label}: ${dup} duplicate path(s)`);
  return out;
}

/** Every protocol-required attestation boolean must be present and true; any other boolean must be true too. */
function checkAttestation(v: unknown, label: string, required: string[], severity: Severity): void {
  if (!isObj(v)) {
    fail(C7, `${label}: must be an object`);
    return;
  }
  const missing = required.filter((k) => typeof v[k] !== "boolean");
  const falses = Object.entries(v)
    .filter(([, x]) => x === false)
    .map(([k]) => k);
  if (missing.length > 0) fail(C7, `${label}: missing boolean(s) ${missing.join(", ")}`);
  if (typeof v.statement !== "string" || v.statement.length === 0) fail(C7, `${label}.statement: missing`);
  if (falses.length > 0) fail(C7, `${label}: false attestation(s) ${falses.join(", ")} (isolation breach)`, severity);
  if (missing.length === 0 && falses.length === 0) pass(C7, `${label}: ${required.join(", ")} all true`);
}

// ---------------------------------------------------------------------------------------------
// Git (read-only)
// ---------------------------------------------------------------------------------------------

function git(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, out: typeof r.stdout === "string" ? r.stdout : "" };
}

function gitBlob(rev: string, path: string): Buffer | null {
  const r = spawnSync("git", ["-C", REPO, "show", `${rev}:${path}`], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 && Buffer.isBuffer(r.stdout) ? r.stdout : null;
}

// ---------------------------------------------------------------------------------------------
// AgentNamer registry (read-only)
// ---------------------------------------------------------------------------------------------

export interface Agent {
  id: string;
  name: string;
  harness: string;
  parentId: string;
  forkedFrom: string;
}

export interface Registry {
  byName: Map<string, Agent>;
  byId: Map<string, Agent>;
}

function parseCsvLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let closed = false;
  for (let k = 0; k < line.length; k++) {
    const c = line.charAt(k);
    if (quoted) {
      if (c === '"' && line.charAt(k + 1) === '"') {
        cur += '"';
        k++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      if (cur.length > 0 || closed) return null;
      quoted = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
      closed = false;
    } else {
      if (closed) return null;
      cur += c;
    }
  }
  if (quoted) return null;
  out.push(cur);
  return out;
}

interface RegistryLoad {
  registry: Registry | null;
  problem: string | null;
}

/** Incomplete or ambiguous evidence is unavailable, never an independent identity. */
export function parseRegistry(text: string): RegistryLoad {
  const unavailable = (problem: string): RegistryLoad => ({ registry: null, problem });
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0] ?? "");
  if (header === null || new Set(header).size !== header.length) return unavailable("registry CSV header is malformed or duplicated");
  const col = (name: string): number => header.indexOf(name);
  const [iId, iName, iHarness, iParent, iFork] = [col("id"), col("name"), col("harness"), col("parent_id"), col("forked_from")] as const;
  if (iId < 0 || iName < 0 || iHarness < 0 || iParent < 0 || iFork < 0) {
    return unavailable("registry requires id, name, harness, parent_id and forked_from columns");
  }
  const reg: Registry = { byName: new Map(), byId: new Map() };
  const validId = (id: string): boolean => /^[0-9A-Z]{2}[0-9]{2}$/.test(id);
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    if (cells === null || cells.length !== header.length) return unavailable("registry CSV row is malformed or incomplete");
    const agent: Agent = {
      id: cells[iId] ?? "",
      name: cells[iName] ?? "",
      harness: cells[iHarness] ?? "",
      parentId: cells[iParent] ?? "",
      forkedFrom: cells[iFork] ?? "",
    };
    if (!validId(agent.id) || agent.name.trim().length === 0 || agent.harness.trim().length === 0 ||
        (agent.parentId !== "" && !validId(agent.parentId)) || (agent.forkedFrom !== "" && !validId(agent.forkedFrom))) {
      return unavailable("registry row has missing or malformed identity/lineage evidence");
    }
    if (reg.byName.has(agent.name) || reg.byId.has(agent.id)) return unavailable("registry has duplicate identity keys");
    reg.byName.set(agent.name, agent);
    reg.byId.set(agent.id, agent);
  }
  return { registry: reg, problem: null };
}

function loadRegistry(): RegistryLoad {
  const csv = join(REGISTRY_DIR, "registry.csv");
  let text: string;
  try {
    text = readFileSync(assertReadable(csv), "utf8");
  } catch {
    return { registry: null, problem: "registry CSV cannot be read" };
  }
  return parseRegistry(text);
}

interface Ancestry {
  ids: Set<string>;
  problem: string | null;
}

/** Follow both parent and fork edges to recorded roots, with explicit unresolved states. */
export function ancestry(reg: Registry, descendant: Agent): Ancestry {
  const ids = new Set<string>();
  const active = new Set<string>();
  const complete = new Set<string>();
  let problem: string | null = null;
  const visit = (agent: Agent, depth: number): void => {
    ids.add(agent.id);
    if (active.has(agent.id)) { problem ??= "registry lineage contains a cycle"; return; }
    if (depth >= 64) { problem ??= "registry lineage traversal limit (64) exhausted"; return; }
    if (complete.has(agent.id)) return;
    active.add(agent.id);
    for (const id of [agent.parentId, agent.forkedFrom]) {
      if (id === "") continue; // Explicit empty cell records no parent/fork.
      const next = reg.byId.get(id);
      if (next === undefined) problem ??= "registry lineage references a missing ancestor record";
      else visit(next, depth + 1);
    }
    active.delete(agent.id);
    complete.add(agent.id);
  };
  visit(descendant, 0);
  return { ids, problem };
}

export function resolveBuilders(reg: Registry): { builders: Agent[]; problems: string[] } {
  const builders: Agent[] = [];
  const problems: string[] = [];
  for (const [index, root] of BUILDER_ROOTS.entries()) {
    const agent = reg.byId.get(root.id);
    if (agent === undefined || reg.byName.get(root.name) !== agent || agent.name !== root.name || agent.harness !== root.harness) {
      problems.push(`builder root ${index + 1}: exact registry identity is missing or mismatched`);
      continue;
    }
    builders.push(agent);
    const lineage = ancestry(reg, agent);
    if (lineage.problem !== null) problems.push(`builder root ${index + 1}: ${lineage.problem}`);
  }
  return { builders, problems };
}

/** A known relationship remains a final failure even when another branch is unresolved. */
export function relationship(reg: Registry, descendant: Agent, ancestorId: string): "related" | "independent" | "unresolved" {
  const lineage = ancestry(reg, descendant);
  return lineage.ids.has(ancestorId) ? "related" : lineage.problem !== null ? "unresolved" : "independent";
}

// ---------------------------------------------------------------------------------------------
// Check 1 — guide sha256 matches the manifest; the guide's FIRST commit precedes every src/ file
// ---------------------------------------------------------------------------------------------

function manifestGuide(m: JsonObject): { first: string | null; latest: string | null } {
  const g = m.guide;
  if (isObj(g) && typeof g.sha256 === "string") {
    const revisions = Array.isArray(g.revisions)
      ? g.revisions.filter(isObj).map((r) => r.sha256).filter((s): s is string => typeof s === "string")
      : [];
    return { first: g.sha256, latest: revisions[revisions.length - 1] ?? g.sha256 };
  }
  if (typeof m.guideSha256 === "string") return { first: m.guideSha256, latest: m.guideSha256 };
  return { first: null, latest: null };
}

function manifestDevFamilies(m: JsonObject): string[] {
  if (Array.isArray(m.enactments)) {
    const fams = m.enactments.filter(isObj).map((e) => e.family).filter((f): f is string => typeof f === "string");
    if (fams.length > 0) return fams;
  }
  const direct = strings(m.devFamilies);
  return direct.length > 0 ? direct : strings(m.families);
}

/** Returns the manifest's current (latest) guide sha256 when it could be established. */
function checkGuideFirst(manifest: JsonObject | null): string | null {
  const guideAbs = join(REPO, GUIDE_PATH);
  let latestRecorded: string | null = null;
  if (!git(["rev-parse", "--verify", "HEAD"]).ok) {
    pending(C1, "inner repo has no commits yet");
  } else {
    const firstAdd = git(["log", "--diff-filter=A", "--reverse", "--format=%H", "--", GUIDE_PATH]).out.split("\n").filter(Boolean)[0];
    if (firstAdd === undefined) {
      pending(C1, `${GUIDE_PATH} has not been committed`);
    } else {
      const inFirst = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", firstAdd]).out.split("\n").filter(Boolean);
      const srcInFirst = inFirst.filter((p) => p.startsWith("src/"));
      if (srcInFirst.length > 0) fail(C1, `guide's first commit ${firstAdd.slice(0, 12)} also adds ${srcInFirst.length} src/ file(s)`, "final");
      const srcCommits = [...new Set(git(["log", "--diff-filter=A", "--format=%H", "--", "src"]).out.split("\n").filter(Boolean))];
      const bad = srcCommits.filter((c) => c === firstAdd || !git(["merge-base", "--is-ancestor", firstAdd, c]).ok);
      if (bad.length > 0) {
        fail(C1, `commits adding src/ files do not descend from the guide's first commit ${firstAdd.slice(0, 12)}: ${bad.map((c) => c.slice(0, 12)).join(", ")}`, "final");
      } else if (srcInFirst.length === 0) {
        pass(C1, `guide first committed in ${firstAdd.slice(0, 12)}; ${srcCommits.length} commit(s) adding src/ files all come after it`);
      }
      if (manifest === null) {
        pending(C1, `${MANIFEST_PATH} absent: guide hash cannot be compared yet (M2)`);
      } else {
        const { first, latest } = manifestGuide(manifest);
        if (first === null || latest === null || !SHA256_RE.test(first) || !SHA256_RE.test(latest)) {
          fail(C1, `${MANIFEST_PATH} does not record the guide sha256 (guide.sha256)`);
        } else {
          latestRecorded = latest;
          const firstBytes = gitBlob(firstAdd, GUIDE_PATH);
          if (firstBytes === null) fail(C1, `cannot read ${GUIDE_PATH} at ${firstAdd.slice(0, 12)}`);
          else if (sha256Hex(firstBytes) !== first) fail(C1, "manifest guide.sha256 differs from the first committed guide bytes");
          else pass(C1, "manifest guide.sha256 matches the first committed guide bytes");
          const headBytes = gitBlob("HEAD", GUIDE_PATH);
          let workBytes: Buffer | null = null;
          try {
            workBytes = readFileSync(assertReadable(guideAbs));
          } catch {
            workBytes = null;
          }
          if (headBytes === null || workBytes === null) {
            fail(C1, `${GUIDE_PATH} missing at HEAD or in the working tree`);
          } else if (sha256Hex(headBytes) !== latest || sha256Hex(workBytes) !== latest) {
            fail(C1, "current guide (HEAD or working tree) is not the latest guide hash recorded in the manifest");
          } else {
            pass(C1, `current guide matches the latest manifest hash ${latest.slice(0, 12)}`);
          }
        }
      }
    }
  }
  return latestRecorded;
}

// ---------------------------------------------------------------------------------------------
// Check 2 — dev fixtures validate (author kit run as child processes)
// ---------------------------------------------------------------------------------------------

function nodeSupportsStripTypes(): boolean {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return (major ?? 0) > 22 || ((major ?? 0) === 22 && (minor ?? 0) >= 6);
}

function runKit(tool: string, dirs: string[]): { ok: boolean; detail: string } {
  const toolPath = assertReadable(join(REPO, "tools", "author-kit", `${tool}.mts`));
  if (!existsSync(toolPath)) return { ok: false, detail: `${tool}.mts not found` };
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", toolPath, ...dirs.map(assertReadable), "--json"],
    { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.error !== undefined) return { ok: false, detail: r.error.message };
  let out: unknown;
  try {
    out = JSON.parse(typeof r.stdout === "string" ? r.stdout : "");
  } catch {
    return { ok: false, detail: `no JSON output (exit ${String(r.status)})` };
  }
  if (!isObj(out)) return { ok: false, detail: "unexpected output" };
  const problems: string[] = [];
  if (Array.isArray(out.results)) {
    for (const res of out.results) {
      if (!isObj(res)) continue;
      problems.push(...strings(res.errors), ...strings(res.mismatches));
    }
  }
  const ok = out.ok === true && r.status === 0;
  const detail = ok ? "clean" : `${problems.length} problem(s)${problems.length > 0 ? `, e.g. ${problems.slice(0, 3).join(" | ")}` : ""}`;
  return { ok, detail };
}

function checkDev(manifest: JsonObject | null): string[] {
  const devRoot = join(REPO, "fixtures", "dev");
  const present = DEV_IDS.filter((id) => {
    try {
      return statSync(assertReadable(join(devRoot, id))).isDirectory();
    } catch {
      return false;
    }
  });
  if (present.length === 0) {
    pending(C2, "fixtures/dev/E01..E06 not present yet (M2)");
  } else if (present.length < DEV_IDS.length) {
    fail(C2, `only ${present.length}/6 dev enactments present: ${present.join(", ")}`);
  }
  if (present.length > 0) {
    if (!nodeSupportsStripTypes()) {
      pending(C2, `Node ${process.versions.node} cannot run the author kit (needs >= 22.6)`);
    } else {
      const dirs = present.map((id) => join(devRoot, id));
      for (const tool of ["validate-packet", "check-offsets", "check-values", "query-dates"]) {
        const r = runKit(tool, dirs);
        if (r.ok) pass(C2, `${tool}: ${present.length} dev enactment(s) ${r.detail}`);
        else fail(C2, `${tool}: ${r.detail}`);
      }
    }
  }
  if (manifest === null) return [];
  const families = manifestDevFamilies(manifest);
  if (families.length !== DEV_IDS.length) fail(C2, `${MANIFEST_PATH} lists ${families.length} dev families; 6 expected`);
  return families;
}

// ---------------------------------------------------------------------------------------------
// Shared receipt checks
// ---------------------------------------------------------------------------------------------

/** materials (inner-repo-relative FileHash[]) and guideSha256: guide entry == guideSha256 == manifest's current guide. */
function checkMaterialsAndGuide(r: JsonObject, label: string, currentGuide: string | null): void {
  const materials = fileHashes(r.materials, `${label}.materials`, C7, null);
  const guideEntry = materials.find((m) => m.path === GUIDE_PATH);
  const guideSha = typeof r.guideSha256 === "string" ? r.guideSha256 : null;
  if (guideEntry === undefined) fail(C7, `${label}.materials: no entry for ${GUIDE_PATH}`);
  else if (guideSha !== null && guideEntry.sha256 !== guideSha) fail(C7, `${label}.guideSha256 differs from its materials entry for the guide`);
  if (guideSha !== null) {
    if (currentGuide === null) pending(C7, `${label}.guideSha256 cannot be compared: the manifest's current guide hash is not available`);
    else if (guideSha !== currentGuide) fail(C7, `${label}.guideSha256 is not the manifest's current guide hash`);
    else pass(C7, `${label}.guideSha256 equals the manifest's current guide hash`);
  }
  // Frozen materials should still match the repo bytes (a warning: the guide itself is checked above).
  let unreadable = 0;
  let changed = 0;
  for (const m of materials) {
    if (isAbsolute(m.path) || m.path.split("/").includes("..")) {
      unreadable++;
      continue;
    }
    try {
      if (sha256Hex(readFileSync(assertReadable(join(REPO, m.path)))) !== m.sha256) changed++;
    } catch {
      unreadable++;
    }
  }
  if (changed > 0) warn(C7, `${label}.materials: ${changed} file(s) differ from the current repo bytes`);
  if (unreadable > 0) warn(C7, `${label}.materials: ${unreadable} path(s) are not readable inner-repo files`);
}

export function identityAssessment(
  callsign: unknown,
  harness: unknown,
  who: "author A" | "relabeller R",
  reg: Registry | null,
  builders: readonly Agent[],
): { agent: Agent | null; findings: Omit<Finding, "check">[] } {
  const result: { agent: Agent | null; findings: Omit<Finding, "check">[] } = { agent: null, findings: [] };
  const add = (status: Status, message: string, severity: Severity | null = null): void => { result.findings.push({ status, message, severity }); };
  if (typeof callsign !== "string" || callsign.length === 0) {
    add("FAIL", `${who}'s receipt callsign must be a non-empty string`, "fixable");
    return result;
  }
  if (reg === null) {
    add("PENDING", `${who}'s registry identity cannot be resolved: registry unavailable`);
    return result;
  }
  const agent = reg.byName.get(callsign) ?? null;
  if (agent === null) {
    add("PENDING", `${who}'s exact identity is missing from the AgentNamer registry`);
    return result;
  }
  result.agent = agent;
  if (harness !== agent.harness) add("FAIL", `${who}'s receipt harness differs from its registry harness (${agent.harness})`, "fixable");
  const lineage = ancestry(reg, agent);
  if (builders.some((builder) => lineage.ids.has(builder.id))) add("FAIL", `${who} is in the cumulative builder lineage`, "final");
  if (lineage.problem !== null) add("PENDING", `${who}'s independence is unresolved: ${lineage.problem}`);
  if (builders.length !== BUILDER_ROOTS.length) add("PENDING", `${who}'s independence is unresolved: not every builder root has an exact registry identity`);
  if (who === "author A" && builders.some((builder) => builder.harness === agent.harness)) {
    add("FAIL", `author A's harness ${agent.harness} is an excluded builder harness`, "final");
  }
  if (result.findings.length === 0) add("PASS", `${who} is registered outside every builder root${who === "author A" ? " with a different harness from every builder" : ""}`);
  return result;
}

function checkIdentity(callsign: unknown, harness: unknown, who: "author A" | "relabeller R", check: string,
  reg: Registry | null, builders: readonly Agent[]): Agent | null {
  const assessed = identityAssessment(callsign, harness, who, reg, builders);
  if (assessed.findings.some((finding) => finding.status === "PENDING")) identityUnresolved = true;
  for (const finding of assessed.findings) record(check, finding.status, finding.message, finding.severity);
  return assessed.agent;
}

// ---------------------------------------------------------------------------------------------
// Check 3 (+ parts of 2, 5, 7) — A-RECEIPT.json
// ---------------------------------------------------------------------------------------------

function checkAuthorReceipt(
  a: JsonObject,
  devFamilies: string[],
  reg: Registry | null,
  builders: readonly Agent[],
  currentGuide: string | null,
): Agent | null {
  checkShape(a, "A-RECEIPT", {
    schemaVersion: "string",
    authorCallsign: "string",
    harness: "string",
    model: "string",
    registry: "string",
    writtenAt: "timestamp",
    appointment: "string",
    materials: "array",
    guideSha256: "sha256",
    node: "string",
    families: "array",
    devFamiliesAvoided: "array",
    enactments: "array",
    checks: "object",
    trapCoverage: "object",
    totals: "object",
    kitRuns: "array",
    kitDisagreements: "array",
    attestation: "object",
  });
  if (a.schemaVersion !== "s46.a-receipt.v1") fail(C0, 'A-RECEIPT.schemaVersion must be "s46.a-receipt.v1"');

  // Enactments.
  const enactments = Array.isArray(a.enactments) ? a.enactments : [];
  if (enactments.length === HIDDEN_COUNT) pass(C3, `A reports ${HIDDEN_COUNT} hidden enactments`);
  else fail(C3, `A reports ${enactments.length} hidden enactments; ${HIDDEN_COUNT} required`);
  const ids = new Set<string>();
  const trapHolders = new Map<string, Set<string>>();
  const enactmentFamilies: string[] = [];
  let fileCount = 0;
  let goldLineCount = 0;
  enactments.forEach((e, k) => {
    const P = `A-RECEIPT.enactments[${k}]`;
    if (!isObj(e)) {
      fail(C3, `${P}: must be an object`);
      return;
    }
    checkShape(e, P, {
      id: "string",
      family: "string",
      sections: "int",
      amendments: "int",
      states: "int",
      queries: "int",
      operativeClauses: "int",
      operativeClausesPerState: "object",
      goldLines: "object",
      traps: "array",
      files: "array",
    });
    const id = typeof e.id === "string" && ID_RE.test(e.id) ? e.id : null;
    if (id === null) fail(C3, `${P}.id: invalid`);
    else if (ids.has(id)) fail(C3, `${P}.id: duplicate enactment id`);
    else ids.add(id);
    if (typeof e.family === "string") enactmentFamilies.push(normKey(e.family));
    const files = fileHashes(e.files, `${P}.files`, C3, "heldout-sealed/");
    fileCount += files.length;
    if (!files.some((f) => f.path.endsWith("/packet.json"))) fail(C3, `${P}.files: no packet.json entry`);
    const ranges: [string, number, number][] = [
      ["sections", 4, 12],
      ["amendments", 2, 3],
      ["states", 3, 4],
      ["operativeClauses", 5, 12],
    ];
    for (const [key, lo, hi] of ranges) {
      const v = e[key];
      if (isNonNegInt(v) && (v < lo || v > hi)) warn(C3, `${P}.${key} = ${v}, outside the authoring size ${lo}..${hi}`);
    }
    const perState = e.operativeClausesPerState;
    if (isObj(perState)) {
      const counts = Object.values(perState);
      if (isNonNegInt(e.states) && counts.length !== e.states) fail(C3, `${P}.operativeClausesPerState has ${counts.length} state(s); states = ${e.states}`);
      if (counts.some((c) => !isNonNegInt(c))) fail(C3, `${P}.operativeClausesPerState: counts must be integers`);
      else if (counts.length > 0 && isNonNegInt(e.operativeClauses) && Math.min(...(counts as number[])) !== e.operativeClauses) {
        fail(C3, `${P}.operativeClauses is not the smallest per-state count`);
      }
    }
    const gl = e.goldLines;
    if (isObj(gl)) {
      const keys = ["obligation", "negative", "no_rows"];
      if (!sameSet(Object.keys(gl), keys) || keys.some((k) => !isNonNegInt(gl[k]))) {
        fail(C3, `${P}.goldLines must be {obligation, negative, no_rows} integers`);
      } else {
        goldLineCount += keys.reduce((n, k) => n + (gl[k] as number), 0);
      }
    }
    const traps = strings(e.traps);
    if (Array.isArray(e.traps) && traps.length !== e.traps.length) fail(C3, `${P}.traps: must be strings T1..T20`);
    for (const t of new Set(traps)) {
      if (!TRAP_RE.test(t)) {
        fail(C3, `${P}.traps: an entry is not T1..T20`);
        continue;
      }
      if (id === null) continue;
      const holders = trapHolders.get(t) ?? new Set<string>();
      holders.add(id);
      trapHolders.set(t, holders);
    }
  });

  // Trap floors (from enactments[].traps) and trapCoverage consistency.
  const count = (t: string): number => trapHolders.get(t)?.size ?? 0;
  const short = [
    ...CRITICAL_TRAPS.filter((t) => count(t) < 2).map((t) => `${t} (${count(t)}/2)`),
    ...OTHER_TRAPS.filter((t) => count(t) < 1).map((t) => `${t} (0/1)`),
  ];
  if (short.length > 0) fail(C3, `trap floors not met: ${short.join(", ")}`);
  else pass(C3, "trap floors met (critical traps in >= 2 hidden enactments, others in >= 1)");
  const coverage = a.trapCoverage;
  if (isObj(coverage)) {
    const disagree = COVERAGE_TRAPS.filter((t) => !sameSet(strings(coverage[t]), trapHolders.get(t) ?? []));
    if (disagree.length > 0) fail(C3, `trapCoverage disagrees with enactments[].traps for ${disagree.join(", ")}`);
  }

  // Kit checks.
  const checks = a.checks;
  for (const key of AUTHOR_KIT_CHECKS) {
    const v = isObj(checks) ? checks[key] : undefined;
    if (passes(v)) pass(C3, `A's author-kit ${key}: pass`);
    else fail(C3, `A's author-kit ${key}: not a passing CheckResult ({ "ok": true, ... })`);
  }
  if (isObj(checks) && !sameSet(Object.keys(checks), AUTHOR_KIT_CHECKS)) fail(C0, "A-RECEIPT.checks must hold exactly the four kit results");

  // Totals.
  const totals = a.totals;
  if (isObj(totals)) {
    if (!sameSet(Object.keys(totals), ["enactments", "files", "goldLines"])) fail(C0, "A-RECEIPT.totals must be {enactments, files, goldLines}");
    if (totals.enactments !== HIDDEN_COUNT) fail(C3, `A-RECEIPT.totals.enactments must be ${HIDDEN_COUNT}`);
    if (totals.files !== fileCount) fail(C3, `A-RECEIPT.totals.files differs from the ${fileCount} file hashes listed`);
    if (totals.goldLines !== goldLineCount) fail(C3, `A-RECEIPT.totals.goldLines differs from the sum of enactments[].goldLines (${goldLineCount})`);
  }

  // Families: ten distinct; each enactment's family among them; disjoint from dev.
  const families = strings(a.families);
  const familyKeys = new Set(families.map(normKey));
  if (families.length !== HIDDEN_COUNT || familyKeys.size !== HIDDEN_COUNT) {
    fail(C3, `A-RECEIPT.families must list ${HIDDEN_COUNT} distinct families (got ${families.length}, ${familyKeys.size} distinct)`);
  }
  if (!sameSet(enactmentFamilies, familyKeys) || new Set(enactmentFamilies).size !== enactmentFamilies.length) {
    fail(C3, "enactments[].family must use each listed family exactly once");
  }
  const devList = devFamilies.length > 0 ? devFamilies : DEV_FAMILIES_DOC;
  const devKeys = devList.map(normKey);
  if (!sameSet(strings(a.devFamiliesAvoided).map(normKey), devKeys)) fail(C3, "A-RECEIPT.devFamiliesAvoided differs from the six dev families");
  if (devFamilies.length === 0) {
    pending(C2, "manifest dev family list unavailable; disjointness checked against docs/AUTHOR-PACKET.md only");
  }
  const overlap = devKeys.filter((f) => familyKeys.has(f));
  if (overlap.length > 0) fail(C2, `${overlap.length} hidden famil${overlap.length === 1 ? "y overlaps" : "ies overlap"} the dev families`);
  else pass(C2, "dev families are disjoint from A's hidden families");

  checkMaterialsAndGuide(a, "A-RECEIPT", currentGuide);

  // Identity: cumulative builder ancestry and all builder harnesses are excluded for A.
  const author = checkIdentity(a.authorCallsign, a.harness, "author A", C3, reg, builders);

  // Attestation: original (check 5), the rest (check 7).
  const att = a.attestation;
  if (isObj(att)) {
    if (att.original === true) pass(C5, "A attests the hidden enactments are original");
    else fail(C5, "A-RECEIPT.attestation.original is not true", "final");
    if (att.license !== "CC0-1.0") fail(C5, 'A-RECEIPT.attestation.license must be "CC0-1.0"');
  }
  checkAttestation(att, "A-RECEIPT.attestation", A_ATTESTATION_TRUE, "final");
  return author;
}

// ---------------------------------------------------------------------------------------------
// Checks 4-7 — R-SEAL.json and ADMISSION.json
// ---------------------------------------------------------------------------------------------

function checkSeal(seal: JsonObject, aReceipt: JsonObject | null, currentGuide: string | null): void {
  checkShape(seal, "R-SEAL", {
    schemaVersion: "string",
    relabellerCallsign: "string",
    harness: "string",
    model: "string",
    registry: "string",
    appointment: "string",
    sealedAt: "timestamp",
    materials: "array",
    guideSha256: "sha256",
    packetsRead: "array",
    files: "array",
    totals: "object",
    attestation: "object",
  });
  if (seal.schemaVersion !== "s46.r-seal.v1") fail(C0, 'R-SEAL.schemaVersion must be "s46.r-seal.v1"');
  if (!isTimestamp(seal.sealedAt)) fail(C7, "R-SEAL.sealedAt must be an ISO 8601 date-time with Z or an offset");
  const packets = fileHashes(seal.packetsRead, "R-SEAL.packetsRead", C7, "heldout-sealed/");
  if (packets.length !== HIDDEN_COUNT || packets.some((p) => !/^heldout-sealed\/[^/]+\/packet\.json$/.test(p.path))) {
    fail(C7, `R-SEAL.packetsRead must list exactly the ${HIDDEN_COUNT} heldout-sealed/<id>/packet.json files`);
  }
  const files = fileHashes(seal.files, "R-SEAL.files", C7, "relabel-sealed/");
  if (files.length > 0) pass(C7, `R sealed ${files.length} file hash(es) before opening A's states or gold (per R-SEAL.json)`);
  else fail(C7, "R-SEAL.files lists no sealed files");
  const totals = seal.totals;
  if (isObj(totals)) {
    if (!sameSet(Object.keys(totals), ["enactments", "files", "labelLines"]) || !isNonNegInt(totals.labelLines)) {
      fail(C0, "R-SEAL.totals must be {enactments, files, labelLines} integers");
    }
    if (totals.enactments !== HIDDEN_COUNT) fail(C7, `R-SEAL.totals.enactments must be ${HIDDEN_COUNT}`);
    if (totals.files !== files.length) fail(C7, "R-SEAL.totals.files differs from the number of sealed file hashes");
  }
  // The packets R read blind must be the packets A receipted (compared by path and hash, never printed).
  if (aReceipt !== null && Array.isArray(aReceipt.enactments)) {
    const aHashes = new Map<string, string>();
    for (const e of aReceipt.enactments) {
      if (!isObj(e) || !Array.isArray(e.files)) continue;
      for (const f of e.files) if (isObj(f) && typeof f.path === "string" && typeof f.sha256 === "string") aHashes.set(f.path, f.sha256);
    }
    const differing = packets.filter((p) => aHashes.get(p.path) !== p.sha256).length;
    if (differing > 0) fail(C7, `R-SEAL.packetsRead: ${differing} packet hash(es) differ from A-RECEIPT (R relabelled other bytes than A receipted)`);
    else if (packets.length > 0) pass(C7, "R-SEAL.packetsRead matches A-RECEIPT's packet hashes");
  }
  checkMaterialsAndGuide(seal, "R-SEAL", currentGuide);
  checkAttestation(seal.attestation, "R-SEAL.attestation", SEAL_ATTESTATION_TRUE, "final");
}

function checkAdmission(
  adm: JsonObject,
  seal: JsonObject | null,
  aSha: string | null,
  sealSha: string | null,
  currentGuide: string | null,
): void {
  checkShape(adm, "ADMISSION", {
    schemaVersion: "string",
    relabellerCallsign: "string",
    harness: "string",
    model: "string",
    registry: "string",
    writtenAt: "timestamp",
    round: "int",
    verdict: "string",
    reasons: "array",
    guideSha256: "sha256",
    guideRevision: "object",
    bindings: "object",
    recheck: "object",
    kitRuns: "array",
    agreement: "object",
    stateDisagreements: "object",
    thresholds: "object",
    contested: "object",
    originalityReview: "object",
    denylistScan: "object",
    noSymlinks: "boolean",
    maxFileBytes: "int",
    attestation: "object",
  });
  if (adm.schemaVersion !== "s46.admission.v1") fail(C0, 'ADMISSION.schemaVersion must be "s46.admission.v1"');
  const round = adm.round;
  if (round !== 1 && round !== 2) fail(C4, "ADMISSION.round must be 1 or 2");
  const secondRound = round === 2;
  const thresholdSeverity: Severity = secondRound ? "final" : "fixable";

  // Same R in both receipts.
  if (seal !== null) {
    if (adm.relabellerCallsign !== seal.relabellerCallsign) fail(C4, "relabellerCallsign differs between R-SEAL.json and ADMISSION.json");
    if (adm.harness !== seal.harness) fail(C4, "harness differs between R-SEAL.json and ADMISSION.json");
  }

  // Blind order: sealedAt earlier than writtenAt.
  if (seal !== null && isTimestamp(seal.sealedAt) && isTimestamp(adm.writtenAt)) {
    if (Date.parse(seal.sealedAt) < Date.parse(adm.writtenAt)) pass(C7, "R-SEAL.sealedAt is earlier than ADMISSION.writtenAt");
    else fail(C7, "R-SEAL.sealedAt is not earlier than ADMISSION.writtenAt (blind-order breach)", "final");
  }

  // Bindings to the exact current receipt bytes.
  const b = adm.bindings;
  if (isObj(b)) {
    if (!sameSet(Object.keys(b), ["aReceiptSha256", "rSealSha256"])) fail(C0, "ADMISSION.bindings must be {aReceiptSha256, rSealSha256}");
    if (aSha !== null && b.aReceiptSha256 !== aSha) fail(C7, "ADMISSION.bindings.aReceiptSha256 is not the sha256 of the current A-RECEIPT.json");
    else if (aSha !== null) pass(C7, "ADMISSION.bindings.aReceiptSha256 matches the current A-RECEIPT.json");
    if (sealSha !== null && b.rSealSha256 !== sealSha) fail(C7, "ADMISSION.bindings.rSealSha256 is not the sha256 of the current R-SEAL.json");
    else if (sealSha !== null) pass(C7, "ADMISSION.bindings.rSealSha256 matches the current R-SEAL.json");
  }

  // Guide edition and revision.
  const guideSha = typeof adm.guideSha256 === "string" ? adm.guideSha256 : null;
  if (guideSha !== null) {
    if (currentGuide === null) pending(C7, "ADMISSION.guideSha256 cannot be compared: the manifest's current guide hash is not available");
    else if (guideSha !== currentGuide) fail(C7, "ADMISSION.guideSha256 is not the manifest's current guide hash");
    else pass(C7, "ADMISSION.guideSha256 equals the manifest's current guide hash");
    if (seal !== null && seal.guideSha256 !== guideSha) fail(C7, "ADMISSION.guideSha256 differs from R-SEAL.guideSha256");
  }
  const gr = adm.guideRevision;
  if (isObj(gr)) {
    const prior = gr.priorGuideSha256;
    if (!sameSet(Object.keys(gr), ["revised", "priorGuideSha256"]) || typeof gr.revised !== "boolean" || !(prior === null || (typeof prior === "string" && SHA256_RE.test(prior)))) {
      fail(C0, "ADMISSION.guideRevision must be {revised: boolean, priorGuideSha256: sha256 | null}");
    } else {
      if (gr.revised !== secondRound) fail(C4, "ADMISSION.guideRevision.revised must be true exactly when round is 2");
      if (gr.revised === (prior === null)) fail(C4, "ADMISSION.guideRevision.priorGuideSha256 must be set exactly when revised");
    }
  }

  // R's re-check of A's files (completes check 3).
  const recheck = adm.recheck;
  if (isObj(recheck)) {
    if (!sameSet(Object.keys(recheck), RECHECK_KEYS)) fail(C0, `ADMISSION.recheck must hold exactly ${RECHECK_KEYS.join(", ")}`);
    for (const key of RECHECK_KEYS) {
      if (passes(recheck[key])) pass(C3, `R's re-check ${key}: pass`);
      else fail(C3, `R's re-check ${key}: not a passing CheckResult ({ "ok": true, ... })`);
    }
  }

  // Agreement thresholds (section 6) and fixed threshold block.
  const ag = adm.agreement;
  if (isObj(ag)) {
    const num = (k: string): number | null => (typeof ag[k] === "number" ? (ag[k] as number) : null);
    const modality = num("modality");
    const tuple = num("tuple");
    const disputed = num("disputedFieldRatio");
    const pairs = ag.alignedObligationPairs;
    if (!isNonNegInt(pairs) || pairs === 0) fail(C4, "agreement.alignedObligationPairs is 0 or missing: thresholds are not met", thresholdSeverity);
    if (modality === null || modality < MIN_MODALITY_AGREEMENT) fail(C4, `modality agreement ${String(modality)} < ${MIN_MODALITY_AGREEMENT}`, thresholdSeverity);
    else pass(C4, `modality agreement ${modality} >= ${MIN_MODALITY_AGREEMENT}`);
    if (tuple === null || tuple < MIN_TUPLE_AGREEMENT) fail(C4, `tuple agreement ${String(tuple)} < ${MIN_TUPLE_AGREEMENT}`, thresholdSeverity);
    else pass(C4, `tuple agreement ${tuple} >= ${MIN_TUPLE_AGREEMENT}`);
    if (disputed === null || disputed < 0 || disputed > MAX_DISPUTED_FIELD_RATIO) {
      fail(C4, `disputed scored-field ratio ${String(disputed)} > ${MAX_DISPUTED_FIELD_RATIO}`, thresholdSeverity);
    } else {
      pass(C4, `disputed scored-field ratio ${disputed} <= ${MAX_DISPUTED_FIELD_RATIO}`);
    }
    if (ag.unresolvedStateDisagreements !== 0) fail(C4, "unresolved consolidated-state/date-boundary disagreements remain (0 allowed)", thresholdSeverity);
    else pass(C4, "no unresolved consolidated-state/date-boundary disagreements");
    const u = ag.disputedNumerator;
    const d = ag.disputedDenominator;
    if (isNonNegInt(u) && isNonNegInt(d) && d > 0 && disputed !== null && Math.abs(u / d - disputed) > 1e-9) {
      fail(C4, "agreement.disputedFieldRatio differs from disputedNumerator / disputedDenominator");
    }
  }
  const th = adm.thresholds;
  if (isObj(th) && (!sameSet(Object.keys(th), Object.keys(FIXED_THRESHOLDS)) || Object.entries(FIXED_THRESHOLDS).some(([k, v]) => th[k] !== v))) {
    fail(C4, "ADMISSION.thresholds differ from the fixed values {modality 0.85, tuple 0.70, disputedMax 0.05, unresolvedStateMax 0}");
  }
  const sd = adm.stateDisagreements;
  if (isObj(sd) && isObj(ag)) {
    const sum = (o: unknown, keys: string[]): number | null =>
      isObj(o) && keys.every((k) => isNonNegInt(o[k])) ? keys.reduce((n, k) => n + (o[k] as number), 0) : null;
    const byKind = sum(sd.byKind, ["state_text", "boundary", "query_dates", "in_force"]);
    const resolved = sum(sd.resolved, ["a_corrected", "r_error", "roy_adjudicated"]);
    const unresolved = isNonNegInt(ag.unresolvedStateDisagreements) ? ag.unresolvedStateDisagreements : null;
    if (!isNonNegInt(sd.total) || byKind === null || resolved === null || unresolved === null) {
      fail(C0, "ADMISSION.stateDisagreements must be {total, byKind{4 ints}, resolved{3 ints}}");
    } else if (byKind !== sd.total || resolved + unresolved !== sd.total) {
      fail(C4, "stateDisagreements do not add up (byKind = total = resolved + unresolved)");
    }
  }

  // Contested summary (CONTESTED.json itself is never read here).
  const contested = adm.contested;
  if (isObj(contested)) {
    const byField = contested.byField;
    if (typeof contested.sha256 !== "string" || !SHA256_RE.test(contested.sha256) || !isNonNegInt(contested.count)) {
      fail(C4, "ADMISSION.contested must carry sha256 (64 hex) and count (integer)");
    } else if (!isObj(byField) || !sameSet(Object.keys(byField), CONTESTED_FIELDS) || CONTESTED_FIELDS.some((f) => !isNonNegInt(byField[f]))) {
      fail(C4, "ADMISSION.contested.byField must hold integer counts for actor, modality, action, deadline, kind");
    } else if (CONTESTED_FIELDS.reduce((n, f) => n + (byField[f] as number), 0) !== contested.count) {
      fail(C4, "ADMISSION.contested.byField does not sum to contested.count");
    } else {
      info(C4, `R lists ${contested.count} contested (queryId, slotId, field) entries; CONTESTED.json is verified against ADMISSION.contested.sha256 by eval-heldout at unseal`);
    }
  }

  // Check 5.
  if (passes(adm.originalityReview)) pass(C5, "R's originality/content review: ok");
  else fail(C5, "ADMISSION.originalityReview not reported ok");
  const dl = adm.denylistScan;
  if (passes(dl) && isObj(dl) && isNonNegInt(dl.hits) && typeof dl.assessment === "string") pass(C5, `R's denylist scan: ok (${dl.hits} hit(s) assessed)`);
  else fail(C5, "ADMISSION.denylistScan must be {ok: true, hits, assessment}");

  // Check 6.
  if (adm.noSymlinks === true) pass(C6, "R reports no symlinks");
  else fail(C6, "ADMISSION.noSymlinks is not true");
  if (isNonNegInt(adm.maxFileBytes) && adm.maxFileBytes <= MAX_FILE_BYTES) pass(C6, `largest hidden file ${adm.maxFileBytes} bytes <= ${MAX_FILE_BYTES}`);
  else fail(C6, `ADMISSION.maxFileBytes is missing or > ${MAX_FILE_BYTES}`);

  // Check 7: R's attestation up to and including ADMISSION.json.
  checkAttestation(adm.attestation, "ADMISSION.attestation", ADMISSION_ATTESTATION_TRUE, "final");

  // R's own verdict.
  const reasons = Array.isArray(adm.reasons) ? adm.reasons.length : 0;
  if (adm.verdict === "GO") pass(C4, "R's ADMISSION verdict: GO");
  else if (adm.verdict === "NO-GO") fail(C4, `R's ADMISSION verdict: NO-GO; R recorded ${reasons} reason(s) in ADMISSION.reasons`, thresholdSeverity);
  else fail(C4, 'ADMISSION.verdict must be "GO" or "NO-GO"');
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function main(argv: string[]): number {
  const json = argv.includes("--json");

  // Registry and builder identity.
  const loadedRegistry = loadRegistry();
  const reg = loadedRegistry.registry;
  let builders: Agent[] = [];
  identityUnresolved = reg === null;
  if (reg === null) {
    pending(C3, `${loadedRegistry.problem ?? "registry unavailable"}; identities cannot be verified`);
  } else {
    const resolved = resolveBuilders(reg);
    builders = resolved.builders;
    identityUnresolved = resolved.problems.length > 0;
    for (const problem of resolved.problems) pending(C3, problem);
  }

  // Manifest (optional until M2).
  let manifest: JsonObject | null = null;
  const manifestAbs = join(REPO, MANIFEST_PATH);
  if (existsSync(assertReadable(manifestAbs))) {
    const m = readJsonFile(manifestAbs, MANIFEST_PATH);
    if (m.value === null) fail(C1, m.problem ?? `${MANIFEST_PATH} unreadable`);
    manifest = m.value;
  }

  const currentGuide = checkGuideFirst(manifest);
  const devFamilies = checkDev(manifest);

  // Receipts: only these three files, each only if present.
  const loaded = new Map<string, LoadedJson>();
  const missing = new Set<string>();
  for (const name of RECEIPT_NAMES) {
    const path = join(ADMISSION_DIR, name);
    if (!existsSync(assertReadable(path))) {
      missing.add(name);
      pending(name === "A-RECEIPT.json" ? C3 : C4, `admission/${name} absent`);
      continue;
    }
    const r = readJsonFile(path, `admission/${name}`);
    if (r.value === null) fail(C0, r.problem ?? `admission/${name} unreadable`);
    loaded.set(name, r);
  }
  const aLoaded = loaded.get("A-RECEIPT.json");
  const sealLoaded = loaded.get("R-SEAL.json");
  const admLoaded = loaded.get("ADMISSION.json");
  const aReceipt = aLoaded?.value ?? null;
  const seal = sealLoaded?.value ?? null;
  const adm = admLoaded?.value ?? null;

  let author: Agent | null = null;
  if (aReceipt !== null) author = checkAuthorReceipt(aReceipt, devFamilies, reg, builders, currentGuide);
  if (seal !== null) checkSeal(seal, aReceipt, currentGuide);
  if (adm !== null) checkAdmission(adm, seal, aLoaded?.sha256 ?? null, sealLoaded?.sha256 ?? null, currentGuide);

  // R's identity: registered, distinct from A, outside the builder lineage.
  const rSource = adm ?? seal;
  if (rSource !== null) {
    const r = checkIdentity(rSource.relabellerCallsign, rSource.harness, "relabeller R", C4, reg, builders);
    if (r !== null && reg !== null) {
      const rToA = author === null ? null : relationship(reg, r, author.id);
      const aToR = author === null ? null : relationship(reg, author, r.id);
      if (rToA === "related" || aToR === "related") {
        fail(C4, "relabeller R is not distinct from author A (same agent or same lineage)", "final");
      } else if (rToA === "unresolved" || aToR === "unresolved") {
        identityUnresolved = true;
        pending(C4, "A/R distinctness is unresolved: registry ancestry is incomplete");
      } else if (author !== null) {
        pass(C4, `relabeller R (${r.harness}) is registered and distinct from author A`);
      } else {
        identityUnresolved = true;
        pending(C4, "author A's registry identity unavailable; R's distinctness from A cannot be checked yet");
      }
    }
  }

  const blocked = missing.size > 0 || identityUnresolved;
  const verdict = blocked
    ? "PENDING"
    : findings.some((f) => f.status === "FAIL")
      ? "NO-GO"
      : findings.some((f) => f.status === "PENDING")
        ? "PENDING"
        : "GO";
  const label = (f: Finding): string => (f.status === "FAIL" ? `FAIL ${f.severity ?? "fixable"}` : f.status);
  const reasons = findings
    .filter((f) => f.status === "FAIL" || f.status === "PENDING")
    .map((f) => `[${label(f)}] ${f.check}: ${f.message}`);

  if (json) {
    process.stdout.write(`${JSON.stringify({ tool: "admit", verdict, reasons, findings }, null, 2)}\n`);
  } else {
    process.stdout.write("S46 G1 admission check (read-only)\n");
    process.stdout.write(`  repo:      ${REPO}\n  receipts:  ${ADMISSION_DIR} (A-RECEIPT.json, R-SEAL.json, ADMISSION.json only)\n  registry:  ${REGISTRY_DIR}\n\n`);
    for (const f of findings) process.stdout.write(`[${label(f)}] ${f.check}: ${f.message}\n`);
    const counts = (s: Status): number => findings.filter((f) => f.status === s).length;
    process.stdout.write(
      `\nG1: ${verdict}   (pass ${counts("PASS")}, fail ${counts("FAIL")}, pending ${counts("PENDING")}, warn ${counts("WARN")})\n`,
    );
    if (verdict === "NO-GO" && findings.some((f) => f.status === "FAIL" && f.severity === "final")) {
      process.stdout.write("At least one failure is FINAL: no headline claim; the repo stays an unadmitted regression build.\n");
    }
    if (reasons.length > 0) {
      process.stdout.write("Reasons:\n");
      for (const r of reasons) process.stdout.write(`  - ${r}\n`);
    }
  }
  return verdict === "GO" ? 0 : verdict === "NO-GO" ? 1 : 2;
}

// Importing pure identity helpers for the authored tests does not run admission or read any files.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
