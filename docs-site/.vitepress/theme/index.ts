import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { setupMermaidPanZoom } from './pan-zoom';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    void setupMermaidPanZoom();
  },
} satisfies Theme;
