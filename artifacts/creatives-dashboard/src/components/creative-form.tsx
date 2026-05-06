import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useCreateCreative, useUpdateCreative,
  getListCreativesQueryKey, getGetCreativeQueryKey,
  getGetDashboardSummaryQueryKey, getGetDecisionBreakdownQueryKey, getGetDashboardChartsQueryKey,
  CreativeWithMetrics,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { FilePen, TrendingUp } from "lucide-react";

const PLANS = ["2m", "3m", "5m", "7m", "9m", "12m", "16m", "20m"] as const;
type Plan = typeof PLANS[number];

const createSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  date: z.string().min(1, "Data é obrigatória"),
});

const editSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  date: z.string().min(1, "Data é obrigatória"),
  spend: z.coerce.number().min(0, "Deve ser >= 0"),
  sales2m:  z.coerce.number().min(0, "Deve ser >= 0"),
  sales3m:  z.coerce.number().min(0, "Deve ser >= 0"),
  sales5m:  z.coerce.number().min(0, "Deve ser >= 0"),
  sales7m:  z.coerce.number().min(0, "Deve ser >= 0"),
  sales9m:  z.coerce.number().min(0, "Deve ser >= 0"),
  sales12m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales16m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales20m: z.coerce.number().min(0, "Deve ser >= 0"),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues   = z.infer<typeof editSchema>;

interface CreativeFormProps {
  onSuccess?: () => void;
  initialData?: CreativeWithMetrics;
}

export function CreativeForm({ onSuccess, initialData }: CreativeFormProps) {
  const isEdit = !!initialData;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", date: today },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "", date: today,
      spend: 0,
      sales2m: 0, sales3m: 0,
      sales5m: 0, sales7m: 0, sales9m: 0,
      sales12m: 0, sales16m: 0, sales20m: 0,
    },
  });

  useEffect(() => {
    if (initialData) {
      editForm.reset({
        name: initialData.name,
        date: initialData.date,
        spend: initialData.spend,
        sales2m:  initialData.sales2m,
        sales3m:  initialData.sales3m,
        sales5m:  initialData.sales5m,
        sales7m:  initialData.sales7m,
        sales9m:  initialData.sales9m,
        sales12m: initialData.sales12m,
        sales16m: initialData.sales16m,
        sales20m: initialData.sales20m,
      });
    }
  }, [initialData, editForm]);

  const createCreative = useCreateCreative();
  const updateCreative = useUpdateCreative();
  const isPending = createCreative.isPending || updateCreative.isPending;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
  }

  function onCreateSubmit(values: CreateValues) {
    createCreative.mutate(
      {
        data: {
          ...values,
          spend: 0,
          sales2m: 0, sales3m: 0,
          sales5m: 0, sales7m: 0, sales9m: 0,
          sales12m: 0, sales16m: 0, sales20m: 0,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Criativo adicionado com sucesso" });
          invalidateAll();
          onSuccess?.();
        },
        onError: () => toast({ title: "Erro ao criar criativo", variant: "destructive" }),
      }
    );
  }

  function onEditSubmit(values: EditValues) {
    updateCreative.mutate(
      { id: initialData!.id, data: values },
      {
        onSuccess: () => {
          toast({ title: "Criativo atualizado" });
          queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(initialData!.id) });
          invalidateAll();
          onSuccess?.();
        },
        onError: () => toast({ title: "Erro ao atualizar criativo", variant: "destructive" }),
      }
    );
  }

  /* ── CREATE MODE ────────────────────────────────── */
  if (!isEdit) {
    return (
      <Form {...createForm}>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Dê um nome ao criativo e defina a data de início. Gasto e vendas são atualizados na edição conforme os dados do dia chegam.
          </p>

          <FormField control={createForm.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do criativo</FormLabel>
              <FormControl>
                <Input placeholder="ex: VSL-Benefícios-V3" autoFocus {...field} />
              </FormControl>
              <p className="text-[11px] text-muted-foreground mt-1">
                Use o mesmo nome no <code className="text-xs bg-muted px-1 rounded">utm_content</code> do link Payt para rastrear vendas automáticas.
              </p>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={createForm.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>Data de início</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? "Criando..." : "Criar Criativo"}
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  /* ── EDIT MODE ──────────────────────────────────── */
  return (
    <Form {...editForm}>
      <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">

        {/* Identificação */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <FilePen className="h-3.5 w-3.5" />
            Identificação
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={editForm.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do criativo</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={editForm.control} name="date" render={({ field }) => (
              <FormItem>
                <FormLabel>Data de início</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {/* Desempenho */}
        <div className="space-y-4 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Desempenho atual
          </div>
          <FormField control={editForm.control} name="spend" render={({ field }) => (
            <FormItem>
              <FormLabel>Gasto acumulado (R$)</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Vendas por plano */}
        <div className="space-y-4 border-t border-border pt-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Vendas por plano
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((plan) => (
              <FormField
                key={plan}
                control={editForm.control}
                name={`sales${plan}` as `sales${Plan}`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{plan}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" placeholder="0" className="h-9 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
