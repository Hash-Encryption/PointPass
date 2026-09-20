import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowUpRight,
  Building2,
  Coins,
  Gift,
  QrCode,
  Sparkles,
  Stamp,
  Store,
  Users,
  Loader2,
} from "lucide-react";

interface OwnerOverviewProps {
  business: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string;
    program_type: "stamp" | "points" | "coupon_morph";
    target_stamps: number | null;
    sar_per_point: number | null;
    points_per_reward: number;
  };
  ar: boolean;
  onNavigateTab: (tab: string) => void;
}

export function OwnerOverview({ business, ar, onNavigateTab }: OwnerOverviewProps) {
  // Summary counts
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

  // Re-use business_analytics for activity & operations metrics
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

  function formatDate(iso: string) {
    try {
      return format(new Date(iso), "dd MMM, HH:mm", { locale: ar ? arSA : enUS });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="flex flex-col gap-2 rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">
            {ar ? `أهلاً بك، ${business.name_ar}` : `Welcome, ${business.name_en}`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {ar
              ? "نظرة عامة على أداء برنامج الولاء والعملاء والنشاط التشغيلي اليوم."
              : "Live pulse of your loyalty program, customers, and operational activity today."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onNavigateTab("customers")}>
            <Users className="size-4 me-1.5" />
            {ar ? "العملاء" : "Customers"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigateTab("qr")}>
            <QrCode className="size-4 me-1.5" />
            {ar ? "رمز QR" : "Join QR"}
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          onClick={() => onNavigateTab("customers")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "إجمالي العملاء" : "Total Customers"}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {summaryQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              (summary?.total_customers ?? 0)
            )}
          </div>
          <div className="mt-1 text-[11px] text-primary font-medium">
            +{summary?.new_customers_30d ?? 0} {ar ? "خلال ٣٠ يوم" : "last 30 days"}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab("analytics")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "عمليات الولاء" : "Loyalty Actions"}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {analyticsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              (analytics?.summary.totalTransactions ?? 0)
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {analytics?.summary.earns ?? 0} {ar ? "اكتساب" : "earns"}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab("analytics")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "المكافآت المستبدلة" : "Redemptions"}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {analyticsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              (analytics?.summary.redemptions ?? 0)
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {analytics?.summary.redemptionRate
              ? `${Math.round(analytics.summary.redemptionRate * 100)}%`
              : "0%"}{" "}
            {ar ? "معدل الاستبدال" : "rate"}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab("team")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "الفروع والفريق" : "Locations & Team"}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {analyticsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              `${analytics?.summary.activeBranches ?? 0} / ${analytics?.summary.activeStaff ?? 0}`
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {ar ? "فرع نشط / كاشير" : "active branch / staff"}
          </div>
        </div>
      </div>

      {/* Program Summary & Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Program Status */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {ar ? "برنامج الولاء" : "Loyalty Program"}
            </span>
            <Badge variant="outline" className="capitalize text-xs">
              {business.program_type}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm font-semibold">
              {business.program_type === "stamp"
                ? ar
                  ? `بطاقة أختام (${business.target_stamps ?? 9} أختام للمكافأة)`
                  : `Stamp Card (${business.target_stamps ?? 9} stamps)`
                : business.program_type === "points"
                  ? ar
                    ? `نقاط (١ نقطة لكل ${business.sar_per_point ?? 10} ر.س)`
                    : `Points (1 pt per ${business.sar_per_point ?? 10} SAR)`
                  : ar
                    ? "كوبون ترحيبي يتحول لبطاقة أختام"
                    : "Coupon Morph (Intro to stamps)"}
            </div>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "جاهز ومفعل للعملاء عبر Apple Wallet و Google Wallet."
                : "Active and issued to customer wallets."}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateTab("designer")}
            className="w-full text-xs"
          >
            {ar ? "تعديل تصميم ومكافأة البطاقة" : "Edit Pass Design & Rewards"}
          </Button>
        </div>

        {/* Operational Shortcuts */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2 sm:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {ar ? "إجراءات سريعة" : "Quick Actions"}
          </span>

          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("customers")}
              className="justify-start text-xs"
            >
              <Users className="size-4 me-2 text-primary" />
              {ar ? "استعراض العملاء" : "View Customers"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("qr")}
              className="justify-start text-xs"
            >
              <QrCode className="size-4 me-2 text-primary" />
              {ar ? "تحميل رمز QR" : "Download QR"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("team")}
              className="justify-start text-xs"
            >
              <Building2 className="size-4 me-2 text-primary" />
              {ar ? "الفروع والكاشيرات" : "Branches & Staff"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("analytics")}
              className="justify-start text-xs"
            >
              <Activity className="size-4 me-2 text-primary" />
              {ar ? "تقارير العمليات" : "Analytics"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("push")}
              className="justify-start text-xs"
            >
              <Sparkles className="size-4 me-2 text-primary" />
              {ar ? "إرسال إشعار محفظة" : "Push Campaign"}
            </Button>

            <Button asChild variant="outline" size="sm" className="justify-start text-xs">
              <a href="/scan" target="_blank" rel="noopener noreferrer">
                <Store className="size-4 me-2 text-primary" />
                {ar ? "شاشة الكاشير" : "Cashier POS"}
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {ar ? "أحدث عمليات الولاء المسجلة" : "Recent Loyalty Activity"}
          </span>
          <Button
            variant="link"
            size="sm"
            onClick={() => onNavigateTab("analytics")}
            className="text-xs p-0 h-auto"
          >
            {ar ? "عرض الكل في التحليلات" : "View all in Analytics"}
          </Button>
        </div>

        {analyticsQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (analytics?.recent ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {ar ? "لم يتم تسجيل عمليات بعد." : "No transactions recorded yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {analytics!.recent.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                    {tx.action === "redeem" ? (
                      <Gift className="size-3.5" />
                    ) : (
                      <Stamp className="size-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">
                      {tx.action === "redeem"
                        ? ar
                          ? "استبدال مكافأة"
                          : "Reward Redeemed"
                        : tx.action === "points"
                          ? ar
                            ? `+${tx.pointsDelta ?? 0} نقطة`
                            : `+${tx.pointsDelta ?? 0} pts`
                          : ar
                            ? `+${tx.stampDelta ?? 1} ختم`
                            : `+${tx.stampDelta ?? 1} stamp`}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {ar ? tx.branchNameAr : tx.branchNameEn} ·{" "}
                      {ar ? tx.staffNameAr : tx.staffNameEn}
                    </div>
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground">
                  {formatDate(tx.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
