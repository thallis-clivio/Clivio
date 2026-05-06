import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateCreative, useUpdateCreative, getListCreativesQueryKey, getGetCreativeQueryKey, getGetDashboardSummaryQueryKey, getGetDecisionBreakdownQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { CreativeWithMetrics } from "@workspace/api-client-react/src/generated/api.schemas";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  date: z.string().min(1, "Date is required"),
  spend: z.coerce.number().min(0, "Must be >= 0"),
  ctr: z.coerce.number().min(0, "Must be >= 0"),
  hookRate: z.coerce.number().min(0, "Must be >= 0"),
  daysWithoutSales: z.coerce.number().min(0, "Must be >= 0"),
  sales5m: z.coerce.number().min(0, "Must be >= 0"),
  sales7m: z.coerce.number().min(0, "Must be >= 0"),
  sales9m: z.coerce.number().min(0, "Must be >= 0"),
  sales12m: z.coerce.number().min(0, "Must be >= 0"),
  sales16m: z.coerce.number().min(0, "Must be >= 0"),
  sales20m: z.coerce.number().min(0, "Must be >= 0"),
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
      ctr: 0,
      hookRate: 0,
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
        ctr: initialData.ctr,
        hookRate: initialData.hookRate,
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

  function onSubmit(values: FormValues) {
    if (initialData) {
      updateCreative.mutate(
        { id: initialData.id, data: values },
        {
          onSuccess: () => {
            toast({ title: "Creative updated successfully" });
            queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetCreativeQueryKey(initialData.id) });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
            onSuccess?.();
          },
          onError: () => {
            toast({ title: "Failed to update creative", variant: "destructive" });
          },
        }
      );
    } else {
      createCreative.mutate(
        { data: values },
        {
          onSuccess: () => {
            toast({ title: "Creative created successfully" });
            queryClient.invalidateQueries({ queryKey: getListCreativesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDecisionBreakdownQueryKey() });
            onSuccess?.();
          },
          onError: () => {
            toast({ title: "Failed to create creative", variant: "destructive" });
          },
        }
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Creative name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="spend"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Spend ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="daysWithoutSales"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Days w/o Sales</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ctr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CTR (%)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hookRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hook Rate (%)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-4 text-muted-foreground uppercase">Sales Counts</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="sales5m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>5m Sales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sales7m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>7m Sales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sales9m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>9m Sales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sales12m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>12m Sales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sales16m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>16m Sales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sales20m"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>20m Sales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : initialData ? "Update Creative" : "Create Creative"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
