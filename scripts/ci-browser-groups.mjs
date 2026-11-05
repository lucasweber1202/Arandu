// Balanced from run 41898780191 (sum of test durations, not wall time).
// One execution of every existing project; no sharding by a guessed risk label.
export const BROWSER_GROUPS=Object.freeze({
  gecko_webkit:Object.freeze(['firefox-desktop','webkit-desktop']),
  chromium_mobile:Object.freeze(['chromium-desktop','mobile-chrome','mobile-safari'])
});
export function browserProjects(group) {
  if(!Object.hasOwn(BROWSER_GROUPS,group))throw new Error('Unknown CI browser group');
  return BROWSER_GROUPS[group];
}
