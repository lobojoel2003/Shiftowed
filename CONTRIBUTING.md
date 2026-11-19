# Contributing to Shiftowed

Thanks for helping workers get paid what they're owed. There are two kinds of contribution, and both matter.

## 1. Fixing or adding a law (no coding needed)

Each Fair Workweek law lives in one JSON file in [`packages/rules/rules/`](packages/rules/rules). The format is described by
[`packages/rules/schema/jurisdiction.schema.json`](packages/rules/schema/jurisdiction.schema.json) and explained in the
[rules README](packages/rules/README.md).

House rules for rules data:

- **Primary sources only.** Every number needs a `citation` whose `url` points to the municipal code, statute, or the
  enforcing agency's own rules or guidance. Not news articles, law-firm blogs or vendor pages.
- **Quote, don't interpret.** Put the operative sentence in `citation.quote`. When Shiftowed simplifies something
  (for example, a "more than 15 minutes" threshold becomes `minChangeMinutes: 16`), say so in `notes`.
- **Set `lastVerified`** to the date you checked the source.
- **Add a scenario test** in `packages/rules/test/jurisdictions.test.ts` showing a change and the expected premium.

If you're not comfortable editing JSON, open a
[rules correction issue](https://github.com/lobojoel2003/Shiftowed/issues/new?template=rules-correction.yml) with the
source link and the exact wording. A maintainer will turn it into a pull request.

## 2. Working on the code

```bash
git clone https://github.com/lobojoel2003/Shiftowed.git
cd Shiftowed
npm install
npm run dev        # the app at http://localhost:5173
```

Useful scripts (run from the repository root):

| Command               | What it does                                                                       |
| --------------------- | ---------------------------------------------------------------------------------- |
| `npm run check`       | Format check, lint, type check, rules validation and unit tests. CI runs the same. |
| `npm test`            | Unit tests for the rules library and the app                                       |
| `npm run e2e`         | Playwright end-to-end tests against a production build (run `npm run build` first) |
| `npm run build`       | Builds the rules library and the app                                               |
| `npm run screenshots` | Regenerates the README screenshots from the sample data                            |
| `npm run format`      | Formats everything with Prettier                                                   |

Project layout:

```
packages/
  rules/   @shiftowed/rules: JSON rules, JSON Schema, TypeScript engine and CLI (MIT)
  app/     Shiftowed PWA: React, IndexedDB, on-device OCR, PDF export (GPL-3.0-or-later)
scripts/   Release, versioning and screenshot tooling
```

### Pull requests

- Keep each pull request focused, and add an entry under **Unreleased** in [`CHANGELOG.md`](CHANGELOG.md).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, e.g. `feat(app): ...`,
  `fix(rules): ...`, `docs: ...`.
- New behavior needs tests. The rules engine has a 90% line-coverage floor.
- Never commit real schedules, names or screenshots from real workers. Use made-up data.

## Licensing of contributions

By contributing you agree that your contributions to `packages/rules` are licensed under the MIT License, and your
contributions to everything else are licensed under the GNU GPL v3.0 or later.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
