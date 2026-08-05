import { createFileRoute, Link } from "@tanstack/react-router";
import { useLocale } from "@/lib/i18n";
import { PortalNav } from "@/components/PortalNav";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, ScanLine, ShieldCheck, Stamp, Gift, Coins } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "منصة ولاء المحافظ الرقمية | Wallet Loyalty SaaS" },
      {
        name: "description",
        content:
          "Multi-tenant digital wallet loyalty platform for Saudi restaurants: stamp cards, points, coupons, Apple & Google Wallet passes.",
      },
      { property: "og:title", content: "Wallet Loyalty SaaS — منصة ولاء المحافظ الرقمية" },
      {
        property: "og:description",
        content: "Apple & Google Wallet loyalty passes, cashier scanner and push campaigns.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const portals = [
    {
      to: "/admin",
      icon: ShieldCheck,
      title: t("adminPortal"),
      desc: ar ? "إدارة الحسابات والتحليلات والأجهزة" : "Tenants, analytics, hardware, domains",
    },
    {
      to: "/dashboard",
      icon: LayoutDashboard,
      title: t("merchantPortal"),
      desc: ar ? "لوحة تحكم المنشأة، مصمم البطاقة والحملات" : "Pass designer, campaigns, overview, analytics",
    },
    {
      to: "/scan",
      icon: ScanLine,
      title: t("cashierPortal"),
      desc: ar ? "شاشة الكاشير لمسح وإضافة الأختام برمز المطعم" : "PIN-locked POS scanner for your restaurant",
    },
  ];

  const programs = [
    {
      icon: Stamp,
      title: ar ? "بطاقة أختام" : "Stamp card",
      desc: ar ? "اشترِ ٩ قهوة واحصل على واحدة مجاناً" : "Buy 9 coffees, get 1 free",
    },
    {
      icon: Coins,
      title: ar ? "نقاط واسترداد" : "Points & cashback",
      desc: ar ? "نقطة لكل ١٠ ريال" : "1 point per 10 SAR spent",
    },
    {
      icon: Gift,
      title: ar ? "قسيمة تتحول لولاء" : "Coupon-to-loyalty",
      desc: ar ? "خصم ٢٠٪ يتحول لبطاقة ولاء" : "20% off morphs into a loyalty card",
    },
  ];

  return (
    <div className="min-h-screen">
      <PortalNav title={t("brand")} subtitle={t("tagline")} />

      <main>
        <section className="border-b border-border bg-gradient-emerald">
          <div className="mx-auto max-w-7xl px-4 py-20 text-primary-foreground">
            <p className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {ar ? "منصة متعددة المستأجرين" : "Multi-tenant SaaS"}
            </p>
            <h1 className="max-w-3xl text-4xl font-extrabold sm:text-5xl">{t("brand")}</h1>
            <p className="mt-4 max-w-2xl text-lg opacity-90">{t("tagline")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/dashboard">{t("heroCta")}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-primary-foreground hover:bg-white/10"
              >
                <Link to="/scan">{t("cashierPortal")}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl font-bold">{ar ? "البوابات" : "Portals"}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {portals.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                className="panel group p-5 transition-transform hover:-translate-y-1"
              >
                <p.icon className="size-6 text-primary" />
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20">
          <h2 className="text-2xl font-bold">{ar ? "أنواع البرامج" : "Program types"}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {programs.map((p) => (
              <div key={p.title} className="panel p-5">
                <p.icon className="size-6 text-accent" />
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
