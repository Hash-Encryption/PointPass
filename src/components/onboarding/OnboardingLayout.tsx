import { ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Globe, LogOut, CheckCircle2, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type OnboardingStepKey = "business" | "plan" | "loyalty" | "reward" | "location" | "launch";

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
  const { locale, t, toggle } = useLocale();
  const ar = locale === "ar";

  const steps: Array<{ key: OnboardingStepKey; num: number; label: string }> = [
    { key: "business", num: 1, label: t("stepBusiness") },
    { key: "plan", num: 2, label: t("stepPlan") },
    { key: "loyalty", num: 3, label: t("stepLoyalty") },
    { key: "reward", num: 4, label: t("stepReward") },
    { key: "location", num: 5, label: t("stepLocation") },
    { key: "launch", num: 6, label: t("stepLaunch") },
  ];

  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-border/70 bg-card/90 backdrop-blur-xs sticky top-0 z-30 px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
              <Store className="size-5" />
            </div>
            <div>
              <span className="font-bold text-sm sm:text-base leading-none block">
                {t("brand")}
              </span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {t("onboardingTitle")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="text-xs h-8 px-2.5 flex items-center gap-1.5"
            >
              <Globe className="size-3.5" />
              <span>{t("language")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => supabase.auth.signOut()}
              className="text-xs h-8 px-2.5 text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">{ar ? "خروج" : "Sign out"}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Stepper Progress Bar */}
      <div className="bg-card border-b border-border/50 py-3 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar gap-2 py-1">
            {steps.map((step, idx) => {
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={step.key} className="flex items-center gap-2 shrink-0">
                  <div
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : isPast
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <span className="size-3.5 flex items-center justify-center text-[10px]">
                        {step.num}
                      </span>
                    )}
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-3 sm:w-6 rounded-full ${
                        isPast ? "bg-primary" : "bg-border"
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
      <main className="flex-1 py-6 px-4 flex flex-col justify-center">
        <div className="mx-auto w-full max-w-2xl">
          {title && (
            <div className="text-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          )}
          <div className="panel p-5 sm:p-7 shadow-xs border border-border/80 bg-card">
            {children}
          </div>
        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border/30">
        <div className="mx-auto max-w-5xl px-4">
          <span>
            {t("brand")} — {t("tagline")}
          </span>
        </div>
      </footer>
    </div>
  );
}
