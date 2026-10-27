// @vitest-environment node
// Authored, not executed: M1-r2 B1 regression coverage. Synthetic registry data only.
import { describe, expect, it } from "vitest";
import { BUILDER_ROOTS, ancestry, identityAssessment, parseRegistry, relationship, resolveBuilders } from "../../tools/admit";
import type { Agent, Registry } from "../../tools/admit";

const roots: Agent[] = BUILDER_ROOTS.map((root) => ({ ...root, parentId: "", forkedFrom: "" }));
const actor = (id = "4000", harness = "Grok", parentId = "", forkedFrom = ""): Agent =>
  ({ id, name: `synthetic-${id}`, harness, parentId, forkedFrom });
function registry(extra: Agent[] = [], builderRoots = roots): Registry {
  const agents = [...builderRoots, ...extra];
  return { byId: new Map(agents.map((a) => [a.id, a])), byName: new Map(agents.map((a) => [a.name, a])) };
}
function assess(a: Agent, who: "author A" | "relabeller R" = "author A", extra: Agent[] = []) {
  const reg = registry([a, ...extra]);
  return identityAssessment(a.name, a.harness, who, reg, resolveBuilders(reg).builders).findings;
}
const finalFailure = (findings: ReturnType<typeof assess>): boolean => findings.some((f) => f.status === "FAIL" && f.severity === "final");
const pending = (findings: ReturnType<typeof assess>): boolean => findings.some((f) => f.status === "PENDING");

describe("M1 B1 cumulative builder exclusion (authored, not executed)", () => {
  it("what_bug_this_catches: succession must retain both exact roots", () => {
    expect(BUILDER_ROOTS).toEqual([
      { id: "0805", name: "0805_Claude_Opus55_S46INT", harness: "Claude" },
      { id: "0914", name: "0914_Codex_GPT-6_N20CodexInt46", harness: "Codex" },
    ]);
  });
  for (const root of roots) {
    for (const who of ["author A", "relabeller R"] as const) {
      it(`what_bug_this_catches: ${who} cannot be builder root ${root.id}`, () => {
        const reg = registry();
        expect(finalFailure(identityAssessment(root.name, root.harness, who, reg, roots).findings)).toBe(true);
      });
      for (const edge of ["parent", "fork"] as const) {
        it(`what_bug_this_catches: ${who} cannot be a ${edge} descendant of ${root.id}`, () => {
          const child = actor("4000", "Grok", edge === "parent" ? root.id : "", edge === "fork" ? root.id : "");
          const grandchild = actor("4001", "Cursor", child.id);
          expect(finalFailure(assess(grandchild, who, [child]))).toBe(true);
        });
      }
    }
  }
  for (const harness of ["Claude", "Codex"]) {
    it(`what_bug_this_catches: an unrelated ${harness} A is still excluded`, () => {
      expect(finalFailure(assess(actor("4000", harness)))).toBe(true);
      expect(assess(actor("4000", harness), "relabeller R").every((f) => f.status === "PASS")).toBe(true);
    });
  }
  it("what_bug_this_catches: proven independent third-harness A remains eligible", () => {
    expect(assess(actor()).every((f) => f.status === "PASS")).toBe(true);
  });
  it("what_bug_this_catches: A/R same identity and ancestry in either direction remain related", () => {
    const a = actor();
    const r = actor("4001", "Cursor", "", a.id);
    const reg = registry([a, r]);
    expect(relationship(reg, a, a.id)).toBe("related");
    expect(relationship(reg, r, a.id)).toBe("related");
    expect(relationship(reg, a, r.id)).toBe("independent");
  });
});

