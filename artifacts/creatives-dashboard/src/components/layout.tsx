import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold tracking-tight text-primary">Clivio</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Status: Ativo</p>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              location === "/" ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Painel
          </Link>
        </nav>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight text-primary">Clivio</h1>
        <Link href="/" className="text-sm font-medium text-muted-foreground">Painel</Link>
      </header>

      <main className="flex-1 overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
