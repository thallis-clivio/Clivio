import { useState } from "react";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Webhook, Link2, Info, AlertTriangle, ChevronRight } from "lucide-react";

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

export default function Settings() {
  const { user } = useUser();

  const origin = window.location.origin;
  const webhookUrl = `${origin}/api/webhooks/payt`;
  const userId = user?.id ?? "carregando...";
  const exampleCreative = "criativo-1";
  const utmExample = `${userId}::${exampleCreative}`;

  return (
    <Layout>
      <div className="flex-1 p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Integração com Payt e configuração de postback</p>
        </div>

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

            {/* Summary diagram */}
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

        {/* Commission rates reference */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tabela de comissões (54% — base Payt)</CardTitle>
            <CardDescription>Valores que o Clivio usa para calcular ROAS e comissão. Atualizado conforme sua tabela de afiliado.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { plan: "2 meses", value: "R$ 161,38" },
                { plan: "3 meses", value: "R$ 187,38" },
                { plan: "5 meses", value: "R$ 241,38" },
                { plan: "7 meses", value: "R$ 295,38" },
                { plan: "9 meses", value: "R$ 376,38" },
                { plan: "12 meses", value: "R$ 484,38" },
                { plan: "16 meses", value: "R$ 562,38" },
                { plan: "20 meses", value: "R$ 1.026,38" },
              ].map(({ plan, value }) => (
                <div key={plan} className="p-3 rounded-lg bg-muted/40 border border-border text-center">
                  <p className="text-xs text-muted-foreground">{plan}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              O plano é detectado automaticamente pelo nome do produto no postback (ex: "Rosa Oriental — 7 Meses" → plano 7m).
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