describe("M1 B1 unresolved evidence (authored, not executed)", () => {
  const header = "id,name,harness,parent_id,forked_from";
  it("what_bug_this_catches: complete registry rows with explicit empty lineage cells are usable", () => {
    const csv = [header, ...roots.map((root) => `${root.id},${root.name},${root.harness},,`), "4000,synthetic-4000,Grok,,"].join("\n");
    const loaded = parseRegistry(csv);
    expect(loaded.problem).toBeNull();
    expect(loaded.registry).not.toBeNull();
    const reg = loaded.registry!;
    const resolved = resolveBuilders(reg);
    expect(resolved.problems).toEqual([]);
    expect(identityAssessment("synthetic-4000", "Grok", "author A", reg, resolved.builders).findings.every((f) => f.status === "PASS")).toBe(true);
  });
  for (const csv of [
    "id,name,harness,forked_from\n4000,A,Grok,",
    "id,name,harness,parent_id\n4000,A,Grok,",
    `${header}\n4000,A,Grok,`, // Row omits the final lineage cell.
    `${header}\n4000,A,Grok,,\n4000,B,Cursor,,`,
    `${header}\n4000,A,Grok,,\n4001,A,Cursor,,`,
    `${header}\n4000,\"unclosed,Grok,,`,
    `${header}\n4000,A,,,`,
  ]) {
    it(`what_bug_this_catches: incomplete/ambiguous CSV is unavailable (${csv})`, () => {
      const result = parseRegistry(csv);
      expect(result.registry).toBeNull();
      expect(result.problem).toBeTruthy();
    });
  }
  for (const index of [0, 1]) {
    it(`what_bug_this_catches: missing builder root ${index} is never inferred from its callsign`, () => {
      const remaining = roots.filter((_, i) => i !== index);
      const reg = registry([], remaining);
      const resolved = resolveBuilders(reg);
      expect(resolved.problems).toHaveLength(1);
      expect(pending(identityAssessment(actor().name, "Grok", "author A", registry([actor()], remaining), resolved.builders).findings)).toBe(true);
    });
  }
  it("what_bug_this_catches: a root with mismatched name or harness cannot be trusted", () => {
    for (const replacement of [{ ...roots[0]!, name: "different-name" }, { ...roots[0]!, harness: "Cursor" }]) {
      expect(resolveBuilders(registry([], [replacement, roots[1]!])).problems).toHaveLength(1);
    }
  });
  it("what_bug_this_catches: unavailable registry or missing actor yields PENDING", () => {
    expect(pending(identityAssessment("absent", "Grok", "author A", registry(), roots).findings)).toBe(true);
    expect(pending(identityAssessment("absent", "Grok", "author A", null, []).findings)).toBe(true);
  });
  it("what_bug_this_catches: missing ancestor is unresolved, not an independent chain end", () => {
    const a = actor("4000", "Grok", "4999");
    expect(pending(assess(a))).toBe(true);
    expect(relationship(registry([a]), a, roots[0]!.id)).toBe("unresolved");
    expect(resolveBuilders(registry([], [{ ...roots[0]!, parentId: "4999" }, roots[1]!])).problems).toHaveLength(1);
  });
  it("what_bug_this_catches: a parent/fork cycle cannot prove independence", () => {
    const a = actor("4000", "Grok", "4001");
    const b = actor("4001", "Cursor", "", a.id);
    expect(pending(assess(a, "author A", [b]))).toBe(true);
    expect(ancestry(registry([a, b]), a).problem).toContain("cycle");
  });
  it("what_bug_this_catches: exhausted traversal cannot prove independence", () => {
    const chain = Array.from({ length: 65 }, (_, i) => actor(String(5000 + i), "Grok", i < 64 ? String(5001 + i) : ""));
    const a = chain[0]!;
    expect(pending(assess(a, "author A", chain.slice(1)))).toBe(true);
    expect(ancestry(registry(chain), a).problem).toContain("limit");
  });
  it("what_bug_this_catches: known builder ancestry is final even with an unresolved second branch", () => {
    const a = actor("4000", "Grok", roots[1]!.id, "4999");
    const findings = assess(a);
    expect(finalFailure(findings)).toBe(true);
    expect(pending(findings)).toBe(true);
  });
});
