import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { isOwner, isManager, isCashier, type OperationsAccess } from "@/lib/access";
import { AuthSignIn } from "@/components/AuthSignIn";
import { OnboardingLayout, type OnboardingStepKey } from "@/components/onboarding/OnboardingLayout";
import { BusinessSetupStep } from "@/components/onboarding/BusinessSetupStep";
import { PlanSelectionStep } from "@/components/onboarding/PlanSelectionStep";
import { LoyaltySetupStep } from "@/components/onboarding/LoyaltySetupStep";
import { RewardSetupStep } from "@/components/onboarding/RewardSetupStep";
import { MainLocationStep } from "@/components/onboarding/MainLocationStep";
import { LaunchStep } from "@/components/onboarding/LaunchStep";
import { type ProgramType } from "@/constants/defaultTemplates";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "إعداد المنشأة | Business Onboarding — Wallet Loyalty" },
      {
        name: "description",
        content: "Set up your digital loyalty program, brand pass, and main location.",
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
      // Look up businesses owned by or assigned to this user
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
        onboarding: onb as { step: OnboardingStepKey; completed: boolean } | null,
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
  const isOwnerUser = isOwner(operationalRole);
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

    // If onboarding is already marked completed, navigate straight to dashboard
    if (onboarding?.completed) {
      void navigate({ to: "/dashboard", replace: true });
      return;
    }

    // Otherwise resume at the saved step
    setCreatedBusiness(business);
    if (onboarding?.step && (onboarding.step as string) !== "completed") {
      setCurrentStep(onboarding.step);
    } else {
      setCurrentStep("plan");
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
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthSignIn
        ar={ar}
        redirectPath="/onboarding"
        title={ar ? "تسجيل الدخول لبدء إعداد المنشأة" : "Sign in to set up your business"}
        description={
          ar
            ? "أنشئ حساباً جديداً أو سجل الدخول لإطلاق بطاقتك الرقمية."
            : "Create an account or sign in to configure your digital pass."
        }
      />
    );
  }

  return (
    <OnboardingLayout
      currentStep={currentStep}
      title={t("onboardingTitle")}
      subtitle={t("onboardingSubtitle")}
    >
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
              offer_ar: "",
              offer_en: "",
              brand_color: "#059669",
              accent_color: "#F59E0B",
              target_stamps: 9,
              sar_per_point: 10,
              points_per_reward: 100,
            });
            setCurrentStep("plan");
          }}
        />
      )}

      {currentStep === "plan" && createdBusiness && (
        <PlanSelectionStep
          businessId={createdBusiness.id}
          initialPlan={createdBusiness.plan}
          onSuccess={() => {
            setCurrentStep("loyalty");
          }}
        />
      )}

      {currentStep === "loyalty" && createdBusiness && (
        <LoyaltySetupStep
          businessId={createdBusiness.id}
          businessNameAr={createdBusiness.name_ar}
          businessNameEn={createdBusiness.name_en}
          initialProgram={createdBusiness.program_type}
          initialBrandColor={createdBusiness.brand_color}
          initialAccentColor={createdBusiness.accent_color}
          onSuccess={(program, brandColor, accentColor) => {
            setCreatedBusiness((prev) =>
              prev
                ? {
                    ...prev,
                    program_type: program,
                    brand_color: brandColor,
                    accent_color: accentColor,
                  }
                : null,
            );
            setCurrentStep("reward");
          }}
          onBack={() => setCurrentStep("plan")}
        />
      )}

      {currentStep === "reward" && createdBusiness && (
        <RewardSetupStep
          businessId={createdBusiness.id}
          program={createdBusiness.program_type}
          initialOfferAr={createdBusiness.offer_ar}
          initialOfferEn={createdBusiness.offer_en}
          initialTargetStamps={createdBusiness.target_stamps ?? 9}
          initialSarPerPoint={createdBusiness.sar_per_point ?? 10}
          initialPointsPerReward={createdBusiness.points_per_reward}
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
            setCurrentStep("location");
          }}
          onBack={() => setCurrentStep("loyalty")}
        />
      )}

      {currentStep === "location" && createdBusiness && (
        <MainLocationStep
          businessId={createdBusiness.id}
          onSuccess={() => {
            setCurrentStep("launch");
          }}
          onBack={() => setCurrentStep("reward")}
        />
      )}

      {currentStep === "launch" && createdBusiness && (
        <LaunchStep
          business={createdBusiness}
          onFinish={() => {
            void navigate({ to: "/dashboard", replace: true });
          }}
          onBack={() => setCurrentStep("location")}
        />
      )}
    </OnboardingLayout>
  );
}
