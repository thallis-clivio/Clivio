import logoUrl from "@/assets/clivio-logo.png";

export function BrandLogo({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const heights = {
    sm: "h-8",
    md: "h-10",
    lg: "h-14",
  } as const;

  return (
    <img
      src={logoUrl}
      alt="Clivio"
      className={`${heights[size]} w-auto object-contain ${className}`}
    />
  );
}
