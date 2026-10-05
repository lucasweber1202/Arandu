import {ledgerPage} from './ledger.js';
export const covenants=ctx=>ledgerPage(ctx,{resource:'covenants',title:'Covenants e obrigações',subtitle:'Períodos, dados, proveniência, revisão independente e exceções temporárias.',filters:[['provider_id','Provedor','providers'],['legal_entity_id','Entidade','entities']]});
