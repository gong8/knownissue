import { describe, it, expect } from "vitest";
import {
  // Credit economy
  SIGNUP_BONUS,
  SEARCH_COST,
  REPORT_IMMEDIATE_REWARD,
  REPORT_DEFERRED_REWARD,
  PATCH_REWARD,
  VERIFY_REWARD,
  PATCH_VERIFIED_FIXED_REWARD,
  PATCH_VERIFIED_NOT_FIXED_PENALTY,
  DUPLICATE_PENALTY,
  // Derived status thresholds
  ACCESS_COUNT_THRESHOLD,
  PATCHED_FIXED_COUNT,
  CLOSED_FIXED_COUNT,
  // Validation limits
  MIN_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_EXPLANATION_LENGTH,
  // Duplicate detection
  DUPLICATE_WARN_THRESHOLD,
  DUPLICATE_REJECT_THRESHOLD,
  // Embeddings
  EMBEDDING_DIMENSIONS,
  // Abuse prevention
  DAILY_VERIFICATION_CAP,
  EMBEDDING_HOURLY_CAP,
  // Report throttle
  REPORT_THROTTLE_NEW,
  REPORT_THROTTLE_MATURE,
  REPORT_THROTTLE_ESTABLISHED,
  // Account age thresholds
  ACCOUNT_AGE_MATURE,
  ACCOUNT_AGE_ESTABLISHED,
  // Issue relation inference
  RELATION_SAME_ROOT_CAUSE_THRESHOLD,
  RELATION_CONFIDENCE_MIN,
  RELATION_DISPLAY_CONFIDENCE_MIN,
  RELATION_MAX_INFERRED_PER_TRIGGER,
  RELATION_MAX_DISPLAYED_PER_ISSUE,
  RELATION_INFERENCE_WINDOW_DAYS,
  // OAuth
  OAUTH_ACCESS_TOKEN_TTL,
  OAUTH_REFRESH_TOKEN_TTL,
  OAUTH_AUTH_CODE_TTL,
  OAUTH_SCOPES,
} from "./constants";

