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
import { type ProgramType } from "@/constants/defaultTemplates";

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
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "super_admin")
        .is("business_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Check if user already has an active business and its onboarding state
  const businessQuery = useQuery({
    queryKey: ["onboarding-business-check", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: businesses, error } = await supabase
        .from("businesses")
        .select(
          "id,slug,name_ar,name_en,plan,program_type,offer_ar,offer_en,brand_color,accent_color,target_stamps,sar_per_point,points_per_reward",
        )
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!businesses || businesses.length === 0) return null;

      const biz = businesses[0] as OnboardingBusiness;

      // Look up onboarding record
      const { data: onb } = await supabase
        .from("business_onboarding")
        .select("step,completed")
        .eq("business_id", biz.id)
        .maybeSingle();

      return {
        business: biz,
        onboarding: onb as { step: string; completed: boolean } | null,
      };
    },
  });

  // Check Operational Access if a business exists for this user
  const accessQuery = useQuery({
    queryKey: ["onboarding-access", businessQuery.data?.business?.id, user?.id],
    enabled: Boolean(businessQuery.data?.business?.id) && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_access", { _business_id: businessQuery.data!.business.id })
        .single();
      if (error) throw error;
      return data as OperationsAccess;
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

  return (
    <OnboardingLayout
      currentStep={currentStep}
      title={
        currentStep === "business"
          ? ar
            ? "الخطوة ١: هوية وبيانات المتجر"
            : "Step 1: Store Identity"
          : currentStep === "loyalty"
            ? ar
              ? "الخطوة ٢: استوديو تصميم البطاقة"
              : "Step 2: Card Studio"
            : currentStep === "reward"
              ? ar
                ? "الخطوة ٣: شروط ومكافأة الولاء"
                : "Step 3: Reward Rules"
              : ar
                ? "الخطوة ٤: إطلاق برنامج الولاء ورمز QR"
                : "Step 4: Launch & Counter QR"
      }
      subtitle={
        currentStep === "business"
          ? ar
            ? "أدخل اسم متجرك لإنشاء بطاقة Apple Wallet الخاصة بك."
            : "Enter your business details to create your Apple Wallet pass."
          : currentStep === "loyalty"
            ? ar
              ? "اختر النموذج المناسب لنشاطك وخصص الألوان وعدد الأختام."
              : "Choose an industry template or customize your card colors."
            : currentStep === "reward"
              ? ar
                ? "حدد الهدية التي تظهر لعملائك بمجرد جمع الأختام."
                : "Specify the gift customers earn upon collecting stamps."
              : ar
                ? "اطبع الرمز وضعه على الكاونتر للبدء باستقبال العملاء."
                : "Place your QR code on the counter to begin enrolling customers."
      }
    >
      {/* Step 1: Business Identity */}
      {currentStep === "business" && (
        <BusinessSetupStep
          onSuccess={(biz) => {
            setCreatedBusiness({
              id: biz.business_id,
              slug: biz.slug,
              name_ar: biz.name_ar,
              name_en: biz.name_en,
              plan: biz.effective_plan,
              program_type: "stamp",
              offer_ar: "مكافأة خاصة بعد 8 زيارات 🎁",
              offer_en: "Special reward after 8 visits 🎁",
              brand_color: "#121214",
              accent_color: "#10B981",
              target_stamps: 8,
              sar_per_point: 10,
              points_per_reward: 100,
              stamp_icon: "⭐",
            });
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
          onSuccess={(config) => {
            setCreatedBusiness((prev) =>
              prev
                ? {
                    ...prev,
                    program_type: config.program,
                    brand_color: config.brandColor,
                    accent_color: config.accentColor,
                    targetStamps: config.targetStamps,
                    stamp_icon: config.stampIcon,
                    offer_ar: config.suggestedRewardAr,
                    offer_en: config.suggestedRewardEn,
                  }
                : null,
            );
            // Advance straight to reward
            setCurrentStep("reward");
          }}
          onBack={() => setCurrentStep("business")}
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
          onBack={() => setCurrentStep("loyalty")}
        />
      )}

      {/* Step 4: Launch & Counter QR */}
      {currentStep === "launch" && createdBusiness && (
        <LaunchStep
          business={createdBusiness}
          onFinish={() => {
            void navigate({ to: "/dashboard", replace: true });
          }}
          onBack={() => setCurrentStep("reward")}
        />
      )}
    </OnboardingLayout>
  );
}
