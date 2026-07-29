---
'@skillit/core': patch
---

Fix a crash when writing skills whose description contains a newline.

`quoteYaml()` wrapped multi-line descriptions in double quotes without
escaping the embedded newlines, producing invalid YAML. Consuming that
same invalid frontmatter back (in `shouldPreserveExistingSkill`, when
deciding whether to preserve an already-installed skill) then threw,
since that code path - unlike `readSkillMetadata` for the on-disk file -
had no lenient-parser fallback. Newlines are now escaped correctly, and
`shouldPreserveExistingSkill` falls back to the lenient parser like its
sibling function already did.
