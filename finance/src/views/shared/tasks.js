// Papéis que editam tarefas/comentários e mensagens de erro de tarefa.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.


export const TASK_EDITORS = ['admin', 'finance_manager', 'analyst'];
/** Papéis da empresa que comentam (fin_post_comment); leitor só lê. */

export const COMMENT_ROLES = ['admin', 'finance_manager', 'analyst'];
// Recusa ao alterar uma tarefa, em linguagem de gente; nada de código ou mensagem crua.

export function taskChangeError(error) {
  if (!error.status) return 'Sem conexão com o servidor. Nada foi confirmado.';
  if (error.status === 403) return 'Seu acesso não permite alterar esta tarefa. Nada mudou.';
  if (error.status === 404) return 'Esta tarefa não está mais disponível para você. Nada mudou.';
  if (error.status === 409) return 'A tarefa mudou enquanto você a alterava. Confira o estado salvo antes de tentar de novo.';
  return 'Não foi possível salvar a alteração agora. Nada foi confirmado.';
}
