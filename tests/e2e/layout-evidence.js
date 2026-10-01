// Geometry evidence is collected only when the document overflows. Keep the
// assertion strict; internal scroll areas remain visible in the evidence.
export async function layoutEvidence(page) {
  return page.evaluate((viewport) => {
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
    return { overflow, viewport, innerWidth: window.innerWidth, elements };
  }, page.viewportSize().width);
}
