import logoUrl from "@assets/ChatGPT_Image_6_de_mai._de_2026,_13_52_39_1778086380496.png";

export function LoginLogo() {
  return (
    <div className="flex flex-col items-center gap-4 mb-6">
      <img src={logoUrl} alt="Clivio" className="h-20 w-20 rounded-2xl object-cover shadow-[0_0_32px_rgba(74,222,128,0.2)]" />
      <div className="text-center">
        <p className="text-2xl font-bold tracking-tight text-foreground">Clivio</p>
        <p className="text-sm text-muted-foreground">Painel de performance para media buyers</p>
      </div>
    </div>
  );
}
