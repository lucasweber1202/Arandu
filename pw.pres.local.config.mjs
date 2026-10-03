import base from '/home/user/Arandu/playwright.presentation.config.js';
const launchOptions = { executablePath: '/opt/pw-browsers/chromium' };
export default { ...base, testDir: '/home/user/Arandu/tests/e2e', projects: base.projects.filter((p) => ['chromium-desktop', 'mobile-chrome'].includes(p.name)).map((p) => ({ ...p, use: { ...p.use, launchOptions } })) };
