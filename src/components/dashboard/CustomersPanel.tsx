import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomerDetailDialog } from "@/components/dashboard/CustomerDetailDialog";
import {
  Users,
  Search,
  UserCheck,
  UserX,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Calendar,
  Building2,
  Filter,
} from "lucide-react";

interface CustomersPanelProps {
  businessId: string;
  ar: boolean;
  isOwnerUser: boolean;
  lockedBranchId?: string | null | undefined;
  assignedBranches?: { id: string; name_ar: string; name_en: string }[];
}

type CustomerRow = {
  customer_id: string;
  phone: string | null;
  is_anonymous: boolean;
  program_type: "stamp" | "points" | "coupon_morph";
  current_stamps: number | null;
  current_points: number | null;
  is_morphed: boolean | null;
  target_stamps: number;
  points_per_reward: number;
  join_date: string | null;
  first_location_activity_at: string | null;
  last_activity_at: string | null;
  transaction_count: number;
  redeem_count: number;
  location_stamps_issued: number;
  location_points_issued: number;
  wallet_attached: boolean | null;
};

export function CustomersPanel({
  businessId,
  ar,
  isOwnerUser,
  lockedBranchId,
  assignedBranches = [],
}: CustomersPanelProps) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(lockedBranchId ?? null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Summary Metrics Query
  const summaryQuery = useQuery({
    queryKey: ["customers-summary", businessId, selectedBranchId],
    enabled: Boolean(businessId),
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

  // Customer List Query
  const customersQuery = useQuery({
    queryKey: ["customers-list", businessId, selectedBranchId, search],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("operations_customers_list", {
        _business_id: businessId,
        _branch_id: selectedBranchId || null,
        _search: search.trim() || null,
        _limit: 100,
        _offset: 0,
      });
      if (error) throw error;
      return (data as CustomerRow[]) ?? [];
    },
  });

  const customers = customersQuery.data ?? [];
  const summary = summaryQuery.data;

  function formatDate(iso: string | null | undefined) {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "dd MMM yyyy", {
        locale: ar ? arSA : enUS,
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="size-6 text-primary" />
            {t("customers")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOwnerUser
              ? ar
                ? "إدارة عملاء المنشأة وسجل الولاء والعمليات"
                : "Manage customer loyalty balances and activity history"
              : ar
                ? "قائمة العملاء الذين تفاعلوا مع الفروع المصرحة لك"
                : "Customers with activity at your authorized branch(es)"}
          </p>
        </div>

        {/* Branch filter for multi-branch Manager or Owner */}
        {!lockedBranchId && assignedBranches.length > 1 ? (
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <select
              value={selectedBranchId ?? ""}
              onChange={(e) => setSelectedBranchId(e.target.value ? e.target.value : null)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
            >
              <option value="">
                {isOwnerUser ? (ar ? "كل الفروع" : "All Branches") : ar ? "فروعي" : "My Locations"}
              </option>
              {assignedBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {ar ? b.name_ar : b.name_en}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{t("totalCustomers")}</div>
          <div className="mt-1 text-2xl font-black text-foreground">
            {summaryQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              (summary?.total_customers ?? 0)
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{t("newCustomers")}</div>
          <div className="mt-1 text-2xl font-black text-primary">
            {summaryQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              `+${summary?.new_customers_30d ?? 0}`
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <UserCheck className="size-3.5 text-emerald-500" />
            {t("identified")}
          </div>
          <div className="mt-1 text-2xl font-black text-foreground">
            {summaryQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              (summary?.identified_customers ?? 0)
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <UserX className="size-3.5 text-muted-foreground" />
            {t("guest")}
          </div>
          <div className="mt-1 text-2xl font-black text-foreground">
            {summaryQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              (summary?.anonymous_customers ?? 0)
            )}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute start-3 top-3 size-4 text-muted-foreground" />
        <Input
          placeholder={t("searchCustomer")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9 h-10 text-sm bg-background border-border"
        />
      </div>

      {/* Customer List (Mobile Cards + Desktop Rows) */}
      <div className="space-y-3">
        {customersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Users className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">{t("noCustomers")}</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-3">
            {customers.map((c) => (
              <div
                key={c.customer_id}
                onClick={() => setSelectedCustomerId(c.customer_id)}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-xs cursor-pointer sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Left info: Phone / Guest + Program */}
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary font-bold">
                    {c.is_anonymous ? (
                      <UserX className="size-5" />
                    ) : (
                      <UserCheck className="size-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold text-sm text-foreground"
                        dir={c.phone ? "ltr" : undefined}
                      >
                        {c.is_anonymous ? (
                          <Badge variant="secondary" className="text-xs">
                            {t("guest")}
                          </Badge>
                        ) : (
                          c.phone
                        )}
                      </span>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {c.program_type}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                      {isOwnerUser && c.join_date ? (
                        <span>
                          {t("joinDate")}: {formatDate(c.join_date)}
                        </span>
                      ) : null}

                      <span>
                        {t("lastActivity")}:{" "}
                        {formatDate(c.last_activity_at || c.first_location_activity_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right info: Progress / Loyalty State */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2 sm:border-0 sm:pt-0 sm:justify-end sm:gap-6">
                  {isOwnerUser ? (
                    <div className="text-start sm:text-end">
                      <div className="text-xs text-muted-foreground">{t("loyaltyBalance")}</div>
                      <div className="text-sm font-bold text-primary">
                        {c.program_type === "points"
                          ? `${c.current_points ?? 0} / ${c.points_per_reward} pts`
                          : `${c.current_stamps ?? 0} / ${c.target_stamps} stamps`}
                      </div>
                    </div>
                  ) : (
                    <div className="text-start sm:text-end">
                      <div className="text-xs text-muted-foreground">{t("transactions")}</div>
                      <div className="text-sm font-bold text-foreground">
                        {c.transaction_count} {ar ? "عملية بالفرع" : "actions"}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground group-hover:text-primary"
                  >
                    {ar ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog
        businessId={businessId}
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
        ar={ar}
        isOwnerUser={isOwnerUser}
      />
    </div>
  );
}
