import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { isManager, isCashier, type OperationsAccess } from "@/lib/access";
import { AuthSignIn } from "@/components/AuthSignIn";
import { OnboardingLayout, type OnboardingStepKey } from "@/components/onboarding/OnboardingLayout";
import { BusinessSetupStep } from "@/components/onboarding/BusinessSetupStep";
import { LoyaltySetupStep } from "@/components/onboarding/LoyaltySetupStep";
import { RewardSetupStep } from "@/components/onboarding/RewardSetupStep";
import { LaunchStep } from "@/components/onboarding/LaunchStep";
// Modular onboarding architecture: BusinessSetupStep, PlanSelectionStep, LoyaltySetupStep, RewardSetupStep, MainLocationStep, LaunchStep
import { type ProgramType } from "@/constants/defaultTemplates";
import { saveOnboardingProgressServerFn } from "@/lib/wallet.functions";
import {
  FREE_TIER_PRESETS,
  getDefaultRewardForStampIcon,
  iconToEmoji,
  nearestFreeColorPreset,
  parsePassTemplateMeta,
  serializePassTemplateMeta,
  STAMP_ICON_DEFAULT_REWARDS,
  type FreeColorPresetKey,
  type PassTierMode,
  type StampIconKey,
  type StripStyleKey,
} from "@/lib/wallet-tier";

export interface V3LoyaltySetupValues {
  businessNameEn: string;
  businessNameAr: string;
  stampsRequired: number;
  rewardNameEn: string;
  rewardNameAr: string;
  stampIcon: StampIconKey;
  stripStyle: StripStyleKey;
  colorPreset: FreeColorPresetKey;
  tierMode: PassTierMode;
  brandColor: string;
  baseTemplateId: string;
}

export function buildV3BusinessPayload(
  userId: string,
  normalizedSlug: string,
  loyaltyValues: V3LoyaltySetupValues,
  phone = "",
  cashierPin = "1234",
) {
  const resolvedColorPreset: FreeColorPresetKey =
    loyaltyValues.tierMode === "free"
      ? loyaltyValues.colorPreset
      : nearestFreeColorPreset(loyaltyValues.brandColor);

  const resolvedBrandColor =
    loyaltyValues.tierMode === "free"
      ? FREE_TIER_PRESETS[resolvedColorPreset]
      : loyaltyValues.brandColor || FREE_TIER_PRESETS[resolvedColorPreset];

  const serializedTemplateId = serializePassTemplateMeta(
    loyaltyValues.baseTemplateId || "default",
    loyaltyValues.stampIcon,
    loyaltyValues.stripStyle,
    {
      colorPreset: resolvedColorPreset,
      tierMode: loyaltyValues.tierMode,
      brandColor: resolvedBrandColor,
    },
  );

  const cleanNameEn =
    loyaltyValues.businessNameEn.trim() ||
    loyaltyValues.businessNameAr.trim() ||
    "PointPass Merchant";
  const cleanNameAr = loyaltyValues.businessNameAr.trim() || cleanNameEn;
  const iconDefaultReward = getDefaultRewardForStampIcon(loyaltyValues.stampIcon);

  // IMPORTANT: Only use schema-valid columns on public.businesses (name_en, name_ar, target_stamps, offer_en, offer_ar)
  return {
    owner_id: userId,
    slug: normalizedSlug,
    name_en: cleanNameEn,
    name_ar: cleanNameAr,
    phone: phone.trim() || null,
    cashier_pin: /^\d{4}$/.test(cashierPin.trim()) ? cashierPin.trim() : "1234",
    target_stamps: loyaltyValues.stampsRequired,
    offer_en: loyaltyValues.rewardNameEn.trim() || iconDefaultReward.en,
    offer_ar: loyaltyValues.rewardNameAr.trim() || iconDefaultReward.ar,
    brand_color: resolvedBrandColor,
    template_id: serializedTemplateId,
  };
}

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "إعداد المتجر وبطاقة الولاء | PointPass Onboarding" },
      {
        name: "description",
        content: "Set up your digital loyalty program, brand pass, and counter QR in 2 minutes.",
      },
    ],
  }),
  loader: async () => {
    return { authenticated: false };
  },
  component: OnboardingRoute,
});

type OnboardingBusiness = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  plan: string;
  program_type: ProgramType;
  offer_ar: string;
  offer_en: string;
  brand_color: string;
  accent_color: string;
  target_stamps: number | null;
  sar_per_point: number | null;
  points_per_reward: number;
  stamp_icon?: string;
  template_id?: string | null;
};

