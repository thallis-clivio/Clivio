import { useState, useMemo } from "react";
import { Link } from "wouter";
import { 
  useListCreatives, 
  getListCreativesQueryKey, 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useGetDecisionBreakdown,
  getGetDecisionBreakdownQueryKey
} from "@workspace/api-client-react";
import { ListCreativesParams, CreativeWithMetricsDecision, ListCreativesSortBy, ListCreativesSortOrder } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRoas } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Plus, ArrowRight, ArrowDown, ArrowUp, Activity, DollarSign, Target, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { Skeleton } from "@/components/ui/skeleton";

function getDecisionColor(decision: string) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 hover:bg-green-500/30";
    case "MONITORAR": return "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30";
    case "OTIMIZAR": return "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 hover:bg-red-500/30";
    default: return "bg-gray-500/20 text-gray-500";
  }
}

function getDecisionFill(decision: string) {
  switch (decision) {
    case "ESCALAR": return "hsl(142 71% 45%)";
    case "MONITORAR": return "hsl(48 96% 53%)";
    case "OTIMIZAR": return "hsl(24 95% 53%)";
    case "PAUSAR": return "hsl(0 84% 60%)";
    default: return "hsl(220 14% 50%)";
  }
}

export default function Home() {
  const [decisionFilter, setDecisionFilter] = useState<CreativeWithMetricsDecision | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<ListCreativesSortBy>("roas");
  const [sortOrder, setSortOrder] = useState<ListCreativesSortOrder>("desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const params: ListCreativesParams = useMemo(() => {
    const p: ListCreativesParams = { sortBy, sortOrder };
    if (decisionFilter !== "ALL") {
      p.decision = decisionFilter as CreativeWithMetricsDecision;
    }
    return p;
  }, [decisionFilter, sortBy, sortOrder]);

  const { data: creatives, isLoading: isCreativesLoading } = useListCreatives(params, {
    query: { queryKey: getListCreativesQueryKey(params) }
  });

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const { data: breakdown, isLoading: isBreakdownLoading } = useGetDecisionBreakdown({
    query: { queryKey: getGetDecisionBreakdownQueryKey() }
  });

  const chartData = useMemo(() => {
    if (!creatives) return [];
    return creatives.slice(0, 10).map(c => ({
      name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
      roas: c.roas,
      decision: c.decision,
    }));
  }, [creatives]);

  return (
    <Layout>
      <div className="flex-1 p-6 space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
            <p className="text-muted-foreground">Performance metrics across all active creatives.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Creative
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] border-border">
              <DialogHeader>
                <DialogTitle>New Creative</DialogTitle>
              </DialogHeader>
              <CreativeForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{formatCurrency(summary?.totalSpend ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission</CardTitle>
              <Target className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{formatCurrency(summary?.totalCommission ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average ROAS</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-primary">{formatRoas(summary?.averageRoas ?? 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Creatives</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{summary?.totalCreatives ?? 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts & Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Top ROAS Performers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {isCreativesLoading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Skeleton className="w-full h-full" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}x`}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                      />
                      <Bar dataKey="roas" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getDecisionFill(entry.decision)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Decision Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isBreakdownLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="font-medium text-green-500">ESCALAR</span>
                    </div>
                    <span className="text-lg font-bold">{breakdown?.ESCALAR ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span className="font-medium text-yellow-500">MONITORAR</span>
                    </div>
                    <span className="text-lg font-bold">{breakdown?.MONITORAR ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span className="font-medium text-orange-500">OTIMIZAR</span>
                    </div>
                    <span className="text-lg font-bold">{breakdown?.OTIMIZAR ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="font-medium text-red-500">PAUSAR</span>
                    </div>
                    <span className="text-lg font-bold">{breakdown?.PAUSAR ?? 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Creatives Table */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Creative Library</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={decisionFilter} onValueChange={(v) => setDecisionFilter(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Decision" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Decisions</SelectItem>
                  <SelectItem value="ESCALAR">Escalar</SelectItem>
                  <SelectItem value="MONITORAR">Monitorar</SelectItem>
                  <SelectItem value="OTIMIZAR">Otimizar</SelectItem>
                  <SelectItem value="PAUSAR">Pausar</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roas">ROAS</SelectItem>
                  <SelectItem value="spend">Spend</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Creative</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">CTR / Hook</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isCreativesLoading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : creatives?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No creatives found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  creatives?.map(creative => (
                    <TableRow key={creative.id} className="border-border hover:bg-muted/50 group">
                      <TableCell className="font-medium">
                        <div>{creative.name}</div>
                        <div className="text-xs text-muted-foreground">{creative.date}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(creative.spend)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(creative.commission)}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-bold font-mono">{formatRoas(creative.roas)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm font-mono">{creative.ctr}%</div>
                        <div className="text-xs text-muted-foreground font-mono">{creative.hookRate}%</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono ${getDecisionColor(creative.decision)}`}>
                          {creative.decision}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
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
