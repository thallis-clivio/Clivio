import { useParams, Link, useLocation } from "wouter";
import { 
  useGetCreative, 
  getGetCreativeQueryKey, 
  useDeleteCreative,
  useAnalyzeCreative,
  getListCreativesQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDecisionBreakdownQueryKey
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatRoas } from "@/lib/format";
import { ArrowLeft, Trash2, Edit, BrainCircuit, Activity, LineChart, Target, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreativeForm } from "@/components/creative-form";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function getDecisionColor(decision: string) {
  switch (decision) {
    case "ESCALAR": return "bg-green-500/20 text-green-500 border-green-500/30";
    case "MONITORAR": return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    case "OTIMIZAR": return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    case "PAUSAR": return "bg-red-500/20 text-red-500 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  }
}

export default function CreativeDetail() {
  const { id } = useParams<{ id: string }>();
  const creativeId = parseInt(id || "0", 10);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: creative, isLoading } = useGetCreative(creativeId, {
    query: { queryKey: getGetCreativeQueryKey(creativeId), enabled: !!creativeId }
  });

  const deleteCreative = useDeleteCreative();
  const analyzeCreative = useAnalyzeCreative();

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this creative?")) {
      deleteCreative.mutate(
        { id: creativeId },
        {
          onSuccess: () => {
            toast({ title: "Creative deleted" });
            queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
            setLocation("/");
          },
          onError: () => toast({ title: "Failed to delete", variant: "destructive" })
        }
      );
    }
  };

  const handleAnalyze = () => {
    analyzeCreative.mutate(
      { id: creativeId },
      {
        onSuccess: () => {
          toast({ title: "Analysis complete" });
        },
        onError: () => toast({ title: "Analysis failed", variant: "destructive" })
      }
    );
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
          <h2 className="text-2xl font-bold mb-4">Creative not found</h2>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
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
              <Button variant="outline" size="icon" className="shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h2 className="text-3xl font-bold tracking-tight font-mono">{creative.name}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-muted-foreground text-sm">{creative.date}</span>
                <Badge variant="outline" className={`font-mono border ${getDecisionColor(creative.decision)}`}>
                  {creative.decision}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={handleAnalyze}
              disabled={analyzeCreative.isPending}
            >
              <BrainCircuit className={`w-4 h-4 ${analyzeCreative.isPending ? 'animate-pulse text-primary' : ''}`} />
              {analyzeCreative.isPending ? 'Analyzing...' : 'AI Analysis'}
            </Button>
            
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Edit className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-border">
                <DialogHeader>
                  <DialogTitle>Edit Creative</DialogTitle>
                </DialogHeader>
                <CreativeForm initialData={creative} onSuccess={() => setIsEditOpen(false)} />
              </DialogContent>
            </Dialog>

            <Button variant="destructive" size="icon" onClick={handleDelete} disabled={deleteCreative.isPending}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* AI Analysis Result */}
        {analyzeCreative.data && (
          <Alert className="border-primary bg-primary/5 text-primary">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <AlertTitle className="font-bold tracking-widest uppercase">Intelligence Report</AlertTitle>
            <AlertDescription className="mt-2 space-y-4">
              <div className="text-foreground">{analyzeCreative.data.explanation}</div>
              <div className="bg-background/50 p-3 rounded-md border border-border">
                <strong className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Recommended Action</strong>
                <span className="font-mono text-sm">{analyzeCreative.data.nextAction}</span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main KPI Column */}
          <div className="space-y-6">
            <Card className="border-border/50 bg-card/50 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">ROAS</div>
                  <div className="text-4xl font-bold font-mono text-primary">{formatRoas(creative.roas)}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Spend</div>
                    <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(creative.spend)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Commission</div>
                    <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(creative.commission)}</div>
                  </div>
                </div>
                <div className="h-px bg-border w-full" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">CTR</div>
                    <div className="text-lg font-mono text-foreground">{creative.ctr}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Hook Rate</div>
                    <div className="text-lg font-mono text-foreground">{creative.hookRate}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {creative.daysWithoutSales > 0 && (
              <Alert className="border-orange-500/50 bg-orange-500/10 text-orange-500">
                <AlertTriangle className="h-4 w-4 stroke-orange-500" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  This creative has had no sales for <strong>{creative.daysWithoutSales} days</strong>.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Sales Breakdown */}
          <Card className="md:col-span-2 border-border/50 bg-card/50 shadow-md">
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <LineChart className="w-4 h-4" />
                Sales Funnel Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="bg-background p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground mb-2">5m Plan</div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold font-mono">{creative.sales5m}</div>
                    <div className="text-xs text-muted-foreground pb-1">@ $217</div>
                  </div>
                </div>
                <div className="bg-background p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground mb-2">7m Plan</div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold font-mono">{creative.sales7m}</div>
                    <div className="text-xs text-muted-foreground pb-1">@ $300</div>
                  </div>
                </div>
                <div className="bg-background p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground mb-2">9m Plan</div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold font-mono">{creative.sales9m}</div>
                    <div className="text-xs text-muted-foreground pb-1">@ $380</div>
                  </div>
                </div>
                <div className="bg-background p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground mb-2">12m Plan</div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold font-mono">{creative.sales12m}</div>
                    <div className="text-xs text-muted-foreground pb-1">@ $460</div>
                  </div>
                </div>
                <div className="bg-background p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground mb-2">16m Plan</div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold font-mono">{creative.sales16m}</div>
                    <div className="text-xs text-muted-foreground pb-1">@ $520</div>
                  </div>
                </div>
                <div className="bg-background p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground mb-2">20m Plan</div>
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold font-mono">{creative.sales20m}</div>
                    <div className="text-xs text-muted-foreground pb-1">@ $650</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
