import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { PortalNav } from "@/components/PortalNav";
import { AuthSignIn } from "@/components/AuthSignIn";
import { OperationsPanel } from "@/components/OperationsPanel";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { OwnerOverview } from "@/components/dashboard/OwnerOverview";
import { ManagerOverview } from "@/components/dashboard/ManagerOverview";
import { CustomersPanel } from "@/components/dashboard/CustomersPanel";
import { JoinQrPanel } from "@/components/dashboard/JoinQrPanel";
import { PlanBillingPanel } from "@/components/dashboard/PlanBillingPanel";
import { PassPreview, type PassDesign } from "@/components/PassPreview";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { PASS_TEMPLATES, autoContrast, type ProgramType } from "@/constants/defaultTemplates";
import { sendWalletPush } from "@/lib/wallet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  Building2,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  QrCode,
  ShieldAlert,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { isOwner, isManager, isCashier, type OperationsAccess } from "@/lib/access";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التاجر | Merchant Dashboard — Wallet Loyalty" },
      {
        name: "description",
        content:
          "Design wallet passes, run loyalty programs, manage cashier PINs, geofence alerts and push campaigns.",
      },
      { property: "og:title", content: "Merchant Dashboard — Wallet Loyalty" },
      {
        property: "og:description",
        content: "Pass designer with live Apple & Google Wallet previews plus analytics.",
      },
    ],
  }),
  component: MerchantDashboard,
});

type Business = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  program_type: ProgramType;
  offer_ar: string | null;
  offer_en: string | null;
  target_stamps: number | null;
  sar_per_point: number | null;
  points_per_reward: number;
  latitude: number | null;
  longitude: number | null;
  geo_text_ar: string | null;
  geo_text_en: string | null;
};

