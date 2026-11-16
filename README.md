# evidence-gated-build

A build tool that is refuse-by-default: it compiles only what recorded evidence covers, proves every output with numbers, and names what it will not build. The domain is "card layouts" in an invented format, so the method is the subject. A layout spec (stack, row, grid, overlay or carousel) compiles to absolutely positioned HTML, and a design-export ingest stage turns a design file into an editable plan in front of the compiler.

## Scope

- **An invented layout format.** Card layouts and design exports are defined here, in this repository, so every rule can be read, run and tested end to end.
- **A reference renderer that stands in for an external tool.** `reference/render.mjs` is a second implementation of the same geometry, written to be simple and independent. It plays the part of a tool you do not control, and the corpus, canary and verify stages are built around it.
- **Held-out specs written after the compiler.** `heldout/` holds specs that were written once the compiler existed and were not used to write its rules, so unseen input is measured separately from the evidence.
- **A design-export ingest stage.** `src/ingest.mjs` reads an invented design format, infers the layout kind from geometry, produces one editable plan, and checks the compiled result against the design for text and numbers.

## The four ideas

1. **Refuse by default, with no override.** The compiler handles the kinds listed in `evidence/rules.json`. Anything else throws `Refused` (exit code 3) and names the kind. No flag, option or environment variable changes that. `check-corpus` also fails if a kind is enabled with fewer than 3 stored corpus pairs, so `rules.json` enables a kind only with recorded evidence.
2. **Corpus plus canary.** `evidence/corpus/` stores pairs of `{spec, expected}` produced by the reference. `check-corpus` compiles each spec and compares it to the stored output. The canary re-runs the reference on every stored spec and fails if the reference no longer produces the stored output, which signals that the reference changed since the evidence was recorded. `canary --refresh` rewrites the stored outputs as an explicit human decision.
3. **Verify with numbers.** `verify` parses the compiled HTML (ignoring the per-run build-stamp comment) and compares every box and the container height with the reference geometry. It prints the maximum drift in px and the per-item drift, and fails above a tolerance (default 0 px).
4. **Report in-sample and held-out separately.** The corpus pairs were used to write the rules, so their results are labelled `in-sample`. `heldout/` holds specs written after the compiler, and `scripts/heldout.mjs` labels its results `held-out`.

## Design sources

The ingest stage reads an invented design export and puts a person-editable plan between the design and the compiler. The design export is JSON (excerpt of `examples/design-stack.json`):

```json
{
  "artboard": { "w": 320, "h": 288 },
  "nodes": [
    { "id": "title", "type": "text", "box": { "x": 16, "y": 16, "w": 288, "h": 32 },
      "text": "Spring collection", "ink": { "x": 18, "y": 22, "w": 171, "h": 20 } },
    { "id": "image", "type": "rect", "box": { "x": 16, "y": 60, "w": 288, "h": 160 } }
  ]
}
```

`type` is `text` or `rect`. `box` is the node's layout box. `ink` is optional and holds the tight glyph bounds.

Six rules:

1. **Layout from boxes, not ink.** Positions come from each node's layout box. `ink` is never read for layout, and a test shows that a drifted or absent `ink` leaves the plan and the output unchanged.
2. **Kind inference by geometry.** Overlapping boxes mean `overlay`. Nodes that share an x and stack vertically mean `stack`. Nodes that share a y mean `row`. A regular lattice (equal cell widths, equal column pitch, rows filled left to right) means `grid`. The kind then goes to the existing compiler. `overlay` has no corpus evidence, so the compiler refuses it with exit 3 and the ingest stage passes that refusal through unchanged. A layout that matches none of the four is named `freeform` and is refused the same way.
3. **One editable plan.** `ingest` writes `plan.json` (kind, width, gap, padding, columns where relevant, and items with ids, sizes and text) and the compiler `spec.json`. Each plan item also records the design box and design text it must reproduce. A person edits the plan and runs `build-plan` again.
4. **Word-for-word text check.** After compiling, the visible text of every item is extracted from the output HTML and compared with the design node text, whitespace-normalised. A mismatch fails with exit 2 and names the node id.
5. **Numeric verify against the design.** The same `verify` stage compares every compiled box and the container height with the design boxes and the artboard height, and reports the maximum drift in px. The tolerance defaults to 0. The compiled output is also compared with the reference geometry.
6. **Malformed exports are refused.** A missing box, a negative size, a duplicate id or a text node without text fails with exit 4 and a message that names the node.

