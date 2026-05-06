import { useState, useEffect } from "react";
import { useUser, useAuth } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, Webhook, Link2, Info, AlertTriangle, ChevronRight, DollarSign, Loader2, CheckCircle2, Sparkles, Package } from "lucide-react";

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors border border-primary/20"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {label ?? (copied ? "Copiado!" : "Copiar")}
    </button>
  );
}

function CodeBlock({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-4 py-3 font-mono text-sm break-all">
      <span className="flex-1 text-foreground">{value}</span>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-none w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary mt-0.5">
        {number}
      </div>
      <div className="flex-1 pb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

const PLANS = [
  { key: "commission2m",  label: "2 meses",  default: 161.38 },
  { key: "commission3m",  label: "3 meses",  default: 187.38 },
  { key: "commission5m",  label: "5 meses",  default: 241.38 },
  { key: "commission7m",  label: "7 meses",  default: 295.38 },
  { key: "commission9m",  label: "9 meses",  default: 376.38 },
  { key: "commission12m", label: "12 meses", default: 484.38 },
  { key: "commission16m", label: "16 meses", default: 562.38 },
  { key: "commission20m", label: "20 meses", default: 1026.38 },
] as const;

type CommissionKey = typeof PLANS[number]["key"];
type Rates = Record<CommissionKey, string>;

const DEFAULT_RATES: Rates = Object.fromEntries(
  PLANS.map(p => [p.key, p.default.toFixed(2)])
) as Rates;

export default function Settings() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const origin = window.location.origin;
  const webhookUrl = `${origin}/api/webhooks/payt`;
  const userId = user?.id ?? "carregando...";
  const exampleCreative = "criativo-1";
  const utmExample = `${userId}::${exampleCreative}`;

  const [paytUrl, setPaytUrl] = useState(() => localStorage.getItem("clivio_payt_checkout_url") ?? "");
  const [urlSaved, setUrlSaved] = useState(false);

  const [mainProductName, setMainProductName] = useState("");
  const [productLoading, setProductLoading] = useState(true);
  const [productSaving, setProductSaving] = useState(false);
  const [productSaved, setProductSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${import.meta.env.BASE_URL}api/settings/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMainProductName(data.mainProductName ?? "");
        }
      } catch { /* keep empty */ } finally {
        setProductLoading(false);
      }
    })();
  }, [user, getToken]);

  const handleSaveProduct = async () => {
    setProductSaving(true);
    setProductSaved(false);
    try {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.BASE_URL}api/settings/products`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mainProductName }),
      });
      if (res.ok) {
        setProductSaved(true);
        setTimeout(() => setProductSaved(false), 3000);
      }
    } finally {
      setProductSaving(false);
    }
  };

  function handleSaveUrl() {
    const trimmed = paytUrl.trim();
    localStorage.setItem("clivio_payt_checkout_url", trimmed);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2500);
  }

  const exampleTrackingLink = paytUrl.trim()
    ? `${paytUrl.trim()}${paytUrl.trim().includes("?") ? "&" : "?"}utm_content=${userId}::${exampleCreative}`
    : null;

  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${import.meta.env.BASE_URL}api/settings/commissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRates(Object.fromEntries(
            PLANS.map(p => [p.key, Number(data[p.key] ?? p.default).toFixed(2)])
          ) as Rates);
        }
      } catch {
        // mantém defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [user, getToken]);

  const handleChange = (key: CommissionKey, value: string) => {
    setRates(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const token = await getToken();
      const body = Object.fromEntries(
        PLANS.map(p => [p.key, parseFloat(rates[p.key]) || p.default])
      );
      const res = await fetch(`${import.meta.env.BASE_URL}api/settings/commissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRates(Object.fromEntries(
          PLANS.map(p => [p.key, Number(data[p.key]).toFixed(2)])
        ) as Rates);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Integração com Payt e configuração de postback</p>
        </div>

        {/* Produto Principal */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Produto Principal</CardTitle>
            </div>
            <CardDescription>
              Informe o nome do seu produto principal (ex: Rosa Oriental). Vendas de outros produtos (cross-sells) serão contabilizadas como <strong>Comissão LTV</strong> — separadas do ROAS para não distorcer a análise do criativo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {productLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nome do produto principal (deve constar no nome do produto na Payt)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="ex: Rosa Oriental"
                      value={mainProductName}
                      onChange={e => { setMainProductName(e.target.value); setProductSaved(false); }}
                      className="bg-muted/30 border-border focus:border-primary"
                    />
                    <Button onClick={handleSaveProduct} disabled={productSaving} size="sm" className="shrink-0 gap-1.5">
                      {productSaving
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>
                        : productSaved
                          ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Salvo!</>
                          : "Salvar"
                      }
                    </Button>
                  </div>
                </div>
                {mainProductName.trim() ? (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Vendas que não contenham "<strong>{mainProductName}</strong>" no nome do produto serão tratadas como LTV.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem produto principal configurado — todas as vendas são tratadas como front (ROAS).</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Commission Editor */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Meus Tickets de Comissão</CardTitle>
            </div>
            <CardDescription>
              Defina quanto você recebe por plano. O Clivio usa esses valores para calcular ROAS e comissão dos seus criativos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando seus valores...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PLANS.map(plan => (
                    <div key={plan.key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{plan.label}</Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rates[plan.key]}
                          onChange={e => handleChange(plan.key, e.target.value)}
                          className="pl-8 h-9 text-sm bg-muted/30 border-border focus:border-primary"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    Valores em BRL. Alterações afetam ROAS e comissão de todos os criativos.
                  </p>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    size="sm"
                    className="gap-2"
                  >
                    {saving ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>
                    ) : saved ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Salvo!</>
                    ) : (
                      "Salvar configurações"
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">URL do Postback</CardTitle>
            </div>
            <CardDescription>Cole esta URL no campo de postback da Payt para receber notificações de venda automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock value={webhookUrl} />
          </CardContent>
        </Card>

        {/* User ID */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Seu ID de usuário</CardTitle>
            </div>
            <CardDescription>Use este ID para vincular as vendas da Payt aos seus criativos. Veja como no guia abaixo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeBlock value={userId} />
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-none" />
              <span>Não compartilhe este ID publicamente. Ele é usado para separar seus dados dos dados de outros usuários.</span>
            </div>
          </CardContent>
        </Card>

        {/* Checkout URL — auto tracking link generator */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Link de Rastreamento Automático</CardTitle>
            </div>
            <CardDescription>
              Cole aqui a URL base do checkout Payt. O Clivio vai gerar o link completo com utm_content já configurado para cada criativo — basta copiar e colar no seu anúncio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL base do checkout (ex: https://pay.payt.com.br/checkout/meu-produto)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://pay.payt.com.br/checkout/..."
                  value={paytUrl}
                  onChange={e => { setPaytUrl(e.target.value); setUrlSaved(false); }}
                  className="bg-muted/30 border-border focus:border-primary font-mono text-sm"
                />
                <Button onClick={handleSaveUrl} size="sm" className="shrink-0 gap-1.5">
                  {urlSaved
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Salvo!</>
                    : "Salvar"
                  }
                </Button>
              </div>
            </div>
            {exampleTrackingLink ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Exemplo de link gerado para <code className="bg-muted px-1 rounded">{exampleCreative}</code>:</p>
                <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-4 py-3">
                  <span className="flex-1 font-mono text-xs text-foreground break-all">{exampleTrackingLink}</span>
                  <CopyButton value={exampleTrackingLink} />
                </div>
                <p className="text-[11px] text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Na Central de Criativos, cada criativo terá seu próprio link pronto para copiar.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Configure a URL acima para que cada criativo tenha um link de rastreamento completo gerado automaticamente.</p>
            )}
          </CardContent>
        </Card>

        {/* Step-by-step guide */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Como configurar o rastreamento</CardTitle>
            </div>
            <CardDescription>Passo a passo para vincular seus criativos às vendas via postback da Payt.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/40">
              <Step number={1} title="Crie um criativo no Clivio">
                <p>Vá ao Painel e clique em <span className="text-foreground font-medium">+ Novo criativo</span>. Dê um nome simples, sem espaços ou caracteres especiais.</p>
                <p>Exemplo de nome: <code className="bg-muted px-1 py-0.5 rounded text-foreground">rosa-oriental-v1</code></p>
              </Step>

              <Step number={2} title='Configure o utm_content no link do criativo'>
                <p>
                  No link de afiliado da Payt, adicione o parâmetro <code className="bg-muted px-1 py-0.5 rounded text-foreground">utm_content</code> no formato:
                </p>
                <div className="mt-2">
                  <CodeBlock value={utmExample} />
                </div>
                <p className="mt-2">
                  O formato é <code className="bg-muted px-1 py-0.5 rounded text-foreground">seuID::nomeDoCreativo</code> — exatamente como está acima, com dois dois-pontos no meio.
                </p>
              </Step>

              <Step number={3} title="Configure o postback na Payt">
                <p>Acesse sua conta na Payt e vá em <span className="text-foreground font-medium">Configurações → Integrações → Postback</span>.</p>
                <p>Cole a URL abaixo no campo de postback:</p>
                <div className="mt-2">
                  <CodeBlock value={webhookUrl} />
                </div>
                <div className="mt-2">Selecione os eventos <Badge variant="outline" className="text-xs">Aprovado</Badge> e <Badge variant="outline" className="text-xs">Cancelado / Reembolso</Badge> para que o painel receba tanto vendas confirmadas quanto cancelamentos.</div>
              </Step>

              <Step number={4} title="Teste a integração">
                <p>Depois de configurar, volte ao Painel e use o botão <span className="text-foreground font-medium">Simular Venda</span> para verificar se o criativo está recebendo dados corretamente.</p>
                <p>Você também pode fazer uma compra de teste pela Payt — o painel atualizará automaticamente.</p>
              </Step>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-2">
              <p className="text-foreground font-medium text-xs uppercase tracking-wide mb-3">Fluxo resumido</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 bg-card border border-border rounded text-foreground">Visitante clica no anúncio</span>
                <ChevronRight className="h-3 w-3 flex-none" />
                <span className="px-2 py-1 bg-card border border-border rounded text-foreground">utm_content carrega o ID e nome do criativo</span>
                <ChevronRight className="h-3 w-3 flex-none" />
                <span className="px-2 py-1 bg-card border border-border rounded text-foreground">Compra aprovada na Payt</span>
                <ChevronRight className="h-3 w-3 flex-none" />
                <span className="px-2 py-1 bg-primary/20 border border-primary/30 rounded text-primary">Payt envia postback → Clivio atualiza o criativo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
