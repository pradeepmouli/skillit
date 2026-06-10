# @to-skills/docusaurus

## 0.3.1

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend
- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`126416e`](https://github.com/pradeepmouli/skillit/commit/126416e59bd35e798f4655ebac8c4ab2243ccdea), [`62c0e2a`](https://github.com/pradeepmouli/skillit/commit/62c0e2a5f4ec05af30f262d24f53631d190eadb9), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186), [`3d5d8eb`](https://github.com/pradeepmouli/skillit/commit/3d5d8eb9df812c628a118764ccdf3a5d4478b4db), [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a), [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279)]:
  - @skillit/core@2.0.0

## 0.3.0

### Minor Changes

- [#41](https://github.com/pradeepmouli/skillit/pull/41) [`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - fix(client): guard msg.content[0] access — throw on empty or non-text response
  - fix(typedoc/refine): fix JSDoc closer indentation + use async fs I/O in TypeDocRefineSource
  - feat(client): add skillit bin with refine command
  - feat(client): add AnthropicModelClient (Sonnet drafter, Opus reviewer)
  - feat(client): scaffold @skillit/client package

### Patch Changes

- [#54](https://github.com/pradeepmouli/skillit/pull/54) [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Rebrand `@to-skills` → `@skillit`: package scope, a single `skillit` CLI (MCP commands now mounted as `skillit mcp …`), bundled skill names (`skillit-cli-docs`/`skillit-docs`/`skillit-mcp-docs`), and the `package.json` config key (`skillit.mcp`). No API or behavior changes.

- Updated dependencies [[`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6), [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18), [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912)]:
  - @skillit/core@1.5.0

## 0.2.26

### Patch Changes

- Updated dependencies [[`2b91bd8`](https://github.com/pradeepmouli/to-skills/commit/2b91bd8e2882ee470c00e5b12705a28c052bb5c8)]:
  - @to-skills/core@1.4.0

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.3.0

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.2.2

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.2.1

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.2.0

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.1.2

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.1.1

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.1.0

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.0.1

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.0.0

## 0.2.16

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.16.2

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.16.1

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.16.0

## 0.2.13

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.15.0

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.14.0

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.4

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.3

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.2

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.1

## 0.2.7

### Patch Changes

- Updated dependencies [[`f9cc01d`](https://github.com/pradeepmouli/to-skills/commit/f9cc01dc46bfe00467afe4e82eec6b557ca8e3f3)]:
  - @to-skills/core@0.13.0

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.12.0

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.11.1

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.11.0

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.3

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.2

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.1

## 0.2.0

### Minor Changes

- Markdown & Docusaurus docs extraction
  - Generalized markdown doc parser (parseMarkdownDoc) with frontmatter, sections, code blocks
  - Docs directory scanner (scanDocs) with sidebar_position/filename-prefix ordering
  - Documentation section in SKILL.md listing available doc pages
  - @to-skills/docusaurus package: Docusaurus adapter with _category_.json support
  - TypeDoc plugin: skillsIncludeDocs + skillsDocsDir options for opt-in docs scanning

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.0
