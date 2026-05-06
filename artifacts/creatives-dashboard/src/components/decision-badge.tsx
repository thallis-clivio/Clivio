import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const DECISION_TOOLTIPS: Record<string, string> = {
  ESCALAR: "Vende hoje e ROAS ≥ 3,5 — hora de escalar o orçamento",
  LUCRATIVO: "Vende hoje com ROAS ≥ 2 e < 3,5 — rentável, mantenha o investimento",
  ATENCAO: "ROAS entre 1× e 2× — margem baixa, sem gatilho de monitorar ou pausar; avalie otimizações",
  MONITORAR: "1 dia sem venda com ROAS ≥ 2, ou 2 dias sem venda com ROAS ≥ 3,5 — monitore antes de agir",
  PAUSAR: "3+ dias sem venda, ou 2 dias com ROAS < 3,5, ou ROAS < 1 — pause para evitar prejuízo",
};

interface DecisionTooltipProps {
  decision: string;
  children: ReactNode;
}

export function DecisionTooltip({ decision, children }: DecisionTooltipProps) {
  const text = DECISION_TOOLTIPS[decision];
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-center leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface DecisionBadgeProps {
  label: string;
  colorClasses: string;
  size?: "md" | "sm";
}

export function DecisionBadge({ label, colorClasses, size = "md" }: DecisionBadgeProps) {
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-3 py-1 text-xs";

  const decisionKey = label === "ATENÇÃO" ? "ATENCAO" : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center rounded-full font-semibold cursor-default select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${sizeClasses} ${colorClasses}`}
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px] text-center leading-snug">
        {DECISION_TOOLTIPS[decisionKey] ?? label}
      </TooltipContent>
    </Tooltip>
  );
}
