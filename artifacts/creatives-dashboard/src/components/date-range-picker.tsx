import { useState } from "react";
import { DateRange } from "react-day-picker";
import type { Locale } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function parseDate(str: string): Date | undefined {
  if (!str) return undefined;
  return new Date(str + "T00:00:00");
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  isActive: boolean;
  onActivate: () => void;
}

export function DateRangePicker({ from, to, onChange, isActive, onActivate }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const range: DateRange | undefined = from && to
    ? { from: parseDate(from), to: parseDate(to) }
    : from
    ? { from: parseDate(from) }
    : undefined;

  function handleSelect(r: DateRange | undefined) {
    if (!r) return;
    const newFrom = r.from ? toISODate(r.from) : from;
    const newTo = r.to ? toISODate(r.to) : "";
    onChange(newFrom, newTo);
    if (r.from && r.to) {
      setOpen(false);
    }
  }

  const label = from && to
    ? `${formatLabel(from)} – ${formatLabel(to)}`
    : from
    ? `${formatLabel(from)} → ...`
    : "Personalizado";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={() => { onActivate(); setOpen(true); }}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-border bg-popover"
        align="end"
        sideOffset={8}
      >
        <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Período personalizado</p>
          {from && to ? (
            <p className="text-sm font-medium mt-1 text-foreground">
              {formatLabel(from)} até {formatLabel(to)}
            </p>
          ) : from ? (
            <p className="text-sm text-muted-foreground mt-1">Selecione a data de fim</p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Selecione a data de início</p>
          )}
        </div>
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={2}
          disabled={{ after: new Date() }}
          locale={ptBR}
          captionLayout="dropdown"
          className="[--cell-size:1.85rem]"
        />
        {from && to && (
          <div className="p-3 border-t border-border flex justify-end">
            <button
              onClick={() => { onChange("", ""); setOpen(false); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpar período
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// pt-BR locale for the calendar
const ptBR = {
  localize: {
    ordinalNumber: (n: number) => `${n}º`,
    era: (n: number) => ["aC", "dC"][n],
    quarter: (n: number) => ["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"][n],
    day: (n: number, opts?: { width?: string }) => {
      const narrow = ["D", "S", "T", "Q", "Q", "S", "S"];
      const abbr   = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
      const wide   = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
      if (opts?.width === "narrow") return narrow[n];
      if (opts?.width === "abbreviated") return abbr[n];
      return wide[n];
    },
    month: (n: number, opts?: { width?: string }) => {
      const narrow = ["J","F","M","A","M","J","J","A","S","O","N","D"];
      const abbr   = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
      const wide   = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
      if (opts?.width === "narrow") return narrow[n];
      if (opts?.width === "abbreviated") return abbr[n];
      return wide[n];
    },
    dayPeriod: (n: string) => ({ am: "AM", pm: "PM", midnight: "meia-noite", noon: "meio-dia", morning: "manhã", afternoon: "tarde", evening: "noite", night: "noite" }[n] ?? n),
  },
  formatLong: {
    date: () => "dd/MM/yyyy",
    time: () => "HH:mm:ss",
    dateTime: () => "dd/MM/yyyy HH:mm:ss",
  },
  formatRelative: (token: string) => ({ lastWeek: "'na semana passada'", yesterday: "'ontem'", today: "'hoje'", tomorrow: "'amanhã'", nextWeek: "'na próxima semana'", other: "P" }[token] ?? token),
  match: {
    ordinalNumber: /^\d+/,
    era: /^(aC|dC)/i,
    quarter: /^[1234]/,
    day: /^(dom|seg|ter|qua|qui|sex|sáb|domingo|segunda|terça|quarta|quinta|sexta|sábado)/i,
    month: /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i,
    dayPeriod: /^(am|pm|meia-noite|meio-dia|manhã|tarde|noite)/i,
  },
  options: { weekStartsOn: 0 as const, firstWeekContainsDate: 1 },
} as unknown as Locale;
