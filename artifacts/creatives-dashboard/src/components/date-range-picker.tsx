import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
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
  const toRef = useRef<HTMLInputElement>(null);

  const label = from && to
    ? `${formatLabel(from)} – ${formatLabel(to)}`
    : "Personalizado";

  function handleFromChange(value: string) {
    onChange(value, to && value > to ? "" : to);
    if (value && !to) {
      setTimeout(() => toRef.current?.showPicker?.(), 50);
    }
  }

  function handleToChange(value: string) {
    onChange(from, value);
    if (from && value) {
      setOpen(false);
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("", "");
    onActivate();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={() => { onActivate(); setOpen(true); }}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 relative",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
          {isActive && from && to && (
            <span
              role="button"
              onClick={handleClear}
              className="ml-0.5 rounded-full hover:bg-primary-foreground/20 p-0.5 flex items-center"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-4 border-border bg-popover shadow-xl"
        align="end"
        sideOffset={8}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Período personalizado
        </p>

        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <input
              type="date"
              value={from}
              max={today()}
              onChange={e => handleFromChange(e.target.value)}
              className={cn(
                "px-3 py-2 rounded-md border text-sm bg-background text-foreground",
                "border-border focus:outline-none focus:ring-2 focus:ring-primary",
                "[color-scheme:dark]"
              )}
            />
          </div>

          <div className="mt-5 text-muted-foreground text-sm">→</div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <input
              ref={toRef}
              type="date"
              value={to}
              min={from || undefined}
              max={today()}
              onChange={e => handleToChange(e.target.value)}
              className={cn(
                "px-3 py-2 rounded-md border text-sm bg-background text-foreground",
                "border-border focus:outline-none focus:ring-2 focus:ring-primary",
                "[color-scheme:dark]"
              )}
            />
          </div>
        </div>

        {from && to && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {formatLabel(from)} até {formatLabel(to)}
            </span>
            <button
              onClick={() => { onChange("", ""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpar
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
