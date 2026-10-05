import {ledgerPage} from './ledger.js';
export const spend=ctx=>ledgerPage(ctx,{resource:'spend',title:'Financial Spend',subtitle:'Tipos separados, por moeda, entidade, provedor e produto.',filters:[['start','Início','date'],['end','Fim','date'],['provider_id','Provedor','providers'],['legal_entity_id','Entidade','entities']]});
