import { ledgerPage } from './ledger.js';
export const implementations=ctx=>ledgerPage(ctx,{resource:'implementations',title:'Implantação pós-award',subtitle:'Responsáveis, prazos, dependências, evidência e aceite humano de go-live.',filters:[['provider_id','Provedor','providers'],['legal_entity_id','Entidade','entities']]});
