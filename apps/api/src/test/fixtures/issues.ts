export function createMockIssueInput(overrides: Record<string, unknown> = {}) {
  return {
    errorMessage: "TypeError: Cannot read properties of undefined (reading 'map')",
    description: "When calling Array.map on the result of getData(), it throws because getData returns undefined instead of an array",
    library: "lodash",
    version: "4.17.21",
    ecosystem: "npm",
    severity: "medium" as const,
    tags: ["runtime-error"],
    ...overrides,
  };
}

export function createMockPatchInput(issueId: string, overrides: Record<string, unknown> = {}) {
  return {
    issueId,
    explanation: "The function getData() can return undefined when the cache is empty. Added a fallback to return an empty array.",
    steps: [
      {
        type: "code_change" as const,
        filePath: "src/utils/data.ts",
        language: "typescript",
        before: "return cache.get(key);",
        after: "return cache.get(key) ?? [];",
      },
    ],
    ...overrides,
  };
}

export function createMockVerificationInput(patchId: string, overrides: Record<string, unknown> = {}) {
  return {
    patchId,
    outcome: "fixed" as const,
    note: "Applied the patch and the error no longer occurs",
    ...overrides,
  };
}
