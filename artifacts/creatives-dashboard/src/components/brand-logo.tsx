import logoUrl from "@/assets/clivio-logo.png";

interface BrandLogoProps {
  className?: string;
  variant?: "sidebar" | "login" | "header";
}

export function BrandLogo({ className = "", variant = "header" }: BrandLogoProps) {
  const styles: Record<string, string> = {
    // Preenche toda a largura da sidebar; a imagem é quadrada então fica generosa
    sidebar: "w-full h-auto",
    // Login centralizado bem grande
    login:   "w-72 h-auto mx-auto",
    // Header landing: largura fixa para a logo ser legível
    header:  "w-36 h-auto",
  };

  return (
    <img
      src={logoUrl}
      alt="Clivio"
      className={`object-contain ${styles[variant]} ${className}`}
    />
  );
}
