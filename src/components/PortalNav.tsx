import { Link } from "@tanstack/react-router";
import { Languages, Wallet } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function PortalNav({
  title,
  subtitle,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  dark?: boolean;
}) {
  const { t, locale, toggle } = useLocale();

  return (
    <header
      className={
        dark
          ? "sticky top-0 z-30 border-b border-white/10 bg-surface-dark/95 backdrop-blur"
          : "sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur"
      }
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="size-5" />
          </span>
          <span className={dark ? "text-surface-dark-foreground" : "text-foreground"}>
            <span className="block text-sm font-semibold leading-tight">{title}</span>
            {subtitle ? (
              <span className="block text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </span>
        </Link>

        <nav className="ms-auto flex items-center gap-1">
          <Button
            variant={dark ? "secondary" : "ghost"}
            size="sm"
            onClick={toggle}
            aria-label="Toggle language"
          >
            <Languages className="size-4" />
            <span className="ms-1 text-xs font-semibold">{t("language")}</span>
          </Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {locale === "ar" ? "العربية" : "English"}
          </span>
        </nav>
      </div>
    </header>
  );
}
