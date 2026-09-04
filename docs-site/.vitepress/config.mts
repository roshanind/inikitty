import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid({
  title: 'Inikitty',
  description: 'How the Inikitty generator engine works, and what it actually builds.',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: 'Overview', link: '/' },
      { text: 'GitHub', link: 'https://github.com/roshanind/inikitty' },
    ],

    sidebar: [
      {
        text: 'Engine internals',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Recipes & bundles', link: '/recipes' },
          { text: 'The generation pipeline', link: '/pipeline' },
          { text: 'A full CLI run', link: '/cli-flow' },
        ],
      },
      {
        text: 'Case study',
        items: [{ text: 'Wiring up authentication', link: '/auth-recipe' }],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Lessons learned', link: '/lessons' },
          { text: 'Module map', link: '/reference' },
        ],
      },
    ],

    outline: { level: [2, 3], label: 'On this page' },
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/roshanind/inikitty/edit/main/docs-site/:path',
    },
  },

  mermaid: {
    // Diagram-level mermaid config. Theme (light/dark) is handled automatically by the plugin.
  },

  vite: {
    optimizeDeps: {
      // Mermaid is only ever dynamically imported (by vitepress-plugin-mermaid, lazily, once a
      // page actually has a diagram), so Vite's dev-server dependency scanner never discovers it
      // — or its own dependencies, like dayjs — ahead of time. Without this, the dev server (not
      // the production build, which pre-bundles everything upfront) serves dayjs's raw CJS/UMD
      // file directly, and the browser's native ESM loader rejects it: "does not provide an
      // export named 'default'". Listing them explicitly forces Vite to pre-bundle (and CJS→ESM
      // convert) them regardless of what static analysis finds.
      include: ['mermaid', 'mermaid > dayjs'],
    },
  },
});
