import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { inviteMerchantAndCreateBusiness } from "@/lib/admin.functions";
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
import { Activity, CreditCard, Loader2, LogOut, Package, ShieldAlert, Store } from "lucide-react";

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
    plan: "starter",
  });

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
        .select("id,name_ar,name_en,slug,plan,status,active_passes,redemptions,custom_domain")
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
          plan: newBusiness.plan as "starter" | "growth" | "enterprise",
        },
      });
    },
    onSuccess: async (result) => {
      setNewBusiness({ merchantEmail: "", slug: "", nameAr: "", nameEn: "", plan: "starter" });
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success(
        result.invitationSent
          ? ar
            ? "تم إنشاء المنشأة وإرسال دعوة التاجر"
            : "Business created and merchant invitation sent"
          : ar
            ? "تم إنشاء المنشأة وربط حساب التاجر الحالي"
            : "Business created and existing merchant assigned",
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
          <p className="mt-2 text-sm text-muted-foreground">
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
                    ? "سيتم إرسال دعوة تلقائياً، أو ربط الحساب إذا كان موجوداً."
                    : "An invitation is sent automatically, or an existing account is assigned."}
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
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="lg:col-span-6">
                <Button type="submit" disabled={createBusinessMutation.isPending}>
                  {createBusinessMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : ar ? (
                    "إنشاء وربط التاجر"
                  ) : (
                    "Create and assign merchant"
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
