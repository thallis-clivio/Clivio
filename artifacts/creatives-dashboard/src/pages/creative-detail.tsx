import { useParams, Link, useLocation } from "wouter";
import {
  useGetCreative, getGetCreativeQueryKey,
  useDeleteCreative,
  useGetCreativeChart, getGetCreativeChartQueryKey,
  getListCreativesQueryKey, getGetDashboardSummaryQueryKey,
  getGetPerformanceSummaryQueryKey, getGetDashboardChartsQueryKey,
  useGetCommissionSettings,
} from "@workspace/api-client-react";
import { useAuth, useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatRoas, formatDate } from "@/lib/format";
import { ArrowLeft, Trash2, Edit, BrainCircuit, LineChart as LineIcon, AlertTriangle, Gauge, TrendingDown, Activity, Rocket, Ban, Loader2, Link2, Copy, Check, Info, FlaskConical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CreativeForm } from "@/components/creative-form";
import { DecisionTooltip } from "@/components/decision-badge";
import { useState, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

type DateFilter = "all" | "daily" | "weekly" | "monthly";

function ClaudeMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bold headers like **1. Diagnóstico**
        const boldMatch = line.match(/^\*\*(.+?)\*\*(.*)$/);
        if (boldMatch) {
          return (
            <p key={i} className="font-semibold text-foreground mt-3 mb-1">
              {boldMatch[1]}{boldMatch[2]}
            </p>
          );
        }
        // Bullet points
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.replace(/^[-•]\s+/, "");
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span className="text-foreground/90">{renderInlineBold(content)}</span>
            </div>
          );
        }
        return <p key={i} className="text-foreground/90">{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-foreground font-semibold">{part}</strong> : part
  );
}

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: "Tudo",
  daily: "Hoje",
  weekly: "Semana",
  monthly: "Mês",
};

