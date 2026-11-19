## What does this change?

<!-- One or two sentences. Link the issue if there is one. -->

## Type

- [ ] Rules data (a law's numbers, citations or a new jurisdiction)
- [ ] App
- [ ] Rules engine or library
- [ ] Docs, CI or tooling

## For rules changes

- [ ] Every new or changed number has a `citation` with a primary-source URL
- [ ] `lastVerified` is set to the day I checked the source
- [ ] I added or updated a scenario test in `packages/rules/test/jurisdictions.test.ts`

## Checklist

- [ ] `npm run check` passes (format, lint, types, rules validation, unit tests)
- [ ] `npm run e2e` passes, if the app changed
- [ ] `CHANGELOG.md` has an entry under **Unreleased**
