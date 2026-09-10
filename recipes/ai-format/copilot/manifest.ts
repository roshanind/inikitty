import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'copilot',
  category: 'ai-format',
  label: 'GitHub Copilot',
  description:
    'Generates a thin .github/copilot-instructions.md that points GitHub Copilot at AGENTS.md ' +
    "-- Copilot Chat automatically includes this file's content in every request in the " +
    'repository, but AGENTS.md stays the single real source of truth. Purely additive.',
};