function getDecisionColor(decision: string, monitorarReason?: string | null) {
  switch (decision) {
    case "ESCALAR":   return "text-green-400 border-green-500/50";
    case "LUCRATIVO": return "text-blue-400 border-blue-500/50";
    case "MONITORAR": return "text-yellow-400 border-yellow-500/50";
    case "ATENCAO":   return "text-orange-400 border-orange-500/50";
    case "PAUSAR":    return "text-red-400 border-red-500/50";
    default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
}

function getDecisionLabel(decision: string) {
  if (decision === "ATENCAO") return "ATENÇÃO";
  return decision;
}

function getPausarLabel(reason?: string | null) {
  if (reason === "semVendas") return "Sem Vendas";
  if (reason === "prejuizo") return "Prejuízo";
  return null;
}

function getPredictabilityColor(label: string) {
  if (label === "EXCELENTE") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (label === "BOM") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

export default function CreativeDetail() {
  const { id } = useParams<{ id: string }>();
  const creativeId = parseInt(id || "0", 10);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [chartDateFilter, setChartDateFilter] = useState<DateFilter>("all");
  const [claudeText, setClaudeText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [claudeError, setClaudeError] = useState("");
  const [trackingCopied, setTrackingCopied] = useState(false);
  const [isSimOpen, setIsSimOpen] = useState(false);
  const [simPlan, setSimPlan] = useState("7m");
  const [simIsLtv, setSimIsLtv] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const { getToken } = useAuth();
  const { user } = useUser();

  const { data: creative, isLoading } = useGetCreative(creativeId, {
    query: { queryKey: getGetCreativeQueryKey(creativeId), enabled: !!creativeId }
  });

  const { data: commissionSettings } = useGetCommissionSettings();

  const chartParams = useMemo(() => ({ dateFilter: chartDateFilter }), [chartDateFilter]);
  const { data: chartData, isLoading: isChartLoading } = useGetCreativeChart(creativeId, chartParams, {
    query: { queryKey: getGetCreativeChartQueryKey(creativeId, chartParams), enabled: !!creativeId }
  });

  const formattedChartData = useMemo(() => {
    if (!chartData) return [];
    return chartData.map(d => ({ ...d, dateLabel: formatDate(d.date) }));
  }, [chartData]);

  const hasSalesData = useMemo(() => {
    if (!chartData) return false;
    return chartData.some(d => d.totalSales > 0);
  }, [chartData]);

  const deleteCreative = useDeleteCreative();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPerformanceSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
  }

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este criativo?")) {
      deleteCreative.mutate({ id: creativeId }, {
        onSuccess: () => {
          toast({ title: "Criativo excluído" });
          invalidateAll();
          setLocation("/");
        },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" })
      });
    }
  };

  const handleSimulate = async () => {
    if (!creative || !user?.id) return;
    setSimLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}api/webhooks/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utmContent: `${user.id}::${creative.name}`, plan: simPlan, isLtv: simIsLtv }),
      });
      if (!resp.ok) throw new Error();
      toast({ title: simIsLtv ? "Venda LTV simulada!" : "Venda simulada!", description: `Plano ${simPlan}` });
      setIsSimOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(creativeId) });
      invalidateAll();
    } catch {
      toast({ title: "Erro ao simular venda", variant: "destructive" });
    } finally {
      setSimLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setClaudeText("");
    setClaudeError("");
    setIsStreaming(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${import.meta.env.BASE_URL}api/creatives/${creativeId}/analyze`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "text/event-stream",
        },
      });
      if (!resp.ok || !resp.body) {
        setClaudeError("Falha ao conectar com Claude. Tente novamente.");
        setIsStreaming(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.content) setClaudeText(prev => prev + payload.content);
            if (payload.error) setClaudeError(payload.error);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setClaudeError("Falha na conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsStreaming(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[400px] md:col-span-2" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!creative) {
    return (
      <Layout>
        <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
          <h2 className="text-2xl font-bold mb-4">Criativo não encontrado</h2>
          <Link href="/"><Button>Voltar ao Painel</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon" className="shrink-0" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h2 className="text-3xl font-bold tracking-tight" data-testid="text-creative-name">{creative.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-muted-foreground text-sm">{formatDate(creative.date)}</span>
                <div className="flex flex-col gap-0.5">
                  <DecisionTooltip decision={creative.decision}>
                    <Badge variant="outline" className={`font-mono border text-xs inline-flex items-center gap-1 ${getDecisionColor(creative.decision, creative.monitorarReason)}`} data-testid="badge-decision">
                      {creative.decision === "ESCALAR" && <Rocket className="w-3 h-3" />}
                      {creative.decision === "LUCRATIVO" && <Rocket className="w-3 h-3" />}
                      {creative.decision === "MONITORAR" && (
                        creative.monitorarReason === "decaindo"
                          ? <TrendingDown className="w-3 h-3" />
                          : <Activity className="w-3 h-3" />
                      )}
                      {creative.decision === "ATENCAO" && <Activity className="w-3 h-3" />}
                      {creative.decision === "PAUSAR" && (
                        creative.pausarReason === "semVendas"
                          ? <Ban className="w-3 h-3" />
                          : <TrendingDown className="w-3 h-3" />
                      )}
                      {getDecisionLabel(creative.decision)}
                    </Badge>
                  </DecisionTooltip>
                  {creative.decision === "ESCALAR" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-400">
                      <Rocket className="w-2.5 h-2.5" />
                      Acelerando
                    </span>
                  )}
                  {creative.decision === "LUCRATIVO" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-400">
                      <Rocket className="w-2.5 h-2.5" />
                      Rentável
                    </span>
                  )}
                  {creative.decision === "MONITORAR" && creative.monitorarReason && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-yellow-400">
                      {creative.monitorarReason === "decaindo"
                        ? <TrendingDown className="w-2.5 h-2.5" />
                        : <Activity className="w-2.5 h-2.5" />
                      }
                      {creative.monitorarReason === "decaindo" ? "Decaindo" : "Lucrativo"}
                    </span>
                  )}
                  {creative.decision === "ATENCAO" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-400">
                      <Activity className="w-2.5 h-2.5" />
                      Margem baixa
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
                <Badge variant="outline" className={`border text-xs ${getPredictabilityColor(creative.predictabilityLabel)}`} data-testid="badge-predictability">
                  {creative.predictabilityLabel}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleAnalyze} disabled={isStreaming} data-testid="button-analyze">
              {isStreaming
                ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                : <BrainCircuit className="w-4 h-4" />}
              {isStreaming ? "Analisando..." : "Analisar com Claude"}
            </Button>
            <Dialog open={isSimOpen} onOpenChange={setIsSimOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" data-testid="button-simulate">
                  <FlaskConical className="w-4 h-4" />
                  Simular Venda
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px] border-border">
                <DialogHeader><DialogTitle>Simular Venda</DialogTitle></DialogHeader>
                <div className="space-y-5 pt-2">
                  <div>
                    <p className="text-sm font-medium mb-2">Plano</p>
                    <div className="flex flex-wrap gap-2">
                      {["2m","3m","5m","7m","9m","12m","16m","20m"].map(p => (
                        <Button key={p} variant={simPlan === p ? "default" : "outline"} size="sm" className="text-xs" onClick={() => setSimPlan(p)}>{p}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-violet-500/5">
                    <input
                      type="checkbox"
                      id="sim-ltv"
                      checked={simIsLtv}
                      onChange={e => setSimIsLtv(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-violet-500 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="sim-ltv" className="text-sm font-medium cursor-pointer">É cross-sell (LTV)?</label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">LTV não afeta ROAS, CPA nem o motor de decisão — apenas acumula em Comissão LTV.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setIsSimOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSimulate} disabled={simLoading} className={simIsLtv ? "bg-violet-600 hover:bg-violet-700" : ""}>
                      {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simular"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-edit"><Edit className="w-4 h-4" /></Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-border">
                <DialogHeader><DialogTitle>Editar Criativo</DialogTitle></DialogHeader>
                <CreativeForm initialData={creative} onSuccess={() => { setIsEditOpen(false); queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(creativeId) }); invalidateAll(); }} />
              </DialogContent>
            </Dialog>
            <Button variant="destructive" size="icon" onClick={handleDelete} disabled={deleteCreative.isPending} data-testid="button-delete">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tracking Link */}
        {(() => {
          const base = localStorage.getItem("clivio_payt_checkout_url")?.trim() ?? "";
          const utmContent = `${user?.id ?? ""}::${creative.name}`;
          const link = base
            ? `${base}${base.includes("?") ? "&" : "?"}utm_content=${utmContent}`
            : utmContent;
          const hasBase = base.length > 0;
          return (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/40 border border-border/60">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground mb-0.5">
                  {hasBase ? "Link de rastreamento" : "UTM Content (configure a URL base em Configurações para o link completo)"}
                </p>
                <p className="font-mono text-xs text-foreground truncate">{link}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setTrackingCopied(true);
                  setTimeout(() => setTrackingCopied(false), 2000);
                }}
              >
                {trackingCopied
                  ? <><Check className="h-3 w-3 text-green-400" /> Copiado</>
                  : <><Copy className="h-3 w-3" /> Copiar</>
                }
              </Button>
            </div>
          );
        })()}

        {/* Claude Analysis */}
        {(claudeText || isStreaming || claudeError) && (
          <Alert className="border-primary/40 bg-primary/5" data-testid="alert-analysis">
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className={`h-5 w-5 text-primary ${isStreaming ? "animate-pulse" : ""}`} />
              <AlertTitle className="font-bold tracking-widest uppercase text-primary m-0">
                Análise Claude
              </AlertTitle>
              {isStreaming && (
                <span className="ml-auto text-xs text-muted-foreground animate-pulse">gerando...</span>
              )}
            </div>
            <AlertDescription className="mt-3">
              {claudeError ? (
                <p className="text-destructive text-sm">{claudeError}</p>
              ) : (
                <ClaudeMarkdown text={claudeText} />
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* KPI Column */}
          <div className="space-y-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Desempenho</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">ROAS</div>
                  <div className="text-4xl font-bold tabular-nums text-primary" data-testid="text-roas">{formatRoas(creative.roas)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Gasto</div>
                    <div className="text-lg font-bold tabular-nums" data-testid="text-spend">{formatCurrency(creative.spend)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Comissão Front</div>
                    <div className="text-lg font-bold tabular-nums" data-testid="text-commission">{formatCurrency(creative.commission)}</div>
                  </div>
                </div>
                <TooltipProvider>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${creative.ltvCommission > 0 ? "bg-violet-500/10 border-violet-500/20" : "bg-muted/30 border-border/40"}`}>
                    <div>
                      <div className={`text-xs font-medium flex items-center gap-1 ${creative.ltvCommission > 0 ? "text-violet-400" : "text-muted-foreground"}`}>
                        Comissão LTV
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 cursor-help opacity-60" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[220px] text-xs">
                            LTV não afeta ROAS, CPA nem o motor de decisão — acumula separado das vendas front.
                          </TooltipContent>
                        </UITooltip>
                      </div>
                      <div className="text-xs text-muted-foreground">cross-sell / upsell</div>
                    </div>
                    <div className={`text-base font-bold tabular-nums ${creative.ltvCommission > 0 ? "text-violet-400" : "text-muted-foreground"}`}>
                      {creative.ltvCommission > 0 ? formatCurrency(creative.ltvCommission) : "—"}
                    </div>
                  </div>
                </TooltipProvider>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Total Vendas</div>
                    <div className="text-lg font-bold tabular-nums">{creative.totalSales}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">CPA</div>
                    <div className={`text-lg font-bold tabular-nums ${getCpaColor(creative.cpa, creative.totalSales)}`} data-testid="text-cpa">
                      {creative.totalSales === 0 ? "—" : formatCurrency(creative.cpa)}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Dias sem Venda</div>
                  <div className={`text-base font-semibold tabular-nums ${creative.daysWithoutSales >= 2 ? "text-red-400" : creative.daysWithoutSales === 1 ? "text-yellow-400" : "text-green-400"}`}>
                    {creative.daysWithoutSales}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Predictability Card */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5" />
                  Desempenho
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${getPredictabilityColor(creative.predictabilityLabel).includes("green") ? "text-green-400" : getPredictabilityColor(creative.predictabilityLabel).includes("yellow") ? "text-yellow-400" : "text-red-400"}`}>
                    {creative.predictabilityLabel}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{creative.predictabilityScore}<span className="text-sm text-muted-foreground">/100</span></span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${creative.predictabilityScore > 80 ? "bg-green-500" : creative.predictabilityScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${creative.predictabilityScore}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {creative.daysWithoutSales > 0 && (
              <Alert className="border-orange-500/50 bg-orange-500/10 text-orange-500">
                <AlertTriangle className="h-4 w-4 stroke-orange-500" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  Este criativo está sem vendas há <strong>{creative.daysWithoutSales} dia(s)</strong>.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Sales Over Time + Breakdown */}
          <div className="md:col-span-2 space-y-4">

            {/* Sales chart card */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    Vendas por Dia (este criativo)
                  </CardTitle>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    {(["all", "daily", "weekly", "monthly"] as DateFilter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setChartDateFilter(f)}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${
                          chartDateFilter === f
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {DATE_FILTER_LABELS[f]}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
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
                          formatter={(v: number) => [v, "Vendas"]}
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

            {/* Sales by plan */}
            <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <LineIcon className="w-4 h-4" />
                Vendas por Plano
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {(() => {
                const r = commissionSettings ?? {
                  commission2m: 161.38, commission3m: 187.38,
                  commission5m: 241.38, commission7m: 295.38,
                  commission9m: 376.38, commission12m: 484.38,
                  commission16m: 562.38, commission20m: 1026.38,
                };
                const plans = [
                  { label: "Plano 2m",  value: creative.sales2m,  rate: r.commission2m  },
                  { label: "Plano 3m",  value: creative.sales3m,  rate: r.commission3m  },
                  { label: "Plano 5m",  value: creative.sales5m,  rate: r.commission5m  },
                  { label: "Plano 7m",  value: creative.sales7m,  rate: r.commission7m  },
                  { label: "Plano 9m",  value: creative.sales9m,  rate: r.commission9m  },
                  { label: "Plano 12m", value: creative.sales12m, rate: r.commission12m },
                  { label: "Plano 16m", value: creative.sales16m, rate: r.commission16m },
                  { label: "Plano 20m", value: creative.sales20m, rate: r.commission20m },
                ];
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {plans.map(plan => (
                      <div key={plan.label} className={`bg-background p-4 rounded-lg border ${plan.value > 0 ? "border-primary/30" : "border-border"}`}>
                        <div className="text-xs text-muted-foreground mb-2">{plan.label}</div>
                        <div className="flex items-end justify-between">
                          <div className={`text-3xl font-bold tabular-nums ${plan.value > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>{plan.value}</div>
                          <div className="text-xs text-muted-foreground pb-1">@ {formatCurrency(plan.rate)}</div>
                        </div>
                        {plan.value > 0 && (
                          <div className="text-xs text-primary/80 font-medium mt-1">{formatCurrency(plan.value * plan.rate)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="mt-6 p-4 rounded-lg border border-border bg-background/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total de Vendas</span>
                  <span className="text-xl font-bold tabular-nums">{creative.totalSales}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">Comissão Front Total</span>
                  <span className="text-xl font-bold tabular-nums text-primary">{formatCurrency(creative.commission)}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">CPA (Custo por Aquisição)</span>
                  <span className={`text-xl font-bold tabular-nums ${getCpaColor(creative.cpa, creative.totalSales)}`}>
                    {creative.totalSales === 0 ? "—" : formatCurrency(creative.cpa)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </Layout>
  );
}
