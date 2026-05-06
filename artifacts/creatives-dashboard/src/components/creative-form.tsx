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

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  date: z.string().min(1, "Data é obrigatória"),
  spend: z.coerce.number().min(0, "Deve ser >= 0"),
  daysWithoutSales: z.coerce.number().min(0, "Deve ser >= 0"),
  sales5m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales7m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales9m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales12m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales16m: z.coerce.number().min(0, "Deve ser >= 0"),
  sales20m: z.coerce.number().min(0, "Deve ser >= 0"),
});

type FormValues = z.infer<typeof formSchema>;

interface CreativeFormProps {
  onSuccess?: () => void;
  initialData?: CreativeWithMetrics;
}

export function CreativeForm({ onSuccess, initialData }: CreativeFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      date: new Date().toISOString().split("T")[0],
      spend: 0,
      daysWithoutSales: 0,
      sales5m: 0,
      sales7m: 0,
      sales9m: 0,
      sales12m: 0,
      sales16m: 0,
      sales20m: 0,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        date: initialData.date,
        spend: initialData.spend,
        daysWithoutSales: initialData.daysWithoutSales,
        sales5m: initialData.sales5m,
        sales7m: initialData.sales7m,
        sales9m: initialData.sales9m,
        sales12m: initialData.sales12m,
        sales16m: initialData.sales16m,
        sales20m: initialData.sales20m,
      });
    }
  }, [initialData, form]);

  const createCreative = useCreateCreative();
  const updateCreative = useUpdateCreative();
  const isPending = createCreative.isPending || updateCreative.isPending;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardChartsQueryKey() });
  }

  function onSubmit(values: FormValues) {
    if (initialData) {
      updateCreative.mutate(
        { id: initialData.id, data: values },
        {
          onSuccess: () => {
            toast({ title: "Criativo atualizado com sucesso" });
            queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(initialData.id) });
            invalidateAll();
            onSuccess?.();
          },
          onError: () => toast({ title: "Erro ao atualizar criativo", variant: "destructive" }),
        }
      );
    } else {
      createCreative.mutate(
        { data: values },
        {
          onSuccess: () => {
            toast({ title: "Criativo criado com sucesso" });
            invalidateAll();
            onSuccess?.();
          },
          onError: () => toast({ title: "Erro ao criar criativo", variant: "destructive" }),
        }
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Criativo</FormLabel>
              <FormControl><Input placeholder="Nome do criativo" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>Data</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="spend" render={({ field }) => (
            <FormItem>
              <FormLabel>Gasto (R$)</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="daysWithoutSales" render={({ field }) => (
            <FormItem>
              <FormLabel>Dias sem Venda</FormLabel>
              <FormControl><Input type="number" min="0" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-widest">Vendas por Plano</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(["5m","7m","9m","12m","16m","20m"] as const).map(plan => (
              <FormField key={plan} control={form.control} name={`sales${plan}` as any} render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendas {plan}</FormLabel>
                  <FormControl><Input type="number" min="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : initialData ? "Atualizar Criativo" : "Criar Criativo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