function MerchantDashboard() {
  const { locale, t } = useLocale();
  const ar = locale === "ar";
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [program, setProgram] = useState<ProgramType>("stamp");
  const tpl = PASS_TEMPLATES[program];

  const [design, setDesign] = useState<PassDesign>({
    businessName: "",
    businessNameEn: "",
    logoUrl: null,
    background: "#059669",
    accent: "#F59E0B",
    headline: "",
    headlineEn: "",
    subline: "شكراً لولائك",
    sublineEn: "Thanks for your loyalty",
    program: "stamp",
    targetStamps: 9,
    sarPerPoint: 10,
    pointsPerReward: 100,
    progress: 0,
  });

  const [pin, setPin] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geoAr, setGeoAr] = useState("");
  const [geoEn, setGeoEn] = useState("");
  const [pushAr, setPushAr] = useState("");
  const [pushEn, setPushEn] = useState("");
  const [reminders, setReminders] = useState({ d14: true, d30: true, d60: false });
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    if (
      typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") ||
        window.location.hash.includes("type=invite"))
    ) {
      setShowResetPassword(true);
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setShowResetPassword(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const adminRoleQuery = useQuery({
    queryKey: ["dashboard-admin-role", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const businessesQuery = useQuery({
    queryKey: ["merchant-businesses", user?.id],
    enabled:
      Boolean(user) && adminRoleQuery.isSuccess && adminRoleQuery.data?.role !== "super_admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id,slug,name_ar,name_en,logo_url,brand_color,accent_color,program_type,offer_ar,offer_en,target_stamps,sar_per_point,points_per_reward,latitude,longitude,geo_text_ar,geo_text_en",
        )
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Business[];
    },
  });

  const businesses = businessesQuery.data ?? [];
  const business = businesses.find((item) => item.id === businessId) ?? businesses[0] ?? null;

  useEffect(() => {
    if (!business) return;
    if (!businessId) setBusinessId(business.id);
    setProgram(business.program_type);
    setDesign({
      businessName: business.name_ar,
      businessNameEn: business.name_en,
      logoUrl: business.logo_url,
      background: business.brand_color,
      accent: business.accent_color,
      headline: business.offer_ar ?? "",
      headlineEn: business.offer_en ?? "",
      subline: "شكراً لولائك",
      sublineEn: "Thanks for your loyalty",
      program: business.program_type,
      targetStamps: business.target_stamps ?? 9,
      sarPerPoint: business.sar_per_point ?? 10,
      pointsPerReward: business.points_per_reward,
      progress: 0,
    });
    setPin("");
    setLat(business.latitude === null ? "" : String(business.latitude));
    setLng(business.longitude === null ? "" : String(business.longitude));
    setGeoAr(business.geo_text_ar ?? "");
    setGeoEn(business.geo_text_en ?? "");
    setLogoFile(null);
  }, [business, businessId]);

  const automationQuery = useQuery({
    queryKey: ["business-automations", business?.id],
    enabled: Boolean(business),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_automations")
        .select("inactive_14_enabled,inactive_30_enabled,inactive_60_enabled")
        .eq("business_id", business!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!automationQuery.data) return;
    setReminders({
      d14: automationQuery.data.inactive_14_enabled,
      d30: automationQuery.data.inactive_30_enabled,
      d60: automationQuery.data.inactive_60_enabled,
    });
  }, [automationQuery.data]);

  const accessQuery = useQuery({
    queryKey: ["dashboard-access", business?.id, user?.id],
    enabled: Boolean(business?.id) && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_access", { _business_id: business!.id })
        .single();
      if (error) throw error;
      return data as OperationsAccess;
    },
  });

  const onboardingQuery = useQuery({
    queryKey: ["dashboard-onboarding-check", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_onboarding")
        .select("step,completed")
        .eq("business_id", business!.id)
        .maybeSingle();
      if (error) return null;
      return data as { step: string; completed: boolean } | null;
    },
  });

  const operationalRole = accessQuery.data?.operational_role;
  const isOwnerUser = isOwner(operationalRole);
  const isManagerUser = isManager(operationalRole);
  const isCashierUser = isCashier(operationalRole);
  const managedBranchIds = useMemo(
    () => accessQuery.data?.managed_branch_ids ?? [],
    [accessQuery.data?.managed_branch_ids],
  );

  const branchesQuery = useQuery({
    queryKey: ["dashboard-branches", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id,name_ar,name_en,status")
        .eq("business_id", business!.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignedBranches = useMemo(() => {
    const all = branchesQuery.data ?? [];
    if (isOwnerUser) return all;
    return all.filter((b) => managedBranchIds.includes(b.id));
  }, [isOwnerUser, branchesQuery.data, managedBranchIds]);

  const lockedBranchId = useMemo(() => {
    if (isManagerUser && managedBranchIds.length === 1) {
      return managedBranchIds[0];
    }
    return null;
  }, [isManagerUser, managedBranchIds]);

  const [managerBranchId, setManagerBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (lockedBranchId) {
      setManagerBranchId(lockedBranchId);
    }
  }, [lockedBranchId]);

  useEffect(() => {
    if (
      accessQuery.isSuccess &&
      !isOwnerUser &&
      (activeTab === "designer" ||
        activeTab === "pin" ||
        activeTab === "geo" ||
        activeTab === "push" ||
        activeTab === "qr" ||
        activeTab === "billing")
    ) {
      setActiveTab("overview");
    }
  }, [accessQuery.isSuccess, isOwnerUser, activeTab]);

  const fg = useMemo(() => autoContrast(design.background), [design.background]);
  function applyProgram(next: ProgramType) {
    setProgram(next);
    const template = PASS_TEMPLATES[next];
    setDesign((d) => ({
      ...d,
      program: next,
      background: template.colors.background,
      accent: template.colors.accent,
      headline: template.program.reward.ar,
      headlineEn: template.program.reward.en,
      targetStamps: template.program.targetStamps ?? d.targetStamps,
      sarPerPoint: template.program.sarPerPoint ?? d.sarPerPoint,
      pointsPerReward: template.program.pointsPerReward ?? d.pointsPerReward,
    }));
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setDesign((d) => ({ ...d, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function updateBusiness(values: Record<string, unknown>, successMessage: string) {
    if (!business) return false;
    setSaving(true);
    const { error } = await supabase.from("businesses").update(values).eq("id", business.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await businessesQuery.refetch();
    toast.success(successMessage);
    return true;
  }

  async function saveDesign() {
    if (!business) return;
    if (
      program === "points" &&
      (!Number.isInteger(design.pointsPerReward) || design.pointsPerReward <= 0)
    ) {
      toast.error(
        ar ? "أدخل حداً صحيحاً موجباً للمكافأة" : "Enter a positive whole-number reward threshold",
      );
      return;
    }
    let logoUrl = business.logo_url;
    if (logoFile) {
      const extension = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${business.id}/logo-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(path, logoFile, { contentType: logoFile.type });
      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }
      logoUrl = supabase.storage.from("business-assets").getPublicUrl(path).data.publicUrl;
    }
    await updateBusiness(
      {
        name_ar: design.businessName,
        name_en: design.businessNameEn,
        logo_url: logoUrl,
        brand_color: design.background,
        accent_color: design.accent,
        program_type: program,
        offer_ar: design.headline,
        offer_en: design.headlineEn,
        target_stamps: design.targetStamps,
        sar_per_point: design.sarPerPoint,
        points_per_reward: design.pointsPerReward,
      },
      ar
        ? "تم حفظ تصميم البطاقة والانتقال إلى لوحة التحكم الرئيسية"
        : "Pass design saved! Switched to main overview.",
    );
    setActiveTab("overview");
  }

  async function saveReminder(key: "d14" | "d30" | "d60", enabled: boolean) {
    if (!business) return;
    const next = { ...reminders, [key]: enabled };
    setReminders(next);
    const { error } = await supabase.from("business_automations").upsert({
      business_id: business.id,
      inactive_14_enabled: next.d14,
      inactive_30_enabled: next.d30,
      inactive_60_enabled: next.d60,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setReminders(reminders);
      toast.error(error.message);
      return;
    }
    toast.success(ar ? "تم تحديث الأتمتة" : "Automation updated");
  }

  async function broadcast(segment: "all" | "inactive_14" | "inactive_30" | "inactive_60") {
    if (!business) return;
    setSending(true);
    try {
      const {
        data: { session },
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (refreshError || !session) {
        throw new Error(
          ar ? "انتهت الجلسة. سجل الدخول مرة أخرى." : "Session expired. Sign in again.",
        );
      }

      const res = await sendWalletPush({
        data: {
          accessToken: session.access_token,
          businessId: business.id,
          slug: business.slug,
          titleAr: design.businessName,
          titleEn: design.businessNameEn,
          bodyAr: pushAr,
          bodyEn: pushEn,
          segment,
        },
      });
      if (res.ok) toast.success(ar ? "تم إرسال الحملة" : "Campaign sent");
      else
        toast.error(
          ar ? "تعذر الإرسال — تحقق من مفتاح WalletWallet" : "Send failed — check WalletWallet key",
        );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ar ? "خطأ في الشبكة" : "Network error");
    } finally {
      setSending(false);
    }
  }

  if (!authReady) {
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
        redirectPath="/dashboard"
        title={ar ? "تسجيل دخول التاجر" : "Merchant sign in"}
        description={
          ar
            ? "استخدم حساب التاجر المرتبط بمنشأتك."
            : "Use the merchant account assigned to your business."
        }
      />
    );
  }

  if (adminRoleQuery.isLoading || businessesQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (adminRoleQuery.data?.role === "super_admin") {
    return <Navigate to="/admin" replace />;
  }

  // Phase 4: A genuine new user without any business relationship enters onboarding
  if (businessesQuery.isSuccess && businesses.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  if (adminRoleQuery.isError || businessesQuery.isError || !business) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="panel max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 text-xl font-bold">
            {ar ? "لا توجد منشأة مرتبطة" : "No business assigned"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground" role="alert">
            {adminRoleQuery.error?.message ??
              businessesQuery.error?.message ??
              (ar
                ? "اطلب من المشرف ربط حسابك بمنشأة."
                : "Ask an administrator to assign your account to a business.")}
          </p>
          <Button className="mt-5" variant="outline" onClick={() => supabase.auth.signOut()}>
            {ar ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </div>
      </div>
    );
  }

  if (accessQuery.isSuccess && isCashierUser) {
    return <Navigate to="/scan" replace />;
  }

  // Phase 4: An Owner with an incomplete onboarding business resumes onboarding
  if (
    isOwnerUser &&
    onboardingQuery.isSuccess &&
    onboardingQuery.data &&
    !onboardingQuery.data.completed
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen">
      {showResetPassword && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-xs px-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setUpdatingPassword(true);
              const { error } = await supabase.auth.updateUser({ password: newPassword });
              setUpdatingPassword(false);
              if (error) {
                toast.error(error.message);
              } else {
                toast.success(
                  ar ? "تم تحديث كلمة المرور بنجاح!" : "Password updated successfully!",
                );
                setShowResetPassword(false);
                setNewPassword("");
                if (typeof window !== "undefined") {
                  window.history.replaceState(null, "", window.location.pathname);
                }
              }
            }}
            className="panel w-full max-w-sm space-y-4 p-6 shadow-xl"
          >
            <div>
              <h2 className="text-lg font-bold">
                {ar ? "تعيين كلمة مرور جديدة" : "Set New Password"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {ar
                  ? "أدخل كلمة المرور الجديدة لحساب التاجر الخاص بك."
                  : "Enter a new password for your merchant account."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-new-password">
                {ar ? "كلمة المرور الجديدة" : "New Password"}
              </Label>
              <Input
                id="reset-new-password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
                placeholder="••••••••"
              />
            </div>
            <div className="flex gap-2">
              <Button className="w-full" type="submit" disabled={updatingPassword}>
                {updatingPassword ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : ar ? (
                  "حفظ كلمة المرور"
                ) : (
                  "Save Password"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowResetPassword(false)}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <PortalNav
        title={t("merchantPortal")}
        subtitle={ar ? design.businessName : design.businessNameEn}
      />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-64 space-y-2">
            <Label htmlFor="active-business">{ar ? "المنشأة" : "Business"}</Label>
            <select
              id="active-business"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={business.id}
              onChange={(event) => setBusinessId(event.target.value)}
              disabled={businesses.length === 1}
            >
              {businesses.map((item) => (
                <option key={item.id} value={item.id}>
                  {ar ? item.name_ar : item.name_en}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground" dir="ltr">
              {user.email}
            </span>
            <Button size="sm" variant="outline" onClick={() => supabase.auth.signOut()}>
              <LogOut className="size-4" /> {ar ? "تسجيل الخروج" : "Sign out"}
            </Button>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="overview">
              <LayoutDashboard className="me-1.5 size-4" />
              {t("overview")}
            </TabsTrigger>
            <TabsTrigger value="customers">
              <Users className="me-1.5 size-4" />
              {t("customers")}
            </TabsTrigger>
            <TabsTrigger value="operations">
              <Building2 className="me-1.5 size-4" />
              {t("locationsAndTeam")}
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <Activity className="me-1.5 size-4" />
              {t("analytics")}
            </TabsTrigger>
            {isOwnerUser ? (
              <>
                <TabsTrigger value="designer">
                  <Edit3 className="me-1.5 size-4" />
                  {t("passDesigner")}
                </TabsTrigger>
                <TabsTrigger value="qr">
                  <QrCode className="me-1.5 size-4" />
                  {t("joinQr")}
                </TabsTrigger>
                <TabsTrigger value="push">{t("campaigns")}</TabsTrigger>
                <TabsTrigger value="geo">{t("geofence")}</TabsTrigger>
                <TabsTrigger value="billing">
                  <CreditCard className="me-1.5 size-4" />
                  {t("planAndBilling")}
                </TabsTrigger>
              </>
            ) : null}
          </TabsList>

          {/* Main Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {isOwnerUser ? (
              <OwnerOverview
                business={business}
                ar={ar}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            ) : (
              <ManagerOverview
                businessId={business.id}
                ar={ar}
                selectedBranchId={managerBranchId}
                onBranchChange={setManagerBranchId}
                assignedBranches={assignedBranches}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="mt-6 space-y-6">
            <CustomersPanel
              businessId={business.id}
              ar={ar}
              isOwnerUser={isOwnerUser}
              lockedBranchId={lockedBranchId}
              assignedBranches={assignedBranches}
            />
          </TabsContent>

          {/* Customer Join & Local QR Tab (Owner only) */}
          {isOwnerUser ? (
            <TabsContent value="qr" className="mt-6 space-y-6">
              <JoinQrPanel
                slug={business.slug}
                businessName={ar ? business.name_ar : business.name_en}
                ar={ar}
              />
            </TabsContent>
          ) : null}

          {/* Pass designer */}
          {isOwnerUser ? (
            <>
              <TabsContent
                value="designer"
                className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
              >
                <div className="panel space-y-5 p-6">
                  <div>
                    <Label className="mb-2 block">{t("programs")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {(["stamp", "points", "coupon_morph"] as ProgramType[]).map((p) => (
                        <Button
                          key={p}
                          size="sm"
                          variant={program === p ? "default" : "outline"}
                          onClick={() => applyProgram(p)}
                        >
                          {ar ? PASS_TEMPLATES[p].name.ar : PASS_TEMPLATES[p].name.en}
                        </Button>
                      ))}
                    </div>
                    {program === "coupon_morph" ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {ar
                          ? "تُستهلك قسيمة الخصم عند أول استبدال ناجح، ثم تصبح بطاقة أختام دائمة."
                          : "The introductory coupon is consumed on its first valid redemption, then becomes a permanent stamp card."}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="nameAr">
                        {ar ? "اسم المنشأة (عربي)" : "Business name (AR)"}
                      </Label>
                      <Input
                        id="nameAr"
                        value={design.businessName}
                        onChange={(e) => setDesign({ ...design, businessName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="nameEn">
                        {ar ? "اسم المنشأة (إنجليزي)" : "Business name (EN)"}
                      </Label>
                      <Input
                        id="nameEn"
                        value={design.businessNameEn}
                        onChange={(e) => setDesign({ ...design, businessNameEn: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="headAr">{ar ? "نص البطاقة (عربي)" : "Pass text (AR)"}</Label>
                      <Input
                        id="headAr"
                        value={design.headline}
                        onChange={(e) => setDesign({ ...design, headline: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="headEn">
                        {ar ? "نص البطاقة (إنجليزي)" : "Pass text (EN)"}
                      </Label>
                      <Input
                        id="headEn"
                        value={design.headlineEn}
                        onChange={(e) => setDesign({ ...design, headlineEn: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="bg">{ar ? "لون الخلفية" : "Background color"}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="bg"
                          type="color"
                          className="h-10 w-16 p-1"
                          value={design.background}
                          onChange={(e) => setDesign({ ...design, background: e.target.value })}
                        />
                        <Badge variant="secondary">
                          {ar ? "تباين تلقائي:" : "Auto contrast:"} {fg}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="ac">{ar ? "لون التمييز" : "Accent color"}</Label>
                      <Input
                        id="ac"
                        type="color"
                        className="h-10 w-16 p-1"
                        value={design.accent}
                        onChange={(e) => setDesign({ ...design, accent: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="logo">{ar ? "شعار المنشأة" : "Brand logo"}</Label>
                    <Input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => onLogo(e.target.files?.[0])}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ar ? "يتم تحجيم الشعار تلقائياً إلى 40×40" : "Logo auto-resized to 40×40"}
                    </p>
                  </div>

                  {program === "points" ? (
                    <div className="space-y-4">
                      <div>
                        <Label>
                          {ar
                            ? `ريال لكل نقطة: ${design.sarPerPoint}`
                            : `SAR per point: ${design.sarPerPoint}`}
                        </Label>
                        <Slider
                          min={1}
                          max={50}
                          step={1}
                          value={[design.sarPerPoint]}
                          onValueChange={([v]) => setDesign({ ...design, sarPerPoint: v ?? 10 })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="pointsPerReward">
                          {ar ? "النقاط المطلوبة للمكافأة" : "Points required per reward"}
                        </Label>
                        <Input
                          id="pointsPerReward"
                          type="number"
                          min={1}
                          step={1}
                          value={design.pointsPerReward}
                          onChange={(e) =>
                            setDesign({ ...design, pointsPerReward: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>
                        {ar
                          ? `عدد الأختام المطلوبة: ${design.targetStamps}`
                          : `Target stamps: ${design.targetStamps}`}
                      </Label>
                      <Slider
                        min={3}
                        max={12}
                        step={1}
                        value={[design.targetStamps]}
                        onValueChange={([v]) => setDesign({ ...design, targetStamps: v ?? 9 })}
                      />
                    </div>
                  )}

                  <Button onClick={saveDesign} disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : t("save")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {ar ? "قالب مرجعي:" : "Template:"} <code>{tpl.id}</code>
                  </p>
                </div>

                <div className="panel p-6">
                  <h2 className="mb-4 text-lg font-semibold">
                    {ar ? "معاينة حية مزدوجة" : "Live dual preview"}
                  </h2>
                  <PassPreview design={design} locale={locale} />
                </div>
              </TabsContent>

              {/* PIN */}
              <TabsContent value="pin" className="panel mt-4 max-w-md space-y-4 p-6">
                <Label htmlFor="pin">
                  {ar ? "رمز الكاشير المكون من ٤ أرقام" : "4-digit cashier PIN"}
                </Label>
                <Input
                  id="pin"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-32 text-center text-2xl tracking-[0.5em]"
                />
                <Button
                  disabled={pin.length !== 4 || saving}
                  onClick={async () => {
                    if (
                      await updateBusiness(
                        { cashier_pin: pin },
                        ar ? "تم تحديث رمز الكاشير" : "Cashier PIN updated",
                      )
                    )
                      setPin("");
                  }}
                >
                  {t("save")}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? "يستخدم موظفو الفرع هذا الرمز لفتح شاشة الماسح /scan"
                    : "Store staff use this PIN to unlock the /scan terminal"}
                </p>
              </TabsContent>
            </>
          ) : null}

          <TabsContent value="operations" className="mt-4">
            <OperationsPanel businessId={business.id} ar={ar} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <AnalyticsPanel
              businessId={business.id}
              ar={ar}
              lockedBranchId={
                lockedBranchId || (isManagerUser && managerBranchId ? managerBranchId : undefined)
              }
            />
          </TabsContent>

          {/* Geofence */}
          {isOwnerUser ? (
            <>
              <TabsContent value="geo" className="mt-4 grid gap-6 lg:grid-cols-2">
                <div className="panel space-y-4 p-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="lat">{ar ? "خط العرض" : "Latitude"}</Label>
                      <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="lng">{ar ? "خط الطول" : "Longitude"}</Label>
                      <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="gAr">{ar ? "نص التنبيه (عربي)" : "Proximity text (AR)"}</Label>
                    <Textarea
                      id="gAr"
                      value={geoAr}
                      onChange={(e) => setGeoAr(e.target.value)}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gEn">
                      {ar ? "نص التنبيه (إنجليزي)" : "Proximity text (EN)"}
                    </Label>
                    <Textarea
                      id="gEn"
                      value={geoEn}
                      onChange={(e) => setGeoEn(e.target.value)}
                      dir="ltr"
                    />
                  </div>
                  <Button
                    disabled={saving}
                    onClick={() =>
                      updateBusiness(
                        {
                          latitude: lat ? Number(lat) : null,
                          longitude: lng ? Number(lng) : null,
                          geo_text_ar: geoAr,
                          geo_text_en: geoEn,
                        },
                        ar ? "تم حفظ الموقع" : "Location saved",
                      )
                    }
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : t("save")}
                  </Button>
                </div>
                <div className="panel overflow-hidden">
                  <iframe
                    title="map"
                    className="h-full min-h-80 w-full border-0"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.01}%2C${Number(lat) - 0.01}%2C${Number(lng) + 0.01}%2C${Number(lat) + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`}
                  />
                </div>
              </TabsContent>

              {/* Push */}
              <TabsContent value="push" className="mt-4 grid gap-6 lg:grid-cols-2">
                <div className="panel space-y-4 p-6">
                  <h2 className="text-lg font-semibold">
                    {ar ? "حملة فورية" : "Instant broadcast"}
                  </h2>
                  <div>
                    <Label htmlFor="pAr">{ar ? "نص الإشعار (عربي)" : "Message (AR)"}</Label>
                    <Textarea
                      id="pAr"
                      value={pushAr}
                      onChange={(e) => setPushAr(e.target.value)}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pEn">{ar ? "نص الإشعار (إنجليزي)" : "Message (EN)"}</Label>
                    <Textarea
                      id="pEn"
                      value={pushEn}
                      onChange={(e) => setPushEn(e.target.value)}
                      dir="ltr"
                    />
                  </div>
                  <Button disabled={sending} onClick={() => broadcast("all")}>
                    {sending ? "…" : t("send")}
                  </Button>
                </div>

                <div className="panel space-y-4 p-6">
                  <h2 className="text-lg font-semibold">
                    {ar ? "تذكيرات الخمول التلقائية" : "Automated inactivity reminders"}
                  </h2>
                  {(
                    [
                      ["d14", 14, "inactive_14"],
                      ["d30", 30, "inactive_30"],
                      ["d60", 60, "inactive_60"],
                    ] as const
                  ).map(([key, days, segment]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {ar ? `بعد ${days} يوماً من الخمول` : `After ${days} days inactive`}
                        </p>
                        <button
                          className="text-xs text-primary underline"
                          onClick={() => broadcast(segment)}
                        >
                          {ar ? "إرسال تجريبي الآن" : "Send test now"}
                        </button>
                      </div>
                      <Switch
                        checked={reminders[key]}
                        onCheckedChange={(value) => saveReminder(key, value)}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </>
          ) : null}

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-4">
            <AnalyticsPanel key={business.id} businessId={business.id} ar={ar} />
          </TabsContent>

          {/* Owner Plan & Billing Tab */}
          {isOwnerUser ? (
            <TabsContent value="billing" className="mt-4">
              <PlanBillingPanel businessId={business.id} ar={ar} />
            </TabsContent>
          ) : null}
        </Tabs>

        {/* Campaign Delete/Reset Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-xs px-4">
            <div className="panel w-full max-w-md space-y-5 p-6 shadow-xl border-destructive/40">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                  <AlertTriangle className="size-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold">
                    {ar
                      ? "هل أنت تأكد من إعادة ضبط الحملة؟"
                      : "Are you sure you want to reset this campaign?"}
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ar
                      ? "سيؤدي هذا الإجراء إلى مسح تصميم البطاقة والعرض المخصص لهذه المنشأة. يمكنك إنشاء تصميم جديد في أي وقت."
                      : "This action will clear the current pass design and reward offer settings for this business. You can create a new design anytime."}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={deletingCampaign}
                  onClick={async () => {
                    setDeletingCampaign(true);
                    await updateBusiness(
                      {
                        offer_ar: "",
                        offer_en: "",
                        brand_color: "#059669",
                        accent_color: "#F59E0B",
                        logo_url: null,
                      },
                      ar ? "تمت إعادة ضبط الحملة بنجاح" : "Campaign reset successfully",
                    );
                    setDeletingCampaign(false);
                    setShowDeleteModal(false);
                    setActiveTab("designer");
                  }}
                >
                  {deletingCampaign ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : ar ? (
                    "تأكيد إعادة الضبط"
                  ) : (
                    "Confirm Reset"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
