import { useMemo } from "react";
import { Link } from "wouter";
import { useListCreatives, getListCreativesQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatRoas } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Rocket, Ban, TrendingDown, Activity,
  CheckCircle, ArrowRight, BellOff, Plus,
} from "lucide-react";
import { DecisionTooltip } from "@/components/decision-badge";

interface Creative {
  id: number;
  name: string;
  spend: number;
  commission: number;
  roas: number;
  cpa: number;
  totalSales: number;
  daysWithoutSales: number;
  decision: string;
  monitorarReason?: string | null;
  pausarReason?: string | null;
  predictabilityLabel: string;
  predictabilityScore: number;
}

type AlertUrgency = "critical" | "warning" | "monitor" | "info" | "success";

function AlertCard({ creative, urgency }: { creative: Creative; urgency: AlertUrgency }) {
  const colorMap = {
    critical: { border: "border-red-500/30",    bg: "",  icon: "text-red-400",    iconBg: "bg-red-500/10"    },
    warning:  { border: "border-orange-500/30", bg: "",  icon: "text-orange-400", iconBg: "bg-orange-500/10" },
    monitor:  { border: "border-yellow-500/30", bg: "",  icon: "text-yellow-400", iconBg: "bg-yellow-500/10" },
    info:     { border: "border-blue-500/30",   bg: "",  icon: "text-blue-400",   iconBg: "bg-blue-500/10"   },
    success:  { border: "border-green-500/30",  bg: "",  icon: "text-green-400",  iconBg: "bg-green-500/10"  },
  }[urgency];

  function getAlertIcon() {
    if (creative.decision === "ESCALAR") return <Rocket className="w-4 h-4" />;
    if (creative.decision === "LUCRATIVO") return <Rocket className="w-4 h-4" />;
    if (creative.pausarReason === "semVendas") return <Ban className="w-4 h-4" />;
    if (creative.pausarReason === "prejuizo") return <TrendingDown className="w-4 h-4" />;
    if (creative.monitorarReason === "decaindo") return <TrendingDown className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  }

  function getAlertMessage() {
    if (creative.decision === "ESCALAR") return "ROAS ≥ 3.5 com vendas hoje — aumentar budget agora";
    if (creative.decision === "LUCRATIVO") return "ROAS ≥ 2.0 com vendas hoje — manter investimento";
    if (creative.decision === "ATENCAO") return "ROAS entre 1–2 — margem baixa, acompanhar de perto";
    if (creative.pausarReason === "semVendas") return `${creative.daysWithoutSales} dia(s) sem conversão — pausar imediatamente`;
    if (creative.pausarReason === "prejuizo") return "ROAS abaixo de 1.0 — operando em prejuízo, pausar";
    if (creative.monitorarReason === "decaindo") return `${creative.daysWithoutSales} dia(s) sem venda — próximos dias determinam o corte`;
    if (creative.monitorarReason === "lucrativo") return "ROAS alto com 1 dia sem venda — monitorar antes de decidir";
    return "Aguardando dados suficientes para decisão";
  }

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border ${colorMap.border} ${colorMap.bg}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorMap.iconBg}`}>
        <span className={colorMap.icon}>{getAlertIcon()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-semibold text-foreground text-sm">{creative.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{getAlertMessage()}</p>
          </div>
          <DecisionTooltip decision={creative.decision}>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${
                urgency === "critical" ? "text-red-400 border-red-500/50" :
                urgency === "warning"  ? "text-orange-400 border-orange-500/50" :
                urgency === "monitor"  ? "text-yellow-400 border-yellow-500/50" :
                urgency === "info"     ? "text-blue-400 border-blue-500/50" :
                "text-green-400 border-green-500/50"
              }`}
            >
              {creative.decision === "ATENCAO" ? "ATENÇÃO" : creative.decision}
            </Badge>
          </DecisionTooltip>
        </div>
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          <span className="text-xs text-muted-foreground">
            ROAS <span className="font-semibold text-foreground tabular-nums">{formatRoas(creative.roas)}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Vendas <span className="font-semibold text-foreground tabular-nums">{creative.totalSales}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Gasto <span className="font-semibold text-foreground tabular-nums">{formatCurrency(creative.spend)}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Comissão <span className="font-semibold text-foreground tabular-nums">{formatCurrency(creative.commission)}</span>
          </span>
        </div>
      </div>
      <Link href={`/creatives/${creative.id}`} className="shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8">
          Detalhes
          <ArrowRight className="w-3 h-3" />
        </Button>
      </Link>
    </div>
  );
}

function AlertSection({
  title,
  description,
  icon,
  creatives,
  urgency,
  emptyText,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  creatives: Creative[];
  urgency: AlertUrgency;
  emptyText: string;
}) {
  const headerColor =
    urgency === "critical" ? "text-red-400"    :
    urgency === "warning"  ? "text-orange-400" :
    urgency === "monitor"  ? "text-yellow-400" :
    urgency === "info"     ? "text-blue-400"   : "text-green-400";
  const countBg =
    urgency === "critical" ? "bg-red-500/20 text-red-400"       :
    urgency === "warning"  ? "bg-orange-500/20 text-orange-400" :
    urgency === "monitor"  ? "bg-yellow-500/20 text-yellow-400" :
    urgency === "info"     ? "bg-blue-500/20 text-blue-400"     : "bg-green-500/20 text-green-400";

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={headerColor}>{icon}</span>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
          <span className={`text-sm font-bold px-2.5 py-1 rounded-full tabular-nums ${countBg}`}>
            {creatives.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {creatives.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{emptyText}</p>
        ) : (
          creatives.map(c => <AlertCard key={c.id} creative={c} urgency={urgency} />)
        )}
      </CardContent>
    </Card>
  );
}

