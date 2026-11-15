# evidence-gated-build

A small demonstration of a build tool that is refuse-by-default. The domain is a toy: "card layouts". A layout spec (stack, row, grid, overlay or carousel) is compiled to absolutely positioned HTML.

The "reference" in `reference/render.mjs` is a second, deliberately simple and slow implementation of the same geometry. It stands in for an external tool you do not control. It is not a real external tool.

## The four ideas

1. **Refuse by default, with no override.** The compiler handles only the kinds listed in `evidence/rules.json`. Anything else throws `Refused` (exit code 3) and names the kind. There is no flag, option or environment variable that bypasses this. `check-corpus` also fails if a kind is enabled with fewer than 3 stored corpus pairs, so `rules.json` cannot enable a kind without recorded evidence.
2. **Corpus plus canary.** `evidence/corpus/` stores pairs of `{spec, expected}` produced by the reference. `check-corpus` compiles each spec and compares it to the stored output. The canary re-runs the reference on every stored spec and fails if the reference no longer produces the stored output, which means the reference changed since the evidence was recorded. `canary --refresh` rewrites the stored outputs. That is a human decision, never automatic.
3. **Verify with numbers.** `verify` parses the compiled HTML (ignoring the per-run build-stamp comment) and compares every box and the container height with the reference geometry. It prints the maximum drift in px and the per-item drift, and fails above a tolerance (default 0 px).
4. **Report in-sample and held-out separately.** The corpus pairs were used to write the rules, so their results are labelled `in-sample`. `heldout/` holds specs that were not used for that, and `scripts/heldout.mjs` labels its results `held-out`.

## Usage

Requires Node 20 or newer. There are no dependencies.

```
node src/cli.mjs build examples/stack.json --out out.html   # compile, then verify
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

This runs `node --test test/` with `node:test` and `node:assert/strict`.

## Results

in-sample: 12 identical, 0 different, 2 refused (the two overlay pairs, by design).
held-out: 6 identical, 0 different, 0 refused (6 specs written after the compiler, not used to write the rules).

## Decisions

- **Refusal has no override.** Reason: an override turns "no evidence" into "trust me" and the gate stops meaning anything. Cost: a kind without evidence cannot be built by this tool at all.
- **A kind needs at least 3 corpus pairs before it can be enabled.** Reason: one or two pairs can pass by coincidence. Cost: the number 3 is a judgement, not a measured threshold.
- **`rules.json` is the only place a kind is enabled.** Reason: one file to review. Cost: adding a kind also needs a compiler rule in code and corpus pairs, so three places change together.
- **The corpus stores the reference's output, not hand-written expectations.** Reason: the pairs track what the reference really does. Cost: if the reference is wrong, the corpus is wrong with it, and the canary only tells you it changed.
- **Verification recomputes geometry from the reference rather than reusing the compiler's own boxes.** Reason: it checks the emitted HTML, not the compiler's opinion of itself. Cost: verify needs the reference at run time.
- **Default tolerance is 0 px.** Reason: the geometry is integer arithmetic, so any drift is a bug. Cost: a tolerance has to be requested explicitly, which makes loose checks visible.
- **The build-stamp comment is ignored by verify.** Reason: it changes on every run by design. Cost: verify does not check the comment, so it cannot be used to tamper-check provenance.

## Limits

- The domain is a toy, and the reference is a second implementation written by the same author. Agreement between the two shows consistency, not correctness against anything external.
- In-sample figures overstate quality, because the rules were written while looking at those pairs. Only the held-out figures say anything about unseen input, and six specs is a small sample.
- The canary only detects change it can see: a different output for the stored specs. A change in the reference that affects only unstored inputs goes unnoticed.
- Refusal means a person must do that kind by hand. Supporting a new kind means writing a rule, recording at least 3 corpus pairs and enabling it in `rules.json`.
- `verify` parses the HTML with regular expressions that match the compiler's own output format. It is not a general HTML parser.
- Grid column width ignores each item's own `w`; cells are uniform. Specs where `width` is too small for the columns and gaps are not validated.

## Held-out findings

None of the six held-out specs exposed a disagreement between the compiler and the reference. That says little: the sample is small and I chose the cases, so the next step would be generated specs rather than hand-picked ones.

## Licence

MIT. See [LICENSE](LICENSE).
