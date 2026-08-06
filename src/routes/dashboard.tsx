import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { PortalNav } from "@/components/PortalNav";
import { AuthSignIn } from "@/components/AuthSignIn";
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
  AlertTriangle,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  QrCode,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  cashier_pin: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_text_ar: string | null;
  geo_text_en: string | null;
};

type PassRow = { id: string; created_at: string; last_visit_at: string | null };
type TransactionRow = { action: string; created_at: string };

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
    if (typeof window !== "undefined" && (window.location.hash.includes("type=recovery") || window.location.hash.includes("type=invite"))) {
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
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from("user_roles")
        .select("business_id")
        .eq("user_id", user!.id)
        .eq("role", "merchant")
        .not("business_id", "is", null);
      if (membershipError) throw membershipError;

      let ids = [...new Set((memberships ?? []).map((row) => row.business_id as string))];

      if (ids.length === 0 && user?.email) {
        // Auto-link pre-registered business by matching merchant_email
        const { data: preRegistered } = await supabase
          .from("businesses")
          .select("id, owner_id")
          .ilike("merchant_email", user.email);

        if (preRegistered && preRegistered.length > 0) {
          for (const biz of preRegistered) {
            if (!biz.owner_id) {
              await supabase.from("businesses").update({ owner_id: user.id }).eq("id", biz.id);
            }
            await supabase.from("user_roles").insert({
              user_id: user.id,
              role: "merchant",
              business_id: biz.id,
            });
          }
          ids = preRegistered.map((b) => b.id);
        }
      }

      if (ids.length === 0) return [] as Business[];

      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id,slug,name_ar,name_en,logo_url,brand_color,accent_color,program_type,offer_ar,offer_en,target_stamps,sar_per_point,cashier_pin,latitude,longitude,geo_text_ar,geo_text_en",
        )
        .in("id", ids)
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
      progress: 0,
    });
    setPin(business.cashier_pin ?? "");
    setLat(business.latitude === null ? "" : String(business.latitude));
    setLng(business.longitude === null ? "" : String(business.longitude));
    setGeoAr(business.geo_text_ar ?? "");
    setGeoEn(business.geo_text_en ?? "");
    setLogoFile(null);
  }, [business, businessId]);

  const analyticsQuery = useQuery({
    queryKey: ["merchant-analytics", business?.id],
    enabled: Boolean(business),
    queryFn: async () => {
      const [passesResult, transactionsResult] = await Promise.all([
        supabase
          .from("pass_instances")
          .select("id,created_at,last_visit_at")
          .eq("business_id", business!.id),
        supabase
          .from("pass_transactions")
          .select("action,created_at")
          .eq("business_id", business!.id),
      ]);
      if (passesResult.error) throw passesResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      return {
        passes: passesResult.data as PassRow[],
        transactions: transactionsResult.data as TransactionRow[],
      };
    },
  });

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

  const fg = useMemo(() => autoContrast(design.background), [design.background]);
  const analytics = useMemo(() => {
    const passes = analyticsQuery.data?.passes ?? [];
    const transactions = analyticsQuery.data?.transactions ?? [];
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        d: new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en", { weekday: "short" }).format(
          date,
        ),
        installs: passes.filter((item) => item.created_at.slice(0, 10) === key).length,
        redemptions: transactions.filter(
          (item) => item.action === "redeem" && item.created_at.slice(0, 10) === key,
        ).length,
      };
    });
    const hours = [0, 4, 8, 12, 16, 20].map((hour) => ({
      h: `${String(hour).padStart(2, "0")}:00`,
      v: transactions.filter((item) => {
        const transactionHour = new Date(item.created_at).getHours();
        return transactionHour >= hour && transactionHour < hour + 4;
      }).length,
    }));
    return {
      days,
      hours,
      installs: passes.length,
      redemptions: transactions.filter((item) => item.action === "redeem").length,
      retention: passes.length
        ? Math.round((passes.filter((item) => item.last_visit_at).length / passes.length) * 100)
        : 0,
    };
  }, [analyticsQuery.data, locale]);

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
    if (!business) return;
    setSaving(true);
    const { error } = await supabase.from("businesses").update(values).eq("id", business.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await businessesQuery.refetch();
    toast.success(successMessage);
  }

  const joinUrl = useMemo(() => {
    if (!business) return "";
    if (typeof window !== "undefined") {
      return `${window.location.origin}/join/${business.slug}`;
    }
    return `http://localhost:8080/join/${business.slug}`;
  }, [business]);

  const qrImageUrl = useMemo(() => {
    if (!joinUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`;
  }, [joinUrl]);

  async function downloadQR() {
    if (!qrImageUrl || !business) return;
    try {
      const response = await fetch(qrImageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${business.slug}-join-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success(ar ? "تم تحميل رمز QR بنجاح!" : "QR code downloaded successfully!");
    } catch {
      toast.error(ar ? "تعذر تحميل رمز QR" : "Failed to download QR code");
    }
  }

  function copyJoinUrl() {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl);
    toast.success(ar ? "تم نسخ رابط الانضمام إلى الحافظة!" : "Join link copied to clipboard!");
  }

  async function saveDesign() {
    if (!business) return;
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
      },
      ar ? "تم حفظ تصميم البطاقة والانتقال إلى لوحة التحكم الرئيسية" : "Pass design saved! Switched to main overview.",
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
      const res = await sendWalletPush({
        data: {
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
    } catch {
      toast.error(ar ? "خطأ في الشبكة" : "Network error");
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

  if (businessesQuery.isError || !business) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="panel max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto size-9 text-destructive" />
          <h1 className="mt-4 text-xl font-bold">
            {ar ? "لا توجد منشأة مرتبطة" : "No business assigned"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {businessesQuery.isError
              ? businessesQuery.error.message
              : ar
                ? "اطلب من المشرف ربط حسابك بمنشأة."
                : "Ask an administrator to assign your account to a business."}
          </p>
          <Button className="mt-5" variant="outline" onClick={() => supabase.auth.signOut()}>
            {ar ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </div>
      </div>
    );
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetPassword(false)}
              >
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
              {ar ? "الرئيسية (مركز التحكم)" : "Main Overview"}
            </TabsTrigger>
            <TabsTrigger value="designer">
              <Edit3 className="me-1.5 size-4" />
              {t("passDesigner")}
            </TabsTrigger>
            <TabsTrigger value="pin">{t("pinManager")}</TabsTrigger>
            <TabsTrigger value="geo">{t("geofence")}</TabsTrigger>
            <TabsTrigger value="push">{t("campaigns")}</TabsTrigger>
            <TabsTrigger value="analytics">{t("analytics")}</TabsTrigger>
          </TabsList>

          {/* Main Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Header Summary & Quick Actions */}
            <div className="panel grid gap-6 p-6 lg:grid-cols-3 items-center">
              <div className="space-y-2 lg:col-span-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {ar ? PASS_TEMPLATES[program].name.ar : PASS_TEMPLATES[program].name.en}
                  </Badge>
                  <Badge variant="default">
                    {ar ? "الحملة نشطة" : "Campaign Active"}
                  </Badge>
                </div>
                <h2 className="text-2xl font-bold">
                  {ar ? design.businessName || "اسم المنشأة" : design.businessNameEn || "Business Name"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? design.headline || "عروض الولاء للمشتركين"
                    : design.headlineEn || "Loyalty offer for customers"}
                </p>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Button variant="default" onClick={() => setActiveTab("designer")}>
                  <Edit3 className="me-2 size-4" />
                  {ar ? "تعديل تصميم البطاقة" : "Edit Pass Design"}
                </Button>
                <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
                  <Trash2 className="me-2 size-4" />
                  {ar ? "حذف / إعادة ضبط الحملة" : "Delete / Reset Campaign"}
                </Button>
              </div>
            </div>

            {/* Sharing & QR Code Section */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Public Join Link Card */}
              <div className="panel flex flex-col justify-between p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary font-semibold">
                    <ExternalLink className="size-5" />
                    <h3>{ar ? "رابط انضمام العملاء" : "Public Join Link"}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ar
                      ? "شارك هذا الرابط مع عملائك ليتمكنوا من الانضمام لبرنامج الولاء وحفظ بطاقتك مباشرة في محفظة Apple أو Google."
                      : "Share this link with your customers to let them join your loyalty program and save your pass directly into Apple or Google Wallet."}
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-input bg-muted/50 p-2 text-xs font-mono">
                    <span className="truncate flex-1 dir-ltr">{joinUrl}</span>
                    <Button size="sm" variant="secondary" onClick={copyJoinUrl}>
                      <Copy className="size-3.5 me-1" />
                      {ar ? "نسخ" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {ar ? "معاينة صفحة الانضمام للعملاء" : "Preview customer join page"}{" "}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>

              {/* Downloadable QR Code Card */}
              <div className="panel flex flex-col items-center p-6 text-center space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <QrCode className="size-5" />
                  <h3>{ar ? "رمز QR المباشر للانضمام" : "Printable Join QR Code"}</h3>
                </div>
                <div className="relative rounded-xl border bg-white p-3 shadow-xs">
                  <img
                    src={qrImageUrl}
                    alt="Public Join QR Code"
                    className="size-44 object-contain"
                  />
                </div>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {ar
                    ? "اطبع رمز QR واعرضه على الطاولات أو الكاونتر ليقوم العملاء بمسحه فوراً."
                    : "Print this QR code on table tents or at the counter for instant customer sign-ups."}
                </p>
                <Button variant="outline" size="sm" onClick={downloadQR}>
                  <Download className="me-2 size-4" />
                  {ar ? "تحميل رمز QR (صورة PNG)" : "Download QR Code (PNG)"}
                </Button>
              </div>
            </div>

            {/* Current Pass Live Preview */}
            <div className="panel p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{ar ? "معاينة البطاقة الحالية" : "Current Pass Preview"}</h3>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("designer")}>
                  <Edit3 className="me-1.5 size-3.5" />
                  {ar ? "تعديل" : "Edit"}
                </Button>
              </div>
              <div className="grid place-items-center py-4">
                <PassPreview design={design} locale={locale} />
              </div>
            </div>
          </TabsContent>

          {/* Pass designer */}
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
                      ? "تبدأ كقسيمة خصم ثم تتحول تلقائياً إلى بطاقة ولاء دائمة بعد أول مسح."
                      : "Starts as a discount voucher and morphs into a permanent loyalty card on first scan."}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nameAr">{ar ? "اسم المنشأة (عربي)" : "Business name (AR)"}</Label>
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
                  <Label htmlFor="headEn">{ar ? "نص البطاقة (إنجليزي)" : "Pass text (EN)"}</Label>
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
              onClick={() =>
                updateBusiness(
                  { cashier_pin: pin },
                  ar ? "تم تحديث رمز الكاشير" : "Cashier PIN updated",
                )
              }
            >
              {t("save")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {ar
                ? "يستخدم موظفو الفرع هذا الرمز لفتح شاشة الماسح /scan"
                : "Store staff use this PIN to unlock the /scan terminal"}
            </p>
          </TabsContent>

          {/* Geofence */}
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
                <Label htmlFor="gEn">{ar ? "نص التنبيه (إنجليزي)" : "Proximity text (EN)"}</Label>
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
              <h2 className="text-lg font-semibold">{ar ? "حملة فورية" : "Instant broadcast"}</h2>
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

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="panel p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {ar ? "التثبيت مقابل الاستبدال" : "Installs vs redemptions"}
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analytics.days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="installs"
                    stroke="var(--primary)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="redemptions"
                    stroke="var(--accent)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="panel p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {ar ? "ساعات الذروة" : "Peak visit hours"}
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.hours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="h" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="v" fill="var(--accent)" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
              {[
                [t("installs"), String(analytics.installs)],
                [t("redemptions"), String(analytics.redemptions)],
                [t("retention"), `${analytics.retention}%`],
              ].map(([label, value]) => (
                <div key={label} className="panel p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-3xl font-extrabold">{value}</p>
                </div>
              ))}
            </div>
          </TabsContent>
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
                    {ar ? "هل أنت تأكد من إعادة ضبط الحملة؟" : "Are you sure you want to reset this campaign?"}
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
