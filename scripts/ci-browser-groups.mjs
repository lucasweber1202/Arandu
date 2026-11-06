// Three disjoint groups; avoid a fourth runner while the real seed dominates.
// One execution of every existing project; no sharding by a guessed risk label.
export const BROWSER_GROUPS=Object.freeze({
  chromium_firefox:Object.freeze(['chromium-desktop','mobile-chrome','firefox-desktop']),
  webkit:Object.freeze(['webkit-desktop']),
  safari:Object.freeze(['mobile-safari'])
});
export function browserProjects(group) {
  if(!Object.hasOwn(BROWSER_GROUPS,group))throw new Error('Unknown CI browser group');
  return BROWSER_GROUPS[group];
}

export function browserEngines(group) {
  // Presentation has a separate full five-project config and receipt stream.
  if(group==='presentation')return ['chromium','firefox','webkit'];
  return [...new Set(browserProjects(group).map(project=>project==='firefox-desktop'?'firefox':project==='webkit-desktop'||project==='mobile-safari'?'webkit':'chromium'))];
}
