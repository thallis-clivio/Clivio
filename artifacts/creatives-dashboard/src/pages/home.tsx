import { useState, useMemo } from "react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetPerformanceSummary, getGetPerformanceSummaryQueryKey,
  useGetDashboardCharts, getGetDashboardChartsQueryKey,
  useGetDecisionBreakdown, getGetDecisionBreakdownQueryKey,
} from "@workspace/api-client-react";
import {
  GetDashboardSummaryParams, GetDashboardChartsParams, GetPerformanceSummaryParams, PerformanceSummary,
  DecisionBreakdown,
} from "@workspace/api-client-react";
import { DateRangePicker } from "@/components/date-range-picker";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Activity, DollarSign, Target, TrendingUp, TrendingDown, ShoppingBag, ShoppingCart, FlaskConical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type DateFilter = "weekly" | "daily" | "monthly" | "all" | "custom";

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

const DATE_FILTER_LABELS: Record<Exclude<DateFilter, "custom">, string> = {
  daily: "Hoje",
  weekly: "7 dias",
  monthly: "15 dias",
  all: "30 dias",
};

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
        <div className="grid grid-cols-5 gap-1.5">
          <div className="flex flex-col items-center p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <span className="text-xl font-bold tabular-nums text-green-400">{data.decisions.ESCALAR}</span>
            <span className="text-[9px] text-green-600 font-semibold mt-0.5 leading-tight text-center">ESCALAR</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-xl font-bold tabular-nums text-blue-400">{data.decisions.LUCRATIVO}</span>
            <span className="text-[9px] text-blue-600 font-semibold mt-0.5 leading-tight text-center">LUCRAT.</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-xl font-bold tabular-nums text-yellow-400">{data.decisions.MONITORAR}</span>
            <span className="text-[9px] text-yellow-600 font-semibold mt-0.5 leading-tight text-center">MONIT.</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <span className="text-xl font-bold tabular-nums text-orange-400">{data.decisions.ATENCAO}</span>
            <span className="text-[9px] text-orange-600 font-semibold mt-0.5 leading-tight text-center">ATENÇÃO</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="text-xl font-bold tabular-nums text-red-400">{data.decisions.PAUSAR}</span>
            <span className="text-[9px] text-red-600 font-semibold mt-0.5 leading-tight text-center">PAUSAR</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const DECISION_CONFIG = [
  { key: "ESCALAR",   label: "Escalar",   colorBg: "bg-green-500/10",   colorBorder: "border-green-500/20",   colorText: "text-green-400",   colorLabel: "text-green-600"   },
  { key: "LUCRATIVO", label: "Lucrativo", colorBg: "bg-blue-500/10",    colorBorder: "border-blue-500/20",    colorText: "text-blue-400",    colorLabel: "text-blue-600"    },
  { key: "MONITORAR", label: "Monitorar", colorBg: "bg-yellow-500/10",  colorBorder: "border-yellow-500/20",  colorText: "text-yellow-400",  colorLabel: "text-yellow-600"  },
  { key: "ATENCAO",   label: "Atenção",   colorBg: "bg-orange-500/10",  colorBorder: "border-orange-500/20",  colorText: "text-orange-400",  colorLabel: "text-orange-600"  },
  { key: "PAUSAR",    label: "Pausar",    colorBg: "bg-red-500/10",     colorBorder: "border-red-500/20",     colorText: "text-red-400",     colorLabel: "text-red-600"     },
] as const;

