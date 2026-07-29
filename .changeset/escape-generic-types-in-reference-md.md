---
'@skillit/core': patch
---

Fix VitePress build failures caused by raw generic type references (e.g. `BuilderFor<T>`) in JSDoc comments.

Class, function, type, enum, and variable descriptions (and function `@remarks`/`@returns`/`@deprecated`/`@throws`/`@see` tags) were embedded verbatim into generated reference markdown. When a comment contained a bare `<Type>` sequence, VitePress's Vue-based markdown compiler parsed it as an unclosed HTML element and failed the docs build. These are now HTML-escaped before being written into reference markdown.
