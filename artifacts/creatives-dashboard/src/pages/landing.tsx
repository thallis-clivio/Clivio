import { Link } from "wouter";
import { BarChart3, TrendingUp, Zap, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <BrandLogo variant="header" />
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Criar conta
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/20">
            <Zap className="h-3.5 w-3.5" />
            Painel de criativos Meta Ads
          </div>

          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Decisões de mídia{" "}
            <span className="text-primary">em tempo real</span>
          </h2>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Monitore ROAS, CPA e comissões de afiliado em um único painel. O motor de decisão classifica automaticamente cada criativo em 5 estados: Escalar, Lucrativo, Atenção, Monitorar ou Pausar.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-md hover:bg-primary/90 transition-colors text-sm"
            >
              Começar agora
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center gap-2 border border-border text-foreground font-medium px-6 py-3 rounded-md hover:bg-accent transition-colors text-sm"
            >
              Já tenho conta
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Motor de decisão</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              5 estados — ESCALAR, LUCRATIVO, ATENÇÃO, MONITORAR ou PAUSAR — decisão automática baseada em ROAS e dias sem vendas.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Desempenho</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Score 0–100 que mede consistência de conversões, qualidade de ROAS e eficiência de CPA.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Dados por usuário</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cada conta vê apenas seus próprios criativos. Compartilhe o acesso com segurança.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Clivio — Painel de performance para media buyers
        </p>
      </footer>
    </div>
  );
}
