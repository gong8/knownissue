import { describe, it, expect } from "vitest";
import {
  severitySchema,
  issueStatusSchema,
  verificationOutcomeSchema,
  issueAccuracySchema,
  issueCategorySchema,
  issueRelationTypeSchema,
  patchRelationTypeSchema,
  patchStepSchema,
  searchInputBase,
  searchInputSchema,
  reportInputSchema,
  patchInputSchema,
  verificationInputSchema,
  myActivityInputSchema,
} from "./validators";
import { MIN_EXPLANATION_LENGTH } from "./constants";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";

// ── Enum Schemas ──────────────────────────────────────────────────────────

describe("severitySchema", () => {
  it.each(["low", "medium", "high", "critical"])("accepts '%s'", (value) => {
    expect(severitySchema.parse(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => severitySchema.parse("urgent")).toThrow();
    expect(() => severitySchema.parse("")).toThrow();
    expect(() => severitySchema.parse(1)).toThrow();
  });
});

describe("issueStatusSchema", () => {
  it.each(["open", "confirmed", "patched", "closed"])("accepts '%s'", (value) => {
    expect(issueStatusSchema.parse(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => issueStatusSchema.parse("resolved")).toThrow();
  });
});

describe("verificationOutcomeSchema", () => {
  it.each(["fixed", "not_fixed", "partial"])("accepts '%s'", (value) => {
    expect(verificationOutcomeSchema.parse(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => verificationOutcomeSchema.parse("unknown")).toThrow();
  });
});

describe("issueAccuracySchema", () => {
  it.each(["accurate", "inaccurate"])("accepts '%s'", (value) => {
    expect(issueAccuracySchema.parse(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => issueAccuracySchema.parse("maybe")).toThrow();
  });
});

describe("issueCategorySchema", () => {
  const validCategories = [
    "crash", "build", "types", "performance", "behavior",
    "config", "compatibility", "install", "hallucination", "deprecated",
  ];

  it.each(validCategories)("accepts '%s'", (value) => {
    expect(issueCategorySchema.parse(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => issueCategorySchema.parse("security")).toThrow();
  });
});

describe("issueRelationTypeSchema", () => {
  const validTypes = [
    "same_root_cause", "version_regression", "cascading_dependency",
    "interaction_conflict", "shared_fix", "fix_conflict",
  ];

  it.each(validTypes)("accepts '%s'", (value) => {
    expect(issueRelationTypeSchema.parse(value)).toBe(value);
  });

  it("rejects invalid values", () => {
    expect(() => issueRelationTypeSchema.parse("duplicate")).toThrow();
  });
});

describe("patchRelationTypeSchema", () => {
  it.each(["shared_fix", "fix_conflict"])("accepts '%s'", (value) => {
    expect(patchRelationTypeSchema.parse(value)).toBe(value);
  });

  it("rejects types not available for patches", () => {
    expect(() => patchRelationTypeSchema.parse("same_root_cause")).toThrow();
    expect(() => patchRelationTypeSchema.parse("version_regression")).toThrow();
  });
});

// ── Patch Step Schema (discriminated union) ───────────────────────────────

describe("patchStepSchema", () => {
  describe("code_change", () => {
    it("accepts valid code_change step", () => {
      const step = {
        type: "code_change",
        filePath: "src/utils/merge.ts",
        before: "const x = 1;",
        after: "const x = 2;",
      };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("accepts code_change with optional language", () => {
      const step = {
        type: "code_change",
        filePath: "src/utils/merge.ts",
        language: "typescript",
        before: "const x = 1;",
        after: "const x = 2;",
      };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("rejects code_change with empty filePath", () => {
      expect(() => patchStepSchema.parse({
        type: "code_change",
        filePath: "",
        before: "a",
        after: "b",
      })).toThrow();
    });

    it("rejects code_change missing required fields", () => {
      expect(() => patchStepSchema.parse({
        type: "code_change",
        filePath: "src/index.ts",
      })).toThrow();
    });

    it("accepts code_change with empty before/after strings", () => {
      const step = {
        type: "code_change",
        filePath: "src/index.ts",
        before: "",
        after: "const x = 1;",
      };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });
  });

  describe("version_bump", () => {
    it("accepts valid version_bump step", () => {
      const step = {
        type: "version_bump",
        package: "lodash",
        to: "4.17.22",
      };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("rejects version_bump with empty package", () => {
      expect(() => patchStepSchema.parse({
        type: "version_bump",
        package: "",
        to: "4.17.22",
      })).toThrow();
    });

    it("rejects version_bump with empty to", () => {
      expect(() => patchStepSchema.parse({
        type: "version_bump",
        package: "lodash",
        to: "",
      })).toThrow();
    });
  });

  describe("config_change", () => {
    it("accepts valid config_change with set action", () => {
      const step = {
        type: "config_change",
        file: "tsconfig.json",
        key: "compilerOptions.strict",
        action: "set",
        value: "true",
      };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("accepts config_change with delete action (no value)", () => {
      const step = {
        type: "config_change",
        file: "tsconfig.json",
        key: "compilerOptions.strict",
        action: "delete",
      };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("rejects config_change with invalid action", () => {
      expect(() => patchStepSchema.parse({
        type: "config_change",
        file: "tsconfig.json",
        key: "compilerOptions.strict",
        action: "update",
      })).toThrow();
    });

    it("rejects config_change with empty file", () => {
      expect(() => patchStepSchema.parse({
        type: "config_change",
        file: "",
        key: "compilerOptions.strict",
        action: "set",
      })).toThrow();
    });

    it("rejects config_change with empty key", () => {
      expect(() => patchStepSchema.parse({
        type: "config_change",
        file: "tsconfig.json",
        key: "",
        action: "set",
      })).toThrow();
    });
  });

  describe("command", () => {
    it("accepts valid command step", () => {
      const step = { type: "command", command: "npm install lodash@4.17.22" };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("rejects command with empty command", () => {
      expect(() => patchStepSchema.parse({
        type: "command",
        command: "",
      })).toThrow();
    });
  });

  describe("instruction", () => {
    it("accepts valid instruction step", () => {
      const step = { type: "instruction", text: "Use useEffect instead of useServerEffect" };
      expect(patchStepSchema.parse(step)).toEqual(step);
    });

    it("rejects instruction with empty text", () => {
      expect(() => patchStepSchema.parse({
        type: "instruction",
        text: "",
      })).toThrow();
    });
  });

  describe("invalid type", () => {
    it("rejects unknown step type", () => {
      expect(() => patchStepSchema.parse({
        type: "rollback",
        details: "some data",
      })).toThrow();
    });

    it("rejects missing type", () => {
      expect(() => patchStepSchema.parse({
        filePath: "src/index.ts",
        before: "a",
        after: "b",
      })).toThrow();
    });
  });
});

// ── Search Input Schemas ──────────────────────────────────────────────────

describe("searchInputBase", () => {
  it("accepts all fields provided", () => {
    const input = {
      query: "lodash merge crash",
      patchId: VALID_UUID,
      library: "lodash",
      version: "4.17.21",
      errorCode: "ERR_MODULE_NOT_FOUND",
      contextLibrary: "webpack",
    };
    expect(searchInputBase.parse(input)).toEqual({ ...input, limit: 10, offset: 0 });
  });

  it("accepts empty object (all fields optional)", () => {
    expect(searchInputBase.parse({})).toEqual({ limit: 10, offset: 0 });
  });

  it("accepts only query", () => {
    expect(searchInputBase.parse({ query: "test" })).toEqual({ query: "test", limit: 10, offset: 0 });
  });

  it("accepts only patchId", () => {
    expect(searchInputBase.parse({ patchId: VALID_UUID })).toEqual({ patchId: VALID_UUID, limit: 10, offset: 0 });
  });

  it("rejects invalid patchId (not a UUID)", () => {
    expect(() => searchInputBase.parse({ patchId: "not-a-uuid" })).toThrow();
  });
});

describe("searchInputSchema", () => {
  it("accepts query + patchId together", () => {
    const result = searchInputSchema.parse({
      query: "test query",
      patchId: VALID_UUID,
    });
    expect(result.query).toBe("test query");
    expect(result.patchId).toBe(VALID_UUID);
  });

  it("accepts only query", () => {
    const result = searchInputSchema.parse({ query: "test query" });
    expect(result.query).toBe("test query");
  });

  it("accepts only patchId", () => {
    const result = searchInputSchema.parse({ patchId: VALID_UUID });
    expect(result.patchId).toBe(VALID_UUID);
  });

  it("rejects neither query nor patchId", () => {
    expect(() => searchInputSchema.parse({})).toThrow("Either query or patchId is required");
  });

  it("rejects when only optional filters provided (no query or patchId)", () => {
    expect(() => searchInputSchema.parse({ library: "react" })).toThrow();
  });

  it("accepts query with optional filters", () => {
    const result = searchInputSchema.parse({
      query: "crash on startup",
      library: "react",
      version: "18.2.0",
      contextLibrary: "webpack",
    });
    expect(result.query).toBe("crash on startup");
    expect(result.library).toBe("react");
  });
});

// ── Report Input Schema ───────────────────────────────────────────────────

describe("reportInputSchema", () => {
  it("accepts minimal report with only errorMessage", () => {
    const result = reportInputSchema.parse({ errorMessage: "TypeError: Cannot read properties" });
    expect(result.errorMessage).toBe("TypeError: Cannot read properties");
    expect(result.severity).toBe("medium");
    expect(result.tags).toEqual([]);
  });

  it("accepts minimal report with only description", () => {
    const result = reportInputSchema.parse({ description: "The merge function crashes on circular references" });
    expect(result.description).toBe("The merge function crashes on circular references");
  });

  it("rejects missing both errorMessage and description", () => {
    expect(() => reportInputSchema.parse({})).toThrow(
      "At least one of errorMessage or description is required"
    );
  });

  it("rejects when only non-required fields are present", () => {
    expect(() => reportInputSchema.parse({ library: "react", version: "18" })).toThrow();
  });

  it("defaults severity to 'medium'", () => {
    const result = reportInputSchema.parse({ errorMessage: "some error" });
    expect(result.severity).toBe("medium");
  });

  it("defaults tags to empty array", () => {
    const result = reportInputSchema.parse({ errorMessage: "some error" });
    expect(result.tags).toEqual([]);
  });

  it("accepts explicit severity", () => {
    const result = reportInputSchema.parse({
      errorMessage: "crash",
      severity: "critical",
    });
    expect(result.severity).toBe("critical");
  });

  it("accepts explicit tags", () => {
    const result = reportInputSchema.parse({
      errorMessage: "crash",
      tags: ["memory-leak", "regression"],
    });
    expect(result.tags).toEqual(["memory-leak", "regression"]);
  });

  it("accepts a full report with all fields", () => {
    const input = {
      library: "lodash",
      version: "4.17.21",
      ecosystem: "npm",
      errorMessage: "TypeError: Cannot merge circular refs",
      description: "When merging objects with circular references, lodash.merge crashes",
      errorCode: "ERR_CIRCULAR",
      stackTrace: "at merge (lodash.js:123)",
      triggerCode: "_.merge(a, a)",
      expectedBehavior: "Should handle circular refs",
      actualBehavior: "Crashes with stack overflow",
      context: [{ name: "webpack", version: "5.0.0", role: "bundler" }],
      runtime: "node 20.11.0",
      platform: "macos-arm64",
      category: "crash",
      tags: ["circular-ref"],
      severity: "high",
      title: "lodash merge circular ref crash",
    };
    const result = reportInputSchema.parse(input);
    expect(result.library).toBe("lodash");
    expect(result.context).toEqual([{ name: "webpack", version: "5.0.0", role: "bundler" }]);
    expect(result.category).toBe("crash");
  });

  it("accepts context without role (optional)", () => {
    const result = reportInputSchema.parse({
      errorMessage: "test",
      context: [{ name: "react", version: "18.2.0" }],
    });
    expect(result.context![0].role).toBeUndefined();
  });

  it("accepts report with inline patch", () => {
    const result = reportInputSchema.parse({
      errorMessage: "crash on merge",
      patch: {
        explanation: "Fix the merge function to handle circular references properly",
        steps: [
          {
            type: "code_change",
            filePath: "src/merge.ts",
            before: "function merge(a, b)",
            after: "function merge(a, b, seen = new Set())",
          },
        ],
      },
    });
    expect(result.patch).toBeDefined();
    expect(result.patch!.steps).toHaveLength(1);
  });

  it("rejects inline patch with explanation too short", () => {
    expect(() => reportInputSchema.parse({
      errorMessage: "crash",
      patch: {
        explanation: "short",
        steps: [{ type: "command", command: "npm install" }],
      },
    })).toThrow();
  });

  it("rejects inline patch with empty steps array", () => {
    expect(() => reportInputSchema.parse({
      errorMessage: "crash",
      patch: {
        explanation: "This is a long enough explanation for the fix",
        steps: [],
      },
    })).toThrow();
  });

  it("accepts report with relatedTo", () => {
    const result = reportInputSchema.parse({
      errorMessage: "related crash",
      relatedTo: {
        issueId: VALID_UUID,
        type: "same_root_cause",
        note: "Same underlying bug",
      },
    });
    expect(result.relatedTo).toBeDefined();
    expect(result.relatedTo!.issueId).toBe(VALID_UUID);
    expect(result.relatedTo!.type).toBe("same_root_cause");
  });

  it("rejects relatedTo with invalid issueId", () => {
    expect(() => reportInputSchema.parse({
      errorMessage: "test",
      relatedTo: {
        issueId: "not-a-uuid",
        type: "same_root_cause",
      },
    })).toThrow();
  });

  it("accepts all issueRelationTypes in relatedTo", () => {
    const types = [
      "same_root_cause", "version_regression", "cascading_dependency",
      "interaction_conflict", "shared_fix", "fix_conflict",
    ];
    for (const type of types) {
      const result = reportInputSchema.parse({
        errorMessage: "test",
        relatedTo: { issueId: VALID_UUID, type },
      });
      expect(result.relatedTo!.type).toBe(type);
    }
  });
});

// ── Patch Input Schema ────────────────────────────────────────────────────

describe("patchInputSchema", () => {
  const validPatch = {
    issueId: VALID_UUID,
    explanation: "Fix the merge function to handle circular references properly",
    steps: [{ type: "command" as const, command: "npm install lodash@4.17.22" }],
  };

  it("accepts valid patch", () => {
    const result = patchInputSchema.parse(validPatch);
    expect(result.issueId).toBe(VALID_UUID);
    expect(result.steps).toHaveLength(1);
  });

  it("rejects invalid issueId", () => {
    expect(() => patchInputSchema.parse({
      ...validPatch,
      issueId: "not-a-uuid",
    })).toThrow();
  });

  it("rejects explanation shorter than MIN_EXPLANATION_LENGTH", () => {
    expect(() => patchInputSchema.parse({
      ...validPatch,
      explanation: "x".repeat(MIN_EXPLANATION_LENGTH - 1),
    })).toThrow();
  });

  it("accepts explanation at exactly MIN_EXPLANATION_LENGTH", () => {
    const result = patchInputSchema.parse({
      ...validPatch,
      explanation: "x".repeat(MIN_EXPLANATION_LENGTH),
    });
    expect(result.explanation).toHaveLength(MIN_EXPLANATION_LENGTH);
  });

  it("rejects empty steps array", () => {
    expect(() => patchInputSchema.parse({
      ...validPatch,
      steps: [],
    })).toThrow();
  });

  it("accepts multiple steps of different types", () => {
    const result = patchInputSchema.parse({
      ...validPatch,
      steps: [
        { type: "version_bump", package: "lodash", to: "4.17.22" },
        { type: "command", command: "npm install" },
        { type: "instruction", text: "Restart the dev server" },
      ],
    });
    expect(result.steps).toHaveLength(3);
  });

  it("accepts optional versionConstraint", () => {
    const result = patchInputSchema.parse({
      ...validPatch,
      versionConstraint: ">=4.17.0 <5.0.0",
    });
    expect(result.versionConstraint).toBe(">=4.17.0 <5.0.0");
  });

  it("accepts patch with relatedTo (shared_fix)", () => {
    const result = patchInputSchema.parse({
      ...validPatch,
      relatedTo: {
        issueId: VALID_UUID_2,
        type: "shared_fix",
        note: "Same fix applies to both issues",
      },
    });
    expect(result.relatedTo).toBeDefined();
    expect(result.relatedTo!.type).toBe("shared_fix");
  });

  it("accepts patch with relatedTo (fix_conflict)", () => {
    const result = patchInputSchema.parse({
      ...validPatch,
      relatedTo: {
        issueId: VALID_UUID_2,
        type: "fix_conflict",
      },
    });
    expect(result.relatedTo!.type).toBe("fix_conflict");
  });

  it("rejects relatedTo with non-patch relation type", () => {
    expect(() => patchInputSchema.parse({
      ...validPatch,
      relatedTo: {
        issueId: VALID_UUID_2,
        type: "same_root_cause",
      },
    })).toThrow();
  });

  it("rejects missing issueId", () => {
    expect(() => patchInputSchema.parse({
      explanation: validPatch.explanation,
      steps: validPatch.steps,
    })).toThrow();
  });

  it("rejects missing explanation", () => {
    expect(() => patchInputSchema.parse({
      issueId: VALID_UUID,
      steps: validPatch.steps,
    })).toThrow();
  });

  it("rejects missing steps", () => {
    expect(() => patchInputSchema.parse({
      issueId: VALID_UUID,
      explanation: validPatch.explanation,
    })).toThrow();
  });
});

// ── Verification Input Schema ─────────────────────────────────────────────

describe("verificationInputSchema", () => {
  const validVerification = {
    patchId: VALID_UUID,
    outcome: "fixed" as const,
  };

  it("accepts valid verification with minimal fields", () => {
    const result = verificationInputSchema.parse(validVerification);
    expect(result.patchId).toBe(VALID_UUID);
    expect(result.outcome).toBe("fixed");
    expect(result.note).toBeNull();
  });

  it("defaults note to null", () => {
    const result = verificationInputSchema.parse(validVerification);
    expect(result.note).toBeNull();
  });

  it("accepts explicit null note", () => {
    const result = verificationInputSchema.parse({
      ...validVerification,
      note: null,
    });
    expect(result.note).toBeNull();
  });

  it("accepts a string note", () => {
    const result = verificationInputSchema.parse({
      ...validVerification,
      note: "Tested and confirmed fix works",
    });
    expect(result.note).toBe("Tested and confirmed fix works");
  });

  it.each(["fixed", "not_fixed", "partial"] as const)("accepts outcome '%s'", (outcome) => {
    const result = verificationInputSchema.parse({
      patchId: VALID_UUID,
      outcome,
    });
    expect(result.outcome).toBe(outcome);
  });

  it("rejects invalid patchId", () => {
    expect(() => verificationInputSchema.parse({
      ...validVerification,
      patchId: "not-a-uuid",
    })).toThrow();
  });

  it("rejects invalid outcome", () => {
    expect(() => verificationInputSchema.parse({
      patchId: VALID_UUID,
      outcome: "maybe",
    })).toThrow();
  });

  it("accepts optional errorBefore/errorAfter/testedVersion", () => {
    const result = verificationInputSchema.parse({
      ...validVerification,
      errorBefore: "TypeError: cannot read property",
      errorAfter: "",
      testedVersion: "4.17.22",
    });
    expect(result.errorBefore).toBe("TypeError: cannot read property");
    expect(result.errorAfter).toBe("");
    expect(result.testedVersion).toBe("4.17.22");
  });

  it("accepts optional issueAccuracy", () => {
    const result = verificationInputSchema.parse({
      ...validVerification,
      issueAccuracy: "accurate",
    });
    expect(result.issueAccuracy).toBe("accurate");
  });

  it("accepts issueAccuracy 'inaccurate'", () => {
    const result = verificationInputSchema.parse({
      ...validVerification,
      issueAccuracy: "inaccurate",
    });
    expect(result.issueAccuracy).toBe("inaccurate");
  });

  it("rejects missing patchId", () => {
    expect(() => verificationInputSchema.parse({
      outcome: "fixed",
    })).toThrow();
  });

  it("rejects missing outcome", () => {
    expect(() => verificationInputSchema.parse({
      patchId: VALID_UUID,
    })).toThrow();
  });
});

// ── My Activity Input Schema ──────────────────────────────────────────────

describe("myActivityInputSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = myActivityInputSchema.parse({});
    expect(result).toEqual({});
  });

  it.each(["issues", "patches", "verifications"] as const)("accepts type '%s'", (type) => {
    const result = myActivityInputSchema.parse({ type });
    expect(result.type).toBe(type);
  });

  it("rejects invalid type", () => {
    expect(() => myActivityInputSchema.parse({ type: "credits" })).toThrow();
  });

  it.each(["fixed", "not_fixed", "partial"] as const)("accepts outcome '%s'", (outcome) => {
    const result = myActivityInputSchema.parse({ outcome });
    expect(result.outcome).toBe(outcome);
  });

  it("rejects invalid outcome", () => {
    expect(() => myActivityInputSchema.parse({ outcome: "unknown" })).toThrow();
  });

  it("accepts valid limit values", () => {
    expect(myActivityInputSchema.parse({ limit: 1 }).limit).toBe(1);
    expect(myActivityInputSchema.parse({ limit: 25 }).limit).toBe(25);
    expect(myActivityInputSchema.parse({ limit: 50 }).limit).toBe(50);
  });

  it("rejects limit below 1", () => {
    expect(() => myActivityInputSchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit above 50", () => {
    expect(() => myActivityInputSchema.parse({ limit: 51 })).toThrow();
  });

  it("rejects non-integer limit", () => {
    expect(() => myActivityInputSchema.parse({ limit: 5.5 })).toThrow();
  });

  it("accepts all filters combined", () => {
    const result = myActivityInputSchema.parse({
      type: "patches",
      outcome: "fixed",
      limit: 10,
    });
    expect(result.type).toBe("patches");
    expect(result.outcome).toBe("fixed");
    expect(result.limit).toBe(10);
  });
});
