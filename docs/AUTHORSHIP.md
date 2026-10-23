# Web UI authorship and provenance

Forge Web UI was extracted with its renderer path history from the original Forge application. It now owns the React workbench and thin Web launchers; runtime, providers and storage belong to Forge Core.

## Workstream credits

- Early workbench: Gemini 3.8 Flash, GLM 5.3 and GPT-6.1 Sol, with a GPT-6 Luna React audit.
- Redesign contract and visual/motion work: Gemini 3.8 Flash High.
- Shell, sidebar, inspector and modal shortcuts: MiMo V2.5 Pro.
- Conversation/composer, MCP labels, checkpoint danger handling and button busy feedback: Grok 4.7.
- Configuration/consent guards and CSS reconciliation: GPT-6.1 Sol.
- Mounted-test adaptation and private QA: DeepSeek V4.1 Flash.
- Composer placement, notices, reasoning slider, shortcuts, output-speed component and image UI (2026-10-17): Gemini 3.8 Flash through Forge. The main agent owned the earlier queue/state/bridge draft, reviewed accepted proposals and authored focused regressions.
- Native model-access renderer (2026-10-20): DeepSeek V4.1 Flash.

These credits cover accepted workstreams, not unsuccessful requests. The detailed chronology remains in this file's Git history; historical quota decisions and temporary invocation budgets are not current development instructions.

Current layout guidance is in [WEB_UI_LAYOUT_SPEC.md](WEB_UI_LAYOUT_SPEC.md), workflow in [WEB_DEV.md](WEB_DEV.md), and agent rules in [AGENTS.md](../AGENTS.md). Core's [authorship](https://github.com/Ling0925/forge-core/blob/master/docs/AUTHORSHIP.md) and [third-party notices](https://github.com/Ling0925/forge-core/blob/master/THIRD_PARTY_NOTICES.md) cover runtime and Magpie-derived model access. Historical screenshots and fixture passes do not establish acceptance of the current deployed UI.
