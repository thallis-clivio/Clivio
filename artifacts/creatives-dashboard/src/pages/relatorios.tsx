import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListCreatives, getListCreativesQueryKey,
} from "@workspace/api-client-react";
import { ListCreativesParams } from "@workspace/api-client-react";
import { DateRangePicker } from "@/components/date-range-picker";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import {
  Download, ArrowRight, ArrowDown, ArrowUp, ChevronsUpDown,
  Trophy, Medal, Award, PieChart, TrendingUp, SplitSquareHorizontal,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type DateFilter = "weekly" | "daily" | "monthly" | "all" | "custom";

const DATE_FILTER_LABELS: Record<Exclude<DateFilter, "custom">, string> = {
  daily: "Hoje",
  weekly: "7 dias",
  monthly: "15 dias",
  all: "30 dias",
};

const MEDAL = [
  { Icon: Trophy, color: "text-yellow-400", ring: "ring-yellow-400/20 bg-yellow-400/5",  label: "1º" },
  { Icon: Medal,  color: "text-slate-300",  ring: "ring-slate-300/20 bg-slate-300/5",    label: "2º" },
  { Icon: Award,  color: "text-orange-500", ring: "ring-orange-500/20 bg-orange-500/5",  label: "3º" },
];

type SortKey = "name" | "spend" | "commission" | "roas" | "cpa" | "totalSales";

function getDecisionBadgeClass(decision: string, monitorarReason?: string | null) {
  switch (decision) {
    case "ESCALAR":   return "bg-green-500/20 text-green-500 border-green-500/30";
    case "MONITORAR": return monitorarReason === "decaindo"
      ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "PAUSAR":    return "bg-red-500/20 text-red-500 border-red-500/30";
    default:          return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

export default function Relatorios() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekly");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]   = useState("");
  const [sortBy, setSortBy]       = useState<SortKey>("commission");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const params = useMemo((): ListCreativesParams => {
    if (dateFilter === "custom") {
      return { dateFrom: customFrom || undefined, dateTo: customTo || undefined, sortBy: "commission", sortOrder: "desc", dateFilter: "all" };
    }
    return { dateFilter, sortBy: "commission", sortOrder: "desc" };
  }, [dateFilter, customFrom, customTo]);

  const { data: creatives, isLoading } = useListCreatives(params, {
    query: { queryKey: getListCreativesQueryKey(params) }
  });

  const totalSpend      = useMemo(() => creatives?.reduce((s, c) => s + c.spend, 0) ?? 0, [creatives]);
  const totalCommission = useMemo(() => creatives?.reduce((s, c) => s + c.commission, 0) ?? 0, [creatives]);
  const avgRoas         = useMemo(() => {
    const w = creatives?.filter(c => c.roas > 0) ?? [];
    return w.length ? w.reduce((s, c) => s + c.roas, 0) / w.length : 0;
  }, [creatives]);

  const podium = useMemo(() => {
    if (!creatives) return [];
    return [...creatives].filter(c => c.commission > 0).sort((a, b) => b.commission - a.commission).slice(0, 3);
  }, [creatives]);

  const ltvData = useMemo(() => {
    if (!creatives) return { frontCommission: 0, ltvCommission: 0, total: 0 };
    const front = creatives.reduce((s, c) => s + c.commission, 0);
    const ltv = creatives.reduce((s, c) => s + (c.ltvCommission ?? 0), 0);
    return { frontCommission: front, ltvCommission: ltv, total: front + ltv };
  }, [creatives]);

  const pareto = useMemo(() => {
    if (!creatives) return { heroes: [] as NonNullable<typeof creatives>, rest: [] as NonNullable<typeof creatives>, total: 0 };
    const srt = [...creatives].filter(c => c.commission > 0).sort((a, b) => b.commission - a.commission);
    const total = srt.reduce((s, c) => s + c.commission, 0);
    if (total === 0) return { heroes: [] as typeof srt, rest: [] as typeof srt, total: 0 };
    let cum = 0, cutoff = srt.length;
    for (let i = 0; i < srt.length; i++) {
      cum += srt[i].commission;
      if (cum / total >= 0.8) { cutoff = i + 1; break; }
    }
    return { heroes: srt.slice(0, cutoff), rest: srt.slice(cutoff), total };
  }, [creatives]);

  const sorted = useMemo(() => {
    if (!creatives) return [];
    return [...creatives].sort((a, b) => {
      const aVal = sortBy === "name" ? a.name : (a as unknown as Record<string, number>)[sortBy];
      const bVal = sortBy === "name" ? b.name : (b as unknown as Record<string, number>)[sortBy];
      if (typeof aVal === "string" && typeof bVal === "string")
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortOrder === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [creatives, sortBy, sortOrder]);

  function handleSort(col: SortKey) {
    if (sortBy === col) setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortOrder("desc"); }
  }

  function exportCsv() {
    if (!sorted.length) return;
    const rows = [
      ["Criativo", "Data", "Gasto (R$)", "Comissão (R$)", "ROAS", "CPA (R$)", "Vendas", "Decisão", "Previsibilidade"],
      ...sorted.map(c => [
        c.name, formatDate(c.date),
        c.spend.toFixed(2), c.commission.toFixed(2), c.roas.toFixed(2),
        c.totalSales > 0 ? c.cpa.toFixed(2) : "-",
        c.totalSales, c.decision, c.predictabilityLabel,
      ]),
    ];
    const csv = "\uFEFF" + rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clivio-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortHead({ col, label, className }: { col: SortKey; label: string; className?: string }) {
    const active = sortBy === col;
    return (
      <TableHead className={`cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`} onClick={() => handleSort(col)}>
        <span className="inline-flex items-center gap-1 justify-end w-full">
          {label}
          {active
            ? sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
            : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
        </span>
      </TableHead>
    );
  }

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Relatórios</h2>
            <p className="text-muted-foreground">Análise inteligente de performance por período.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["daily", "weekly", "monthly", "all"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    dateFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {DATE_FILTER_LABELS[f]}
                </button>
              ))}
              <DateRangePicker
                from={customFrom}
                to={customTo}
                onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); if (f && t) setDateFilter("custom"); }}
                isActive={dateFilter === "custom"}
                onActivate={() => setDateFilter("custom")}
              />
            </div>
            <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={!sorted.length}>
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* 3 métricas do período */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Investido",    value: isLoading ? null : formatCurrency(totalSpend),      sub: "no período" },
            { label: "Comissão",     value: isLoading ? null : formatCurrency(totalCommission), sub: "estimada total" },
            { label: "ROAS Médio",   value: isLoading ? null : formatRoas(avgRoas),             sub: "dos criativos ativos", hi: true },
          ].map(({ label, value, sub, hi }) => (
            <Card key={label} className="border-border/50 bg-card/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                {value === null
                  ? <Skeleton className="h-7 w-24" />
                  : <p className={`text-2xl font-bold tabular-nums ${hi ? "text-primary" : "text-foreground"}`}>{value}</p>
                }
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pódio */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              <CardTitle className="text-base">Pódio do Período</CardTitle>
              <span className="text-xs text-muted-foreground">criativos com maior comissão</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}</div>
            ) : podium.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum criativo com comissão gerada neste período.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {podium.map((c, i) => {
                  const m = MEDAL[i];
                  return (
                    <Link key={c.id} href={`/creatives/${c.id}`}>
                      <div className={`rounded-lg border ring-1 p-4 space-y-2 hover:opacity-80 transition-opacity cursor-pointer ${m.ring} border-border/50`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground">{m.label} lugar</span>
                          <m.Icon className={`w-4 h-4 ${m.color}`} />
                        </div>
                        <p className="font-semibold text-sm truncate text-foreground">{c.name}</p>
                        <div>
                          <p className="text-lg font-bold tabular-nums text-primary">{formatCurrency(c.commission)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">ROAS {formatRoas(c.roas)} · {c.totalSales} vendas</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Front vs LTV + Pareto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Front vs LTV */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <SplitSquareHorizontal className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Front vs LTV</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Comissão front (produto principal, conta no ROAS) vs comissão LTV (cross-sells, não conta no ROAS).</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : ltvData.total === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma comissão gerada neste período.</p>
              ) : (
                <div className="space-y-4 pt-1">
                  {[
                    { label: "Comissão Front", value: ltvData.frontCommission, color: "bg-primary", textColor: "text-primary", pct: ltvData.total > 0 ? Math.round((ltvData.frontCommission / ltvData.total) * 100) : 0 },
                    { label: "Comissão LTV", value: ltvData.ltvCommission, color: "bg-violet-500", textColor: "text-violet-400", pct: ltvData.total > 0 ? Math.round((ltvData.ltvCommission / ltvData.total) * 100) : 0 },
                  ].map(row => (
                    <div key={row.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{row.label}</span>
                        <span className={`tabular-nums font-semibold ${row.textColor}`}>{formatCurrency(row.value)} · {row.pct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${row.color}`} style={{ width: `${row.pct}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Total combinado</span>
                    <span className="font-semibold text-foreground tabular-nums">{formatCurrency(ltvData.total)}</span>
                  </div>
                  {ltvData.ltvCommission === 0 && (
                    <p className="text-[11px] text-muted-foreground">Configure o <strong>Produto Principal</strong> em Configurações para começar a rastrear LTV.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Concentração de Comissão */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <PieChart className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Concentração de Comissão</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Quais criativos geram 80% da sua receita — escale esses, corte o resto.</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : pareto.total === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma comissão gerada neste período.</p>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-primary flex-none" />
                    <p className="text-xs text-primary font-medium">
                      {pareto.heroes.length === 1 ? "1 criativo gera" : `${pareto.heroes.length} criativos geram`} 80% da comissão do período
                    </p>
                  </div>
                  {pareto.heroes.map((c, i) => {
                    const pct = Math.round((c.commission / pareto.total) * 100);
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
                        <span className="text-xs font-bold text-green-400 w-5 text-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(c.commission)} · {pct}% do total</p>
                        </div>
                        <Badge variant="outline" className="text-xs border bg-green-500/10 text-green-400 border-green-500/20 shrink-0">Top</Badge>
                      </div>
                    );
                  })}
                  {pareto.rest.length > 0 && (
                    <p className="text-[11px] text-muted-foreground pl-2 pt-1">
                      + {pareto.rest.length} outro{pareto.rest.length > 1 ? "s" : ""} criativo{pareto.rest.length > 1 ? "s" : ""} compõem os {100 - Math.round((pareto.heroes.reduce((s, c) => s + c.commission, 0) / pareto.total) * 100)}% restantes
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabela completa */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "Carregando..." : `${sorted.length} criativos no período`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("name")}>
                    <span className="inline-flex items-center gap-1">
                      Criativo
                      {sortBy === "name"
                        ? sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
                    </span>
                  </TableHead>
                  <SortHead col="spend"      label="Gasto"    className="text-right" />
                  <SortHead col="commission" label="Comissão" className="text-right" />
                  <SortHead col="roas"       label="ROAS"     className="text-right" />
                  <SortHead col="cpa"        label="CPA"      className="text-right" />
                  <SortHead col="totalSales" label="Vendas"   className="text-right" />
                  <TableHead>Decisão</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [1, 2, 3, 4].map(i => (
                    <TableRow key={i} className="border-border">
                      {[...Array(8)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      Nenhum dado encontrado para o período selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map(creative => (
                    <TableRow key={creative.id} className="border-border hover:bg-muted/50 group">
                      <TableCell className="font-medium">
                        <div>{creative.name}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(creative.date)}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(creative.spend)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(creative.commission)}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatRoas(creative.roas)}</TableCell>
                      <TableCell className={`text-right text-sm tabular-nums font-semibold ${getCpaColor(creative.cpa, creative.totalSales)}`}>
                        {creative.totalSales === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(creative.cpa)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{creative.totalSales}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs border ${getDecisionBadgeClass(creative.decision, creative.monitorarReason)}`}>
                          {creative.decision}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/creatives/${creative.id}`}>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
