import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { inviteMerchantAndCreateBusiness } from "@/lib/admin.functions";
import { AVAILABLE_PLANS } from "@/lib/plans";
import { useLocale } from "@/lib/i18n";
import { PortalNav } from "@/components/PortalNav";
import { AuthSignIn } from "@/components/AuthSignIn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Activity,
  CreditCard,
  Download,
  Eye,
  Loader2,
  LogOut,
  Package,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import {
  getStoredWalletTier,
  setStoredWalletTier,
  STRIP_STYLES,
  type StripStyle,
  type WalletTierMode,
} from "@/lib/wallet-tier";
import { generateStampStripDataUri } from "@/lib/strip-generator";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Super Admin — Wallet Loyalty Platform" },
      {
        name: "description",
        content: "Manage tenant restaurants, platform analytics, hardware dispatch and domains.",
      },
    ],
  }),
  component: AdminPortal,
});

type Tenant = {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  plan: string;
  status: string;
  active_passes: number;
  redemptions: number;
  custom_domain: string | null;
  merchant_email: string | null;
  owner_id: string | null;
};

type HardwareDispatch = {
  id: string;
  business_id: string | null;
  item: string;
  quantity: number;
  status: string;
  tracking_no: string | null;
};

const EMPTY_TENANTS: Tenant[] = [];
const EMPTY_HARDWARE: HardwareDispatch[] = [];

function Stat({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="size-7 animate-spin text-primary" />
    </div>
  );
}

