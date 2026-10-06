import {ledgerPage} from './ledger.js';
export const performance=ctx=>ledgerPage(ctx,{resource:'performance',title:'Performance do provedor',subtitle:'Metas da empresa, fontes, cobertura e revisão independente.',filters:[['provider_id','Provedor','providers'],['legal_entity_id','Entidade','entities']]});
