// Validação local de CNPJ.
//
// Verifica APENAS formato e dígitos verificadores. Um CNPJ com dígitos válidos
// pode não existir, pode estar baixado ou pode pertencer a outra empresa. Por
// isso o resultado separa, de propósito, duas afirmações diferentes:
//
//   format_valid        — a estrutura e os dígitos conferem (verificável aqui);
//   externally_verified — alguém consultou a fonte oficial (não acontece nesta
//                         fase; sempre falso, sem integração externa).
//
// Nada neste módulo autoriza dizer que a empresa "existe" ou "está regular".

const BLOCKED = new Set([
  '00000000000000', '11111111111111', '22222222222222', '33333333333333', '44444444444444',
  '55555555555555', '66666666666666', '77777777777777', '88888888888888', '99999999999999'
]);

export function normalizeCnpj(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function checkDigit(digits, weights) {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * @returns {{format_valid: boolean, externally_verified: false, digits: string, reason: string|null}}
 */
export function validateCnpj(value) {
  const digits = normalizeCnpj(value);
  const result = { format_valid: false, externally_verified: false, digits, reason: null };
  if (!digits) { result.reason = 'CNPJ não informado.'; return result; }
  if (digits.length !== 14) { result.reason = 'O CNPJ precisa ter 14 dígitos.'; return result; }
  if (BLOCKED.has(digits)) { result.reason = 'Sequência de dígitos repetidos não é um CNPJ válido.'; return result; }
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (Number(digits[12]) !== first || Number(digits[13]) !== second) {
    result.reason = 'Os dígitos verificadores do CNPJ não conferem.';
    return result;
  }
  result.format_valid = true;
  return result;
}
