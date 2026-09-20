import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  Coins,
  Gift,
  Stamp,
  Smartphone,
  Calendar,
  UserCheck,
  ShieldCheck,
} from "lucide-react";

interface CustomerDetailDialogProps {
  businessId: string;
  customerId: string | null;
  onClose: () => void;
  ar: boolean;
  isOwnerUser: boolean;
}

type CustomerProfile = {
  customer_id: string;
  phone: string | null;
  is_anonymous: boolean;
  program_type: "stamp" | "points" | "coupon_morph";
  current_stamps?: number | null;
  current_points?: number | null;
  is_morphed?: boolean | null;
  target_stamps?: number;
  points_per_reward?: number;
  join_date?: string | null;
  last_activity_at?: string | null;
  first_location_activity_at?: string | null;
  last_location_activity_at?: string | null;
  transaction_count?: number;
  redeem_count?: number;
  location_transactions?: number;
  location_redeems?: number;
  location_stamps_issued?: number;
  location_points_issued?: number;
  wallet_attached?: boolean | null;
};

type TransactionEvent = {
  id: string;
  created_at: string;
  action: "stamp" | "points" | "redeem";
  amount_sar: number | null;
  stamp_delta: number | null;
  points_delta: number | null;
  morph_applied: boolean | null;
  stamps_after?: number | null;
  points_after?: number | null;
  branch_name_ar: string;
  branch_name_en: string;
  staff_name_ar: string;
  staff_name_en: string;
  cashier_device_name?: string | null;
};

