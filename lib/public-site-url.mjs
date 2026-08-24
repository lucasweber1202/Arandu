/**
 * Regra única de "domínio próprio" da Arandu.
 *
 * Existia uma cópia da validação no runtime da API, outra no build e outra no
 * gate de domínio. As três aceitavam `https://sua-url-da-vercel` — o
 * placeholder do .env.example, que está configurado em produção — porque o host
 * não termina em .vercel.app nem é localhost. O efeito era um gate verde sobre
 * um domínio inexistente.
 *
 * Domínio público de verdade tem pelo menos um rótulo e um TLD alfabético.
 */
export const PUBLIC_HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export function publicHostname(hostname) {
  return PUBLIC_HOSTNAME.test(String(hostname || ''));
}

/**
 * Devolve a URL normalizada quando o valor é um domínio próprio publicável, ou
 * string vazia. Deploys de preview (.vercel.app) não contam como domínio
 * próprio: é o que mantém o build marcando o site como não indexável.
 */
export function ownSiteUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    if (url.hostname === 'localhost' || url.hostname.endsWith('.vercel.app')) return '';
    if (!publicHostname(url.hostname)) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}
