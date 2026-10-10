import { Link } from "@tanstack/react-router";
import { CreditCard, Globe, Sparkles } from "lucide-react";
import { useLocale } from "@/lib/i18n";

export interface PortalNavProps {
  title?: string;
  subtitle?: string;
  dark?: boolean;
  isLanding?: boolean;
}

export function PortalNav({ title, subtitle, isLanding = false }: PortalNavProps) {
  const { locale, toggle } = useLocale();
  const ar = locale === "ar";

  // Check if this is rendered as the primary landing navigation
  const showLandingLinks = isLanding || !title || title === "PointPass" || title === "ولاء واليت";

  return (
    <header className="sticky top-0 z-50 w-full bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 px-4 sm:px-8 py-3.5 transition-colors">
      <div
        className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-6"
        dir={ar ? "rtl" : "ltr"}
      >
        {/* Left / Start: Logo & Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/"
            className="group flex items-center gap-2.5 transition-transform hover:opacity-95"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-emerald-400 text-zinc-950 shadow-[0_0_18px_rgba(16,185,129,0.35)] ring-1 ring-emerald-300/40 transition-shadow group-hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]">
              <CreditCard className="size-4.5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-white text-base sm:text-lg">
                  PointPass<span className="text-emerald-400">.</span>
                </span>
                {showLandingLinks && (
                  <span className="hidden lg:inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <Sparkles className="size-2.5" />
                    Apple & Google Wallet
                  </span>
                )}
              </div>
              {subtitle && !showLandingLinks && (
                <span className="text-[11px] text-zinc-400 truncate max-w-[160px] sm:max-w-none">
                  {subtitle}
                </span>
              )}
            </div>
          </Link>

          {/* Internal Portal Indicator if on dashboard/admin */}
          {!showLandingLinks && title && (
            <div className="hidden md:flex items-center gap-2 border-r border-zinc-800 pr-3 mr-2 rtl:border-r-0 rtl:border-l rtl:pl-3 rtl:ml-2">
              <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                {title}
              </span>
            </div>
          )}
        </div>

        {/* Desktop Links (Centered / Middle) */}
        {showLandingLinks && (
          <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-zinc-400">
            <a href="#comparison" className="transition-colors hover:text-white">
              {ar ? "المميزات" : "Features"}
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-white">
              {ar ? "كيف يعمل" : "How it Works"}
            </a>
            <a href="#faq" className="transition-colors hover:text-white">
              {ar ? "الأسئلة الشائعة" : "FAQ"}
            </a>
            <Link
              to="/scan"
              className="inline-flex items-center gap-1.5 text-zinc-300 transition-colors hover:text-emerald-400"
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {ar ? "للكاشير" : "Cashier Scanner"}
            </Link>
          </nav>
        )}

        {/* Right / End Actions: Bilingual toggle, Sign in, and Emerald CTA */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-850 hover:text-white active:scale-95"
            aria-label="Toggle Language"
          >
            <Globe className="size-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] sm:text-xs font-medium">
              {ar ? "عربي / EN" : "عربي / EN"}
            </span>
          </button>

          {/* Sign In (Points to /onboarding) */}
          {showLandingLinks && (
            <Link
              to="/onboarding"
              className="hidden sm:inline-flex text-xs sm:text-sm font-medium text-zinc-400 transition-colors hover:text-white px-2 py-1.5"
            >
              {ar ? "تسجيل الدخول" : "Sign In"}
            </Link>
          )}

          {/* Primary CTA: ابدأ مجاناً (Points to /onboarding) */}
          <Link
            to="/onboarding"
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3.5 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_28px_rgba(16,185,129,0.55)] hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
          >
            {ar ? "ابدأ مجاناً" : "Get Started"}
          </Link>
        </div>
      </div>
    </header>
  );
}
