import type {
  DecisionMakerType,
  EventType,
  ExperimentStatus,
  JobStatus,
  JobType,
  LeadChannelState,
  LeadPipelineStage,
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from "@/db/schema";
import type { BadgeTone } from "@/components/badge";

export const PIPELINE_STAGE_LABELS: Record<LeadPipelineStage, string> = {
  discovered: "Descoberto",
  qualified: "Qualificado",
  contacted: "Abordado",
  replied: "Respondeu",
  interested: "Interessado",
  whatsapp_handoff: "Encaminhado ao WhatsApp",
  registered: "Cadastrado",
  active_customer: "Cliente ativo",
  closed: "Encerrado",
};

export const CHANNEL_STATE_LABELS: Record<LeadChannelState, string> = {
  browser_contact_pending: "Aguardando contato (navegador)",
  browser_contact_sent: "Contato enviado (navegador)",
  waiting_inbound_reply: "Aguardando resposta",
  api_eligible: "Elegível para API",
  api_active: "Ativo via API",
  api_window_closed: "Janela da API fechada",
  human_review_required: "Revisão humana necessária",
  do_not_contact: "Não contatar",
  blocked: "Bloqueado",
  completed: "Concluído",
};

export const DECISION_MAKER_LABELS: Record<DecisionMakerType, string> = {
  owner: "Dono(a)",
  employee: "Funcionário(a)",
  store_account: "Conta da loja",
  unknown: "Desconhecido",
};

export const MESSAGE_DIRECTION_LABELS: Record<MessageDirection, string> = {
  outbound: "Enviada",
  inbound: "Recebida",
};

export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
  browser: "Navegador",
  api: "API",
  whatsapp: "WhatsApp",
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  failed: "Falhou",
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  discover_profile: "Descobrir perfil",
  send_browser_dm: "Enviar DM (navegador)",
  poll_webhook_inbox: "Checar webhook",
  send_api_message: "Enviar mensagem (API)",
  decide_and_reply: "Decidir resposta (IA)",
  follow_up: "Follow-up",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pendente",
  running: "Em execução",
  completed: "Concluído",
  failed: "Falhou",
  dead_letter: "Morta (dead-letter)",
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  lead_discovered: "Lead descoberto",
  lead_created: "Lead cadastrado",
  pipeline_stage_changed: "Etapa do funil alterada",
  channel_state_changed: "Estado do canal alterado",
  message_sent: "Mensagem enviada",
  message_received: "Mensagem recebida",
  circuit_breaker_tripped: "Disjuntor acionado",
  budget_exceeded: "Orçamento excedido",
  note_added: "Nota adicionada",
  browser_unavailable: "Navegador indisponível",
  dm_send_failed: "Falha ao enviar DM",
  webhook_message_unmatched: "Mensagem do webhook sem lead correspondente",
  channel_lock_lost: "Disputa de canal perdida",
  ai_reply_decided: "IA decidiu a próxima ação",
  ai_claim_blocked: "Resposta da IA bloqueada (alegação não verificada)",
  experiment_variant_assigned: "Variante de experimento atribuída",
  experiment_weights_adjusted: "Pesos do experimento ajustados",
  system_resumed: "Sistema retomado",
};

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  running: "Em andamento",
  paused: "Pausado",
  concluded: "Concluído",
};

/** Tone a status badge should render in — colocated with the labels since both encode the same "what does this state mean" judgment. */
export const PIPELINE_STAGE_TONE: Record<LeadPipelineStage, BadgeTone> = {
  discovered: "ink",
  qualified: "ink",
  contacted: "gold",
  replied: "gold",
  interested: "gold",
  whatsapp_handoff: "gold",
  registered: "gold",
  active_customer: "moss",
  closed: "ink",
};

export const CHANNEL_STATE_TONE: Record<LeadChannelState, BadgeTone> = {
  browser_contact_pending: "gold",
  browser_contact_sent: "gold",
  waiting_inbound_reply: "gold",
  api_eligible: "gold",
  api_active: "gold",
  api_window_closed: "ink",
  human_review_required: "ember",
  do_not_contact: "ember",
  blocked: "ember",
  completed: "moss",
};

export const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  pending: "ink",
  running: "gold",
  completed: "moss",
  failed: "ember",
  dead_letter: "ember",
};

export const EXPERIMENT_STATUS_TONE: Record<ExperimentStatus, BadgeTone> = {
  running: "gold",
  paused: "ink",
  concluded: "moss",
};