function DecisionBreakdownWidget({ data, isLoading }: { data?: DecisionBreakdown; isLoading: boolean }) {
  const total = data ? Object.values(data).reduce((s, v) => s + v, 0) : 0;

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Distribuição por Decisão</CardTitle>
        <p className="text-xs text-muted-foreground">Estado atual de todos os criativos ativos</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-5 gap-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {DECISION_CONFIG.map(({ key, label, colorBg, colorBorder, colorText, colorLabel }) => {
              const count = data?.[key as keyof DecisionBreakdown] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div
                  key={key}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border ${colorBg} ${colorBorder}`}
                  data-testid={`decision-${key.toLowerCase()}`}
                >
                  <span className={`text-3xl font-bold tabular-nums leading-none ${colorText}`}>{count}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${colorLabel}`}>{label}</span>
                  <span className="text-[10px] text-muted-foreground">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && total > 0 && (
          <div className="mt-3 flex rounded-full overflow-hidden h-2">
            {DECISION_CONFIG.map(({ key, colorText }) => {
              const count = data?.[key as keyof DecisionBreakdown] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              if (pct === 0) return null;
              const barColor = {
                ESCALAR:   "bg-green-500",
                LUCRATIVO: "bg-blue-500",
                MONITORAR: "bg-yellow-500",
                ATENCAO:   "bg-orange-500",
                PAUSAR:    "bg-red-500",
              }[key];
              return <div key={key} className={`${barColor} transition-all`} style={{ width: `${pct}%` }} title={`${key}: ${count}`} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekly");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [isSeeding, setIsSeeding] = useState(false);

  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  async function handleSeedDemo() {
    setIsSeeding(true);
    try {
      const token = await getToken();
      await fetch("/api/seed-demo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPerformanceSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
    } finally {
      setIsSeeding(false);
    }
  }

  const dashParams = useMemo((): GetDashboardSummaryParams & GetDashboardChartsParams & GetPerformanceSummaryParams => {
    if (dateFilter === "custom") {
      return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
    }
    return { dateFilter };
  }, [dateFilter, customFrom, customTo]);

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(dashParams, {
    query: { queryKey: getGetDashboardSummaryQueryKey(dashParams) }
  });
  const { data: performanceSummary, isLoading: isPerformanceLoading } = useGetPerformanceSummary(dashParams, {
    query: { queryKey: getGetPerformanceSummaryQueryKey(dashParams) }
  });
  const { data: chartData, isLoading: isChartLoading } = useGetDashboardCharts(dashParams, {
    query: { queryKey: getGetDashboardChartsQueryKey(dashParams) }
  });
  const { data: decisionBreakdown, isLoading: isBreakdownLoading } = useGetDecisionBreakdown(dashParams, {
    query: { queryKey: getGetDecisionBreakdownQueryKey(dashParams) }
  });

  const formattedChartData = useMemo(() => {
    if (!chartData) return [];
    return chartData.map(d => ({ ...d, dateLabel: d.label ?? formatDate(d.date) }));
  }, [chartData]);

  const hasSalesData = useMemo(() => {
    if (!chartData) return false;
    return chartData.some(d => d.totalSales > 0);
  }, [chartData]);

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header + Date Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Visão Geral</h2>
            <p className="text-muted-foreground">Métricas consolidadas de desempenho no período selecionado.</p>
          </div>
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
                data-testid={`button-date-${f}`}
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
        </div>

        {/* Banner de boas-vindas quando não há criativos */}
        {!isSummaryLoading && (summary?.totalCreatives ?? 0) === 0 && (
          <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <FlaskConical className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Nenhum criativo cadastrado ainda</p>
                <p className="text-xs text-muted-foreground">Carregue dados de demonstração para explorar todas as funcionalidades do painel.</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2"
              onClick={handleSeedDemo}
              disabled={isSeeding}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {isSeeding ? "Carregando..." : "Carregar Demonstração"}
            </Button>
          </div>
        )}

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

        {/* Decision Breakdown */}
        <DecisionBreakdownWidget data={decisionBreakdown} isLoading={isBreakdownLoading} />

        {/* Chart + Performance Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vendas no Período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                {isChartLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : !hasSalesData ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                    <Activity className="w-8 h-8 opacity-20" />
                    <p>Nenhuma venda registrada ainda.</p>
                    <p className="text-xs opacity-60">O gráfico aparece quando há dados de vendas.</p>
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
      </div>
    </Layout>
  );
}
