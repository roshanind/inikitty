import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'cursor',
  category: 'ai-format',
  label: 'Cursor',
  description:
    'Generates a thin .cursor/rules/agents.mdc that points Cursor at AGENTS.md -- Cursor looks ' +
    'for rules under .cursor/rules/ by convention, but AGENTS.md stays the single real source of ' +
    'truth. Purely additive; works with or without any bundle selected, since AGENTS.md always exists.',
};
