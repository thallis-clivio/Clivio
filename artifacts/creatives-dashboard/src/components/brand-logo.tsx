import logoUrl from "@assets/ChatGPT_Image_6_de_mai._de_2026,_14_04_19_1778087079617.png";

export function BrandLogo({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-20 w-20",
  } as const;

  return <img src={logoUrl} alt="Clivio" className={`${sizes[size]} object-contain ${className}`} />;
}
