// Botão "Registrar contrato existente" sem o Contract 360: telas que só
// oferecem o registro (Instituições, relacionamento) não baixam a gaveta do
// contrato. O formulário (import.js) continua carregado só no clique.
import { toast, button, readableError } from '../../ui.js';

/** Botão + formulário de contrato existente (carteira fora de RFQ). */
export function importContractButton(ctx, entities, { label = 'Registrar contrato existente', variant = 'secondary', providerId = null, size = null } = {}) {
  if (!ctx.can('create_rfq')) return null;
  return button(label, { variant, size, iconName: 'plus', attrs: { 'data-intent': 'registrar-contrato' }, onClick: () => import('./import.js').then((m) => m.openImportContract(ctx, entities, { providerId })).catch((error) => toast(readableError(error), 'error')) });
}
