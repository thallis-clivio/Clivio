import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCreatives, getListCreativesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardChartsQueryKey,
  getGetPerformanceSummaryQueryKey,
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
import { Plus, ArrowRight, ArrowDown, ArrowUp, Activity, TrendingDown, ChevronsUpDown, Rocket, Ban, Link2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (label === "EXCELENTE") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (label === "BOM") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function getPredictabilityShort(label: string) {
  if (label === "EXCELENTE") return "Excelente";
  if (label === "BOM") return "Bom";
  return "Ruim";
}

function getCpaColor(cpa: number, totalSales: number) {
  if (totalSales === 0) return "text-muted-foreground";
  if (cpa < 150) return "text-green-400";
  if (cpa < 300) return "text-yellow-400";
  return "text-red-400";
}

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

function CopyLinkButton({ creativeName, userId }: { creativeName: string; userId: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const base = localStorage.getItem("clivio_payt_checkout_url")?.trim() ?? "";
    const utm  = `${userId}::${creativeName}`;
    const link = base ? `${base}${base.includes("?") ? "&" : "?"}utm_content=${utm}` : utm;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={handleCopy}
      title="Copiar link de rastreamento"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" />}
    </Button>
  );
}

export default function Criativos() {
  const [decisionFilter, setDecisionFilter] = useState<CreativeWithMetricsDecision | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<ListCreativesSortBy>("roas");
  const [sortOrder, setSortOrder] = useState<ListCreativesSortOrder>("desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { user } = useUser();
  const userId = user?.id ?? "";
  const queryClient = useQueryClient();

  function handleSort(col: ListCreativesSortBy) {
    if (sortBy === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  }

  const creativeParams: ListCreativesParams = useMemo(() => {
    const p: ListCreativesParams = { sortBy, sortOrder, dateFilter: "all" };
    if (decisionFilter !== "ALL") p.decision = decisionFilter as CreativeWithMetricsDecision;
    return p;
  }, [decisionFilter, sortBy, sortOrder]);

  const { data: creatives, isLoading } = useListCreatives(creativeParams, {
    query: { queryKey: getListCreativesQueryKey(creativeParams) }
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPerformanceSummaryQueryKey() });
  }

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Central de Criativos</h2>
            <p className="text-muted-foreground">Todos os criativos ativos com métricas acumuladas.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-creative">
                <Plus className="w-4 h-4" />
                Adicionar Criativo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px] border-border">
              <DialogHeader>
                <DialogTitle>Novo Criativo</DialogTitle>
              </DialogHeader>
              <CreativeForm onSuccess={() => { setIsCreateOpen(false); invalidateAll(); }} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Table */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>
              {creatives ? `${creatives.length} criativos` : "Criativos"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={decisionFilter} onValueChange={v => setDecisionFilter(v as CreativeWithMetricsDecision | "ALL")}>
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
                {isLoading ? (
                  [1, 2, 3].map(i => (
                    <TableRow key={i} className="border-border">
                      {[...Array(9)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : creatives?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      Nenhum criativo encontrado. Clique em "Adicionar Criativo" para começar.
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
                        <div className="flex items-center">
                          <CopyLinkButton creativeName={creative.name} userId={userId} />
                          <Link href={`/creatives/${creative.id}`}>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-view-${creative.id}`}>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </div>
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
