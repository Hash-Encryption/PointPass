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
  Gift,
  MapPin,
  ShieldCheck,
  Stamp,
  Store,
  Users,
  Loader2,
} from "lucide-react";

interface ManagerOverviewProps {
  businessId: string;
  ar: boolean;
  selectedBranchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  assignedBranches: { id: string; name_ar: string; name_en: string }[];
  onNavigateTab: (tab: string) => void;
}

export function ManagerOverview({
  businessId,
  ar,
  selectedBranchId,
  onBranchChange,
  assignedBranches,
  onNavigateTab,
}: ManagerOverviewProps) {
  const isSingleBranch = assignedBranches.length === 1;
  const currentBranch =
    assignedBranches.find((b) => b.id === selectedBranchId) ?? assignedBranches[0];

  // Scoped Customer metrics via operations_dashboard_summary
  const summaryQuery = useQuery({
    queryKey: ["manager-overview-summary", businessId, selectedBranchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_dashboard_summary", {
          _business_id: businessId,
          _branch_id: selectedBranchId || null,
        })
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

  // Scoped Analytics via business_analytics (enforces manager branch filtering server-side)
  const analyticsQuery = useQuery({
    queryKey: ["manager-overview-analytics", businessId, selectedBranchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("business_analytics", {
          _business_id: businessId,
          _branch_id: selectedBranchId || null,
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
      {/* Location Context Banner */}
      <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase">
                {ar ? "فرعك المخصص" : "Assigned Location"}
              </span>
              <Badge variant="outline" className="text-[11px] gap-1">
                <ShieldCheck className="size-3 text-primary" />
                {ar ? "صلاحيات مدير" : "Manager Scope"}
              </Badge>
            </div>
            <h2 className="text-lg font-bold text-foreground mt-0.5">
              {isSingleBranch
                ? ar
                  ? currentBranch?.name_ar
                  : currentBranch?.name_en
                : selectedBranchId
                  ? ar
                    ? currentBranch?.name_ar
                    : currentBranch?.name_en
                  : ar
                    ? "جميع فروعي المصرّحة"
                    : "All My Assigned Branches"}
            </h2>
          </div>
        </div>

        {/* Multi-location switcher */}
        {!isSingleBranch ? (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <select
              value={selectedBranchId ?? ""}
              onChange={(e) => onBranchChange(e.target.value ? e.target.value : null)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-medium"
            >
              <option value="">{ar ? "فروعي (الكل)" : "My Locations (All)"}</option>
              {assignedBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {ar ? b.name_ar : b.name_en}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* Scoped KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          onClick={() => onNavigateTab("customers")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "عملاء الفرع" : "Location Customers"}</span>
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
            +{summary?.new_customers_30d ?? 0} {ar ? "جدد بالفرع (٣٠ يوم)" : "new at branch (30d)"}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab("analytics")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "عمليات الفرع" : "Location Actions"}</span>
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
            {analytics?.summary.earns ?? 0} {ar ? "عملية إضافة" : "earns"}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab("analytics")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "المكافآت الممنوحة" : "Redemptions"}</span>
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
            {ar ? "معدل استبدال" : "redemption rate"}
          </div>
        </div>

        <div
          onClick={() => onNavigateTab("team")}
          className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 cursor-pointer"
        >
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>{ar ? "كاشيرات الفرع" : "Active Staff"}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">
            {analyticsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              (analytics?.summary.activeStaff ?? 0)
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {ar ? "أعضاء فريق مسجلين" : "staff assigned"}
          </div>
        </div>
      </div>

      {/* Operational Shortcuts */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {ar ? "العمليات التشغيلية" : "Operational Actions"}
        </span>

        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("customers")}
            className="justify-start text-xs"
          >
            <Users className="size-4 me-2 text-primary" />
            {ar ? "عملاء الفرع" : "Location Customers"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("analytics")}
            className="justify-start text-xs"
          >
            <Activity className="size-4 me-2 text-primary" />
            {ar ? "تقارير الفرع" : "Branch Analytics"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab("team")}
            className="justify-start text-xs"
          >
            <Building2 className="size-4 me-2 text-primary" />
            {ar ? "فريق وأجهزة الفرع" : "Staff & Devices"}
          </Button>

          <Button asChild variant="outline" size="sm" className="justify-start text-xs">
            <a href="/scan" target="_blank" rel="noopener noreferrer">
              <Store className="size-4 me-2 text-primary" />
              {ar ? "فتح شاشة الكاشير" : "Open Cashier POS"}
            </a>
          </Button>
        </div>
      </div>

      {/* Recent Activity at Branch */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {ar ? "أحدث عمليات الفرع" : "Recent Activity at Location"}
          </span>
          <Button
            variant="link"
            size="sm"
            onClick={() => onNavigateTab("analytics")}
            className="text-xs p-0 h-auto"
          >
            {ar ? "عرض تقرير الفرع" : "View branch report"}
          </Button>
        </div>

        {analyticsQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (analytics?.recent ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {ar
              ? "لم يتم تسجيل عمليات في هذا الفرع بعد."
              : "No transactions recorded at this location yet."}
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
