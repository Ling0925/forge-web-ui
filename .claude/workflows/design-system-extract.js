export const meta = {
  name: 'design-system-extract',
  description: 'Extract the authoritative design system from forge-web-ui and adversarially verify every number',
  phases: [
    { title: 'Extract', detail: 'six parallel readers over color, type, space, layout, components, a11y' },
    { title: 'Verify', detail: 'recompute every contrast ratio, count and effective token value' },
    { title: 'Critique', detail: 'completeness critic: what would a maintainer still not know' },
  ],
}

const ROOT = '/home/ling/services/desktop-harness/repos/forge-web-ui/src/renderer'

const COMMON = `
Repo root for renderer source: ${ROOT}
The effective theme is the CASCADE RESULT, not either file alone. Load order:
  main.tsx -> styles/global.css -> styles/tokens.css (@import) -> styles/workspace-theme.css -> styles/sidebar-compact.css
  App.tsx  -> components/workbench/workbench.css -> app.css -> workbench-header.css -> new-session.css -> inspector.css -> styles/motion.css
  each component imports its own sheet; Settings/UsageDashboard/PrimitiveShowcase are lazy chunks appended at runtime.
So a token declared in both styles/tokens.css and styles/workspace-theme.css takes the workspace-theme value.
Also read dist/renderer/assets/*.css (the built bundle) when you need to confirm which declaration actually won.

Report ONLY facts you read in source. Never guess. If something is ambiguous, say so explicitly.
Always give file:line for every claim.
`

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '5-10 sentences: what this dimension actually is, in the built product' },
    tables: {
      type: 'array',
      description: 'Dense reference tables. Each row will be rendered into a markdown table.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        },
        required: ['title', 'columns', 'rows'],
      },
    },
    deviations: {
      type: 'array',
      description: 'Measured drift: things that contradict the system or the spec',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string', description: 'file:line plus the concrete value' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
        required: ['claim', 'evidence', 'severity'],
      },
    },
    notes: { type: 'array', items: { type: 'string' }, description: 'Caveats, ambiguities, things the cascade makes unpredictable' },
  },
  required: ['summary', 'tables', 'deviations', 'notes'],
}

