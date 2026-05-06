import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold tracking-tight text-primary">Clivio</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Status: Ativo</p>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              location === "/dashboard" || location === "/"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Painel
          </Link>
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              location === "/settings"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            }`}
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
        </nav>
        <div className="p-4 border-t border-border space-y-3">
          {user && (
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-foreground truncate">{user.fullName || user.username}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight text-primary">Clivio</h1>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm font-medium text-muted-foreground">Painel</Link>
          <Link href="/settings" className="text-sm font-medium text-muted-foreground">Config.</Link>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