describe("constants", () => {
  describe("credit economy", () => {
    it("has correct values", () => {
      expect(SIGNUP_BONUS).toBe(5);
      expect(SEARCH_COST).toBe(1);
      expect(REPORT_IMMEDIATE_REWARD).toBe(1);
      expect(REPORT_DEFERRED_REWARD).toBe(2);
      expect(PATCH_REWARD).toBe(5);
      expect(VERIFY_REWARD).toBe(2);
      expect(PATCH_VERIFIED_FIXED_REWARD).toBe(1);
      expect(PATCH_VERIFIED_NOT_FIXED_PENALTY).toBe(1);
      expect(DUPLICATE_PENALTY).toBe(2);
    });

    it("all credit values are positive integers", () => {
      const creditValues = [
        SIGNUP_BONUS,
        SEARCH_COST,
        REPORT_IMMEDIATE_REWARD,
        REPORT_DEFERRED_REWARD,
        PATCH_REWARD,
        VERIFY_REWARD,
        PATCH_VERIFIED_FIXED_REWARD,
        PATCH_VERIFIED_NOT_FIXED_PENALTY,
        DUPLICATE_PENALTY,
      ];
      for (const value of creditValues) {
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });

  describe("derived status thresholds", () => {
    it("has correct values", () => {
      expect(ACCESS_COUNT_THRESHOLD).toBe(2);
      expect(PATCHED_FIXED_COUNT).toBe(1);
      expect(CLOSED_FIXED_COUNT).toBe(3);
    });

    it("CLOSED_FIXED_COUNT > PATCHED_FIXED_COUNT", () => {
      expect(CLOSED_FIXED_COUNT).toBeGreaterThan(PATCHED_FIXED_COUNT);
    });
  });

  describe("validation limits", () => {
    it("has correct values", () => {
      expect(MIN_TITLE_LENGTH).toBe(10);
      expect(MIN_DESCRIPTION_LENGTH).toBe(30);
      expect(MIN_EXPLANATION_LENGTH).toBe(10);
    });

    it("description minimum is longer than title minimum", () => {
      expect(MIN_DESCRIPTION_LENGTH).toBeGreaterThan(MIN_TITLE_LENGTH);
    });
  });

  describe("duplicate detection", () => {
    it("has correct values", () => {
      expect(DUPLICATE_WARN_THRESHOLD).toBe(0.90);
      expect(DUPLICATE_REJECT_THRESHOLD).toBe(0.96);
    });

    it("reject threshold > warn threshold", () => {
      expect(DUPLICATE_REJECT_THRESHOLD).toBeGreaterThan(DUPLICATE_WARN_THRESHOLD);
    });

    it("thresholds are between 0 and 1", () => {
      expect(DUPLICATE_WARN_THRESHOLD).toBeGreaterThan(0);
      expect(DUPLICATE_WARN_THRESHOLD).toBeLessThan(1);
      expect(DUPLICATE_REJECT_THRESHOLD).toBeGreaterThan(0);
      expect(DUPLICATE_REJECT_THRESHOLD).toBeLessThan(1);
    });
  });

  describe("embeddings", () => {
    it("has correct dimensions", () => {
      expect(EMBEDDING_DIMENSIONS).toBe(1536);
    });
  });

  describe("abuse prevention", () => {
    it("has correct values", () => {
      expect(DAILY_VERIFICATION_CAP).toBe(20);
      expect(EMBEDDING_HOURLY_CAP).toBe(100);
    });
  });

  describe("report throttle tiers", () => {
    it("has correct values", () => {
      expect(REPORT_THROTTLE_NEW).toBe(10);
      expect(REPORT_THROTTLE_MATURE).toBe(30);
      expect(REPORT_THROTTLE_ESTABLISHED).toBe(60);
    });

    it("throttle limits increase with account age", () => {
      expect(REPORT_THROTTLE_ESTABLISHED).toBeGreaterThan(REPORT_THROTTLE_MATURE);
      expect(REPORT_THROTTLE_MATURE).toBeGreaterThan(REPORT_THROTTLE_NEW);
    });
  });

  describe("account age thresholds", () => {
    it("has correct values in milliseconds", () => {
      expect(ACCOUNT_AGE_MATURE).toBe(7 * 24 * 60 * 60 * 1000);
      expect(ACCOUNT_AGE_ESTABLISHED).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("established > mature", () => {
      expect(ACCOUNT_AGE_ESTABLISHED).toBeGreaterThan(ACCOUNT_AGE_MATURE);
    });
  });

  describe("issue relation inference", () => {
    it("has correct values", () => {
      expect(RELATION_SAME_ROOT_CAUSE_THRESHOLD).toBe(0.85);
      expect(RELATION_CONFIDENCE_MIN).toBe(0.5);
      expect(RELATION_DISPLAY_CONFIDENCE_MIN).toBe(0.7);
      expect(RELATION_MAX_INFERRED_PER_TRIGGER).toBe(5);
      expect(RELATION_MAX_DISPLAYED_PER_ISSUE).toBe(3);
      expect(RELATION_INFERENCE_WINDOW_DAYS).toBe(180);
    });

    it("display confidence >= storage confidence", () => {
      expect(RELATION_DISPLAY_CONFIDENCE_MIN).toBeGreaterThanOrEqual(RELATION_CONFIDENCE_MIN);
    });

    it("same_root_cause threshold >= display confidence", () => {
      expect(RELATION_SAME_ROOT_CAUSE_THRESHOLD).toBeGreaterThanOrEqual(RELATION_DISPLAY_CONFIDENCE_MIN);
    });

    it("max displayed <= max inferred", () => {
      expect(RELATION_MAX_DISPLAYED_PER_ISSUE).toBeLessThanOrEqual(RELATION_MAX_INFERRED_PER_TRIGGER);
    });
  });

  describe("OAuth", () => {
    it("has correct TTL values", () => {
      expect(OAUTH_ACCESS_TOKEN_TTL).toBe(60 * 60 * 1000); // 1 hour
      expect(OAUTH_REFRESH_TOKEN_TTL).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
      expect(OAUTH_AUTH_CODE_TTL).toBe(60 * 1000); // 1 minute
    });

    it("refresh token TTL > access token TTL > auth code TTL", () => {
      expect(OAUTH_REFRESH_TOKEN_TTL).toBeGreaterThan(OAUTH_ACCESS_TOKEN_TTL);
      expect(OAUTH_ACCESS_TOKEN_TTL).toBeGreaterThan(OAUTH_AUTH_CODE_TTL);
    });

    it("has correct scopes", () => {
      expect(OAUTH_SCOPES).toEqual(["mcp:tools"]);
    });
  });
});