const DIMENSIONS = [
  {
    key: 'color',
    prompt: `${COMMON}
TASK: Produce the authoritative COLOR reference.
1. Enumerate EVERY CSS custom property that carries a color, in styles/tokens.css, styles/workspace-theme.css, styles/global.css, and any component sheet that declares one (e.g. --chart-series, --context-*, --chart-completion, --usage-run-color).
2. For each: its LIGHT effective value and DARK effective value as actually rendered (resolve the cascade), plus the file:line where it loses and where it wins.
3. Group them: surfaces, text inks, borders, accent, semantic states, charts, shadows, aliases (--neutral-*, --surface-body, etc).
4. List every color that appears as a literal hex/rgb in a component sheet instead of a token, grouped by file, with counts. Distinguish legitimate (inside styles/tokens.css or workspace-theme.css, or a data-URI) from drift.
5. Identify which custom properties are REFERENCED but never DEFINED. Grep for var(--x) across all css and compare against definitions. Give the exact list with every reference site.
6. Report the two competing palettes if they exist (zinc/emerald in tokens.css vs warm paper in workspace-theme.css) — which properties each owns after the cascade.`,
  },
  {
    key: 'type',
    prompt: `${COMMON}
TASK: Produce the authoritative TYPOGRAPHY reference.
1. Font families: the exact stacks, how they load, what CJK resolves to, whether anything is self-hosted or remote.
2. The declared scale in tokens.css: every --text-* and --leading-* with value and where each is USED (count and representative sites) and which are UNUSED.
3. The scale actually rendered, per surface: global, transcript prose, composer, header, sidebar, settings, inspector, usage dashboard, code, tool disclosure, charts. Give size / line-height / weight / letter-spacing for each role with file:line.
4. Every hardcoded font-size in px: the full value distribution with counts, and per-file counts. Identify values that are off any plausible scale.
5. Font weights actually used, including any non-standard variable-font weights (e.g. 450, 550, 650).
6. Letter-spacing values in use and where.
7. Whether numbers use --font-mono + font-variant-numeric: tabular-nums where the spec requires it; list violations.`,
  },
  {
    key: 'space',
    prompt: `${COMMON}
TASK: Produce the authoritative SPACING / RADIUS / ELEVATION / MOTION reference.
1. The spacing scale in tokens.css; then the actual distribution of hardcoded padding/margin/gap px values with counts, and how many are off the 4px grid.
2. The radius scale: every --radius-* token with value and use count; every literal radius in component sheets with count; note duplicate/competing definitions of the same object.
3. Shadows: every --shadow-* token (light and dark, and whether the dark version differs in layer count), plus every ad-hoc box-shadow outside tokens.
4. Z-index values in use and whether there is a scale.
5. Motion: every duration and easing token (note there are two or three parallel vocabularies), the keyframes inventory, and how prefers-reduced-motion is handled across sheets — list any animation NOT covered by a reduced-motion guard (including JS-driven animation such as ECharts animationDuration).
6. Transitions declared as \`all\` — where, and why that is risky.`,
  },
  {
    key: 'layout',
    prompt: `${COMMON}
TASK: Produce the authoritative LAYOUT reference.
1. The app shell DOM structure (top-level regions and their classes) and the CSS grid/flex that places them, per breakpoint. Quote the actual rules.
2. Every layout dimension token and its EFFECTIVE value after workspace-theme overrides (rail width, compact rail, header height, inspector width, compact inspector, reading measure, control heights, composer inset, touch target).
3. Every breakpoint actually used, as a frequency table (how many component sheets use 480/640/768/1000/1001/1366/etc), and what each major one switches.
4. Content measures: transcript reading column, welcome column, composer width, settings section width, dashboard width, inspector text column. Compute approximate characters-per-line for the reading column at its font size.
5. Horizontal and vertical padding/inset for each major region — list them side by side to expose misalignment.
6. Responsive behaviour at <=1000px, <=768px, and 390px: what changes, and any rule that is defeated by specificity (check the built bundle to confirm which wins).`,
  },
  {
    key: 'components',
    prompt: `${COMMON}
TASK: Produce the authoritative COMPONENT reference.
1. Inventory the primitives under components/primitives/ — for each: purpose, DOM root, variants, sizes, states, and whether it is actually used in the app or only in the showcase.
2. The card object: enumerate every bordered container in the product (inspector section/card, settings card/entry/panel, agent profile card/editor section, MCP card, plugin card, advisor card, child session card, tool disclosure, code block, diff viewer, approval panel, chart card, user message, composer). For each give radius / border / fill / shadow / padding. This exposes whether one object has many treatments.
3. Status representation: every badge/pill/chip class, its size, radius, and colour source; note shapes that differ for the same semantic status.
4. Empty / error / loading states: every distinct treatment with file:line, and which primitive (if any) each should have used.
5. Buttons: every button-ish class in the product and its geometry (height, padding, radius, font). Expose collapse in the size API.
6. Controls: native vs custom select/checkbox usage — exact counts and sites. Single-line truncated text and whether it keeps a title attribute.
7. Tables/lists/key-value: how <dl> pairs are laid out in each place (grid columns, nowrap, wrapping).`,
  },
  {
    key: 'a11y',
    prompt: `${COMMON}
TASK: Produce the authoritative ACCESSIBILITY & INTERACTION reference.
1. Focus: the global :focus-visible rule; then every place that suppresses it (outline:none / outline:0) and whether a replacement indicator exists. List each with file:line and the element it affects.
2. Keyboard reachability: any control that is visually hidden until hover (opacity:0 / visibility / pointer-events:none) and whether it has a :focus-within reveal. Any control removed from flow but still tabbable.
3. Icon-only controls: are they all labelled? Count aria-label vs title coverage; list gaps.
4. Live regions and alert roles: count and where; is there any transient notification layer at all.
5. Modal/dialog behaviour: which modals use native <dialog>, which are custom; focus containment and Escape handling for each; whether background content is made inert.
6. Touch targets: which controls meet 44px at coarse pointer, which do not.
7. Contrast: compute WCAG 2.x ratios (use the standard sRGB relative-luminance formula) for every text/surface pair that the product actually uses — at minimum each ink token against each surface token in both themes, plus every semantic state ink against its own tinted background, plus every literal colour used as text. Report each pair's ratio and whether it passes 4.5:1 (normal text) / 3:1 (large text or UI). Show the arithmetic you used for at least three pairs so it can be checked.`,
  },
]

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'wrong', 'imprecise'] },
          correction: { type: 'string', description: 'the true value if wrong or imprecise; empty if confirmed' },
          evidence: { type: 'string' },
        },
        required: ['claim', 'verdict', 'correction', 'evidence'],
      },
    },
    missed: { type: 'array', items: { type: 'string' }, description: 'Facts in this dimension the extractor omitted but a maintainer would need' },
  },
  required: ['checks', 'missed'],
}

