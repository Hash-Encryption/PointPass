import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Apple, Loader2, Smartphone, Sparkles } from "lucide-react";
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
        content: "Enter your phone number or click to save your loyalty card to your phone wallet.",
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

  // Auto-detect if user is on Apple / Safari vs Android
  const isAppleDevice = useMemo(() => {
    if (typeof window === "undefined") return true;
    return /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
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

  async function generatePass(customPhone?: string) {
    const targetPhone = (customPhone ?? phone).trim();
    const effectivePhone = targetPhone || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;

    setLoading(true);
    try {
      try {
        await supabase.from("pass_instances").insert({
          business_slug: slug,
          phone: effectivePhone,
          program_type: business?.program_type ?? "stamp",
        });
      } catch {
        // Non-fatal if table constraint or RLS warning occurs
      }

      const res = await createWalletPass({
        data: {
          slug,
          phone: effectivePhone,
          programType: business?.program_type ?? "stamp",
          template: PASS_TEMPLATES[business?.program_type ?? "stamp"] as unknown as Record<
            string,
            unknown
          >,
        },
      });

      setLinks({ apple: res.appleUrl, google: res.googleUrl });

      if (res.ok) {
        toast.success(ar ? "تم إنشاء بطاقتك بنجاح!" : "Your pass is ready!");
        const targetUrl = isAppleDevice ? res.appleUrl : res.googleUrl || res.appleUrl;
        if (targetUrl) {
          window.location.href = targetUrl;
        }
      } else {
        toast.info(
          ar
            ? "تم تسجيل بطاقتك — تفعيل التحميل يتطلب مفتاح WalletWallet"
            : "Pass registered — instant wallet download activates with WalletWallet key",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : ar ? "تعذر إنشاء البطاقة" : "Failed to create pass",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void generatePass();
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

        <div className="mt-8 rounded-3xl bg-white p-6 text-foreground shadow-[var(--shadow-pass)] space-y-4">
          {!links ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Button
                type="button"
                className="h-14 w-full text-base font-bold shadow-md bg-foreground text-background hover:bg-foreground/90"
                disabled={loading}
                onClick={() => generatePass()}
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : isAppleDevice ? (
                  <>
                    <Apple className="me-2 size-6" />
                    {ar ? "إضافة فورية إلى Apple Wallet" : "Instant Add to Apple Wallet"}
                  </>
                ) : (
                  <>
                    <Smartphone className="me-2 size-6" />
                    {ar ? "إضافة فورية إلى Google Wallet" : "Instant Add to Google Wallet"}
                  </>
                )}
              </Button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground my-2">
                <span className="h-px flex-1 bg-border" />
                <span>{ar ? "أو أدخل رقم الجوال للمزامنة" : "or enter phone to sync across devices"}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div>
                <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">
                  {ar ? "رقم الجوال (اختياري)" : "Phone number (optional)"}
                </Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 text-center text-sm mt-1"
                />
              </div>

              <Button type="submit" variant="outline" className="h-11 w-full text-sm" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : ar ? "حفظ باستخدام الرقم" : "Save with Phone Number"}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                {ar
                  ? "بالمتابعة أنت توافق على تلقي إشعارات عروض المحفظة"
                  : "By continuing you agree to receive wallet offer notifications"}
              </p>
            </form>
          ) : (
            <div className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 text-primary font-bold text-lg">
                <Sparkles className="size-5" />
                <span>{ar ? "بطاقتك جاهزة 🎉" : "Your card is ready 🎉"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "إذا لم يبدأ التحميل تلقائياً، اضغط على زر محفظتك أدناه:"
                  : "If auto-download didn't start, tap your wallet button below:"}
              </p>

              <Button
                asChild={Boolean(links.apple)}
                className={`h-12 w-full text-base ${
                  isAppleDevice ? "bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90 ring-2 ring-primary" : "bg-surface-dark text-surface-dark-foreground"
                }`}
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
                variant={isAppleDevice ? "outline" : "default"}
                className={`h-12 w-full text-base ${!isAppleDevice ? "ring-2 ring-primary" : ""}`}
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
