// Never transmit query/fragment values or dynamic paths to a third party.
// Static route names are sufficient to measure this multi-page application's vitals.
const STATIC_ROUTES = new Set(["/", "/404.html", "/adquirencia.html", "/credito.html", "/index.html", "/limites.html", "/produto.html", "/seguranca.html", "/finance/approvals.html", "/finance/boundaries.html", "/finance/contracts.html", "/finance/covenants.html", "/finance/dashboard.html", "/finance/extractions.html", "/finance/fees.html", "/finance/implementations.html", "/finance/index.html", "/finance/new-rfq.html", "/finance/notifications.html", "/finance/opportunities.html", "/finance/ops.html", "/finance/passport.html", "/finance/performance.html", "/finance/portfolio.html", "/finance/proposals.html", "/finance/providers.html", "/finance/qualifications.html", "/finance/rfq.html", "/finance/rfqs.html", "/finance/settings.html", "/finance/spend.html", "/finance/tasks.html", "/finance/value.html", "/provider/index.html", "/provider/proposal.html", "/provider/rfqs.html"]);

export function sanitizeSpeedInsight(event) {
  try {
    if (event?.type !== 'vital') return null;
    const url = new URL(event.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!STATIC_ROUTES.has(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return { type: 'vital', url: url.href, route: url.pathname };
  } catch { return null; }
}
