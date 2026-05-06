import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, LogOut, Settings, Film, FileBarChart2, Bell } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { BrandLogo } from "@/components/brand-logo";

const NAV = [
  {
    section: "Análise",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Visão Geral" },
      { href: "/criativos", icon: Film, label: "Central de Criativos" },
      { href: "/relatorios", icon: FileBarChart2, label: "Relatórios" },
    ],
  },
  {
    section: "Operação",
    items: [
      { href: "/alertas", icon: Bell, label: "Alertas" },
    ],
  },
  {
    section: "Conta",
    items: [
      { href: "/settings", icon: Settings, label: "Configurações" },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
  };

  function isActive(href: string) {
    if (href === "/dashboard") return location === "/dashboard" || location === "/";
    return location === href || location.startsWith(href + "/");
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="px-5 py-5 border-b border-border">
          <BrandLogo variant="sidebar" />
        </div>

        <nav className="p-4 flex-1 space-y-5 overflow-y-auto">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1.5">
                {section}
              </p>
              <div className="space-y-0.5">
                {items.map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(href)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
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
        <BrandLogo variant="header" />
        <div className="flex items-center gap-2 overflow-x-auto">
          <Link href="/dashboard" className="text-sm font-medium text-muted-foreground whitespace-nowrap">Painel</Link>
          <Link href="/criativos" className="text-sm font-medium text-muted-foreground whitespace-nowrap">Criativos</Link>
          <Link href="/alertas" className="text-sm font-medium text-muted-foreground whitespace-nowrap">Alertas</Link>
          <Link href="/relatorios" className="text-sm font-medium text-muted-foreground whitespace-nowrap">Relatórios</Link>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1"
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
