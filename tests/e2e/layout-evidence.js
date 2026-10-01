// Geometry evidence is collected only when the document overflows. Keep the
// assertion strict; internal scroll areas remain visible in the evidence.
export async function layoutEvidence(page) {
  return page.evaluate(async (viewport) => {
    const overflow = document.documentElement.scrollWidth - viewport;
    const elements = overflow > 1 ? [...document.body.querySelectorAll('*')].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!rect.width || !rect.height || rect.right <= viewport + 1 || style.visibility === 'hidden') return [];
      return [{ tag: element.tagName, id: element.id, class: element.className?.baseVal ?? element.className,
        left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width),
        scroll: element.scrollWidth, client: element.clientWidth, display: style.display,
        overflowX: style.overflowX, text: element.textContent?.trim().slice(0, 100) }];
    }).slice(-40) : [];
    const evidence = { overflow, viewport, innerWidth: window.innerWidth, elements };
    if (overflow > 1) {
      // Observe finite entry animations without changing the original assertion.
      const animations = document.getAnimations().filter((animation) =>
        animation.effect?.target?.closest?.('#view') && animation.effect.getTiming().iterations !== Infinity);
      evidence.animations = animations.map((animation) => ({ name: animation.animationName, state: animation.playState }));
      await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
      evidence.settledOverflow = document.documentElement.scrollWidth - viewport;
      evidence.hiddenElements = [...document.querySelectorAll('*')].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width && rect.right > viewport + 1 && style.visibility === 'hidden'
          ? [{ tag: element.tagName, class: element.className?.baseVal ?? element.className, right: Math.round(rect.right) }] : [];
      }).slice(-20);
      // Isolate overflow contributors only in failed test diagnostics. Restore
      // every inline style immediately; no layout suppression is a solution.
      evidence.contributors = [...document.querySelectorAll('.tabs-scroll, .cmp-bar, .cmp-synthesis, .comparison, .compare-mobile, .est, .sidebar, .topbar, .mobile-tabbar')].map((element) => {
        const original = element.getAttribute('style');
        element.style.setProperty('display', 'none', 'important');
        const without = document.documentElement.scrollWidth - viewport;
        if (original === null) element.removeAttribute('style'); else element.setAttribute('style', original);
        return { class: element.className, without };
      });
      evidence.restoredOverflow = document.documentElement.scrollWidth - viewport;
    }
    return evidence;
  }, page.viewportSize().width);
}
