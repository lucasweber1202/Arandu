import {createHash,X509Certificate} from 'node:crypto';

// Trust only the public key generated for this canonical loopback stack.
// Never add a certificate exception for a hosted deployment or arbitrary host.
export function localDemoCertificateArgs(baseURL, certificatePem, now = Date.now()) {
  const url=new URL(baseURL);
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||!['localhost','127.0.0.1','::1'].includes(host)||!certificatePem)return [];
  if(url.username||url.password)throw new Error('Local demo URL must not contain credentials');
  const cert=new X509Certificate(certificatePem);
  if(now<Date.parse(cert.validFrom)||now>Date.parse(cert.validTo))throw new Error('Local demo certificate is outside its validity period');
  const matches=host==='localhost'?cert.checkHost(host):cert.checkIP(host);
  if(!matches)throw new Error('Local demo certificate does not match loopback host');
  const spki=cert.publicKey.export({type:'spki',format:'der'});
  return ['--ignore-certificate-errors-spki-list='+createHash('sha256').update(spki).digest('base64')];
}
