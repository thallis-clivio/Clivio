import { TrendingUp, TrendingDown, ShoppingBag } from "lucide-react";

const data = {
  bestRoas: { name: "VS_Hook_Urgência_v3", value: 2.70, commission: "R$ 3.371", spend: "R$ 1.250" },
  worstCpa: { name: "Hook_Desconto_v1", value: 223.00, sales: 5, spend: "R$ 1.115" },
  mostSales: { name: "VS_Hook_Urgência_v3", value: 11, roas: 2.70 },
  active: { escalar: 1, otimizar: 0, pausar: 2 },
};

function StatRow({ icon, label, name, main, sub, colorBg, colorText }: {
  icon: React.ReactNode;
  label: string;
  name: string;
  main: string;
  sub: string;
  colorBg: string;
  colorText: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
      <div className={`mt-0.5 w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${colorBg}`}>
        <span className={colorText}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">{label}</div>
        <div className="text-sm font-semibold text-zinc-100 truncate">{name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-lg font-bold font-mono leading-none ${colorText}`}>{main}</span>
          <span className="text-xs text-zinc-500">{sub}</span>
        </div>
      </div>
    </div>
  );
}

export function Panel() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-[380px] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Resumo de Performance
          </h3>
          <span className="text-xs text-zinc-600">3 criativos</span>
        </div>

        {/* Stats */}
        <div className="p-4 space-y-2.5">
          <StatRow
            icon={<TrendingUp className="w-4 h-4" />}
            label="Melhor ROAS"
            name={data.bestRoas.name}
            main="2.70x"
            sub={`comissão ${data.bestRoas.commission}`}
            colorBg="bg-green-500/20"
            colorText="text-green-400"
          />
          <StatRow
            icon={<TrendingDown className="w-4 h-4" />}
            label="Pior CPA"
            name={data.worstCpa.name}
            main="R$ 223"
            sub={`${data.worstCpa.sales} vendas · gasto ${data.worstCpa.spend}`}
            colorBg="bg-red-500/20"
            colorText="text-red-400"
          />
          <StatRow
            icon={<ShoppingBag className="w-4 h-4" />}
            label="Mais Vendas"
            name={data.mostSales.name}
            main="11 vendas"
            sub={`ROAS ${data.mostSales.roas}x`}
            colorBg="bg-blue-500/20"
            colorText="text-blue-400"
          />
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-zinc-800" />

        {/* Decision summary */}
        <div className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Situação dos Criativos</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="text-2xl font-bold font-mono text-green-400">{data.active.escalar}</span>
              <span className="text-[10px] text-green-600 font-semibold mt-0.5">ESCALAR</span>
            </div>
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="text-2xl font-bold font-mono text-orange-400">{data.active.otimizar}</span>
              <span className="text-[10px] text-orange-600 font-semibold mt-0.5">OTIMIZAR</span>
            </div>
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-2xl font-bold font-mono text-red-400">{data.active.pausar}</span>
              <span className="text-[10px] text-red-600 font-semibold mt-0.5">PAUSAR</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
