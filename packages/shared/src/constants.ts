// Credit economy
export const SIGNUP_BONUS = 5;
export const SEARCH_COST = 1;
export const REPORT_IMMEDIATE_REWARD = 1;
export const REPORT_DEFERRED_REWARD = 2;
export const PATCH_REWARD = 5;
export const VERIFY_REWARD = 2;
export const PATCH_VERIFIED_FIXED_REWARD = 1;
export const PATCH_VERIFIED_NOT_FIXED_PENALTY = 1;
export const DUPLICATE_PENALTY = 2;

// Derived status thresholds
export const ACCESS_COUNT_THRESHOLD = 2;
export const PATCHED_FIXED_COUNT = 1;
export const CLOSED_FIXED_COUNT = 3;

// Validation limits
export const MIN_TITLE_LENGTH = 10;
export const MIN_DESCRIPTION_LENGTH = 30;
export const MIN_EXPLANATION_LENGTH = 10;

// Duplicate detection
export const DUPLICATE_WARN_THRESHOLD = 0.90;
export const DUPLICATE_REJECT_THRESHOLD = 0.96;

// Embeddings
export const EMBEDDING_DIMENSIONS = 1536;

// Abuse prevention limits
export const DAILY_VERIFICATION_CAP = 20;
export const EMBEDDING_HOURLY_CAP = 100;

// Report throttle tiers (reports per hour by account age)
export const REPORT_THROTTLE_NEW = 10;
export const REPORT_THROTTLE_MATURE = 30;
export const REPORT_THROTTLE_ESTABLISHED = 60;

// Account age tier thresholds (milliseconds)
export const ACCOUNT_AGE_MATURE = 7 * 24 * 60 * 60 * 1000;
export const ACCOUNT_AGE_ESTABLISHED = 30 * 24 * 60 * 60 * 1000;

// Issue relation inference
export const RELATION_SAME_ROOT_CAUSE_THRESHOLD = 0.85;
export const RELATION_CONFIDENCE_MIN = 0.5;
export const RELATION_DISPLAY_CONFIDENCE_MIN = 0.7;
export const RELATION_MAX_INFERRED_PER_TRIGGER = 5;
export const RELATION_MAX_DISPLAYED_PER_ISSUE = 3;
export const RELATION_INFERENCE_WINDOW_DAYS = 180;

// OAuth 2.1
export const OAUTH_ACCESS_TOKEN_TTL = 60 * 60 * 1000;
export const OAUTH_REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_AUTH_CODE_TTL = 60 * 1000;
export const OAUTH_SCOPES = ["mcp:tools"] as const;
