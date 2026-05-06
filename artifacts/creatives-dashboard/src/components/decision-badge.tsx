import { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DECISION_TOOLTIPS } from "@/components/decision-tooltips";

interface DecisionTooltipProps {
  decision: string;
  children: ReactNode;
  className?: string;
}

export function DecisionTooltip({ decision, children, className = "inline-flex" }: DecisionTooltipProps) {
  const text = DECISION_TOOLTIPS[decision];
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{children}</span>
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
