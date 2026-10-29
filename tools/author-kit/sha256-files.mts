/**
 * sha256-files.mts — S46 author kit (standalone).
 *
 * Hashes every regular file under a folder (recursively) and prints one JSON document suitable for
 * pasting into a receipt's `files: [{ path, sha256 }]` list. Node built-ins only; imports nothing from
 * the application and has no relative imports.
 *
 * Usage (Node >= 22.6):
 *   node --experimental-strip-types tools/author-kit/sha256-files.mts <folder> [--relative-to <dir>]
 * Paths are relative to <folder> (or to --relative-to <dir>, e.g. the outer shell so that paths read
 * "heldout-sealed/H01/packet.json"), use "/" separators and are sorted by UTF-16 code unit order.
 * SHA-256 is over the exact bytes on disk, lowercase hex.
 * Symbolic links are never followed: each one is listed under "symlinks". Files larger than
 * 200000 bytes are listed under "oversize". Exit code: 0 clean, 1 symlinks or oversize files present,
 * 2 usage error or unreadable folder.
 */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const TOOL = "sha256-files";
const KIT_VERSION = "s46.author-kit.v1";
const MAX_FILE_BYTES = 200_000;

interface FileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

function walk(dir: string, base: string, files: FileEntry[], symlinks: string[], other: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = toPosix(relative(base, full));
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      symlinks.push(rel);
    } else if (st.isDirectory()) {
      walk(full, base, files, symlinks, other);
    } else if (st.isFile()) {
      const buf = readFileSync(full);
      files.push({ path: rel, sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length });
    } else {
      other.push(rel);
    }
  }
}

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function main(argv: string[]): number {
  const k = argv.indexOf("--relative-to");
  const relativeTo = k >= 0 ? argv[k + 1] ?? null : null;
  if (k >= 0 && relativeTo === null) {
    process.stderr.write(`${TOOL}: --relative-to needs a directory\n`);
    return 2;
  }
  const positional = argv.filter((a, idx) => !a.startsWith("--") && !(k >= 0 && idx === k + 1));
  const folder = positional[0];
  if (argv.includes("--help") || folder === undefined || positional.length !== 1) {
    process.stderr.write(`usage: node --experimental-strip-types tools/author-kit/${TOOL}.mts <folder> [--relative-to <dir>]\n`);
    return 2;
  }
  const root = resolve(folder);
  const base = relativeTo !== null ? resolve(relativeTo) : root;
  const files: FileEntry[] = [];
  const symlinks: string[] = [];
  const other: string[] = [];
  try {
    const st = lstatSync(root);
    if (st.isSymbolicLink()) symlinks.push(toPosix(relative(base, root)) || ".");
    else if (!st.isDirectory()) throw new Error("not a directory");
    else walk(root, base, files, symlinks, other);
  } catch (e) {
    process.stderr.write(`${TOOL}: cannot read folder ${folder}: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }
  files.sort((a, b) => byCodeUnits(a.path, b.path));
  symlinks.sort(byCodeUnits);
  other.sort(byCodeUnits);
  const oversize = files.filter((f) => f.bytes > MAX_FILE_BYTES).map((f) => f.path);
  const ok = symlinks.length === 0 && oversize.length === 0 && other.length === 0;
  const out = {
    tool: TOOL,
    kitVersion: KIT_VERSION,
    algorithm: "sha256",
    folder,
    relativeTo: relativeTo ?? folder,
    count: files.length,
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    maxFileBytes: files.reduce((n, f) => Math.max(n, f.bytes), 0),
    maxAllowedFileBytes: MAX_FILE_BYTES,
    ok,
    symlinks,
    oversize,
    otherEntries: other,
    files,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