phase('Extract')
const extracted = await parallel(
  DIMENSIONS.map((d) => () =>
    agent(d.prompt, { label: `extract:${d.key}`, phase: 'Extract', schema: EXTRACT_SCHEMA, effort: 'high' })
      .then((r) => (r ? { key: d.key, ...r } : null)),
  ),
)

const ok = extracted.filter(Boolean)
log(`extracted ${ok.length}/6 dimensions`)

phase('Verify')
const verified = await pipeline(
  ok,
  (dim) =>
    agent(
      `${COMMON}
TASK: Adversarially verify the extract below. Your job is to find what is WRONG, not to agree.

Rules:
- Re-read the source for every numeric or named claim. Recompute every contrast ratio with the WCAG 2.x sRGB formula yourself.
- Recompute every COUNT by re-running the grep; extractors routinely miscount.
- For every "effective value after cascade" claim, confirm in dist/renderer/assets/*.css which declaration actually won.
- Mark a claim 'wrong' if the value differs, 'imprecise' if the direction is right but the number/filename/line is off, 'confirmed' only if you independently reproduced it exactly.
- Then list what the extractor MISSED that a maintainer of this design system would need.

Extract for dimension "${dim.key}":
${JSON.stringify({ summary: dim.summary, tables: dim.tables, deviations: dim.deviations, notes: dim.notes }).slice(0, 60000)}`,
      { label: `verify:${dim.key}`, phase: 'Verify', schema: VERIFY_SCHEMA, effort: 'high' },
    ).then((v) => ({ ...dim, verification: v })),
)

const good = verified.filter(Boolean)
const wrongCount = good.reduce(
  (n, d) => n + ((d.verification && d.verification.checks) || []).filter((c) => c.verdict !== 'confirmed').length,
  0,
)
log(`${wrongCount} claims needed correction`)

phase('Critique')
const critique = await agent(
  `${COMMON}
A design-system reference document is being written for this repo, to live at docs/DESIGN_SYSTEM.md.
Its job: a maintainer who has never seen this codebase can read it and correctly predict what will render, then add a new surface that fits.

Here is everything gathered:
${JSON.stringify(
  good.map((d) => ({
    key: d.key,
    summary: d.summary,
    tables: d.tables,
    deviations: d.deviations,
    notes: d.notes,
    corrections: (d.verification && d.verification.checks || []).filter((c) => c.verdict !== 'confirmed'),
    missed: (d.verification && d.verification.missed) || [],
  })),
).slice(0, 120000)}

Answer these, concretely and with file:line where relevant:
1. Which decisions does a maintainer still have to guess? Name the gaps.
2. What in the gathered data is CONTRADICTORY between dimensions (e.g. a radius the component reader reports differently from the space reader)?
3. Which "deviations" are actually DELIBERATE choices that the document should present as canonical rather than as bugs? Be specific — this matters, a reference doc that calls intentional design a defect is worse than useless.
4. What are the five or six most important invariants — the rules that, if a change violates them, will visibly break the product?
5. Anything in the data that reads as a hallucination or an unverifiable claim that should be dropped.

Return plain prose with headed sections. Be blunt.`,
  { label: 'completeness-critic', phase: 'Critique', effort: 'max' },
)

return {
  dimensions: good.map((d) => ({
    key: d.key,
    summary: d.summary,
    tables: d.tables,
    deviations: d.deviations,
    notes: d.notes,
    corrections: ((d.verification && d.verification.checks) || []).filter((c) => c.verdict !== 'confirmed'),
    missed: (d.verification && d.verification.missed) || [],
  })),
  critique,
}
