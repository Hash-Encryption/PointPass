import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Check, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";
import { AVAILABLE_PLANS, CanonicalPlanCode } from "@/lib/plans";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface PlanSelectionStepProps {
  businessId: string;
  initialPlan?: string;
  onSuccess: (selectedPlan: string) => void;
  onBack?: () => void;
}

export function PlanSelectionStep({
  businessId,
  initialPlan = "starter",
  onSuccess,
  onBack,
}: PlanSelectionStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [selectedPlan, setSelectedPlan] = useState<CanonicalPlanCode>(
    initialPlan === "growth" || initialPlan === "enterprise" ? initialPlan : "starter",
  );
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error(
          ar ? "انتهت الجلسة. يرجى تسجيل الدخول مجدداً." : "Session expired. Sign in again.",
        );
      }

      await saveOnboardingStepFn({
        data: {
          accessToken: session.access_token,
          businessId,
          step: "plan",
          requestedPlan: selectedPlan,
        },
      });

      toast.success(ar ? "تم تسجيل اختيار الباقة ومتابعة الإعداد" : "Plan preference saved");
      onSuccess(selectedPlan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-border/60">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("stepPlan")}</h2>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "اختر الباقة المناسبة لسعة فروع منشأتك لتخصيص لوحة التحكم."
              : "Select the plan capacity suited for your business locations."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {AVAILABLE_PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.code;
          return (
            <div
              key={plan.code}
              onClick={() => setSelectedPlan(plan.code)}
              className={`rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                  : "border-border/80 bg-card hover:border-primary/40"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-bold text-sm sm:text-base">
                    {ar ? plan.nameAr : plan.nameEn}
                  </h3>
                  <div
                    className={`size-5 rounded-full flex items-center justify-center text-xs ${
                      isSelected ? "bg-primary text-primary-foreground" : "border border-border"
                    }`}
                  >
                    {isSelected && <Check className="size-3.5" />}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  {ar ? plan.descriptionAr : plan.descriptionEn}
                </p>
              </div>

              <div className="pt-3 border-t border-border/40">
                <Badge
                  variant={isSelected ? "default" : "secondary"}
                  className="text-xs font-medium w-full justify-center"
                >
                  <MapPin className="size-3 me-1" />
                  {plan.maxLocations === 1
                    ? t("singleLocationAllowance")
                    : t("multiLocationAllowance")}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-muted/40 p-3.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground block mb-0.5">
          {ar ? "ملاحظة تشغيلية:" : "Operational Note:"}
        </span>
        {ar
          ? "يتم تفعيل سعة الفروع وفق الاختيار مع الحفاظ على الفرع الرئيسي تلقائياً، والربط بالفوترة عند تفعيلها."
          : "Location entitlement is configured based on your selection while preserving your automatic Main Location."}
      </div>

      <div className="pt-3 border-t border-border/60 flex items-center justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack} disabled={saving}>
            {t("prevStep")}
          </Button>
        ) : (
          <div />
        )}

        <Button onClick={handleContinue} disabled={saving} className="h-11 px-6 font-semibold">
          {saving ? (
            <Loader2 className="size-4 animate-spin me-2" />
          ) : ar ? (
            <>
              {t("nextStep")}
              <ArrowLeft className="size-4 ms-2" />
            </>
          ) : (
            <>
              {t("nextStep")}
              <ArrowRight className="size-4 ms-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
