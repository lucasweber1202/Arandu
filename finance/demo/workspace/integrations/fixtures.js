// Dados fictícios e determinísticos das integrações simuladas.
// Nenhum nome real de pessoa; CNPJs com dígitos inválidos de propósito.

export const DIRECTORY = Object.freeze({
  idps: [['entra', 'Microsoft Entra ID'], ['okta', 'Okta'], ['google', 'Google Workspace']],
  groups: [
    { name: 'Finance-Team', members: 9 },
    { name: 'CFO', members: 2 },
    { name: 'Procurement-Admin', members: 3 },
    { name: 'Controladoria', members: 9 }
  ],
  total: 23,
  sample: [
    ['Marina Costa', 'Finance-Team'], ['João Mendes', 'Finance-Team'], ['Ricardo Alves', 'CFO'], ['Helena Prado', 'Procurement-Admin'],
    ['Pessoa Fictícia 05', 'Finance-Team'], ['Pessoa Fictícia 06', 'Controladoria'], ['Pessoa Fictícia 07', 'Controladoria']
  ]
});
export const APP_ROLES = Object.freeze({ buyer: ['finance_manager', 'Comprador (gestão financeira)'], approver: ['viewer', 'Aprovador (leitura e aprovação)'], admin: ['admin', 'Administrador'], none: [null, 'Sem acesso'] });

// O que cada papel do produto pode fazer (espelha as regras do produto; não as altera).
export const RBAC = Object.freeze([
  ['Ver solicitações, propostas e contratos', ['admin', 'finance_manager', 'viewer']],
  ['Aprovar quando for a etapa da pessoa', ['admin', 'finance_manager', 'viewer']],
  ['Criar e revisar solicitações', ['admin', 'finance_manager']],
  ['Convidar provedores', ['admin', 'finance_manager']],
  ['Registrar decisão e contrato', ['admin', 'finance_manager']],
  ['Enviar documentos', ['admin', 'finance_manager']],
  ['Gerenciar equipe e papéis', ['admin']],
  ['Editar a política de aprovação', ['admin']],
  ['Conectar integrações', ['admin']]
]);

export const ERP_SUPPLIERS = Object.freeze([
  { code: 'F-00412', name: 'ATLAS BANK S.A. — DEMO', tax_id: '00.000.001/0001-00', match: 'Atlas Bank — DEMO' },
  { code: 'F-00518', name: 'BANCO HORIZONTE SUL — DEMO', tax_id: '00.000.002/0001-00', match: 'Banco Horizonte Sul — DEMO' },
  { code: 'F-00733', name: 'CADENCIA ADQUIRENCIA LTDA — DEMO', tax_id: '00.000.005/0001-00', match: 'Cadência Adquirência — DEMO' },
  { code: 'F-00902', name: 'FORNECEDOR DE RESINA — DEMO', tax_id: '00.000.090/0001-00', match: null },
  { code: 'F-01011', name: 'TREVO CAPITAL SCD — DEMO', tax_id: '00.000.011/0001-00', match: 'Trevo Capital — DEMO' }
]);
export const ERP_COST_CENTERS = Object.freeze([
  { code: 'CC-110', name: 'Tesouraria' }, { code: 'CC-120', name: 'Controladoria' }, { code: 'CC-310', name: 'Fábrica 1 — Produção' },
  { code: 'CC-320', name: 'Fábrica 2 — Expansão' }, { code: 'CC-510', name: 'E-commerce' }
]);

// Perfil financeiro: 20 campos; o Open Finance simulado preenche 17.
export const OPEN_FINANCE_FIELDS = Object.freeze([
  ['contas_ativas', 'Contas ativas', '4 contas em 2 instituições', 'Contas'],
  ['saldo_consolidado', 'Saldo consolidado', 'R$ 14,2 milhões', 'Saldos'],
  ['saldo_medio_90d', 'Saldo médio (90 dias)', 'R$ 11,8 milhões', 'Saldos'],
  ['limite_disponivel', 'Limites disponíveis', 'R$ 6,5 milhões', 'Saldos'],
  ['entradas_mensais', 'Entradas mensais (média 6m)', 'R$ 15,9 milhões', 'Transações'],
  ['saidas_mensais', 'Saídas mensais (média 6m)', 'R$ 14,7 milhões', 'Transações'],
  ['recebiveis_cartao', 'Recebíveis de cartão (média 6m)', 'R$ 8,1 milhões', 'Transações'],
  ['sazonalidade', 'Sazonalidade', 'Pico em outubro e novembro', 'Transações'],
  ['folha_pagamento', 'Folha de pagamento', 'R$ 2,3 milhões/mês', 'Transações'],
  ['emprestimos_ativos', 'Empréstimos ativos', '3 contratos', 'Empréstimos'],
  ['saldo_devedor', 'Saldo devedor total', 'R$ 7,4 milhões', 'Empréstimos'],
  ['parcela_mensal', 'Parcelas mensais', 'R$ 410 mil', 'Empréstimos'],
  ['prazo_medio_divida', 'Prazo médio restante', '19 meses', 'Empréstimos'],
  ['taxa_media_divida', 'Taxa média informada', '1,52% a.m.', 'Empréstimos'],
  ['garantias_vinculadas', 'Garantias já vinculadas', 'Recebíveis de cartão (30%)', 'Empréstimos'],
  ['instituicoes', 'Instituições com relacionamento', 'Banco Horizonte Sul — DEMO, Atlas Bank — DEMO', 'Contas'],
  ['atraso_12m', 'Atrasos nos últimos 12 meses', 'Nenhum registrado', 'Empréstimos'],
  ['faturamento_anual', 'Faturamento anual', null, 'Declarado'],
  ['funcionarios', 'Número de funcionários', null, 'Declarado'],
  ['garantias_disponiveis', 'Garantias disponíveis', null, 'Declarado']
]);
export const OPEN_FINANCE_INSTITUTIONS = Object.freeze(['Banco Horizonte Sul — DEMO', 'Atlas Bank — DEMO']);