function AdminPortal() {
  const { locale, t } = useLocale();
  const ar = locale === "ar";
  const queryClient = useQueryClient();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [domain, setDomain] = useState("");
  const [domainTenantId, setDomainTenantId] = useState("");
  const [newBusiness, setNewBusiness] = useState({
    merchantEmail: "",
    slug: "",
    nameAr: "",
    nameEn: "",
    plan: "single_location",
  });

  const [tierMode, setTierMode] = useState<WalletTierMode>(getStoredWalletTier);
  const [inspectorStyle, setInspectorStyle] = useState<StripStyle>("pizzatown");
  const [inspectorIcon, setInspectorIcon] = useState("☕");
  const [inspectorTarget, setInspectorTarget] = useState(7);
  const [inspectorStamps, setInspectorStamps] = useState(3);
  const [inspectorBrand, setInspectorBrand] = useState("#1A1412");
  const [inspectorAccent, setInspectorAccent] = useState("#D97706");

  const inspectorStripUri = useMemo(() => {
    try {
      return generateStampStripDataUri({
        targetStamps: inspectorTarget,
        stamps: inspectorStamps,
        brandColor: inspectorBrand,
        accentColor: inspectorAccent,
        stampIcon: inspectorIcon,
        stripStyle: inspectorStyle,
      });
    } catch {
      return null;
    }
  }, [
    inspectorTarget,
    inspectorStamps,
    inspectorBrand,
    inspectorAccent,
    inspectorIcon,
    inspectorStyle,
  ]);

  function handleModeChange(mode: WalletTierMode) {
    setTierMode(mode);
    setStoredWalletTier(mode);
    toast.success(
      mode === "free"
        ? ar
          ? "تم تفعيل الوضع المجاني (Free Tier Mode) في كافة الاستوديوهات"
          : "Free Tier Mode activated across all studio editors"
        : ar
          ? "تم تفعيل وضع استوديو Pro وميزات WalletWallet Pro"
          : "Pro Studio Mode activated with Retina strip banners",
    );
  }

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
      void queryClient.clear();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const roleQuery = useQuery({
    queryKey: ["admin-role", user?.id],
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

  const isAdmin = roleQuery.data?.role === "super_admin";

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id,name_ar,name_en,slug,plan,status,active_passes,redemptions,custom_domain,merchant_email,owner_id",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Tenant[];
    },
  });

  const hardwareQuery = useQuery({
    queryKey: ["hardware-dispatch"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hardware_dispatch")
        .select("id,business_id,item,quantity,status,tracking_no")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as HardwareDispatch[];
    },
  });

  const tenants = tenantsQuery.data ?? EMPTY_TENANTS;
  const hardware = hardwareQuery.data ?? EMPTY_HARDWARE;

  useEffect(() => {
    if (!domainTenantId && tenants[0]) {
      setDomainTenantId(tenants[0].id);
      setDomain(tenants[0].custom_domain ?? "");
    }
  }, [domainTenantId, tenants]);

  const statusMutation = useMutation({
    mutationFn: async (tenant: Tenant) => {
      const status = tenant.status === "active" ? "suspended" : "active";
      const { error } = await supabase.from("businesses").update({ status }).eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success(ar ? "تم تحديث حالة الحساب" : "Account status updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createBusinessMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (refreshError || !session) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Your admin session expired. Sign in again and retry.");
      }

      return inviteMerchantAndCreateBusiness({
        data: {
          accessToken: session.access_token,
          merchantEmail: newBusiness.merchantEmail.trim(),
          slug: newBusiness.slug.trim(),
          nameAr: newBusiness.nameAr.trim(),
          nameEn: newBusiness.nameEn.trim(),
          plan: newBusiness.plan as
            "single_location" | "multi_location" | "starter" | "growth" | "enterprise",
        },
      });
    },
    onSuccess: async (result) => {
      setNewBusiness({
        merchantEmail: "",
        slug: "",
        nameAr: "",
        nameEn: "",
        plan: "single_location",
      });
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success(
        result.merchantLinked
          ? ar
            ? "تم إنشاء المنشأة وربط حساب التاجر الحالي"
            : "Business created and existing merchant assigned"
          : ar
            ? "تم إنشاء المنشأة مسبقاً. يمكن للتاجر إنشاء حساب بنفس البريد."
            : "Business pre-registered. The merchant can sign up with this email.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domainMutation = useMutation({
    mutationFn: async () => {
      if (!domainTenantId) throw new Error("Choose a tenant first");
      const { error } = await supabase
        .from("businesses")
        .update({ custom_domain: domain.trim() || null })
        .eq("id", domainTenantId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success(ar ? "تم حفظ النطاق" : "Domain mapping saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!authReady) return <LoadingScreen />;
  if (!user)
    return (
      <AuthSignIn
        ar={ar}
        allowSignUp={false}
        redirectPath="/admin"
        title={ar ? "تسجيل دخول المشرف" : "Admin sign in"}
        description={
          ar
            ? "استخدم حساب Supabase المعيّن كمشرف عام."
            : "Use the Supabase account assigned the super_admin role."
        }
      />
    );
  if (roleQuery.isLoading) return <LoadingScreen />;

  if (roleQuery.isError || !isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="panel max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 text-xl font-bold">{ar ? "غير مصرح" : "Access denied"}</h1>
          <p className="mt-2 text-sm text-muted-foreground" role="alert">
            {roleQuery.isError
              ? roleQuery.error.message
              : ar
                ? "هذا الحساب لا يملك دور المشرف العام."
                : "This account does not have the super_admin role."}
          </p>
          <Button className="mt-5" variant="outline" onClick={() => supabase.auth.signOut()}>
            {ar ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </div>
      </div>
    );
  }

  const dataError = tenantsQuery.error ?? hardwareQuery.error;
  const totalPasses = tenants.reduce((sum, tenant) => sum + (tenant.active_passes ?? 0), 0);
  const totalRedemptions = tenants.reduce((sum, tenant) => sum + (tenant.redemptions ?? 0), 0);
  const tenantSlug = new Map(tenants.map((tenant) => [tenant.id, tenant.slug]));

  return (
    <div className="min-h-screen">
      <PortalNav title={t("adminPortal")} subtitle={t("brand")} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" dir="ltr">
            {user.email}
          </p>
          <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
            <LogOut className="size-4" /> {ar ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </div>

        {dataError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {dataError.message}
          </div>
        ) : null}

        {/* Master Wallet & Studio Control Panel */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-5 sm:p-6 shadow-2xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-xs">
                <Sliders className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">
                  {ar
                    ? "لوحة التحكم الرئيسية بالاستوديو والتراخيص"
                    : "Master Pass Studio & Tier Engine"}
                </h2>
                <p className="text-xs text-zinc-400">
                  {ar
                    ? "التحكم في وضع الاستوديو الشامل وفحص شرائط Apple Wallet بدقة Retina"
                    : "Global tier switch for Onboarding/Dashboard & live 1080x360 retina strip inspector"}
                </p>
              </div>
            </div>

            <Badge
              variant="outline"
              className={
                tierMode === "pro"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 font-mono text-xs px-3 py-1"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono text-xs px-3 py-1"
              }
            >
              {tierMode === "pro" ? "⚡ PRO STUDIO ACTIVE" : "🟢 FREE TIER ACTIVE"}
            </Badge>
          </div>

          {/* Mode Switch Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleModeChange("free")}
              className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                tierMode === "free"
                  ? "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  <span>
                    {ar ? "الوضع المجاني (اختبار مضمون)" : "Free Tier Mode (Active Testing)"}
                  </span>
                </span>
                {tierMode === "free" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-zinc-950">
                    {ar ? "نشط حالياً" : "ACTIVE"}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                {ar
                  ? "يقيد الاستوديو بالألوان الستة الرسمية وشريط الإيموجي عالي التباين، مما يضمن تحميل البطاقة بنسبة 100% على كافة حسابات WalletWallet المجانية."
                  : "Locks studio to 6 official wallet presets & emoji stamp bar. Guaranteed 100% pass creation without Pro-plan restrictions."}
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange("pro")}
              className={`p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                tierMode === "pro"
                  ? "border-amber-500/60 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="size-4 text-amber-400" />
                  <span>
                    {ar
                      ? "وضع استوديو برو (WalletWallet Pro)"
                      : "Pro Studio Mode (WalletWallet Pro)"}
                  </span>
                </span>
                {tierMode === "pro" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950">
                    {ar ? "نشط حالياً" : "ACTIVE"}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                {ar
                  ? "يفتح خيارات الألوان المخصصة بالكامل (Hex)، وشرائط 1080x360 Retina بنمط بيتزاتاون وبطاقة نيلز البيضاء ولينير داكن، وشعار المنشأة."
                  : "Unlocks custom hex colors, 1080x360 retina strip banners (Pizzatown, Nails White, Linear Dark), and custom logo branding."}
              </p>
            </button>
          </div>

          {/* Live Retina Strip Inspector */}
          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="size-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  {ar
                    ? "مفتش شرائط Retina المباشر (1080×360 px)"
                    : "Live Retina Strip Inspector (1080×360 px)"}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">
                Native PNG Bitmap Engine • Zero Network Latency
              </span>
            </div>

            {/* Inspector Controls */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Style selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">
                  {ar ? "نمط التصميم" : "Strip Style"}
                </Label>
                <div className="flex gap-1.5">
                  {STRIP_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setInspectorStyle(st.id)}
                      className={`flex-1 px-2 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        inspectorStyle === st.id
                          ? "bg-emerald-500 text-zinc-950 font-bold shadow-xs"
                          : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {st.id === "pizzatown"
                        ? "Pizzatown"
                        : st.id === "nails_white"
                          ? "Nails"
                          : "Linear"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">
                  {ar ? "أيقونة الختم" : "Stamp Icon"}
                </Label>
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {["☕", "🍔", "🥐", "✂️", "🚗", "⭐"].map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setInspectorIcon(ic)}
                      className={`size-8 rounded-lg text-sm transition-all flex items-center justify-center shrink-0 ${
                        inspectorIcon === ic
                          ? "bg-zinc-800 border-2 border-emerald-500 scale-105"
                          : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick stamp count presets */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">
                  {ar ? "نماذج الأختام" : "Stamp Count Presets"}
                </Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { target: 5, stamps: 0, label: "0/5" },
                    { target: 5, stamps: 2, label: "2/5" },
                    { target: 5, stamps: 5, label: "5/5" },
                    { target: 8, stamps: 3, label: "3/8" },
                    { target: 7, stamps: 7, label: "7/7" },
                  ].map((p) => {
                    const isSelected = inspectorTarget === p.target && inspectorStamps === p.stamps;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setInspectorTarget(p.target);
                          setInspectorStamps(p.stamps);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-all ${
                          isSelected
                            ? "bg-emerald-500 text-zinc-950 font-bold"
                            : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color pickers */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">
                  {ar ? "الألوان (Brand / Accent)" : "Colors"}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={inspectorBrand}
                    onChange={(e) => setInspectorBrand(e.target.value)}
                    title="Brand Color"
                    className="size-8 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer"
                  />
                  <Input
                    type="color"
                    value={inspectorAccent}
                    onChange={(e) => setInspectorAccent(e.target.value)}
                    title="Accent Color"
                    className="size-8 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer"
                  />
                  {inspectorStripUri && (
                    <a
                      href={inspectorStripUri}
                      download={`strip-${inspectorStyle}-${inspectorStamps}of${inspectorTarget}.png`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors ml-auto"
                    >
                      <Download className="size-3" />
                      <span>PNG</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Generated Strip Live Viewport */}
            <div className="pt-2">
              <div className="rounded-2xl border border-zinc-800 bg-black/60 p-2 sm:p-3 shadow-inner">
                {inspectorStripUri ? (
                  <div className="space-y-2">
                    <img
                      src={inspectorStripUri}
                      alt="Inspector Strip Preview"
                      className="w-full h-auto aspect-[3/1] rounded-xl object-cover block shadow-2xl border border-white/10"
                    />
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 font-mono">
                      <span>Resolution: 1080 × 360 px (Aspect 3:1)</span>
                      <span>
                        Style: {inspectorStyle} • Stamps: {inspectorStamps}/{inspectorTarget} •
                        Icon: {inspectorIcon}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-32 grid place-items-center text-xs text-zinc-500">
                    Failed to render preview
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Store} label={ar ? "المستأجرون" : "Tenants"} value={String(tenants.length)} />
          <Stat icon={CreditCard} label={t("activePasses")} value={totalPasses.toLocaleString()} />
          <Stat
            icon={Activity}
            label={t("redemptions")}
            value={totalRedemptions.toLocaleString()}
          />
          <Stat
            icon={Package}
            label={t("systemHealth")}
            value={dataError ? "Error" : "Connected"}
          />
        </div>

        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">{t("accounts")}</TabsTrigger>
            <TabsTrigger value="hardware">{t("hardware")}</TabsTrigger>
            <TabsTrigger value="domains">{t("domains")}</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-4 space-y-4">
            <form
              className="panel grid gap-4 p-5 lg:grid-cols-6"
              onSubmit={(event) => {
                event.preventDefault();
                createBusinessMutation.mutate();
              }}
            >
              <div className="lg:col-span-6">
                <h2 className="font-semibold">{ar ? "إنشاء منشأة" : "Create business"}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ar
                    ? "سيتم ربط الحساب الموجود، أو حجز المنشأة حتى يسجل التاجر بنفس البريد."
                    : "An existing account is linked, or the business waits for this email to sign up."}
                </p>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="merchant-email">{ar ? "بريد التاجر" : "Merchant email"}</Label>
                <Input
                  id="merchant-email"
                  type="email"
                  dir="ltr"
                  required
                  value={newBusiness.merchantEmail}
                  onChange={(event) =>
                    setNewBusiness({ ...newBusiness, merchantEmail: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-slug">Slug</Label>
                <Input
                  id="business-slug"
                  dir="ltr"
                  required
                  pattern="[a-z0-9-]+"
                  placeholder="elite-coffee"
                  value={newBusiness.slug}
                  onChange={(event) =>
                    setNewBusiness({
                      ...newBusiness,
                      slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-name-en">{ar ? "الاسم الإنجليزي" : "English name"}</Label>
                <Input
                  id="business-name-en"
                  required
                  value={newBusiness.nameEn}
                  onChange={(event) =>
                    setNewBusiness({ ...newBusiness, nameEn: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-name-ar">{ar ? "الاسم العربي" : "Arabic name"}</Label>
                <Input
                  id="business-name-ar"
                  dir="rtl"
                  required
                  value={newBusiness.nameAr}
                  onChange={(event) =>
                    setNewBusiness({ ...newBusiness, nameAr: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-plan">{ar ? "الباقة" : "Plan"}</Label>
                <select
                  id="business-plan"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={newBusiness.plan}
                  onChange={(event) => setNewBusiness({ ...newBusiness, plan: event.target.value })}
                >
                  {AVAILABLE_PLANS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {ar ? p.nameAr : p.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-6">
                <Button type="submit" disabled={createBusinessMutation.isPending}>
                  {createBusinessMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : ar ? (
                    "إنشاء المنشأة"
                  ) : (
                    "Create business"
                  )}
                </Button>
              </div>
            </form>

            <div className="panel p-4">
              {tenantsQuery.isLoading ? (
                <Loader2 className="mx-auto my-10 size-6 animate-spin text-primary" />
              ) : tenants.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {ar ? "لا توجد منشآت في Supabase بعد." : "No businesses exist in Supabase yet."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ar ? "المنشأة" : "Business"}</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>{ar ? "التاجر" : "Merchant"}</TableHead>
                      <TableHead>{ar ? "الباقة" : "Plan"}</TableHead>
                      <TableHead>{t("activePasses")}</TableHead>
                      <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">
                          {ar ? tenant.name_ar : tenant.name_en}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                        <TableCell>
                          <span className="block text-xs" dir="ltr">
                            {tenant.merchant_email ?? "—"}
                          </span>
                          <Badge
                            className="mt-1"
                            variant={tenant.owner_id ? "secondary" : "outline"}
                          >
                            {tenant.owner_id
                              ? ar
                                ? "مرتبط"
                                : "Linked"
                              : ar
                                ? "بانتظار التسجيل"
                                : "Awaiting signup"}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{tenant.plan}</TableCell>
                        <TableCell>{(tenant.active_passes ?? 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={tenant.status === "active" ? "default" : "destructive"}>
                            {tenant.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate(tenant)}
                          >
                            {tenant.status === "active"
                              ? ar
                                ? "تعليق"
                                : "Suspend"
                              : ar
                                ? "تفعيل"
                                : "Activate"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="hardware" className="panel mt-4 p-4">
            {hardwareQuery.isLoading ? (
              <Loader2 className="mx-auto my-10 size-6 animate-spin text-primary" />
            ) : hardware.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {ar ? "لا توجد شحنات أجهزة." : "No hardware dispatches exist yet."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>{ar ? "الصنف" : "Item"}</TableHead>
                    <TableHead>{ar ? "الكمية" : "Qty"}</TableHead>
                    <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                    <TableHead>{ar ? "التتبع" : "Tracking"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hardware.map((dispatch) => (
                    <TableRow key={dispatch.id}>
                      <TableCell>
                        {dispatch.business_id ? (tenantSlug.get(dispatch.business_id) ?? "—") : "—"}
                      </TableCell>
                      <TableCell>{dispatch.item}</TableCell>
                      <TableCell>{dispatch.quantity}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{dispatch.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dispatch.tracking_no ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="domains" className="panel mt-4 space-y-4 p-6">
            {tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ar ? "أضف منشأة أولاً لإدارة نطاقها." : "Add a business before mapping a domain."}
              </p>
            ) : (
              <div className="grid gap-3 sm:max-w-md">
                <Label htmlFor="domain-tenant">{ar ? "المنشأة" : "Tenant"}</Label>
                <select
                  id="domain-tenant"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={domainTenantId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setDomainTenantId(id);
                    setDomain(tenants.find((tenant) => tenant.id === id)?.custom_domain ?? "");
                  }}
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.slug}
                    </option>
                  ))}
                </select>
                <Label htmlFor="domain">{ar ? "نطاق مخصص للعميل" : "Client custom domain"}</Label>
                <Input
                  id="domain"
                  placeholder="loyalty.example.sa"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  dir="ltr"
                />
                <Button
                  onClick={() => domainMutation.mutate()}
                  disabled={domainMutation.isPending}
                  className="w-fit"
                >
                  {domainMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("save")
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
