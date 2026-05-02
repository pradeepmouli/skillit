# typedoc-plugin-to-skills

Auto-discovery wrapper for [`@to-skills/typedoc`](https://github.com/pradeepmouli/to-skills/tree/master/packages/typedoc).

TypeDoc auto-discovers packages named `typedoc-plugin-*`. This package re-exports `@to-skills/typedoc` so you get zero-config setup:

```bash
# Install
pnpm add -D typedoc-plugin-to-skills

# Run TypeDoc as normal — skills are generated automatically
pnpm typedoc
```

No need to add anything to the `plugin` array in `typedoc.json`.

If you want generated skills copied into agent discovery roots as part of the
TypeDoc run, add `skillsInstallTargets`:

```json
{
  "skillsInstallTargets": [".claude/skills", ".agents/skills"]
}
```

When install targets are configured, the plugin installs both the generated
skills and the bundled `to-skills-docs` guidance skill into each target.

For configuration options, see the [@to-skills/typedoc docs](https://github.com/pradeepmouli/to-skills/tree/master/packages/typedoc).

## License

MIT
