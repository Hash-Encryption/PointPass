import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Activity, AlertCircle, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type NamedOption = { id: string; nameAr: string; nameEn: string };
type Summary = {
  totalTransactions: number;
  earns: number;
  redemptions: number;
  redemptionRate: number;
  loyaltySarActivity: number;
  stampsIssued: number;
  stampsRedeemed: number;
  pointsIssued: number;
  pointsRedeemed: number;
  introCouponRedemptions: number;
  morphTransitions: number;
  unattributed: number;
  activeBranches: number;
  activeStaff: number;
};
type Trend = {
  date: string;
  earns: number;
  redemptions: number;
  total: number;
  amountSar: number;
};
type ProgramActivity = {
  program: string;
  total: number;
  earns: number;
  redemptions: number;
};
type BranchActivity = NamedOption & {
  id: string | null;
  total: number;
  earns: number;
  redemptions: number;
  amountSar: number;
  activeStaff: number;
};
type StaffActivity = NamedOption & {
  id: string | null;
  role: string | null;
  total: number;
  earns: number;
  redemptions: number;
  amountSar: number;
};
type RecentActivity = {
  id: string;
  createdAt: string;
  action: string;
  program: string | null;
  amountSar: number | null;
  stampDelta: number | null;
  pointsDelta: number | null;
  morphApplied: boolean | null;
  branchNameAr: string;
  branchNameEn: string;
  staffNameAr: string;
  staffNameEn: string;
  deviceName: string | null;
};
type Analytics = {
  access: { role: string; scope: "business" | "branches" };
  summary: Summary;
  trend: Trend[];
  programs: ProgramActivity[];
  branches: BranchActivity[];
  staff: StaffActivity[];
  recent: RecentActivity[];
  filters: { branches: NamedOption[]; staff: NamedOption[] };
};

const copy = {
  en: {
    title: "Loyalty operations analytics",
    subtitle: "Authoritative loyalty activity recorded by PointPass · Saudi time",
    loading: "Loading analytics…",
    error: "Analytics could not be loaded. Check your access or filters and try again.",
    empty: "No loyalty activity matches these filters yet.",
    from: "From",
    to: "To",
    branch: "Branch",
    staff: "Staff / cashier",
    program: "Program",
    action: "Action",
    all: "All",
    earn: "Earn",
    redeem: "Redeem",
    scopeBusiness: "Business-wide",
    scopeBranches: "Assigned branches",
    total: "Loyalty transactions",
    earns: "Earning actions",
    redemptions: "Redemptions",
    rate: "Redemption rate",
    rateHelp: "Redemptions ÷ all filtered loyalty transactions",
    sar: "Loyalty-associated SAR activity",
    activeBranches: "Active branches",
    activeStaff: "Active staff / cashiers",
    trend: "Activity over time",
    programs: "Program distribution",
    branchActivity: "Activity by branch",
    staffActivity: "Activity by staff / cashier",
    recent: "Recent activity",
    stampsIssued: "Stamps issued",
    stampsRedeemed: "Stamps redeemed",
    pointsIssued: "Points issued",
    pointsRedeemed: "Points redeemed",
    couponRedemptions: "Intro coupon redemptions",
    morphs: "Morph transitions",
    unattributed: "Unattributed / legacy",
    date: "Date",
    amount: "SAR activity",
    role: "Role",
    device: "Device",
    details: "Loyalty change",
    noActivity: "No activity",
    stamp: "Stamps",
    points: "Points",
    coupon_morph: "Coupon / morph",
    legacy: "Legacy",
  },
  ar: {
    title: "تحليلات عمليات الولاء",
    subtitle: "نشاط الولاء الموثّق والمسجل في بوينت باس · بتوقيت السعودية",
    loading: "جارٍ تحميل التحليلات…",
    error: "تعذر تحميل التحليلات. تحقق من الصلاحيات أو عوامل التصفية وحاول مجدداً.",
    empty: "لا يوجد نشاط ولاء يطابق عوامل التصفية حتى الآن.",
    from: "من",
    to: "إلى",
    branch: "الفرع",
    staff: "الموظف / الكاشير",
    program: "البرنامج",
    action: "الإجراء",
    all: "الكل",
    earn: "اكتساب",
    redeem: "استبدال",
    scopeBusiness: "جميع المنشأة",
    scopeBranches: "الفروع المعيّنة",
    total: "معاملات الولاء",
    earns: "عمليات الاكتساب",
    redemptions: "عمليات الاستبدال",
    rate: "معدل الاستبدال",
    rateHelp: "عمليات الاستبدال ÷ جميع معاملات الولاء المصفّاة",
    sar: "النشاط المرتبط بالولاء بالريال",
    activeBranches: "الفروع النشطة",
    activeStaff: "الموظفون / الكاشير النشطون",
    trend: "النشاط عبر الوقت",
    programs: "توزيع البرامج",
    branchActivity: "النشاط حسب الفرع",
    staffActivity: "النشاط حسب الموظف / الكاشير",
    recent: "أحدث النشاطات",
    stampsIssued: "الأختام الممنوحة",
    stampsRedeemed: "الأختام المستبدلة",
    pointsIssued: "النقاط الممنوحة",
    pointsRedeemed: "النقاط المستبدلة",
    couponRedemptions: "استبدالات القسيمة الترحيبية",
    morphs: "تحولات البرنامج",
    unattributed: "غير منسوب / قديم",
    date: "التاريخ",
    amount: "نشاط الريال",
    role: "الدور",
    device: "الجهاز",
    details: "تغيّر الولاء",
    noActivity: "لا يوجد نشاط",
    stamp: "الأختام",
    points: "النقاط",
    coupon_morph: "القسيمة / التحول",
    legacy: "قديم",
  },
} as const;

function dateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activityDelta(item: RecentActivity, locale: "ar" | "en") {
  const parts = [];
  if (item.stampDelta)
    parts.push(`${item.stampDelta > 0 ? "+" : ""}${item.stampDelta} ${copy[locale].stamp}`);
  if (item.pointsDelta)
    parts.push(`${item.pointsDelta > 0 ? "+" : ""}${item.pointsDelta} ${copy[locale].points}`);
  if (item.morphApplied) parts.push(copy[locale].morphs);
  return parts.join(" · ") || copy[locale].noActivity;
}

export function AnalyticsPanel({ businessId, ar }: { businessId: string; ar: boolean }) {
  const locale = ar ? "ar" : "en";
  const text = copy[locale];
  const today = dateInput(new Date());
  const initialFrom = new Date();
  initialFrom.setDate(initialFrom.getDate() - 29);
  const [dateFrom, setDateFrom] = useState(dateInput(initialFrom));
  const [dateTo, setDateTo] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [program, setProgram] = useState("");
  const [action, setAction] = useState("");

  const query = useQuery({
    queryKey: [
      "business-analytics",
      businessId,
      dateFrom,
      dateTo,
      branchId,
      staffId,
      program,
      action,
    ],
    enabled: Boolean(businessId && dateFrom && dateTo),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("business_analytics", {
        _business_id: businessId,
        _date_from: dateFrom,
        _date_to: dateTo,
        _branch_id: branchId || null,
        _staff_id: staffId || null,
        _program_type: program || null,
        _action: action || null,
      });
      if (error) throw error;
      return data as Analytics;
    },
  });

  const analytics = query.data;
  const number = new Intl.NumberFormat(ar ? "ar-SA" : "en-US");
  const money = new Intl.NumberFormat(ar ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  });
  const date = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const dateTime = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const programLabel = (value: string | null) =>
    ({
      stamp: text.stamp,
      points: text.points,
      coupon_morph: text.coupon_morph,
      legacy: text.legacy,
    })[value ?? "legacy"] ??
    value ??
    text.legacy;

  return (
    <section className="space-y-4" aria-labelledby="analytics-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="analytics-title" className="text-xl font-bold">
            {text.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{text.subtitle}</p>
        </div>
        {analytics ? (
          <Badge variant="outline">
            {analytics.access.scope === "business" ? text.scopeBusiness : text.scopeBranches} ·{" "}
            {analytics.access.role}
          </Badge>
        ) : null}
      </div>

      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label={text.title}>
        <Filter label={text.from}>
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </Filter>
        <Filter label={text.to}>
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            type="date"
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </Filter>
        <Filter label={text.branch}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">{text.all}</option>
            {analytics?.filters.branches.map((item) => (
              <option key={item.id} value={item.id}>
                {ar ? item.nameAr : item.nameEn}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label={text.staff}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
          >
            <option value="">{text.all}</option>
            {analytics?.filters.staff.map((item) => (
              <option key={item.id} value={item.id}>
                {ar ? item.nameAr : item.nameEn}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label={text.program}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={program}
            onChange={(event) => setProgram(event.target.value)}
          >
            <option value="">{text.all}</option>
            <option value="stamp">{text.stamp}</option>
            <option value="points">{text.points}</option>
            <option value="coupon_morph">{text.coupon_morph}</option>
          </select>
        </Filter>
        <Filter label={text.action}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="">{text.all}</option>
            <option value="earn">{text.earn}</option>
            <option value="redeem">{text.redeem}</option>
          </select>
        </Filter>
      </div>

      {query.isPending ? (
        <div
          className="panel flex min-h-48 items-center justify-center gap-2 p-6 text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-5 animate-spin" /> {text.loading}
        </div>
      ) : query.isError ? (
        <div
          className="panel flex min-h-40 items-center justify-center gap-2 border-destructive/40 p-6 text-destructive"
          role="alert"
        >
          <AlertCircle className="size-5" /> {text.error}
        </div>
      ) : analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              [text.total, number.format(analytics.summary.totalTransactions)],
              [text.earns, number.format(analytics.summary.earns)],
              [text.redemptions, number.format(analytics.summary.redemptions)],
              [text.rate, `${number.format(analytics.summary.redemptionRate)}%`],
              [text.sar, money.format(analytics.summary.loyaltySarActivity)],
              [text.activeBranches, number.format(analytics.summary.activeBranches)],
            ].map(([label, value]) => (
              <div key={label} className="panel p-4">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
                {label === text.rate ? (
                  <p className="mt-1 text-xs text-muted-foreground">{text.rateHelp}</p>
                ) : null}
              </div>
            ))}
          </div>

          {analytics.summary.totalTransactions === 0 ? (
            <div className="panel flex min-h-40 flex-col items-center justify-center p-6 text-center">
              <Activity className="mb-3 size-7 text-muted-foreground" />
              <p className="font-medium">{text.empty}</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="panel p-4 lg:col-span-2">
                <h3 className="mb-3 font-semibold">{text.trend}</h3>
                <div className="h-64" aria-label={text.trend}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.trend} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => date.format(new Date(`${value}T00:00:00`))}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip
                        labelFormatter={(value) => date.format(new Date(`${value}T00:00:00`))}
                      />
                      <Legend
                        formatter={(value) => (value === "earns" ? text.earns : text.redemptions)}
                      />
                      <Line
                        type="monotone"
                        dataKey="earns"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="redemptions"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="panel p-4">
                <h3 className="mb-3 font-semibold">{text.programs}</h3>
                <div className="h-64" aria-label={text.programs}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics.programs.map((item) => ({
                        ...item,
                        label: programLabel(item.program),
                      }))}
                      accessibilityLayer
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip />
                      <Legend
                        formatter={(value) => (value === "earns" ? text.earns : text.redemptions)}
                      />
                      <Bar dataKey="earns" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="redemptions" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {[
              [text.stampsIssued, analytics.summary.stampsIssued],
              [text.stampsRedeemed, analytics.summary.stampsRedeemed],
              [text.pointsIssued, analytics.summary.pointsIssued],
              [text.pointsRedeemed, analytics.summary.pointsRedeemed],
              [text.couponRedemptions, analytics.summary.introCouponRedemptions],
              [text.morphs, analytics.summary.morphTransitions],
              [text.activeStaff, analytics.summary.activeStaff],
              [text.unattributed, analytics.summary.unattributed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {number.format(Number(value))}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ActivityTable
              title={text.branchActivity}
              rows={analytics.branches.map((item) => ({
                id: item.id ?? "legacy",
                name: ar ? item.nameAr : item.nameEn,
                role: "",
                total: item.total,
                earns: item.earns,
                redemptions: item.redemptions,
                amount: item.amountSar,
              }))}
              text={text}
              number={number}
              money={money}
            />
            <ActivityTable
              title={text.staffActivity}
              rows={analytics.staff.map((item) => ({
                id: item.id ?? "legacy",
                name: ar ? item.nameAr : item.nameEn,
                role: item.role ?? "—",
                total: item.total,
                earns: item.earns,
                redemptions: item.redemptions,
                amount: item.amountSar,
              }))}
              text={text}
              number={number}
              money={money}
              showRole
            />
          </div>

          <div className="panel overflow-hidden">
            <h3 className="p-4 font-semibold">{text.recent}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {[
                      text.date,
                      text.action,
                      text.program,
                      text.branch,
                      text.staff,
                      text.details,
                      text.amount,
                      text.device,
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-start font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.recent.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-4 py-3">
                        {dateTime.format(new Date(item.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {item.action === "redeem" ? text.redeem : text.earn}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{programLabel(item.program)}</td>
                      <td className="px-4 py-3">{ar ? item.branchNameAr : item.branchNameEn}</td>
                      <td className="px-4 py-3">{ar ? item.staffNameAr : item.staffNameEn}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {activityDelta(item, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {item.amountSar === null ? "—" : money.format(item.amountSar)}
                      </td>
                      <td className="px-4 py-3">{item.deviceName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="space-y-1.5 text-xs">
      <span>{label}</span>
      {children}
    </Label>
  );
}

function ActivityTable({
  title,
  rows,
  text,
  number,
  money,
  showRole = false,
}: {
  title: string;
  rows: {
    id: string;
    name: string;
    role: string;
    total: number;
    earns: number;
    redemptions: number;
    amount: number;
  }[];
  text: typeof copy.en | typeof copy.ar;
  number: Intl.NumberFormat;
  money: Intl.NumberFormat;
  showRole?: boolean;
}) {
  return (
    <div className="panel overflow-hidden">
      <h3 className="p-4 font-semibold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-medium">
                {showRole ? text.staff : text.branch}
              </th>
              {showRole ? <th className="px-4 py-3 text-start font-medium">{text.role}</th> : null}
              {[text.total, text.earns, text.redemptions, text.amount].map((heading) => (
                <th key={heading} className="px-4 py-3 text-start font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  {showRole ? (
                    <td className="px-4 py-3 text-muted-foreground">{row.role}</td>
                  ) : null}
                  <td className="px-4 py-3 tabular-nums">{number.format(row.total)}</td>
                  <td className="px-4 py-3 tabular-nums">{number.format(row.earns)}</td>
                  <td className="px-4 py-3 tabular-nums">{number.format(row.redemptions)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {money.format(row.amount)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="px-4 py-6 text-center text-muted-foreground"
                  colSpan={showRole ? 6 : 5}
                >
                  {text.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
