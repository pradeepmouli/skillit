/**
 * typedoc-plugin-skillit — auto-discovered TypeDoc plugin alias.
 *
 * This is a thin re-export of @skillit/typedoc so that TypeDoc
 * auto-discovers it when installed (TypeDoc looks for packages
 * named typedoc-plugin-*).
 *
 * Usage: just `pnpm add -D typedoc-plugin-skillit` — no config needed.
 */
export { load } from '@skillit/typedoc';
