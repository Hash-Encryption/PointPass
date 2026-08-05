import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Apple, Loader2, Smartphone } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { supabase, resolveSlugFromHost } from "@/lib/supabase";
import { createWalletPass } from "@/lib/wallet.functions";
import { PASS_TEMPLATES, autoContrast, type ProgramType } from "@/constants/defaultTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/join/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `انضم لبرنامج الولاء | Join loyalty — ${params.slug}` },
      {
        name: "description",
        content:
          "Join the loyalty program in seconds and add your card to Apple Wallet or Google Wallet.",
      },
      { property: "og:title", content: `Join the loyalty program — ${params.slug}` },
      {
        property: "og:description",
        content: "Enter your phone number and save your loyalty card to your phone wallet.",
      },
    ],
  }),
  component: ClaimPage,
});

type Business = {
  slug: string;
  name_ar: string;
  name_en: string;
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  program_type: ProgramType;
  offer_ar: string;
  offer_en: string;
};

function ClaimPage() {
  const { slug: pathSlug } = Route.useParams();
  const { locale, t, toggle } = useLocale();
  const ar = locale === "ar";

  const [slug, setSlug] = useState(pathSlug);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<{ apple: string | null; google: string | null } | null>(null);

  useEffect(() => {
    // Subdomain takes priority over the path fallback.
    const fromHost = resolveSlugFromHost(window.location.hostname, pathSlug);
    if (fromHost) setSlug(fromHost);
  }, [pathSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusinessLoading(true);
      setBusinessError(null);
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "slug,name_ar,name_en,logo_url,brand_color,accent_color,program_type,offer_ar,offer_en",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      setBusiness((data as Business | null) ?? null);
      setBusinessError(
        error?.message ?? (data ? null : ar ? "المنشأة غير موجودة." : "Business not found."),
      );
      setBusinessLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ar, slug]);

  const fg = useMemo(() => autoContrast(business?.brand_color ?? "#059669"), [business]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[0-9+ ]{8,15}$/.test(phone)) {
      toast.error(ar ? "رقم جوال غير صالح" : "Invalid phone number");
      return;
    }
    setLoading(true);
    try {
      const { error: insertError } = await supabase
        .from("pass_instances")
        .insert({ business_slug: slug, phone, program_type: business?.program_type ?? "stamp" });
      if (insertError) throw insertError;

      const res = await createWalletPass({
        data: {
          slug,
          phone,
          programType: business?.program_type ?? "stamp",
          template: PASS_TEMPLATES[business?.program_type ?? "stamp"] as unknown as Record<
            string,
            unknown
          >,
        },
      });
      setLinks({ apple: res.appleUrl, google: res.googleUrl });
      if (!res.ok)
        toast.info(
          ar
            ? "تم تسجيلك — روابط المحفظة تُفعّل بعد ربط مفتاح WalletWallet"
            : "You're registered — wallet links activate once the WalletWallet key is set",
        );
      else toast.success(ar ? "تم إنشاء بطاقتك" : "Your pass is ready");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : ar ? "تعذر التسجيل" : "Registration failed",
      );
    } finally {
      setLoading(false);
    }
  }

  if (businessLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (businessError || !business) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="panel max-w-md p-6 text-center">
          <h1 className="text-xl font-bold">
            {ar ? "تعذر تحميل برنامج الولاء" : "Loyalty program unavailable"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{businessError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: business.brand_color }}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8" style={{ color: fg }}>
        <div className="flex items-center justify-between">
          <span className="text-xs opacity-70">{slug}.yourplatform.com</span>
          <button
            className="rounded-full bg-black/10 px-3 py-1 text-xs font-semibold"
            onClick={toggle}
          >
            {t("language")}
          </button>
        </div>

        <div className="mt-10 text-center">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt=""
              className="mx-auto size-20 rounded-2xl object-contain"
              style={{ background: `${fg}18` }}
            />
          ) : (
            <span
              className="mx-auto grid size-20 place-items-center rounded-2xl text-2xl font-bold"
              style={{ background: `${fg}22` }}
            >
              {(ar ? business.name_ar : business.name_en).slice(0, 2)}
            </span>
          )}
          <h1 className="mt-4 text-2xl font-extrabold">
            {ar ? business.name_ar : business.name_en}
          </h1>
          <p className="mt-2 text-base opacity-85">{ar ? business.offer_ar : business.offer_en}</p>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 text-foreground shadow-[var(--shadow-pass)]">
          {!links ? (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="phone">{t("phone")}</Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 text-center text-lg"
                />
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
                {loading ? <Loader2 className="size-5 animate-spin" /> : t("join")}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {ar
                  ? "بالمتابعة أنت توافق على تلقي إشعارات العروض"
                  : "By continuing you agree to receive offer notifications"}
              </p>
            </form>
          ) : (
            <div className="space-y-3 text-center">
              <p className="font-semibold">{ar ? "بطاقتك جاهزة 🎉" : "Your card is ready 🎉"}</p>
              <Button
                asChild={Boolean(links.apple)}
                className="h-12 w-full bg-surface-dark text-base text-surface-dark-foreground hover:bg-surface-dark/90"
                disabled={!links.apple}
              >
                {links.apple ? (
                  <a href={links.apple}>
                    <Apple className="me-2 size-5" /> {t("appleWallet")}
                  </a>
                ) : (
                  <span>
                    <Apple className="me-2 inline size-5" /> {t("appleWallet")}
                  </span>
                )}
              </Button>
              <Button
                asChild={Boolean(links.google)}
                variant="outline"
                className="h-12 w-full text-base"
                disabled={!links.google}
              >
                {links.google ? (
                  <a href={links.google}>
                    <Smartphone className="me-2 size-5" /> {t("googleWallet")}
                  </a>
                ) : (
                  <span>
                    <Smartphone className="me-2 inline size-5" /> {t("googleWallet")}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-auto pt-8 text-center text-xs opacity-70">{t("brand")}</p>
      </div>
    </div>
  );
}
