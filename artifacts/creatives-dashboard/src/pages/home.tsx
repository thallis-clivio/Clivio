import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCreatives, getListCreativesQueryKey,
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetPerformanceSummary, getGetPerformanceSummaryQueryKey,
  useGetDashboardCharts, getGetDashboardChartsQueryKey,
  useSimulateSale,
} from "@workspace/api-client-react";
import {
  ListCreativesParams, CreativeWithMetricsDecision,
  ListCreativesSortBy, ListCreativesSortOrder,
  PerformanceSummary, SimulateSaleBodyPlan,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Plus, ArrowRight, ArrowDown, ArrowUp, Activity, DollarSign, Target, TrendingUp, TrendingDown, ShoppingBag, ShoppingCart, ChevronsUpDown, Rocket, Ban, FlaskConical, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { Skeleton } from "@/components/ui/skeleton";

type DateFilter = "weekly" | "daily" | "monthly" | "all";

function getDecisionColor(decision: string, monitorarReason?: string | null) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 hover:bg-green-500/30";
    case "MONITORAR":
      return monitorarReason === "decaindo"
        ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
        : "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 hover:bg-red-500/30";
    default: return "bg-gray-500/20 text-gray-500";
  }
}

function getMonitorarLabel(reason?: string | null) {
  if (reason === "decaindo") return "Decaindo";
  if (reason === "lucrativo") return "Lucrativo";
  return null;
}

function getPausarLabel(reason?: string | null) {
  if (reason === "semVendas") return "Sem Vendas";
  if (reason === "prejuizo") return "Prejuízo";
  return null;
}

function getPredictabilityColor(label: string) {
  if (label === "ALTA PREVISIBILIDADE") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (label === "MÉDIA PREVISIBILIDADE") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function getPredictabilityShort(label: string) {
  if (label === "ALTA PREVISIBILIDADE") return "Alta";
  if (label === "MÉDIA PREVISIBILIDADE") return "Média";
  return "Baixa";
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  daily: "Hoje",
  weekly: "Últimos 7 dias",
  monthly: "Últimos 15 dias",
  all: "Últimos 30 dias",
};

const SORTABLE_COLS: { key: ListCreativesSortBy; label: string }[] = [
  { key: "spend", label: "Gasto" },
  { key: "commission", label: "Comissão" },
  { key: "roas", label: "ROAS" },
  { key: "cpa", label: "CPA" },
  { key: "totalSales", label: "Vendas" },
];

function SortableHead({
  col, sortBy, sortOrder, onSort, className,
}: {
  col: ListCreativesSortBy;
  sortBy: ListCreativesSortBy;
  sortOrder: ListCreativesSortOrder;
  onSort: (col: ListCreativesSortBy) => void;
  className?: string;
}) {
  const active = sortBy === col;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1 justify-end w-full">
        {SORTABLE_COLS.find(c => c.key === col)?.label}
        {active
          ? sortOrder === "asc"
            ? <ArrowUp className="w-3 h-3 text-primary" />
            : <ArrowDown className="w-3 h-3 text-primary" />
          : <ChevronsUpDown className="w-3 h-3 opacity-30" />
        }
      </span>
    </TableHead>
  );
}

function StatRow({ icon, label, name, main, sub, colorBg, colorText }: {
  icon: React.ReactNode;
  label: string;
  name: string;
  main: string;
  sub: string;
  colorBg: string;
  colorText: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
      <div className={`mt-0.5 w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${colorBg}`}>
        <span className={colorText}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-semibold text-foreground truncate">{name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-base font-bold tabular-nums leading-none ${colorText}`}>{main}</span>
          <span className="text-xs text-muted-foreground">{sub}</span>
        </div>
      </div>
    </div>
  );
}

