import { useState, useMemo } from "react";
import {
  useListCreatives, getListCreativesQueryKey,
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  ListCreativesParams, GetDashboardSummaryParams,
} from "@workspace/api-client-react";
import { DateRangePicker } from "@/components/date-range-picker";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import { Download, DollarSign, Target, TrendingUp, Activity, ShoppingCart, ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

type DateFilter = "weekly" | "daily" | "monthly" | "all" | "custom";

const DATE_FILTER_LABELS: Record<Exclude<DateFilter, "custom">, string> = {
  daily: "Hoje",
  weekly: "7 dias",
  monthly: "15 dias",
  all: "30 dias",
};

function getDecisionBadgeClass(decision: string, monitorarReason?: string | null) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 border-green-500/30";
    case "MONITORAR":
      return monitorarReason === "decaindo"
        ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
        : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

type SortKey = "name" | "spend" | "commission" | "roas" | "cpa" | "totalSales";

export default function Relatorios() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekly");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("roas");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const params = useMemo((): ListCreativesParams & GetDashboardSummaryParams => {
    if (dateFilter === "custom") {
      return { dateFrom: customFrom || undefined, dateTo: customTo || undefined, sortBy: "roas", sortOrder: "desc", dateFilter: "all" };
    }
    return { dateFilter, sortBy: "roas", sortOrder: "desc" };
  }, [dateFilter, customFrom, customTo]);

  const { data: creatives, isLoading } = useListCreatives(params, {
    query: { queryKey: getListCreativesQueryKey(params) }
  });

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(params, {
    query: { queryKey: getGetDashboardSummaryQueryKey(params) }
  });

  const sorted = useMemo(() => {
    if (!creatives) return [];
    return [...creatives].sort((a, b) => {
      const aVal = sortBy === "name" ? a.name : (a as unknown as Record<string, number>)[sortBy];
      const bVal = sortBy === "name" ? b.name : (b as unknown as Record<string, number>)[sortBy];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [creatives, sortBy, sortOrder]);

  function handleSort(col: SortKey) {
    if (sortBy === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  }

  function exportCsv() {
    if (!sorted.length) return;
    const rows = [
      ["Criativo", "Data", "Gasto (R$)", "Comissão (R$)", "ROAS", "CPA (R$)", "Vendas", "Decisão", "Previsibilidade"],
      ...sorted.map(c => [
        c.name,
        formatDate(c.date),
        c.spend.toFixed(2),
        c.commission.toFixed(2),
        c.roas.toFixed(2),
        c.totalSales > 0 ? c.cpa.toFixed(2) : "-",
        c.totalSales,
        c.decision,
        c.predictabilityLabel,
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
      <TableHead
        className={`cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`}
        onClick={() => handleSort(col)}
      >
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
            <p className="text-muted-foreground">Análise detalhada de performance por período.</p>
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
                onChange={(f, t) => {
                  setCustomFrom(f);
                  setCustomTo(t);
                  if (f && t) setDateFilter("custom");
                }}
                isActive={dateFilter === "custom"}
                onActivate={() => setDateFilter("custom")}
              />
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={exportCsv}
              disabled={!sorted.length}
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Gasto Total", value: isSummaryLoading ? null : formatCurrency(summary?.totalSpend ?? 0), icon: <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />, color: "text-foreground" },
            { label: "Comissão Total", value: isSummaryLoading ? null : formatCurrency(summary?.totalCommission ?? 0), icon: <Target className="w-3.5 h-3.5 text-muted-foreground" />, color: "text-foreground" },
            { label: "ROAS Médio", value: isSummaryLoading ? null : formatRoas(summary?.averageRoas ?? 0), icon: <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />, color: "text-primary" },
            { label: "CPA Médio", value: isSummaryLoading ? null : ((summary?.totalSales ?? 0) === 0 ? "—" : formatCurrency(summary?.averageCpa ?? 0)), icon: <Activity className="w-3.5 h-3.5 text-muted-foreground" />, color: getCpaColor(summary?.averageCpa ?? 0, summary?.totalSales ?? 0) },
            { label: "Total Vendas", value: isSummaryLoading ? null : String(summary?.totalSales ?? 0), icon: <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />, color: "text-foreground" },
          ].map(({ label, value, icon, color }) => (
            <Card key={label} className="border-border/50 bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                {icon}
              </CardHeader>
              <CardContent>
                {value === null
                  ? <Skeleton className="h-7 w-24" />
                  : <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
                }
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
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
                  <SortHead col="spend" label="Gasto" className="text-right" />
                  <SortHead col="commission" label="Comissão" className="text-right" />
                  <SortHead col="roas" label="ROAS" className="text-right" />
                  <SortHead col="cpa" label="CPA" className="text-right" />
                  <SortHead col="totalSales" label="Vendas" className="text-right" />
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
