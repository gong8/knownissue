import type { User } from "@knownissue/shared";

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-test-1",
    clerkId: "clerk_test_1",
    avatarUrl: null,
    credits: 100,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function createMockUserNoCredits(overrides: Partial<User> = {}): User {
  return createMockUser({ id: "user-broke", credits: 0, ...overrides });
}

export function createMockNewUser(overrides: Partial<User> = {}): User {
  return createMockUser({
    id: "user-new",
    credits: 5,
    createdAt: new Date(), // brand new account
    ...overrides,
  });
}
