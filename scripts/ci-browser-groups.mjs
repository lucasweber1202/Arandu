// Four disjoint groups, measured against run 41898780191 worker durations.
// One execution of every existing project; no sharding by a guessed risk label.
export const BROWSER_GROUPS=Object.freeze({
  chromium:Object.freeze(['chromium-desktop','mobile-chrome']),
  firefox:Object.freeze(['firefox-desktop']),
  webkit:Object.freeze(['webkit-desktop']),
  safari:Object.freeze(['mobile-safari'])
});
export function browserProjects(group) {
  if(!Object.hasOwn(BROWSER_GROUPS,group))throw new Error('Unknown CI browser group');
  return BROWSER_GROUPS[group];
}

export function browserEngines(group) {
  return [...new Set(browserProjects(group).map(project=>project==='firefox-desktop'?'firefox':project==='webkit-desktop'||project==='mobile-safari'?'webkit':'chromium'))];
}
