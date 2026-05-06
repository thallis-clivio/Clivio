import logoUrl from "@assets/ChatGPT_Image_6_de_mai._de_2026,_13_52_39_1778086380496.png";

export function BrandLogo({ className = "", showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <img src={logoUrl} alt="Clivio" className="h-10 w-10 rounded-xl object-cover shadow-[0_0_24px_rgba(74,222,128,0.18)]" />
      {showText ? <span className="text-xl font-bold tracking-tight text-foreground">Clivio</span> : null}
    </div>
  );
}
