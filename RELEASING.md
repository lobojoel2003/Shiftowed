# Releasing Shiftowed

Shiftowed uses [Semantic Versioning](https://semver.org/). The app, the rules library and the repository share one
version number, and every release is a git tag `vMAJOR.MINOR.PATCH`.

| Change                                                      | Bump  |
| ----------------------------------------------------------- | ----- |
| A law's numbers or citations corrected, bug fixes           | patch |
| New jurisdiction, new app feature                           | minor |
| Breaking change to the rules JSON format or the library API | major |

## Build numbers

Every CI run stamps the app with a build number (the GitHub Actions run number), the short commit hash and the build
date. They appear in **Settings > About** and on every exported evidence log, for example
`v1.0.0 (build 57, 1a2b3c4)`. Local builds say `build dev`.

## One-click release

1. Make sure everything you want to ship is listed under **Unreleased** in `CHANGELOG.md`.
2. In GitHub, open **Actions > Version bump > Run workflow** and pick `patch`, `minor`, `major` or `prerelease`.

The workflow bumps every `package.json`, moves the changelog entries under the new version, commits, tags, pushes and
starts the **Release** workflow.

## Manual release

```bash
node scripts/bump-version.mjs minor   # prints the new version, e.g. 1.1.0
npm install --package-lock-only
git commit -am "chore(release): v1.1.0"
git tag -a v1.1.0 -m "Shiftowed v1.1.0"
git push origin main v1.1.0
```

Pushing the tag starts the **Release** workflow.

## What the Release workflow does

1. Checks that the tag matches every `package.json` and that `CHANGELOG.md` has a section for it.
2. Runs format, lint, type, rules-schema and unit checks.
3. Builds the app and the library with the release build number.
4. Packages:
   - `shiftowed-pwa-vX.Y.Z.zip`: the installable web app, ready for any static host
   - `shiftowed-rules-X.Y.Z.tgz`: the `@shiftowed/rules` npm package
   - `shiftowed-rules-data-vX.Y.Z.zip`: the rules as plain JSON plus the JSON Schema
   - `SHA256SUMS.txt`
5. Publishes a GitHub release with notes taken from the changelog. Tags with a hyphen (`v1.2.0-rc.0`) become
   pre-releases.
6. Optionally publishes `@shiftowed/rules` to npm with provenance. To turn this on, set the repository variable
   `PUBLISH_NPM` to `true` and either configure
   [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) for this repository or add an `NPM_TOKEN` secret.

## Deploying the web app

The **Deploy app to GitHub Pages** workflow publishes `main` on every push. Enable it once under
**Settings > Pages > Build and deployment > Source: GitHub Actions**. Until then the workflow skips the deploy with a
notice instead of failing.