function OnboardingRoute() {
  const { locale, t } = useLocale();
  const ar = locale === "ar";
  const navigate = useNavigate();

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStepKey>("business");
  const [createdBusiness, setCreatedBusiness] = useState<OnboardingBusiness | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Check Super Admin
  const adminRoleQuery = useQuery({
    queryKey: ["onboarding-admin-role", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user!.id)
          .eq("role", "super_admin")
          .is("business_id", null)
          .maybeSingle();
        if (error) {
          console.warn("adminRoleQuery warning:", error.message);
          return null;
        }
        return data;
      } catch (err) {
        console.warn("adminRoleQuery exception:", err);
        return null;
      }
    },
  });

  // Check if user already has an active business and its onboarding state
  const businessQuery = useQuery({
    queryKey: ["onboarding-business-check", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      try {
        const { data: businesses, error } = await supabase
          .from("businesses")
          .select(
            "id,slug,name_ar,name_en,plan,program_type,offer_ar,offer_en,brand_color,accent_color,target_stamps,sar_per_point,points_per_reward,template_id",
          )
          .eq("owner_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          console.warn("businessQuery warning:", error.message);
          return null;
        }
        if (!businesses || businesses.length === 0) return null;

        const biz = businesses[0] as OnboardingBusiness;

        if (biz.template_id) {
          try {
            const meta = parsePassTemplateMeta(biz.template_id, biz.brand_color);
            biz.stamp_icon = iconToEmoji(meta.stampIcon);
          } catch {
            // Safe fallback if format differs
          }
        }

        // Look up onboarding record (non-blocking if permission denied or missing)
        let onb: { step: string; completed: boolean } | null = null;
        try {
          const { data: onbData, error: onbErr } = await supabase
            .from("business_onboarding")
            .select("step,completed")
            .eq("business_id", biz.id)
            .maybeSingle();
          if (!onbErr && onbData) {
            onb = onbData as { step: string; completed: boolean };
          }
        } catch {
          onb = null;
        }

        return {
          business: biz,
          onboarding: onb,
        };
      } catch (err) {
        console.warn("businessQuery exception:", err);
        return null;
      }
    },
  });

  // Check Operational Access if a business exists for this user
  const accessQuery = useQuery({
    queryKey: ["onboarding-access", businessQuery.data?.business?.id, user?.id],
    enabled: Boolean(businessQuery.data?.business?.id) && Boolean(user?.id),
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .rpc("operations_access", { _business_id: businessQuery.data!.business.id })
          .single();
        if (error) {
          console.warn("accessQuery warning:", error.message);
          return null;
        }
        return data as OperationsAccess;
      } catch (err) {
        console.warn("accessQuery exception:", err);
        return null;
      }
    },
  });

  const operationalRole = accessQuery.data?.operational_role;
  const isManagerUser = isManager(operationalRole);
  const isCashierUser = isCashier(operationalRole);
  const isSuperAdmin = adminRoleQuery.data?.role === "super_admin";

  useEffect(() => {
    if (isSuperAdmin) {
      void navigate({ to: "/admin", replace: true });
      return;
    }
    if (accessQuery.isSuccess) {
      if (isCashierUser) {
        void navigate({ to: "/scan", replace: true });
        return;
      }
      if (isManagerUser) {
        void navigate({ to: "/dashboard", replace: true });
        return;
      }
    }
  }, [isSuperAdmin, accessQuery.isSuccess, isCashierUser, isManagerUser, navigate]);

  useEffect(() => {
    if (!businessQuery.data) return;
    const { business, onboarding } = businessQuery.data;

    // If onboarding is already completed, go straight to dashboard
    if (onboarding?.completed) {
      void navigate({ to: "/dashboard", replace: true });
      return;
    }

    setCreatedBusiness(business);

    // Map existing draft step to condensed 4-step wizard
    if (onboarding?.step) {
      if (onboarding.step === "plan") {
        setCurrentStep("loyalty");
      } else if (onboarding.step === "location") {
        setCurrentStep("launch");
      } else if (["business", "loyalty", "reward", "launch"].includes(onboarding.step)) {
        setCurrentStep(onboarding.step as OnboardingStepKey);
      } else {
        setCurrentStep("loyalty");
      }
    } else {
      setCurrentStep("loyalty");
    }
  }, [businessQuery.data, navigate]);

  if (isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (accessQuery.isSuccess && isCashierUser) {
    return <Navigate to="/scan" replace />;
  }

  if (accessQuery.isSuccess && isManagerUser) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!authReady || (user && (businessQuery.isLoading || adminRoleQuery.isLoading))) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b]">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // Not signed in: render dark AuthSignIn defaulted to signup mode
  if (!user) {
    return (
      <AuthSignIn
        ar={ar}
        redirectPath="/onboarding"
        defaultMode="signup"
        title={ar ? "ابدأ برنامج ولائك مجاناً" : "Start your loyalty program free"}
        description={
          ar
            ? "بدون بطاقة ائتمانية. بطاقتك جاهزة في دقيقتين."
            : "No credit card needed. Live in Apple Wallet in 2 minutes."
        }
      />
    );
  }

  async function handleStepBack(targetStep: OnboardingStepKey) {
    setCurrentStep(targetStep);
    if (!createdBusiness?.id) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      await saveOnboardingProgressServerFn({
        data: {
          accessToken: session.access_token,
          businessId: createdBusiness.id,
          step: targetStep,
        },
      });
    } catch (err) {
      console.warn("Onboarding step back sync note:", err);
    }
  }

  return (
    <OnboardingLayout currentStep={currentStep}>
      {/* Step 1: Business Identity */}
      {currentStep === "business" && (
        <BusinessSetupStep
          initialBusiness={createdBusiness}
          onSuccess={(biz) => {
            const defaultStarReward = STAMP_ICON_DEFAULT_REWARDS.star!;
            setCreatedBusiness((prev) =>
              prev && prev.id === biz.business_id
                ? {
                    ...prev,
                    slug: biz.slug,
                    name_ar: biz.name_ar,
                    name_en: biz.name_en,
                    plan: biz.effective_plan,
                  }
                : {
                    id: biz.business_id,
                    slug: biz.slug,
                    name_ar: biz.name_ar,
                    name_en: biz.name_en,
                    plan: biz.effective_plan,
                    program_type: "stamp",
                    offer_ar: defaultStarReward.ar,
                    offer_en: defaultStarReward.en,
                    brand_color: "#121214",
                    accent_color: "#10B981",
                    target_stamps: 8,
                    sar_per_point: 10,
                    points_per_reward: 100,
                    stamp_icon: "⭐",
                  },
            );
            // Advance straight to loyalty (skipping manual plan screen)
            setCurrentStep("loyalty");
          }}
        />
      )}

      {/* Step 2: Card Studio */}
      {currentStep === "loyalty" && createdBusiness && (
        <LoyaltySetupStep
          businessId={createdBusiness.id}
          businessNameAr={createdBusiness.name_ar}
          businessNameEn={createdBusiness.name_en}
          initialProgram={createdBusiness.program_type}
          initialBrandColor={createdBusiness.brand_color}
          initialAccentColor={createdBusiness.accent_color}
          initialTargetStamps={createdBusiness.target_stamps ?? 8}
          initialStampIcon={createdBusiness.stamp_icon ?? "⭐"}
          initialOfferAr={createdBusiness.offer_ar}
          initialOfferEn={createdBusiness.offer_en}
          initialTemplateId={createdBusiness.template_id ?? null}
          onSuccess={(config) => {
            setCreatedBusiness((prev) =>
              prev
                ? {
                    ...prev,
                    program_type: config.program,
                    brand_color: config.brandColor,
                    accent_color: config.accentColor,
                    target_stamps: config.targetStamps,
                    stamp_icon: config.stampIcon,
                    offer_ar: config.suggestedRewardAr,
                    offer_en: config.suggestedRewardEn,
                    template_id: config.templateId,
                  }
                : null,
            );
            // Advance straight to reward
            setCurrentStep("reward");
          }}
          onBack={() => void handleStepBack("business")}
        />
      )}

      {/* Step 3: Reward Rules */}
      {currentStep === "reward" && createdBusiness && (
        <RewardSetupStep
          businessId={createdBusiness.id}
          program={createdBusiness.program_type}
          initialOfferAr={createdBusiness.offer_ar}
          initialOfferEn={createdBusiness.offer_en}
          initialTargetStamps={createdBusiness.target_stamps ?? 8}
          initialSarPerPoint={createdBusiness.sar_per_point ?? 10}
          initialPointsPerReward={createdBusiness.points_per_reward}
          stampIcon={createdBusiness.stamp_icon ?? "⭐"}
          onSuccess={(rules) => {
            setCreatedBusiness((prev) =>
              prev
                ? {
                    ...prev,
                    offer_ar: rules.offerAr,
                    offer_en: rules.offerEn,
                    target_stamps: rules.targetStamps ?? prev.target_stamps,
                    sar_per_point: rules.sarPerPoint ?? prev.sar_per_point,
                    points_per_reward: rules.pointsPerReward ?? prev.points_per_reward,
                  }
                : null,
            );
            // Advancing from reward progresses directly to launch (skipping location step)
            setCurrentStep("launch");
          }}
          onBack={() => void handleStepBack("loyalty")}
        />
      )}

      {/* Step 4: Launch & Counter QR */}
      {currentStep === "launch" && createdBusiness && (
        <LaunchStep
          business={createdBusiness}
          onFinish={() => {
            void navigate({ to: "/dashboard", replace: true });
          }}
          onBack={() => void handleStepBack("reward")}
        />
      )}
    </OnboardingLayout>
  );
}