function PerformanceSummaryPanel({ data, isLoading }: { data?: PerformanceSummary; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </div>
    );
  }

  if (!data || data.totalCreatives === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Nenhum criativo no período.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.bestRoas && (
        <StatRow
          icon={<TrendingUp className="w-4 h-4" />}
          label="Melhor ROAS"
          name={data.bestRoas.name}
          main={`${data.bestRoas.roas.toFixed(2)}x`}
          sub={`comissão ${formatCurrency(data.bestRoas.commission)}`}
          colorBg="bg-green-500/20"
          colorText="text-green-400"
        />
      )}
      {data.worstCpa && (
        <StatRow
          icon={<TrendingDown className="w-4 h-4" />}
          label="Pior CPA"
          name={data.worstCpa.name}
          main={formatCurrency(data.worstCpa.cpa)}
          sub={`${data.worstCpa.totalSales} vendas · gasto ${formatCurrency(data.worstCpa.spend)}`}
          colorBg="bg-red-500/20"
          colorText="text-red-400"
        />
      )}
      {data.mostSales && (
        <StatRow
          icon={<ShoppingBag className="w-4 h-4" />}
          label="Mais Vendas"
          name={data.mostSales.name}
          main={`${data.mostSales.totalSales} vendas`}
          sub={`ROAS ${data.mostSales.roas.toFixed(2)}x`}
          colorBg="bg-blue-500/20"
          colorText="text-blue-400"
        />
      )}

      <div className="pt-1 border-t border-border mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 mt-2">
          Situação dos Criativos
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <span className="text-2xl font-bold tabular-nums text-green-400">{data.decisions.ESCALAR}</span>
            <span className="text-[10px] text-green-600 font-semibold mt-0.5">ESCALAR</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-2xl font-bold tabular-nums text-yellow-400">{data.decisions.MONITORAR}</span>
            <span className="text-[10px] text-yellow-600 font-semibold mt-0.5">MONITOR.</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="text-2xl font-bold tabular-nums text-red-400">{data.decisions.PAUSAR}</span>
            <span className="text-[10px] text-red-600 font-semibold mt-0.5">PAUSAR</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekly");
  const [decisionFilter, setDecisionFilter] = useState<CreativeWithMetricsDecision | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<ListCreativesSortBy>("roas");
  const [sortOrder, setSortOrder] = useState<ListCreativesSortOrder>("desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simCreative, setSimCreative] = useState("");
  const [simPlan, setSimPlan] = useState<SimulateSaleBodyPlan>("7m");
  const [simResult, setSimResult] = useState<"success" | "error" | null>(null);

  const queryClient = useQueryClient();
  const simulateMutation = useSimulateSale({
    mutation: {
      onSuccess: (data) => {
        if (data.ok) {
          setSimResult("success");
          queryClient.invalidateQueries();
        } else {
          setSimResult("error");
        }
      },
      onError: () => setSimResult("error"),
    },
  });

  function handleSort(col: ListCreativesSortBy) {
    if (sortBy === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  }

  const creativeParams: ListCreativesParams = useMemo(() => {
    const p: ListCreativesParams = { sortBy, sortOrder, dateFilter };
    if (decisionFilter !== "ALL") p.decision = decisionFilter as CreativeWithMetricsDecision;
    return p;
  }, [decisionFilter, sortBy, sortOrder, dateFilter]);

  const dashParams = useMemo(() => ({ dateFilter }), [dateFilter]);

  const { data: creatives, isLoading: isCreativesLoading } = useListCreatives(creativeParams, {
    query: { queryKey: getListCreativesQueryKey(creativeParams) }
  });
  const { data: allCreatives } = useListCreatives({ dateFilter: "all" }, {
    query: { queryKey: getListCreativesQueryKey({ dateFilter: "all" }) }
  });
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(dashParams, {
    query: { queryKey: getGetDashboardSummaryQueryKey(dashParams) }
  });
  const { data: performanceSummary, isLoading: isPerformanceLoading } = useGetPerformanceSummary(dashParams, {
    query: { queryKey: getGetPerformanceSummaryQueryKey(dashParams) }
  });
  const { data: chartData, isLoading: isChartLoading } = useGetDashboardCharts(dashParams, {
    query: { queryKey: getGetDashboardChartsQueryKey(dashParams) }
  });

  const formattedChartData = useMemo(() => {
    if (!chartData) return [];
    return chartData.map(d => ({ ...d, dateLabel: formatDate(d.date) }));
  }, [chartData]);

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header + Date Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Visão Geral</h2>
            <p className="text-muted-foreground">Métricas de desempenho de todos os criativos ativos.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["daily", "weekly", "monthly", "all"] as DateFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    dateFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid={`button-date-${f}`}
                >
                  {DATE_FILTER_LABELS[f]}
                </button>
              ))}
            </div>
            <Dialog open={isSimulateOpen} onOpenChange={(open) => {
              setIsSimulateOpen(open);
              if (!open) { setSimResult(null); setSimCreative(""); setSimPlan("7m"); }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-dashed border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300">
                  <FlaskConical className="w-4 h-4" />
                  Simular Venda
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px] border-border">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-yellow-400" />
                    Simular Venda (Teste)
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Simula uma venda recebida via postback da Payt. Use para verificar se o webhook está funcionando corretamente.
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Criativo</label>
                    <Select value={simCreative} onValueChange={setSimCreative}>
                      <SelectTrigger className="border-border">
                        <SelectValue placeholder="Selecione o criativo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allCreatives?.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Plano</label>
                    <Select value={simPlan} onValueChange={(v) => setSimPlan(v as SimulateSaleBodyPlan)}>
                      <SelectTrigger className="border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["5m", "7m", "9m", "12m", "16m", "20m"] as const).map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {simResult === "success" && (
                    <div className="flex items-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      Venda simulada com sucesso! O dashboard foi atualizado.
                    </div>
                  )}
                  {simResult === "error" && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm">
                      <XCircle className="w-4 h-4 shrink-0" />
                      Criativo não encontrado. Verifique o nome exato.
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1"
                      disabled={!simCreative || simulateMutation.isPending}
                      onClick={() => {
                        setSimResult(null);
                        simulateMutation.mutate({ data: { creativeName: simCreative, plan: simPlan } });
                      }}
                    >
                      {simulateMutation.isPending ? "Simulando..." : "Simular +1 Venda"}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      disabled={!simCreative || simulateMutation.isPending}
                      onClick={() => {
                        setSimResult(null);
                        simulateMutation.mutate({ data: { creativeName: simCreative, plan: simPlan, cancelled: true } });
                      }}
                    >
                      −1 (Cancelar)
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-add-creative">
                  <Plus className="w-4 h-4" />
                  Adicionar Criativo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-border">
                <DialogHeader>
                  <DialogTitle>Novo Criativo</DialogTitle>
                </DialogHeader>
                <CreativeForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Gasto Total</CardTitle>
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className="text-xl font-bold tabular-nums text-foreground" data-testid="text-total-spend">{formatCurrency(summary?.totalSpend ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Comissão Total</CardTitle>
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className="text-xl font-bold tabular-nums text-foreground" data-testid="text-total-commission">{formatCurrency(summary?.totalCommission ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">ROAS Médio</CardTitle>
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-20" /> : (
                <div className="text-xl font-bold tabular-nums text-primary" data-testid="text-average-roas">{formatRoas(summary?.averageRoas ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">CPA Médio</CardTitle>
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className={`text-xl font-bold tabular-nums ${getCpaColor(summary?.averageCpa ?? 0, summary?.totalSales ?? 0)}`} data-testid="text-average-cpa">
                  {(summary?.totalSales ?? 0) === 0 ? "—" : formatCurrency(summary?.averageCpa ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total de Vendas</CardTitle>
              <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-xl font-bold tabular-nums text-foreground" data-testid="text-total-sales">{summary?.totalSales ?? 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart + Performance Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                {isChartLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : formattedChartData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    Nenhum dado para o período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                        formatter={(v: number) => [v, "Vendas Totais"]}
                        labelFormatter={label => `Data: ${label}`}
                      />
                      <Line
                        dataKey="totalSales"
                        stroke="hsl(142 71% 45%)"
                        strokeWidth={2.5}
                        dot={{ fill: "hsl(142 71% 45%)", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Resumo de Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <PerformanceSummaryPanel data={performanceSummary} isLoading={isPerformanceLoading} />
            </CardContent>
          </Card>
        </div>

        {/* Creatives Table */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Biblioteca de Criativos</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={decisionFilter} onValueChange={v => setDecisionFilter(v as any)}>
                <SelectTrigger className="w-[155px]">
                  <SelectValue placeholder="Decisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as Decisões</SelectItem>
                  <SelectItem value="ESCALAR">Escalar</SelectItem>
                  <SelectItem value="MONITORAR">Monitorar</SelectItem>
                  <SelectItem value="PAUSAR">Pausar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort("name" as ListCreativesSortBy)}
                  >
                    <span className="inline-flex items-center gap-1">
                      Criativo
                      {sortBy === "name"
                        ? sortOrder === "asc"
                          ? <ArrowUp className="w-3 h-3 text-primary" />
                          : <ArrowDown className="w-3 h-3 text-primary" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-30" />
                      }
                    </span>
                  </TableHead>
                  <SortableHead col="spend" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="commission" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="roas" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="cpa" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <SortableHead col="totalSales" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right" />
                  <TableHead>Decisão</TableHead>
                  <TableHead>Previsibilidade</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isCreativesLoading ? (
                  [1, 2, 3].map(i => (
                    <TableRow key={i} className="border-border">
                      {[...Array(9)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : creatives?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      Nenhum criativo encontrado. Adicione um para começar.
                    </TableCell>
                  </TableRow>
                ) : (
                  creatives?.map(creative => (
                    <TableRow key={creative.id} className="border-border hover:bg-muted/50 group" data-testid={`row-creative-${creative.id}`}>
                      <TableCell className="font-medium">
                        <div data-testid={`text-name-${creative.id}`}>{creative.name}</div>
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
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={`text-xs inline-flex items-center gap-1 ${getDecisionColor(creative.decision, creative.monitorarReason)}`}>
                            {creative.decision === "ESCALAR" && <Rocket className="w-2.5 h-2.5" />}
                            {creative.decision === "MONITORAR" && (
                              creative.monitorarReason === "decaindo"
                                ? <TrendingDown className="w-2.5 h-2.5" />
                                : <Activity className="w-2.5 h-2.5" />
                            )}
                            {creative.decision === "PAUSAR" && (
                              creative.pausarReason === "semVendas"
                                ? <Ban className="w-2.5 h-2.5" />
                                : <TrendingDown className="w-2.5 h-2.5" />
                            )}
                            {creative.decision}
                          </Badge>
                          {creative.decision === "ESCALAR" && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-400">
                              <Rocket className="w-2.5 h-2.5" />
                              Acelerando
                            </span>
                          )}
                          {creative.decision === "MONITORAR" && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${creative.monitorarReason === "decaindo" ? "text-orange-400" : "text-yellow-400"}`}>
                              {creative.monitorarReason === "decaindo"
                                ? <TrendingDown className="w-2.5 h-2.5" />
                                : <Activity className="w-2.5 h-2.5" />
                              }
                              {getMonitorarLabel(creative.monitorarReason)}
                            </span>
                          )}
                          {creative.decision === "PAUSAR" && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-400">
                              {creative.pausarReason === "semVendas"
                                ? <Ban className="w-2.5 h-2.5" />
                                : <TrendingDown className="w-2.5 h-2.5" />
                              }
                              {getPausarLabel(creative.pausarReason)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs border ${getPredictabilityColor(creative.predictabilityLabel)}`}>
                          {getPredictabilityShort(creative.predictabilityLabel)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/creatives/${creative.id}`}>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-view-${creative.id}`}>
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
