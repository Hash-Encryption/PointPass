import { ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import { Globe, LogOut, CheckCircle2, Store, Palette, Gift, Rocket } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type OnboardingStepKey = "business" | "loyalty" | "reward" | "launch" | "plan" | "location";

interface OnboardingLayoutProps {
  currentStep: OnboardingStepKey;
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function OnboardingLayout({
  currentStep,
  children,
  title,
  subtitle,
}: OnboardingLayoutProps) {
  const { locale, toggle } = useLocale();
  const ar = locale === "ar";

  // Strictly 4 curated steps for modern wizard
  const steps: Array<{
    key: "business" | "loyalty" | "reward" | "launch";
    num: number;
    label: string;
    icon: typeof Store;
  }> = [
    {
      key: "business",
      num: 1,
      label: ar ? "المتجر" : "Store Identity",
      icon: Store,
    },
    {
      key: "loyalty",
      num: 2,
      label: ar ? "تصميم البطاقة" : "Card Studio",
      icon: Palette,
    },
    {
      key: "reward",
      num: 3,
      label: ar ? "المكافأة" : "Reward Rules",
      icon: Gift,
    },
    {
      key: "launch",
      num: 4,
      label: ar ? "الإطلاق" : "Launch & QR",
      icon: Rocket,
    },
  ];

  // Map internal steps to the 4 visual steps
  const normalizedKey =
    currentStep === "plan" ? "loyalty" : currentStep === "location" ? "launch" : currentStep;

  const currentIdx = steps.findIndex((s) => s.key === normalizedKey);

  return (
    <div
      className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col justify-between selection:bg-emerald-500/30 selection:text-emerald-300"
      dir={ar ? "rtl" : "ltr"}
    >
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-xs">
              <Store className="size-4.5" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base leading-none text-white tracking-tight block">
                PointPass<span className="text-emerald-400">.</span>
              </span>
              <span className="text-[11px] text-zinc-500 hidden sm:inline font-mono">
                {ar ? "معالج الإعداد السريع" : "Quick Setup Wizard"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
            >
              <Globe className="size-3.5 text-zinc-500" />
              <span>{ar ? "English" : "العربية"}</span>
            </button>

            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-rose-400 hover:border-rose-950/50 transition-colors"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">{ar ? "خروج" : "Sign out"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Stepper Progress Bar */}
      <div className="bg-zinc-900/40 border-b border-zinc-800/70 py-3.5 px-4 backdrop-blur-xs">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            {steps.map((step, idx) => {
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              const Icon = step.icon;

              return (
                <div
                  key={step.key}
                  className="flex items-center gap-1.5 sm:gap-2 flex-1 last:flex-none"
                >
                  <div
                    className={`flex items-center gap-1.5 sm:gap-2 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all ${
                      isCurrent
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                        : isPast
                          ? "bg-zinc-900/90 border-emerald-500/30 text-emerald-400/90"
                          : "bg-zinc-900/40 border-zinc-800 text-zinc-500"
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Icon className="size-3.5 shrink-0" />
                    )}
                    <span className="hidden sm:inline font-medium">{step.label}</span>
                    <span className="sm:hidden font-mono text-[10px]">{step.num}</span>
                  </div>

                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 rounded-full transition-colors ${
                        isPast ? "bg-emerald-500/40" : "bg-zinc-800"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 py-8 px-4 flex flex-col justify-center">
        <div className="mx-auto w-full max-w-3xl">
          {title && (
            <div className="text-center mb-6 space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto">{subtitle}</p>
              )}
            </div>
          )}

          <div className="bg-zinc-900/90 border border-zinc-800 shadow-2xl rounded-3xl p-5 sm:p-8 backdrop-blur-md">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-[11px] text-zinc-500 border-t border-zinc-850">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>PointPass — Digital Wallet Loyalty Platform</span>
          <span>Apple Wallet & Google Wallet Ready</span>
        </div>
      </footer>
    </div>
  );
}
