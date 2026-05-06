export const DECISION_TOOLTIPS: Record<string, string> = {
  ESCALAR: "Vende hoje e ROAS ≥ 3,5 — hora de escalar o orçamento",
  LUCRATIVO: "Vende hoje com ROAS ≥ 2 e < 3,5 — rentável, mantenha o investimento",
  ATENCAO: "ROAS entre 1× e 2× — margem baixa, sem gatilho de monitorar ou pausar; avalie otimizações",
  MONITORAR: "1 dia sem venda com ROAS ≥ 2, ou 2 dias sem venda com ROAS ≥ 3,5 — monitore antes de agir",
  PAUSAR: "3+ dias sem venda, ou 2 dias com ROAS < 3,5, ou ROAS < 1 — pause para evitar prejuízo",
};
