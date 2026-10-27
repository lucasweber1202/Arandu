import { HttpError } from '../../api-core.mjs';
import { userSupabaseRequest } from '../../supabase.mjs';
import { upstream } from './finance-core.mjs';

export async function providerIntegrityRpc(token, name, body) {
  try { return await userSupabaseRequest(token, `rpc/${name}`, { method: 'POST', body }); }
  catch (error) {
    if (error.message === 'provider intent conflict') throw new HttpError(409, 'Esta intenção já foi usada com outros dados. Confira o recibo original antes de iniciar outro cadastro.', 'provider_creation_conflict');
    if (error.message === 'invalid provider') throw new HttpError(400, 'Confira os dados da instituição antes de enviar.', 'invalid_provider');
    return upstream(Promise.reject(error));
  }
}