```
node src/cli.mjs ingest examples/design-stack.json --plan plan.json --spec spec.json
node src/cli.mjs build-plan plan.json --out out.html
node src/cli.mjs ingest examples/design-row.json --plan row-plan.json
node src/cli.mjs ingest examples/design-overlay.json      # refused: no evidence for overlay (exit 3)
node src/cli.mjs ingest examples/design-bad.json          # malformed export (exit 4)
```

`ingest` and `build-plan` accept `--tolerance N` (px, default 0). `ingest` writes the plan and spec first, then runs the same text and numeric checks that `build-plan` runs.

Exit codes for `ingest` and `build-plan`: 0 ok, 2 verification or text mismatch, 3 refused, 4 malformed export. Exit 1 reports a usage error or an unreadable file.

## Usage

Requires Node 20 or newer. There are no dependencies.

```
node src/cli.mjs build examples/stack.json --out out.html   # compile, then verify
node src/cli.mjs ingest <design.json> --plan plan.json --spec spec.json
node src/cli.mjs build-plan plan.json --out out.html        # compile a plan, check text and numbers
node src/check-corpus.mjs                                   # in-sample check + evidence rule
node src/canary.mjs                                         # has the reference changed?
node src/canary.mjs --refresh                               # accept the reference's current output
node src/verify.mjs spec.json out.html --tolerance 1        # verify any compiled file
node scripts/heldout.mjs                                    # held-out comparison
node scripts/make-corpus.mjs                                # regenerate the corpus from the reference
```

Exit codes: `cli build` returns 0 ok, 2 verification failed, 3 refused. `verify` returns 2 on drift above tolerance. `check-corpus` and `canary` return 1 on a failure. `examples/overlay.json` demonstrates a refusal.

## Tests

```
npm test
```

This runs `node --test test/*.test.mjs` with `node:test` and `node:assert/strict` over four files (28 tests): `test/canary.test.mjs` (the canary and `--refresh`), `test/corpus.test.mjs` (the corpus check, refusal with no override and the evidence rule), `test/verify.test.mjs` (numeric verification and drift) and `test/ingest.test.mjs`, which covers the ingest stage: layout ignoring ink, kind inference, refusal propagation, text match and mismatch, drift from the design, malformed exports and the plan edit round trip.

## Results

in-sample: 12 identical, 0 different, 2 refused (the two overlay pairs, by design).
held-out: 6 identical, 0 different, 0 refused (6 specs written after the compiler, not used to write the rules).

## Decisions

- **Refusal has no override.** Reason: an override turns "no evidence" into "trust me" and the gate stops meaning anything. A kind without evidence gains evidence first.
- **A kind needs at least 3 corpus pairs before it can be enabled.** Reason: one or two pairs can pass by coincidence.
- **`rules.json` is the only place a kind is enabled.** Reason: one file to review. A new kind arrives as a compiler rule, corpus pairs and a `rules.json` entry together.
- **The corpus stores the reference's output, not hand-written expectations.** Reason: the pairs track what the reference really does, and the canary flags when that changes.
- **Verification recomputes geometry from the reference rather than reusing the compiler's own boxes.** Reason: it checks the emitted HTML, not the compiler's opinion of itself.
- **Default tolerance is 0 px.** Reason: the geometry is integer arithmetic, so any drift is a bug. A looser tolerance is requested explicitly, which keeps it visible.
- **The build-stamp comment is ignored by verify.** Reason: it changes on every run by design.
- **Layout comes from the design's layout boxes, never from ink bounds.** Reason: tight glyph bounds shift with fonts and rendering, so spacing derived from them drifts. Layout boxes are stable.
- **The ingest stage does not catch the compiler's refusal.** Reason: `overlay` and `freeform` have no corpus evidence, and the refusal reaches the user with its own exit code 3.
- **The plan is a plain JSON file that a person edits and re-runs.** Reason: every decision between the design and the output is visible and repeatable.
- **Each plan item records the design box and design text.** Reason: the checks compare the compiled output with the design itself, so an edit to the plan is measured against the source.
- **Malformed exports are refused with their own exit code, 4.** Reason: bad input is separated from a refusal for missing evidence (3) and from a failed check (2).

## Licence

MIT. See [LICENSE](LICENSE).
