import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListCreatives, getListCreativesQueryKey,
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetDecisionBreakdown, getGetDecisionBreakdownQueryKey,
  useGetDashboardCharts, getGetDashboardChartsQueryKey,
} from "@workspace/api-client-react";
import {
  ListCreativesParams, CreativeWithMetricsDecision,
  ListCreativesSortBy, ListCreativesSortOrder,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Plus, ArrowRight, ArrowDown, ArrowUp, Activity, DollarSign, Target, TrendingUp, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { Skeleton } from "@/components/ui/skeleton";

type DateFilter = "all" | "daily" | "weekly" | "monthly";

function getDecisionColor(decision: string) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 hover:bg-green-500/30";
    case "MONITORAR": return "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30";
    case "OTIMIZAR": return "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 hover:bg-red-500/30";
    default: return "bg-gray-500/20 text-gray-500";
  }
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
  all: "Tudo",
  daily: "Hoje",
  weekly: "Semana",
  monthly: "Mês",
};

type ChartView = "roas" | "cpa" | "sales";

export default function Home() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [decisionFilter, setDecisionFilter] = useState<CreativeWithMetricsDecision | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<ListCreativesSortBy>("roas");
  const [sortOrder, setSortOrder] = useState<ListCreativesSortOrder>("desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [chartView, setChartView] = useState<ChartView>("roas");

  const creativeParams: ListCreativesParams = useMemo(() => {
    const p: ListCreativesParams = { sortBy, sortOrder, dateFilter };
    if (decisionFilter !== "ALL") p.decision = decisionFilter as CreativeWithMetricsDecision;
    return p;
  }, [decisionFilter, sortBy, sortOrder, dateFilter]);

  const dashParams = useMemo(() => ({ dateFilter }), [dateFilter]);

  const { data: creatives, isLoading: isCreativesLoading } = useListCreatives(creativeParams, {
    query: { queryKey: getListCreativesQueryKey(creativeParams) }
  });
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(dashParams, {
    query: { queryKey: getGetDashboardSummaryQueryKey(dashParams) }
  });
  const { data: breakdown, isLoading: isBreakdownLoading } = useGetDecisionBreakdown(dashParams, {
    query: { queryKey: getGetDecisionBreakdownQueryKey(dashParams) }
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
              {(["all", "daily", "weekly", "monthly"] as DateFilter[]).map(f => (
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

        {/* KPI Cards — 5 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Gasto Total</CardTitle>
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-7 w-24" /> : (
                <div className="text-xl font-bold text-foreground" data-testid="text-total-spend">{formatCurrency(summary?.totalSpend ?? 0)}</div>
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
                <div className="text-xl font-bold text-foreground" data-testid="text-total-commission">{formatCurrency(summary?.totalCommission ?? 0)}</div>
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
                <div className="text-xl font-bold text-primary" data-testid="text-average-roas">{formatRoas(summary?.averageRoas ?? 0)}</div>
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
                <div className={`text-xl font-bold ${getCpaColor(summary?.averageCpa ?? 0, summary?.totalSales ?? 0)}`} data-testid="text-average-cpa">
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
                <div className="text-xl font-bold text-foreground" data-testid="text-total-sales">{summary?.totalSales ?? 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts + Decision Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Desempenho ao Longo do Tempo</CardTitle>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(["roas", "cpa", "sales"] as ChartView[]).map(v => (
                    <button
                      key={v}
                      onClick={() => setChartView(v)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        chartView === v
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {v === "roas" ? "ROAS" : v === "cpa" ? "CPA" : "Vendas"}
                    </button>
                  ))}
                </div>
              </div>
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
                    {chartView === "sales" ? (
                      <BarChart data={formattedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                          formatter={(v: number) => [v, "Vendas"]}
                        />
                        <Bar dataKey="totalSales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={formattedChartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                          tickFormatter={v => chartView === "roas" ? `${v}x` : `R$${v}`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                          formatter={(v: number) => [chartView === "roas" ? `${v.toFixed(2)}x` : formatCurrency(v), chartView === "roas" ? "ROAS" : "CPA"]}
                        />
                        <Line
                          dataKey={chartView}
                          stroke={chartView === "roas" ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)"}
                          strokeWidth={2}
                          dot={{ fill: chartView === "roas" ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)", r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Distribuição de Decisões</CardTitle>
            </CardHeader>
            <CardContent>
              {isBreakdownLoading ? (
                <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="space-y-3">
                  {(["ESCALAR", "MONITORAR", "OTIMIZAR", "PAUSAR"] as const).map(d => {
                    const colors = {
                      ESCALAR: { bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-500", dot: "bg-green-500" },
                      MONITORAR: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-500", dot: "bg-yellow-500" },
                      OTIMIZAR: { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-500", dot: "bg-orange-500" },
                      PAUSAR: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-500", dot: "bg-red-500" },
                    }[d];
                    return (
                      <div key={d} className={`flex items-center justify-between p-3 rounded-lg ${colors.bg} border ${colors.border}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                          <span className={`font-medium text-sm ${colors.text}`}>{d}</span>
                        </div>
                        <span className="text-base font-bold" data-testid={`count-${d.toLowerCase()}`}>{breakdown?.[d] ?? 0}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Creatives Table */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Biblioteca de Criativos</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={decisionFilter} onValueChange={v => setDecisionFilter(v as any)}>
                <SelectTrigger className="w-[155px]">
                  <SelectValue placeholder="Decisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as Decisões</SelectItem>
                  <SelectItem value="ESCALAR">Escalar</SelectItem>
                  <SelectItem value="MONITORAR">Monitorar</SelectItem>
                  <SelectItem value="OTIMIZAR">Otimizar</SelectItem>
                  <SelectItem value="PAUSAR">Pausar</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roas">ROAS</SelectItem>
                  <SelectItem value="cpa">CPA</SelectItem>
                  <SelectItem value="spend">Gasto</SelectItem>
                  <SelectItem value="commission">Comissão</SelectItem>
                  <SelectItem value="totalSales">Vendas</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")} data-testid="button-toggle-sort">
                {sortOrder === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Criativo</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
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
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(creative.spend)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(creative.commission)}</TableCell>
                      <TableCell className="text-right font-bold font-mono">{formatRoas(creative.roas)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${getCpaColor(creative.cpa, creative.totalSales)}`}>
                        {creative.totalSales === 0 ? <span className="text-muted-foreground">—</span> : formatCurrency(creative.cpa)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{creative.totalSales}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-xs ${getDecisionColor(creative.decision)}`}>
                          {creative.decision}
                        </Badge>
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