export default function Alertas() {
  const { data: allCreatives, isLoading } = useListCreatives(
    { dateFilter: "all", sortBy: "roas", sortOrder: "asc" },
    { query: { queryKey: getListCreativesQueryKey({ dateFilter: "all", sortBy: "roas", sortOrder: "asc" }) } }
  );

  const { pausar, monitorarDecaindo, atencao, monitorarLucrativo, lucrativo, escalar } = useMemo(() => {
    const creatives = (allCreatives ?? []) as Creative[];
    return {
      pausar: creatives.filter(c => c.decision === "PAUSAR"),
      monitorarDecaindo: creatives.filter(c => c.decision === "MONITORAR" && c.monitorarReason === "decaindo"),
      atencao: creatives.filter(c => c.decision === "ATENCAO"),
      monitorarLucrativo: creatives.filter(c => c.decision === "MONITORAR" && c.monitorarReason === "lucrativo"),
      lucrativo: creatives.filter(c => c.decision === "LUCRATIVO"),
      escalar: creatives.filter(c => c.decision === "ESCALAR"),
    };
  }, [allCreatives]);

  const totalActionNeeded = pausar.length + monitorarDecaindo.length + atencao.length;
  const investimentoEmRisco = pausar.reduce((s, c) => s + c.spend, 0);
  const comissaoPotencial = [...escalar, ...lucrativo].reduce((s, c) => s + c.commission, 0);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 p-6 space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Alertas</h2>
            <p className="text-muted-foreground">Ações recomendadas pelo motor de decisão.</p>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        </div>
      </Layout>
    );
  }

  const hasAnyCreative = (allCreatives?.length ?? 0) > 0;

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Alertas</h2>
          <p className="text-muted-foreground">Ações recomendadas pelo motor de decisão automático.</p>
        </div>

        {!hasAnyCreative ? (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <BellOff className="w-12 h-12 text-muted-foreground opacity-30" />
              <div className="text-center">
                <p className="font-semibold text-foreground">Nenhum criativo cadastrado</p>
                <p className="text-sm text-muted-foreground mt-1">Adicione criativos para começar a receber alertas automáticos.</p>
              </div>
              <Link href="/criativos">
                <Button className="gap-2 mt-2">
                  <Plus className="w-4 h-4" />
                  Adicionar Criativo
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-red-400">{totalActionNeeded}</p>
                      <p className="text-xs text-muted-foreground">criativos precisam de ação</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/15 flex items-center justify-center">
                      <TrendingDown className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-yellow-400">{formatCurrency(investimentoEmRisco)}</p>
                      <p className="text-xs text-muted-foreground">investimento em criativos a pausar</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
                      <Rocket className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-green-400">{formatCurrency(comissaoPotencial)}</p>
                      <p className="text-xs text-muted-foreground">comissão acumulada para escalar</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tudo ok banner */}
            {totalActionNeeded === 0 && escalar.length === 0 && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="flex items-center gap-4 py-5">
                  <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-300">Tudo sob controle!</p>
                    <p className="text-sm text-muted-foreground">Nenhum criativo precisa de ação imediata. Continue monitorando.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Alert sections */}
            <AlertSection
              title="Ação Necessária — Pausar"
              description="Criativos sem vendas por 3+ dias ou operando com prejuízo (ROAS < 1)."
              icon={<AlertTriangle className="w-5 h-5" />}
              creatives={pausar}
              urgency="critical"
              emptyText="Nenhum criativo precisa ser pausado agora."
            />

            <AlertSection
              title="Monitorar — Decaindo"
              description="Com dias sem venda. Próximos 1–2 dias determinam se serão cortados."
              icon={<TrendingDown className="w-5 h-5" />}
              creatives={monitorarDecaindo}
              urgency="monitor"
              emptyText="Nenhum criativo em decaimento detectado."
            />

            {atencao.length > 0 && (
              <AlertSection
                title="Atenção — Margem Baixa"
                description="ROAS entre 1–2: vendendo mas com lucro marginal. Avaliar otimizações."
                icon={<Activity className="w-5 h-5" />}
                creatives={atencao}
                urgency="warning"
                emptyText=""
              />
            )}

            <AlertSection
              title="Oportunidade — Escalar"
              description="ROAS ≥ 3.5 com vendas hoje. Aumentar orçamento agora."
              icon={<Rocket className="w-5 h-5" />}
              creatives={escalar}
              urgency="success"
              emptyText="Nenhum criativo pronto para escala no momento."
            />

            {lucrativo.length > 0 && (
              <AlertSection
                title="Lucrativos — Manter"
                description="ROAS ≥ 2.0 com vendas hoje. Manter investimento e acompanhar."
                icon={<CheckCircle className="w-5 h-5" />}
                creatives={lucrativo}
                urgency="info"
                emptyText=""
              />
            )}

            {monitorarLucrativo.length > 0 && (
              <AlertSection
                title="Monitorar — Alto ROAS"
                description="ROAS ≥ 3 com 1 dia sem venda. Provavelmente vai se recuperar — acompanhe."
                icon={<Activity className="w-5 h-5" />}
                creatives={monitorarLucrativo}
                urgency="monitor"
                emptyText=""
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
