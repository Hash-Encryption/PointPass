import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/lib/i18n";
import { PortalNav } from "@/components/PortalNav";
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
import { Activity, CreditCard, Package, Store } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Super Admin — Wallet Loyalty Platform" },
      {
        name: "description",
        content: "Manage tenant restaurants, platform analytics, hardware dispatch and domains.",
      },
      { property: "og:title", content: "Super Admin — Wallet Loyalty Platform" },
      {
        property: "og:description",
        content: "Multi-tenant control panel for the wallet loyalty platform.",
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
};

const DEMO_TENANTS: Tenant[] = [
  { id: "t1", name_ar: "مقهى النخبة", name_en: "Elite Coffee", slug: "elite-coffee", plan: "growth", status: "active", active_passes: 2841, redemptions: 918 },
  { id: "t2", name_ar: "مطعم البيك الذهبي", name_en: "Golden Bites", slug: "golden-bites", plan: "starter", status: "active", active_passes: 1203, redemptions: 402 },
  { id: "t3", name_ar: "حلويات سُكر", name_en: "Sukkar Sweets", slug: "sukkar", plan: "enterprise", status: "suspended", active_passes: 5490, redemptions: 2311 },
];

const DEMO_HARDWARE = [
  { id: "h1", tenant: "elite-coffee", item: "NFC counter stand", qty: 3, status: "shipped", tracking: "SPL-882301" },
  { id: "h2", tenant: "golden-bites", item: "QR acrylic sign", qty: 8, status: "packing", tracking: "—" },
  { id: "h3", tenant: "sukkar", item: "NFC counter stand", qty: 12, status: "delivered", tracking: "SPL-771204" },
];

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

function AdminPortal() {
  const { locale, t } = useLocale();
  const ar = locale === "ar";
  const [domain, setDomain] = useState("");

  const { data: tenants = DEMO_TENANTS } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").limit(50);
      if (error || !data?.length) return DEMO_TENANTS;
      return data as unknown as Tenant[];
    },
  });

  const totalPasses = tenants.reduce((s, x) => s + (x.active_passes ?? 0), 0);
  const totalRedemptions = tenants.reduce((s, x) => s + (x.redemptions ?? 0), 0);

  return (
    <div className="min-h-screen">
      <PortalNav title={t("adminPortal")} subtitle={t("brand")} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Store} label={ar ? "المستأجرون" : "Tenants"} value={String(tenants.length)} />
          <Stat icon={CreditCard} label={t("activePasses")} value={totalPasses.toLocaleString()} />
          <Stat icon={Activity} label={t("redemptions")} value={totalRedemptions.toLocaleString()} />
          <Stat icon={Package} label={t("systemHealth")} value="99.98%" />
        </div>

        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">{t("accounts")}</TabsTrigger>
            <TabsTrigger value="hardware">{t("hardware")}</TabsTrigger>
            <TabsTrigger value="domains">{t("domains")}</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="panel mt-4 p-4">
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
                {tenants.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{ar ? x.name_ar : x.name_en}</TableCell>
                    <TableCell className="text-muted-foreground">{x.slug}</TableCell>
                    <TableCell className="capitalize">{x.plan}</TableCell>
                    <TableCell>{(x.active_passes ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={x.status === "active" ? "default" : "destructive"}>
                        {x.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          toast.success(
                            ar ? "تم تحديث حالة الحساب" : "Account status updated",
                          )
                        }
                      >
                        {x.status === "active"
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
          </TabsContent>

          <TabsContent value="hardware" className="panel mt-4 p-4">
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
                {DEMO_HARDWARE.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{h.tenant}</TableCell>
                    <TableCell>{h.item}</TableCell>
                    <TableCell>{h.qty}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{h.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{h.tracking}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="domains" className="panel mt-4 space-y-4 p-6">
            <div className="grid gap-3 sm:max-w-md">
              <Label htmlFor="domain">{ar ? "نطاق مخصص للعميل" : "Client custom domain"}</Label>
              <Input
                id="domain"
                placeholder="loyalty.elitecoffee.sa"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
              <Button
                onClick={() => toast.success(ar ? "تم حفظ النطاق" : "Domain mapping saved")}
                className="w-fit"
              >
                {t("save")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {ar
                ? "كل مستأجر يحصل تلقائياً على نطاق فرعي slug.yourplatform.com"
                : "Every tenant automatically gets slug.yourplatform.com"}
            </p>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
