/* global __ARANDU_DEMO__ */
// Exportação factual do processo (JSON) gerada no navegador.
// Extraído de views/rfq.js (v7.0).

import { el } from '../../core.js';
import { toast, toastError } from '../../ui.js';

export async function exportProcess(ctx, rfq) {
  try {
    const result = await ctx.api(`export?rfq_id=${encodeURIComponent(rfq.id)}`);
    const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `arandu-${(__ARANDU_DEMO__ && ctx.mode === 'demo') ? 'demo-' : ''}rfq-${rfq.id.slice(0, 8)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Exportação gerada neste navegador.');
  } catch (error) { toastError(error); }
}
