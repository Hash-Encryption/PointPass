import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { LocalQrCode, downloadQrCanvas } from "@/components/LocalQrCode";
import { PassPreview, type PassDesign } from "@/components/PassPreview";
import {
  Clock,
  Copy,
  Download,
  ExternalLink,
  Gift,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  Stamp,
  Users,
  Zap,
} from "lucide-react";
import {
  WALLET_COLOR_PRESETS,
  type StripStyle,
  type WalletColorPreset,
  type WalletTierMode,
} from "@/lib/wallet-tier";

export interface OwnerOverviewProps {
  business: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string;
    brand_color?: string;
    accent_color?: string;
    logo_url?: string | null;
    offer_ar?: string | null;
    offer_en?: string | null;
    program_type: "stamp" | "points" | "coupon_morph";
    target_stamps: number | null;
    sar_per_point: number | null;
    points_per_reward: number;
    template_id?: string | null;
  };
  ar: boolean;
  onNavigateTab: (tab: string) => void;
  design?: PassDesign;
  tierMode?: WalletTierMode;
  colorPreset?: WalletColorPreset;
  stripStyle?: StripStyle;
  stampIcon?: string;
}

export function OwnerOverview({
  business,
  ar,
  onNavigateTab,
  design,
  tierMode = "free",
  colorPreset = "green",
  stripStyle = "pizzatown",
  stampIcon = "⭐",
}: OwnerOverviewProps) {
  const [canvasInstance, setCanvasInstance] = useState<HTMLCanvasElement | null>(null);

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${business.slug}`
      : `https://pointpass.pages.dev/join/${business.slug}`;

  // 1. Summary counts: Total enrolled customers
  const summaryQuery = useQuery({
    queryKey: ["owner-overview-summary", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_dashboard_summary", { _business_id: business.id })
        .single();
      if (error) throw error;
      return data as {
        total_customers: number;
        new_customers_30d: number;
        identified_customers: number;
        anonymous_customers: number;
      };
    },
  });

  // 2. Activity & operations metrics: Total loyalty engagement & redemptions
  const analyticsQuery = useQuery({
    queryKey: ["owner-overview-analytics", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("business_analytics", {
          _business_id: business.id,
        })
        .single();
      if (error) throw error;
      return data as {
        summary: {
          totalTransactions: number;
          earns: number;
          redemptions: number;
          redemptionRate: number;
          activeBranches: number;
          activeStaff: number;
        };
        recent: Array<{
          id: string;
          createdAt: string;
          action: string;
          branchNameAr: string;
          branchNameEn: string;
          staffNameAr: string;
          staffNameEn: string;
          amountSar: number | null;
          stampDelta: number | null;
          pointsDelta: number | null;
        }>;
      };
    },
  });

  const summary = summaryQuery.data;
  const analytics = analyticsQuery.data;

  function copyJoinLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(joinUrl);
      toast.success(ar ? "تم نسخ رابط الانضمام!" : "Join link copied to clipboard!");
    }
  }

  function handleDownloadQr() {
    downloadQrCanvas(canvasInstance, `${business.slug}-counter-qr.png`);
    toast.success(ar ? "تم تحميل رمز QR لستاند الكاشير!" : "Counter QR code downloaded!");
  }

  function formatDate(iso: string) {
    try {
      return format(new Date(iso), "dd MMM, HH:mm", { locale: ar ? arSA : enUS });
    } catch {
      return iso;
    }
  }

  // Construct active pass design for live preview
  const livePassDesign: PassDesign = useMemo(() => {
    if (design) {
      return {
        ...design,
        headline: ar ? design.headline : design.headlineEn,
        background: tierMode === "free" ? WALLET_COLOR_PRESETS[colorPreset].hex : design.background,
        accent: tierMode === "free" ? WALLET_COLOR_PRESETS[colorPreset].accent : design.accent,
        stampIcon,
        stripStyle,
        tierMode,
        colorPreset,
        progress: design.progress || 1,
      };
    }
    return {
      businessName: business.name_ar,
      businessNameEn: business.name_en,
      logoUrl: business.logo_url ?? null,
      background:
        tierMode === "free"
          ? WALLET_COLOR_PRESETS[colorPreset].hex
          : business.brand_color || "#121214",
      accent:
        tierMode === "free"
          ? WALLET_COLOR_PRESETS[colorPreset].accent
          : business.accent_color || "#10B981",
      headline: (ar ? business.offer_ar : business.offer_en) || "مكافأة خاصة 🎁",
      headlineEn: business.offer_en || "Special Reward 🎁",
      subline: ar ? "شكراً لولائك" : "Thanks for your loyalty",
      sublineEn: "Thanks for your loyalty",
      program: business.program_type,
      targetStamps: business.target_stamps ?? 8,
      sarPerPoint: business.sar_per_point ?? 10,
      pointsPerReward: business.points_per_reward ?? 100,
      progress: 1,
      stampIcon,
      stripStyle,
      tierMode,
      colorPreset,
    };
  }, [design, business, ar, tierMode, colorPreset, stripStyle, stampIcon]);

  const redemptionRatePercent = analytics?.summary.redemptionRate
    ? Math.round(analytics.summary.redemptionRate * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 4 HIGH-IMPACT COMMAND CENTER KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Active Wallet Passes */}
        <div
          onClick={() => onNavigateTab("customers")}
          className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-4 transition-all hover:border-emerald-500/50 hover:bg-zinc-900/90 cursor-pointer shadow-lg"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>{ar ? "بطاقات المحفظة النشطة" : "Active Wallet Passes"}</span>
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight">
            {summaryQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-zinc-500" />
            ) : (
              (summary?.total_customers ?? 0).toLocaleString()
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              +{summary?.new_customers_30d ?? 0} {ar ? "عميل جديد هذا الشهر" : "new this month"}
            </span>
          </div>
        </div>

        {/* KPI 2: Stamps Issued / Total Engagement */}
        <div
          onClick={() => onNavigateTab("analytics")}
          className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-4 transition-all hover:border-amber-500/50 hover:bg-zinc-900/90 cursor-pointer shadow-lg"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>{ar ? "الأختام الممنوحة" : "Stamps Issued"}</span>
            <div className="size-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
              <Stamp className="size-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight">
            {analyticsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-zinc-500" />
            ) : (
              (analytics?.summary.earns ?? 0).toLocaleString()
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-400 font-mono">
            {analytics?.summary.totalTransactions ?? 0} {ar ? "إجمالي التفاعلات" : "total actions"}
          </div>
        </div>

        {/* KPI 3: Rewards Unlocked / Redeemed */}
        <div
          onClick={() => onNavigateTab("analytics")}
          className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-4 transition-all hover:border-purple-500/50 hover:bg-zinc-900/90 cursor-pointer shadow-lg"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>{ar ? "المكافآت المستبدلة" : "Rewards Redeemed"}</span>
            <div className="size-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
              <Gift className="size-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight">
            {analyticsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-zinc-500" />
            ) : (
              (analytics?.summary.redemptions ?? 0).toLocaleString()
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-purple-400 font-medium">
            {redemptionRatePercent}% {ar ? "معدل تحويل الزيارات" : "redemption rate"}
          </div>
        </div>

        {/* KPI 4: Program Status & Live Join URL */}
        <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>{ar ? "حالة البرنامج" : "Program Status"}</span>
            {tierMode === "pro" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="size-3" />
                Pro
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="size-3" />
                Free
              </span>
            )}
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-base font-bold text-white truncate font-mono">
                /{business.slug}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={copyJoinLink}
              className="h-8 flex-1 text-xs border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200"
            >
              <Copy className="size-3 me-1.5" />
              {ar ? "نسخ" : "Copy"}
            </Button>
            <Button
              size="sm"
              asChild
              className="h-8 flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              <a href={joinUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3 me-1.5" />
                {ar ? "تجربة" : "Test"}
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* SPLIT HERO GRID: Left (2 cols) vs Right Live Pass Preview (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: Store Counter Stand QR & Live Activity Feed */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Store Counter QR Stand & Quick Share Card */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <QrCode className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {ar ? "رمز ستاند الكاشير ورابط الانضمام" : "Counter Stand QR & Join Link"}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {ar
                      ? "اطبع الرمز عند نقطة البيع أو شارك الرابط ليحفظ العملاء البطاقة فوراً."
                      : "Place at checkout or share the link so customers can instantly add your card."}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start sm:self-auto">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {ar ? "نشط وجاهز" : "Live & Active"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              {/* QR Preview Box */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                <div className="rounded-lg p-2.5 bg-white shadow-md">
                  <LocalQrCode
                    text={joinUrl}
                    size={160}
                    onReady={(canvas) => setCanvasInstance(canvas)}
                  />
                </div>
                <span className="mt-2.5 text-[11px] font-mono text-zinc-400">
                  pointpass.pages.dev
                </span>
              </div>

              {/* Action Buttons & URL */}
              <div className="sm:col-span-2 space-y-3.5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-xs text-zinc-300" dir="ltr">
                    {joinUrl}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyJoinLink}
                    className="shrink-0 h-8 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                  >
                    <Copy className="size-3.5 me-1.5" />
                    {ar ? "نسخ" : "Copy"}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <Button
                    onClick={handleDownloadQr}
                    className="h-10 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
                  >
                    <Download className="size-4 me-2" />
                    {ar ? "تحميل رمز QR (PNG)" : "Download QR (PNG)"}
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="h-10 text-xs border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-200"
                  >
                    <a href={joinUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4 me-2" />
                      {ar ? "فتح صفحة العميل" : "Open Join Page"}
                    </a>
                  </Button>
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {ar
                    ? "✨ العميل لا يحتاج لتنزيل أي تطبيق؛ يمسح الكاميرا وتُضاف البطاقة بضغطة واحدة إلى Apple Wallet."
                    : "✨ Zero app downloads required for customers. Scans directly into native Apple Wallet in 3 seconds."}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Recent Customer Activity Feed */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {ar ? "أحدث عمليات ونشاط العملاء" : "Recent Customer Activity"}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigateTab("analytics")}
                className="text-xs text-zinc-400 hover:text-white p-0 h-auto"
              >
                {ar ? "عرض الكل في التحليلات ←" : "View all in Analytics →"}
              </Button>
            </div>

            {analyticsQuery.isLoading ? (
              <div className="flex h-28 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-zinc-500" />
              </div>
            ) : (analytics?.recent ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center space-y-2">
                <div className="size-10 rounded-full bg-zinc-800/60 border border-zinc-700 text-zinc-400 flex items-center justify-center mx-auto">
                  <Stamp className="size-5" />
                </div>
                <p className="text-xs text-zinc-400 font-medium">
                  {ar
                    ? "لم يتم تسجيل عمليات بعد. افتح شاشة الكاشير /scan وامنح أول ختم!"
                    : "No transactions recorded yet. Open /scan and award your first stamp!"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="mt-2 text-xs border-zinc-700 bg-zinc-800/80 text-zinc-200"
                >
                  <a href="/scan" target="_blank" rel="noopener noreferrer">
                    {ar ? "فتح شاشة الكاشير" : "Open Cashier Scanner"}
                  </a>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {analytics!.recent.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-3 text-xs transition-colors hover:bg-zinc-800/30 px-2 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`size-8 rounded-xl flex items-center justify-center shrink-0 ${
                          tx.action === "redeem"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {tx.action === "redeem" ? (
                          <Gift className="size-4" />
                        ) : (
                          <Stamp className="size-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {tx.action === "redeem"
                            ? ar
                              ? "استبدال مكافأة مكتملة 🎁"
                              : "Reward Redeemed 🎁"
                            : tx.action === "points"
                              ? ar
                                ? `+${tx.pointsDelta ?? 0} نقطة`
                                : `+${tx.pointsDelta ?? 0} pts`
                              : ar
                                ? `+${tx.stampDelta ?? 1} ختم ولاء`
                                : `+${tx.stampDelta ?? 1} loyalty stamp`}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {ar ? tx.branchNameAr : tx.branchNameEn} ·{" "}
                          {ar ? tx.staffNameAr : tx.staffNameEn}
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] text-zinc-500 font-mono">
                      {formatDate(tx.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Live Active Pass Preview (Sticky Card) */}
        <div className="lg:col-span-1 sticky top-20 space-y-4">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 backdrop-blur-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {ar ? "البطاقة النشطة حالياً" : "Live Active Pass"}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                {tierMode === "pro" ? "Pro Retina" : "Free 2-Col"}
              </span>
            </div>

            {/* The Live Pass Preview */}
            <div className="pt-1">
              <PassPreview design={livePassDesign} locale={ar ? "ar" : "en"} showToggle={false} />
            </div>

            {/* 1-Click Action to Jump to Pass Studio */}
            <Button
              onClick={() => onNavigateTab("designer")}
              className="w-full h-11 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700/80 shadow-md flex items-center justify-center gap-2"
            >
              <span>{ar ? "تعديل في استوديو البطاقة ←" : "Edit in Card Studio →"}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
