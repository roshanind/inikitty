import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'claude-code',
  category: 'ai-format',
  description:
    'Generates a thin CLAUDE.md at the project root that points at AGENTS.md — Claude Code looks ' +
    'for CLAUDE.md by convention, but AGENTS.md stays the single real source of truth. Purely ' +
    'additive; works with or without any bundle selected, since AGENTS.md always exists.',
};