export function CustomerDetailDialog({
  businessId,
  customerId,
  onClose,
  ar,
  isOwnerUser,
}: CustomerDetailDialogProps) {
  const detailQuery = useQuery({
    queryKey: ["customer-detail", businessId, customerId],
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_customer_detail", {
          _business_id: businessId,
          _customer_id: customerId!,
        })
        .single();
      if (error) throw error;
      return data as {
        customer: CustomerProfile;
        transactions: TransactionEvent[];
      };
    },
  });

  const customer = detailQuery.data?.customer;
  const transactions = detailQuery.data?.transactions ?? [];

  function formatDateTime(iso: string | null | undefined) {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "dd MMM yyyy, HH:mm", {
        locale: ar ? arSA : enUS,
      });
    } catch {
      return iso;
    }
  }

  function getActionLabel(tx: TransactionEvent) {
    if (tx.morph_applied) {
      return ar
        ? "استخدام الكوبون الترحيبي وتفعيل بطاقة الولاء"
        : "Intro coupon redeemed & pass morphed";
    }
    if (tx.action === "stamp") {
      return ar ? `إضافة ختم (+${tx.stamp_delta ?? 1})` : `+${tx.stamp_delta ?? 1} Stamp added`;
    }
    if (tx.action === "points") {
      return ar
        ? `اكتساب نقاط (+${tx.points_delta ?? 0})`
        : `+${tx.points_delta ?? 0} Points earned`;
    }
    if (tx.action === "redeem") {
      return ar ? "استبدال مكافأة" : "Reward redeemed";
    }
    return tx.action;
  }

  function getActionIcon(tx: TransactionEvent) {
    if (tx.action === "redeem" || tx.morph_applied) {
      return <Gift className="size-4 text-accent" />;
    }
    if (tx.action === "points") {
      return <Coins className="size-4 text-amber-500" />;
    }
    return <Stamp className="size-4 text-primary" />;
  }

  return (
    <Dialog open={Boolean(customerId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-lg">
            <span>{ar ? "تفاصيل العميل والنشاط" : "Customer Activity & Details"}</span>
            {customer ? (
              <Badge variant={customer.is_anonymous ? "secondary" : "outline"} className="text-xs">
                {customer.is_anonymous
                  ? ar
                    ? "زائر (غير معرّف)"
                    : "Guest (Anonymous)"
                  : ar
                    ? "عميل معرّف"
                    : "Identified Customer"}
              </Badge>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : detailQuery.isError || !customer ? (
          <div className="p-4 text-center text-sm text-destructive">
            {ar
              ? "تعذر تحميل تفاصيل العميل أو لا تملك صلاحية الوصول."
              : "Could not load customer details or access is restricted."}
          </div>
        ) : (
          <div className="space-y-4 text-start">
            {/* Identity & Status */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {ar ? "معرّف الجوال" : "Phone Identifier"}
                </span>
                <span className="font-mono text-sm font-semibold" dir="ltr">
                  {customer.phone || (ar ? "زائر (غير مسجل برقم)" : "Guest (No phone)")}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {ar ? "نوع البرنامج" : "Program Type"}
                </span>
                <Badge variant="outline" className="text-xs capitalize">
                  {customer.program_type}
                </Badge>
              </div>

              {/* Owner View: Global Program Balance */}
              {isOwnerUser ? (
                <>
                  <div className="flex items-center justify-between border-t border-border/50 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "الرصيد الكلي" : "Total Program Balance"}
                    </span>
                    <span className="text-sm font-bold text-primary">
                      {customer.program_type === "points"
                        ? `${customer.current_points ?? 0} / ${customer.points_per_reward ?? 100} ${ar ? "نقطة" : "pts"}`
                        : `${customer.current_stamps ?? 0} / ${customer.target_stamps ?? 9} ${ar ? "ختم" : "stamps"}`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "تاريخ الانضمام" : "Join Date"}
                    </span>
                    <span className="text-xs">{formatDateTime(customer.join_date)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "إجمالي العمليات" : "Total Loyalty Actions"}
                    </span>
                    <span className="text-xs font-semibold">{customer.transaction_count ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "حالة المحفظة الرقمية" : "Digital Wallet Status"}
                    </span>
                    <span className="text-xs">
                      {customer.wallet_attached
                        ? ar
                          ? "مضافة للمحفظة"
                          : "Attached to wallet"
                        : ar
                          ? "غير مضافة"
                          : "Not attached"}
                    </span>
                  </div>
                </>
              ) : (
                /* Manager View: Location-Scoped Metrics ONLY */
                <>
                  <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                    <ShieldCheck className="me-1 inline size-3.5 text-primary" />
                    {ar
                      ? "المعلومات محددة بالفروع المعينة لك فقط."
                      : "Information is strictly scoped to your assigned branch(es)."}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "عمليات الفرع" : "Location Actions"}
                    </span>
                    <span className="text-sm font-bold">{customer.location_transactions ?? 0}</span>
                  </div>

                  {customer.location_stamps_issued ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {ar ? "أختام منحت بفرعك" : "Stamps Issued at Branch"}
                      </span>
                      <span className="text-xs font-semibold">
                        +{customer.location_stamps_issued}
                      </span>
                    </div>
                  ) : null}

                  {customer.location_points_issued ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {ar ? "نقاط منحت بفرعك" : "Points Issued at Branch"}
                      </span>
                      <span className="text-xs font-semibold">
                        +{customer.location_points_issued}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "أول عملية بالفرع" : "First Branch Activity"}
                    </span>
                    <span className="text-xs">
                      {formatDateTime(customer.first_location_activity_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {ar ? "آخر عملية بالفرع" : "Last Branch Activity"}
                    </span>
                    <span className="text-xs">
                      {formatDateTime(customer.last_location_activity_at)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Chronological Activity Timeline */}
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ar ? "سجل العمليات" : "Activity Timeline"}
              </h3>

              {transactions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  {ar
                    ? "لا توجد عمليات مسجلة لهذا العميل حتى الآن."
                    : "No activity recorded for this customer yet."}
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="rounded-xl border border-border bg-card/60 p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          {getActionIcon(tx)}
                          <span>{getActionLabel(tx)}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDateTime(tx.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                        <span>{ar ? tx.branch_name_ar : tx.branch_name_en}</span>
                        <span>
                          {ar ? tx.staff_name_ar : tx.staff_name_en}
                          {tx.cashier_device_name ? ` (${tx.cashier_device_name})` : ""}
                        </span>
                      </div>

                      {tx.amount_sar ? (
                        <div className="text-[11px] text-muted-foreground">
                          {ar ? `المبلغ: ${tx.amount_sar} ر.س` : `Amount: ${tx.amount_sar} SAR`}
                        </div>
                      ) : null}

                      {/* Stamps after (visible to Owner only) */}
                      {isOwnerUser && tx.stamps_after !== undefined && tx.stamps_after !== null ? (
                        <div className="text-[11px] font-medium text-primary">
                          {ar
                            ? `الرصيد بعد العملية: ${tx.stamps_after} أختام`
                            : `Balance after: ${tx.stamps_after} stamps`}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
