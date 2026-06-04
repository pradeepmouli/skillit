// packages/client/src/model/models.ts
// Shared model identifiers for the refine drafter/reviewer roles. Imported by
// both the Anthropic API client and the claude CLI adapter so the role→model
// mapping has one source of truth.
export const DRAFTER = 'claude-sonnet-4-6';
export const REVIEWER = 'claude-opus-4-7';
export const MAX_TOKENS = 1024;
