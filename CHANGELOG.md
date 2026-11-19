# Changelog

All notable changes to Shiftowed are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The app and the `@shiftowed/rules` library share one version.

## [Unreleased]

## [1.0.0] - 2026-11-19

The first release of Shiftowed: a Fair Workweek predictability-pay calculator for hourly workers.

### Added

#### App (PWA)

- Offline-first progressive web app that installs to the home screen, with an update prompt that never interrupts a
  half-filled form.
- Onboarding: choose your law, hourly rate and pay period, or explore with sample data.
- Add schedules three ways: scan a screenshot, type shifts in, or log a quick change ("sent home early", "asked to stay
  late", "shift cancelled", "extra shift").
- On-device OCR with Tesseract (WebAssembly), served by the app itself. It reads list and grid layouts, 12- and 24-hour
  times, and dark-mode screenshots, then lets you review every shift before saving.
- A live preview of what each update changes and what it's worth, before you save it.
- A running total of what you're owed for each pay period (weekly, every two weeks, twice a month, monthly), with every
  change listed alongside its notice, premium, formula and citation.
- Exception picker for every finding ("I asked for this change", "shift swap", and so on), each with its citation.
- Schedule view by week, version history, and version detail with screenshot, OCR text and SHA-256 fingerprints.
- SHA-256 hash chain across schedule versions, with an integrity check and an activity log of edits and deletions.
- Evidence export: a dated PDF (findings, citations and source links, version fingerprints, activity log, optional
  screenshots), CSV, and a full JSON backup with restore.
- English and Spanish interface.
- Build number, commit and version shown in Settings and stamped on every export.
- Accessible (WCAG 2 AA checks with axe), responsive, light and dark themes, strict Content-Security-Policy.

#### Rules library (`@shiftowed/rules`)

- Open-data rules, one JSON file per law, with a citation and primary-source link for every number:
  New York City fast food and retail, Philadelphia, Oregon, Seattle, Chicago, Evanston, Los Angeles city and county
  (retail), San Francisco formula retail, Emeryville and Berkeley.
- JSON Schema (draft 2020-12) and semantic validation for rules files.
- Engine that applies schedule versions to a timeline, matches shifts, classifies changes, and prices them with
  per-rule notice windows measured to the shift or to the first day of the work schedule, minimum-change thresholds,
  stacked rule groups, prohibitions, exceptions, rest-between-shift premiums and late-posting violations.
- Amount types: flat, hours of pay (optionally pro-rated), per hour lost, capped hours of pay, hours of pay by shift
  length, and per rest hour (window or whole second shift).
- DST-aware time handling with no dependencies, and money computed in integer cents.
- `shiftowed-rules` CLI: `list`, `show`, `evaluate`.

#### Project

- CI on every push and pull request: formatting, lint, type checks, rules validation, unit tests on Node 22 and 24
  with coverage, builds, a packed-CLI smoke test, and Playwright end-to-end tests (worker journey, OCR, offline,
  accessibility, layout in both languages).
- Release workflow that verifies the tag and changelog, then publishes the PWA zip, the npm tarball, the rules data zip
  and SHA-256 checksums to a GitHub release. Publishing to npm is opt-in.
- GitHub Pages deployment, a one-click version-bump workflow, CodeQL, dependency review and Dependabot.
- Contributor guide, security policy, code of conduct, and issue and pull request templates.

[Unreleased]: https://github.com/lobojoel2003/Shiftowed/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lobojoel2003/Shiftowed/releases/tag/v1.0.0
