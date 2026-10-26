import { HttpError } from '../../api-core.mjs';
import { userSupabaseRequest } from '../../supabase.mjs';
import { upstream } from './finance-core.mjs';

// Only the caller's JWT is used. Interpret fixed errors from these operations;
// all other failures retain the existing sanitizer and schema/outage behavior.
export async function contractIntegrityRpc(token, name, body) {
  try { return await userSupabaseRequest(token, `rpc/${name}`, {method:'POST',body}); }
  catch(error) {
    if(error.message==='duplicate request') throw new HttpError(409,'Esta intenção já foi usada com outros dados. Confira o resultado original antes de registrar outra intenção.','contract_import_conflict');
    if(error.message==='invalid task assignee') throw new HttpError(403,'O responsável precisa ser membro autorizado com acesso à entidade do contrato.','contract_owner_unavailable');
    if(error.message==='contract version conflict') throw new HttpError(409,'O responsável mudou em outra sessão. Recarregue antes de atribuir novamente.','contract_owner_conflict');
    return upstream(Promise.reject(error));
  }
}
