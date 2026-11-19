# @shiftowed/rules

**Fair Workweek laws as open data, plus a small TypeScript engine that turns a worker's schedule history into
predictability-pay findings, each with a citation.**

This is the law library inside [Shiftowed](https://github.com/lobojoel2003/Shiftowed). It is MIT licensed, has no
dependencies, and runs in browsers and Node 20+.

```bash
npm install @shiftowed/rules
```

## What's inside

- **`rules/*.json`**: one file per law. Advance-notice rules, premium tiers, rest-between-shift premiums, exceptions,
  coverage, the enforcing agency, and a citation with a primary-source link for every number.
- **`schema/jurisdiction.schema.json`**: the JSON Schema (draft 2020-12) every file must pass.
- **An engine** that diffs schedule versions, classifies each change, and prices it under a law.
- **A CLI**, `shiftowed-rules`, for worker centers and advocates who want answers without the app.

## Quick start

```ts
import { evaluate, formatCents, getJurisdiction } from "@shiftowed/rules";

const seattle = getJurisdiction("us-wa-seattle")!;

const versions = [
  {
    id: "posted",
    postedAt: "2026-11-01T17:00:00Z", // when the employer posted it (an instant)
    periodStart: "2026-11-16", // dates this version covers
    periodEnd: "2026-11-22",
    shifts: [{ id: "a", start: "2026-11-16T09:00", end: "2026-11-16T17:00" }], // local wall-clock times
  },
  {
    id: "cut",
    postedAt: "2026-11-15T03:30:00Z", // Saturday evening in Seattle
    periodStart: "2026-11-16",
    periodEnd: "2026-11-16",
    shifts: [{ id: "a2", start: "2026-11-16T09:00", end: "2026-11-16T13:00" }],
  },
];

const result = evaluate(seattle, versions, { hourlyRate: 20 });
for (const f of result.findings) {
  console.log(
    f.change?.kind,
    formatCents(f.cents),
    f.lines.map((l) => l.citation.code),
  );
}
// reduce $40.00 [ 'SMC 14.22.050.A.2' ]
```

## How the engine works

1. **Timeline.** Versions are applied in `postedAt` order. Each version replaces the shifts inside its own
   `periodStart`..`periodEnd`, so posting next week's schedule never cancels this week's shifts.
2. **Matching.** Inside the overlap, old and new shifts are paired: identical times first, then by largest overlap,
   then by same start date, then equal-length shifts moved within six days.
3. **Classification.** Each difference becomes `add`, `extend`, `move`, `reduce` or `cancel`, with `hoursDelta`,
   `changeMinutes` and `noticeHours` (from `postedAt` to the earliest affected start, so a change made after a shift
   started has negative notice).
4. **Pricing.** For each rule group, the first premium whose change kinds, notice window and `minChangeMinutes` match
   is applied. Groups stack. A worker-selected exception removes the lines it covers.
5. **Rest and late postings.** Rest rules run over the current schedule; any newly covered dates posted with less than
   the required notice become a `late-posting` violation.

All money is computed in integer cents. All time math is DST-aware and uses the law's IANA time zone.

## The data format

A trimmed example (see the schema for every field):

```jsonc
{
  "id": "us-wa-seattle",
  "timeZone": "America/Los_Angeles",
  "advanceNotice": {
    "hours": 336,
    "label": "14 calendar days",
    "citation": { "code": "SMC 14.22.040", "url": "https://..." },
  },
  "premiums": [
    {
      "id": "hours-lost",
      "group": "schedule-change",
      "label": "Hours cut or shift cancelled after the schedule was posted",
      "on": ["reduce", "cancel"],
      "notice": { "maxHours": 336 }, // [minHours, maxHours): "less than 14 days"
      "minChangeMinutes": 16, // "more than 15 minutes"
      "amount": { "type": "perLostHour", "multiplier": 0.5 },
      "exceptions": ["employee-requested", "shift-swap"],
      "citation": { "code": "SMC 14.22.050.A.2", "url": "https://...", "quote": "..." },
    },
  ],
  "rest": [
    {
      "id": "rest",
      "minRestHours": 10,
      "amount": { "type": "perRestHour", "multiplier": 0.5 },
      "citation": { "...": "..." },
    },
  ],
}
```

Amount types:

| `type`                    | Meaning                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `flat`                    | A fixed amount per change, e.g. NYC's $10 to $75 tiers                               |
| `hoursOfPay`              | N hours at the regular rate, optionally pro-rated for additions under N hours        |
| `perLostHour`             | `multiplier` x rate x hours lost, e.g. half-time for hours not worked                |
| `hoursOfPayByShiftLength` | Hours of pay that depend on the shift's length, e.g. San Francisco                   |
| `perRestHour`             | Extra `multiplier` x rate per hour inside the rest window, or the whole second shift |

`prohibitions` describe changes a law forbids outright (for example NYC retail's 72-hour rule). Matching changes with no
premium are reported as violations so the worker can report them.

## CLI

```bash
npx shiftowed-rules list
npx shiftowed-rules show us-or-oregon
npx shiftowed-rules evaluate us-wa-seattle versions.json --rate 20
npx shiftowed-rules evaluate us-wa-seattle versions.json --rate 20 --json
```

## Accuracy and contributions

The rules were checked against the codes and agency guidance on the `lastVerified` date in each file. Laws change.
If you spot a difference, please open a
[rules correction issue](https://github.com/lobojoel2003/Shiftowed/issues/new?template=rules-correction.yml) with a
primary-source link, or send a pull request. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

This library is a calculator, not legal advice.

## License

[MIT](LICENSE)
