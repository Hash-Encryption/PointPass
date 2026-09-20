import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CreditCard,
  Building2,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";
import { AVAILABLE_PLANS, CanonicalPlanCode } from "@/lib/plans";
import { getBusinessBillingStateFn, requestBusinessPlanChangeFn } from "@/lib/billing.functions";
import { supabase } from "@/lib/supabase";

interface PlanBillingPanelProps {
  businessId: string;
  ar: boolean;
}

export function PlanBillingPanel({ businessId, ar }: PlanBillingPanelProps) {
  const { t } = useLocale();
  const [requestingPlan, setRequestingPlan] = useState<string | null>(null);

  const billingQuery = useQuery({
    queryKey: ["business-billing-state", businessId],
    queryFn: async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error(
          ar ? "انتهت الجلسة. يرجى تسجيل الدخول مجدداً." : "Session expired. Sign in again.",
        );
      }

      const res = await getBusinessBillingStateFn({
        data: {
          accessToken: session.access_token,
          businessId,
        },
      });

      return res.state;
    },
  });

  const state = billingQuery.data;

  async function handleRequestPlanChange(targetPlan: CanonicalPlanCode) {
    if (!state) return;

    const targetDef = AVAILABLE_PLANS.find((p) => p.code === targetPlan);
    if (targetDef && state.activeLocations > targetDef.maxLocations) {
      toast.error(
        ar
          ? `فروعك النشطة (${state.activeLocations}) تتجاوز الحد المسموح لهذه الباقة (${targetDef.maxLocations}). يرجى تعطيل الفروع الزائدة أولاً.`
          : `Active locations (${state.activeLocations}) exceed target plan limit (${targetDef.maxLocations}). Deactivate extra branches first.`,
      );
      return;
    }

    setRequestingPlan(targetPlan);
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

      const res = await requestBusinessPlanChangeFn({
        data: {
          accessToken: session.access_token,
          businessId,
          targetPlan,
        },
      });

      if (res.ok) {
        toast.info(
          ar
            ? "تم تسجيل رغبتك في تغيير الباقة. الدفع الإلكتروني غير مفعّل بعد."
            : "Plan preference recorded. Online billing is not configured yet.",
        );
        await billingQuery.refetch();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRequestingPlan(null);
    }
  }

  if (billingQuery.isLoading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="size-8 animate-spin mx-auto text-primary" />
        <p className="mt-3 text-xs text-muted-foreground">
          {ar ? "جاري تحميل تفاصيل الباقة والاشتراك..." : "Loading plan & subscription..."}
        </p>
      </div>
    );
  }

  if (billingQuery.isError || !state) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-2">
        <AlertTriangle className="size-8 text-destructive mx-auto" />
        <h3 className="font-bold text-sm">
          {ar ? "تعذر تحميل بيانات الفوترة" : "Failed to load billing state"}
        </h3>
        <p className="text-xs text-muted-foreground">{billingQuery.error?.message}</p>
      </div>
    );
  }

  const usagePercent = Math.min(
    100,
    Math.round((state.activeLocations / Math.max(1, state.maxLocations)) * 100),
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/70">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CreditCard className="size-5 text-primary" />
            {t("planAndBilling")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ar
              ? "متابعة الباقة الحالية وسعة الفروع الفعالة وحالة الفوترة المعتمدة."
              : "Monitor current plan, location entitlements, and subscription status."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="px-3 py-1 font-semibold text-xs border-primary/40 bg-primary/5 text-primary"
          >
            {ar ? state.planNameAr : state.planNameEn}
          </Badge>
        </div>
      </div>

      {/* Subscription & Entitlement Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Status Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              {t("subscriptionStatus")}
            </span>
            <Badge
              variant={
                state.subscriptionStatus === "legacy" || state.subscriptionStatus === "active"
                  ? "secondary"
                  : "outline"
              }
              className="text-xs"
            >
              {state.subscriptionStatus === "legacy"
                ? ar
                  ? "تشغيلي معتمد"
                  : "Operational"
                : state.subscriptionStatus === "pending"
                  ? ar
                    ? "بانتظار الفوترة"
                    : "Pending"
                  : state.subscriptionStatus}
            </Badge>
          </div>

          <div className="text-sm font-bold text-foreground">
            {state.subscriptionStatus === "legacy"
              ? t("billingLegacyStatus")
              : state.subscriptionStatus === "pending"
                ? t("billingPendingStatus")
                : state.subscriptionStatus}
          </div>

          <p className="text-xs text-muted-foreground">
            {ar
              ? "الدفع الإلكتروني عبر بوابات الدفع غير مفعّل حالياً في هذا الإصدار. المنشأة تعمل بكامل الصلاحيات المعتمدة."
              : "Online payment gateways are not configured in this release. All operational features remain fully enabled."}
          </p>
        </div>

        {/* Location Usage Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <MapPin className="size-4 text-primary" />
              {t("locationUsage")}
            </span>
            <span className="font-mono font-bold text-sm text-foreground" dir="ltr">
              {state.activeLocations} / {state.maxLocations}
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent >= 100 ? "bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("activeLocationsCount")}:{" "}
              <strong className="text-foreground">{state.activeLocations}</strong>
            </span>
            <span>
              {t("maxLocationsAllowed")}:{" "}
              <strong className="text-foreground">{state.maxLocations}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Available Plans Section */}
      <div className="space-y-4 pt-2">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {ar ? "باقات ولاء واليت" : "Wallet Loyalty Plans"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "مقارنة السعات والخيارات المتاحة لمنشأتك وفق متطلبات التشغيل."
              : "Compare available plan capacities for your business operations."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {AVAILABLE_PLANS.map((plan) => {
            const isCurrent = state.planCode === plan.code;
            const isRequested = state.requestedPlanCode === plan.code;
            const isExceeded = state.activeLocations > plan.maxLocations;

            return (
              <div
                key={plan.code}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  isCurrent
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                    : "border-border/80 bg-card"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-bold text-base">{ar ? plan.nameAr : plan.nameEn}</h4>
                    {isCurrent && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0.5">
                        {t("currentPlan")}
                      </Badge>
                    )}
                    {!isCurrent && isRequested && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0.5 text-primary border-primary"
                      >
                        {t("requestedPlan")}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mb-4">
                    {ar ? plan.descriptionAr : plan.descriptionEn}
                  </p>

                  <div className="space-y-2 mb-4">
                    {(ar ? plan.featuresAr : plan.featuresEn).map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-foreground/90">
                        <div className="size-1.5 rounded-full bg-primary shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-border/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 text-primary" />
                    <span>
                      {plan.maxLocations === 1
                        ? t("singleLocationAllowance")
                        : t("multiLocationAllowance")}
                    </span>
                  </div>

                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full text-xs h-9">
                      <CheckCircle2 className="size-3.5 me-1.5 text-primary" />
                      {ar ? "الباقة الحالية" : "Current Plan"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleRequestPlanChange(plan.code)}
                      disabled={requestingPlan !== null || isExceeded}
                      className="w-full text-xs h-9"
                    >
                      {requestingPlan === plan.code ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : isExceeded ? (
                        ar ? (
                          "الفروع تتجاوز الحد"
                        ) : (
                          "Locations Exceeded"
                        )
                      ) : (
                        t("requestPlanChange")
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Safety & Integrity Guarantee */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <Info className="size-4 text-primary" />
          {ar ? "ضمانات استمرارية البيانات والتشغيل" : "Data Preservation Guarantees"}
        </div>
        <ul className="list-disc ps-5 space-y-1">
          <li>
            {ar
              ? "تغيير أو تعديل الباقة لا يؤدي إطلاقاً إلى حذف أي عميل، بطاقة، أو عملية سابقة."
              : "Plan modifications never delete existing customers, passes, or transactions."}
          </li>
          <li>
            {ar
              ? "يمنع النظام تقليص الباقة إذا كان عدد الفروع النشطة يتجاوز سعة الباقة المستهدفة."
              : "Downgrading is safely prevented if active locations exceed the target plan limit."}
          </li>
          <li>
            {ar
              ? "يتم تشغيل وحماية الفروع وفق الحد المعرّف في قاعدة البيانات مباشرة."
              : "Location limits are strictly enforced by database transactional triggers."}
          </li>
        </ul>
      </div>
    </div>
  );
}
