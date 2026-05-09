# @to-skills/vitepress

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

- VitePress plugin for AI agent skill generation
  - Vite plugin registered in .vitepress/config.mts vite.plugins array
  - Receives VitePress config via config.vitepress.site (sidebar, srcDir, title)
  - Sidebar-driven document ordering — no frontmatter heuristics
  - Generates skills at closeBundle with core's renderSkill + writeSkills
  - Sidebar walker extracts ordered doc paths from array or object sidebars
