const READY_ATTR = 'data-pan-zoom-ready';

interface PanZoomInstance {
  resize(): unknown;
  fit(): unknown;
  center(): unknown;
}

type SvgPanZoomFactory = (el: SVGSVGElement, options: Record<string, unknown>) => PanZoomInstance;

function hasStableLayout(svg: SVGSVGElement): boolean {
  const box = svg.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && Number.isFinite(box.width) && Number.isFinite(box.height);
}

/**
 * svg-pan-zoom computes its initial fit/center transform from the SVG's current layout box. Right
 * after Mermaid inserts the SVG, that box can still be 0×0 for a frame (most reliably reproduced
 * by a tall, narrow flowchart) — svg-pan-zoom then divides by zero internally and throws
 * "Failed to set the 'a' property on 'SVGMatrix': The provided double value is non-finite."
 * Waiting for a real layout box before initializing avoids it.
 */
function whenLayoutStable(svg: SVGSVGElement, run: () => void, attemptsLeft = 30): void {
  if (hasStableLayout(svg) || attemptsLeft <= 0) {
    run();
    return;
  }
  requestAnimationFrame(() => whenLayoutStable(svg, run, attemptsLeft - 1));
}

function enhanceSvg(svg: SVGSVGElement, svgPanZoom: SvgPanZoomFactory): void {
  if (svg.hasAttribute(READY_ATTR)) return;
  svg.setAttribute(READY_ATTR, 'true');

  svg.style.width = '100%';
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  svg.style.cursor = 'grab';

  whenLayoutStable(svg, () => initPanZoom(svg, svgPanZoom));
}

/**
 * Even with a stable layout box on the SVG itself, svg-pan-zoom's own internal fit/center
 * computation intermittently throws on some diagram shapes (reliably reproducible on the tall,
 * narrow pipeline flowchart, maybe ~1 in 3 loads) — the underlying cause looks like a transient
 * divide-by-zero inside its own sizing code, not anything under this file's control. It's a timing
 * issue, so retrying a frame later resolves it rather than needing to fully root-cause svg-pan-zoom
 * internals.
 */
function initPanZoom(svg: SVGSVGElement, svgPanZoom: SvgPanZoomFactory, attemptsLeft = 5): void {
  let instance: PanZoomInstance;
  try {
    instance = svgPanZoom(svg, {
      panEnabled: true,
      zoomEnabled: true,
      dblClickZoomEnabled: true,
      mouseWheelZoomEnabled: true,
      controlIconsEnabled: true,
      fit: true,
      center: true,
      minZoom: 0.5,
      maxZoom: 8,
      zoomScaleSensitivity: 0.35,
    });
  } catch (err) {
    if (attemptsLeft > 0) {
      requestAnimationFrame(() => initPanZoom(svg, svgPanZoom, attemptsLeft - 1));
    } else {
      console.warn('[pan-zoom] giving up on this diagram after repeated init failures:', err);
    }
    return;
  }

  // Re-fit if the container changes size (sidebar toggle, window resize, outline collapse).
  const container = svg.closest('.mermaid') ?? svg.parentElement ?? svg;
  const resizeObserver = new ResizeObserver(() => {
    instance.resize();
    instance.fit();
    instance.center();
  });
  resizeObserver.observe(container);
}

/**
 * Wires pan/zoom onto every Mermaid-rendered SVG on the page, and keeps watching for new ones —
 * Mermaid renders asynchronously client-side, and VitePress swaps page content in place on
 * client-side navigation rather than reloading, so a one-shot scan at load time isn't enough.
 *
 * `svg-pan-zoom` touches `window` as soon as its module body runs, which crashes VitePress's SSR
 * build pass if imported statically at the top of this file — it's loaded dynamically instead, so
 * that only ever happens in the browser. Its shipped .d.ts also doesn't cleanly type the callable
 * factory export, hence the small local `SvgPanZoomFactory` type instead of importing one.
 */
export async function setupMermaidPanZoom(): Promise<void> {
  if (typeof window === 'undefined') return;

  const mod = await import('svg-pan-zoom');
  const svgPanZoom = mod.default as unknown as SvgPanZoomFactory;

  const scanForDiagrams = (root: ParentNode) => {
    root.querySelectorAll<SVGSVGElement>('.mermaid svg').forEach((svg) => enhanceSvg(svg, svgPanZoom));
  };

  scanForDiagrams(document.body);

  const observer = new MutationObserver(() => {
    scanForDiagrams(document.body);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
