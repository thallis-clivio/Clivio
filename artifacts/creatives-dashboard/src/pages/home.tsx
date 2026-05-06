import { useState, useMemo } from "react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetPerformanceSummary, getGetPerformanceSummaryQueryKey,
  useGetDashboardCharts, getGetDashboardChartsQueryKey,
} from "@workspace/api-client-react";
import {
  GetDashboardSummaryParams, GetDashboardChartsParams, GetPerformanceSummaryParams, PerformanceSummary,
} from "@workspace/api-client-react";
import { DateRangePicker } from "@/components/date-range-picker";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Activity, DollarSign, Target, TrendingUp, TrendingDown, ShoppingBag, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

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
