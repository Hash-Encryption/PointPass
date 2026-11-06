import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Apple, Check, Copy, Gift, Loader2, Phone, RefreshCw, Smartphone } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { resolveSlugFromHost } from "@/lib/supabase";
import {
  createWalletPass,
  getPublicBusinessBySlug,
  refreshCustomerPassStatus,
} from "@/lib/wallet.functions";
import {
  resolveRestaurantBranding,
  type StripStyle,
  type WalletColorPreset,
  type WalletTierMode,
} from "@/lib/wallet-tier";
import { generateStampStripSvg } from "@/lib/strip-svg";
import { LocalQrCode } from "@/components/LocalQrCode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/join/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `انضم لبرنامج الولاء | Join Loyalty — ${params.slug}` },
      {
        name: "description",
        content:
          "Unlock your free loyalty reward in seconds. Save your pass to Apple Wallet or Google Wallet.",
      },
      { property: "og:title", content: `Join Loyalty — ${params.slug}` },
      {
        property: "og:description",
        content: "Claim your free welcome stamp and start earning rewards on every visit.",
      },
    ],
  }),
  loader: async ({ params }) => {
    try {
      const res = await getPublicBusinessBySlug({ data: { slug: params.slug } });
      return {
        business: res.business ?? null,
        error: res.error ?? null,
      };
    } catch {
      return { business: null, error: null };
    }
  },
  component: ClaimPage,
});

type PublicBusiness = {
  id: string;
  name: string;
  name_ar: string;
  name_en: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  program_type: "stamp" | "points" | "coupon_morph";
  offer_ar: string;
  offer_en: string;
  stamps_required: number;
  target_stamps: number;
  template_id?: string | null;
  templateMeta: {
    baseId: string;
    stampIcon: string;
    stampEmoji: string;
    stripStyle: StripStyle;
    colorPreset: WalletColorPreset;
    tierMode: WalletTierMode;
    accentHex: string;
    brandHex: string;
  };
};

type ActivePass = {
  passSerial: string;
  currentStamps: number;
  stampsRequired: number;
  isReturning: boolean;
  customerName?: string | null | undefined;
  customerPhone?: string | null | undefined;
  pkpassUrl?: string | null | undefined;
  rewardUnlocked: boolean;
  offerAr: string;
  offerEn: string;
  updatedAt?: string | null | undefined;
  programType?: string | undefined;
  points?: number | undefined;
};

function ClaimPage() {
  const { slug: pathSlug } = Route.useParams();
  const loaderData = Route.useLoaderData() as
    | {
        business: PublicBusiness | null;
        error: string | null;
      }
    | undefined;

  const { locale, toggle } = useLocale();
  const ar = locale === "ar";

  const [slug, setSlug] = useState(pathSlug);
  const [business, setBusiness] = useState<PublicBusiness | null>(loaderData?.business ?? null);
  const [businessLoading, setBusinessLoading] = useState(!loaderData?.business);
  const [businessError, setBusinessError] = useState<string | null>(loaderData?.error ?? null);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activePass, setActivePass] = useState<ActivePass | null>(null);
  const [copied, setCopied] = useState(false);
  const [stampPulsing, setStampPulsing] = useState(false);

  // Detect user device OS: iOS vs Android vs Desktop
  const deviceOS = useMemo(() => {
    if (typeof window === "undefined") return "ios";
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod|Macintosh/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "desktop";
  }, []);

  const isAppleDevice = deviceOS === "ios";
  const storageKey = useMemo(() => `pointpass_card_${slug}`, [slug]);

  // Handle subdomain tenant overrides
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromHost = resolveSlugFromHost(window.location.hostname, pathSlug);
    if (fromHost && fromHost !== slug) {
      setSlug(fromHost);
    }
  }, [pathSlug, slug]);

  // Load public business branding & template
  useEffect(() => {
    let cancelled = false;
    async function loadBusiness() {
      if (business && business.slug === slug) return;
      setBusinessLoading(true);
      setBusinessError(null);
      try {
        const res = await getPublicBusinessBySlug({ data: { slug } });
        if (cancelled) return;
        if (res.ok && res.business) {
          setBusiness(res.business as PublicBusiness);
        } else {
          setBusinessError(res.error ?? (ar ? "المنشأة غير موجودة." : "Business not found."));
        }
      } catch (err) {
        if (!cancelled) {
          setBusinessError(
            err instanceof Error ? err.message : ar ? "تعذر تحميل المنشأة" : "Failed to load store",
          );
        }
      } finally {
        if (!cancelled) setBusinessLoading(false);
      }
    }
    void loadBusiness();
    return () => {
      cancelled = true;
    };
  }, [ar, business, slug]);

  // Check persisted pass in localStorage or URL query params on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check URL query params for ?serial=PP-... or ?pass=PP-...
    const urlParams = new URLSearchParams(window.location.search);
    const querySerial = urlParams.get("serial") || urlParams.get("pass");

    if (querySerial && querySerial.trim()) {
      const serialToLoad = querySerial.trim();
      void (async () => {
        try {
          const res = await refreshCustomerPassStatus({
            data: { slug, passSerial: serialToLoad },
          });
          if (res.ok && res.passSerial) {
            const restored: ActivePass = {
              passSerial: res.passSerial,
              currentStamps: res.currentStamps,
              stampsRequired: res.stampsRequired,
              isReturning: true,
              pkpassUrl: res.pkpassUrl ?? undefined,
              rewardUnlocked: res.rewardUnlocked,
              offerAr: business?.offer_ar || "",
              offerEn: business?.offer_en || "",
              updatedAt: res.updatedAt ?? undefined,
              programType: res.programType,
              points: res.points,
            };
            setActivePass(restored);
            localStorage.setItem(storageKey, JSON.stringify(restored));
          }
        } catch {
          // Ignore restore errors
        }
      })();
      return;
    }

    // 2. Check localStorage
    try {
      const rawStored = localStorage.getItem(storageKey);
      if (rawStored) {
        const parsed = JSON.parse(rawStored) as ActivePass;
        if (parsed?.passSerial) {
          setActivePass(parsed);
          // Silently refresh balance in the background to show live cashier updates
          void refreshCustomerPassStatus({
            data: { slug, passSerial: parsed.passSerial },
          }).then((res) => {
            if (res.ok && res.passSerial) {
              const updated: ActivePass = {
                ...parsed,
                currentStamps: res.currentStamps,
                stampsRequired: res.stampsRequired,
                rewardUnlocked: res.rewardUnlocked,
                pkpassUrl: res.pkpassUrl ?? parsed.pkpassUrl ?? undefined,
                updatedAt: res.updatedAt ?? undefined,
              };
              setActivePass(updated);
              localStorage.setItem(storageKey, JSON.stringify(updated));
            }
          });
        }
      }
    } catch {
      // Storage read fallback
    }
  }, [business?.offer_ar, business?.offer_en, slug, storageKey]);

  // Dynamic restaurant branding (resolves true emoji and brand color like warm coffee orange for testpass)
  const branding = useMemo(() => {
    return resolveRestaurantBranding({
      brandColor: business?.brand_color,
      accentColor: business?.accent_color,
      templateId: business?.template_id,
      offerEn: business?.offer_en,
      offerAr: business?.offer_ar,
      nameEn: business?.name_en,
      nameAr: business?.name_ar,
    });
  }, [business]);

  const brandHex = branding.brandHex;
  const stampEmoji = branding.stampEmoji;
  const targetStamps = business?.stamps_required || 8;
  const storeName = ar
    ? business?.name_ar || business?.name || slug
    : business?.name_en || business?.name || slug;
  const storeOffer = ar
    ? business?.offer_ar || "مكافأة خاصة عند اكتمال الأختام"
    : business?.offer_en || "Special reward on completed card";

  // SVG Strip Preview for Pro tier
  const stripSvg = useMemo(() => {
    if (!business) return "";
    try {
      return generateStampStripSvg({
        targetStamps: business.stamps_required || 8,
        stamps: activePass ? activePass.currentStamps : 1,
        brandColor: brandHex,
        accentColor: branding.accentHex,
        stampIcon: branding.stampIcon,
        stripStyle: branding.stripStyle,
      });
    } catch {
      return "";
    }
  }, [activePass, business, brandHex, branding.accentHex, branding.stampIcon, branding.stripStyle]);

  // Claim or resume customer pass (supports both phone-backed and instant skip)
  const handleClaim = useCallback(
    async (e?: React.FormEvent | null, skipPhone = false) => {
      if (e) e.preventDefault();
      const trimmedPhone = phone.trim();

      if (!skipPhone && !trimmedPhone) {
        toast.error(
          ar ? "يرجى إدخال رقم الجوال للمتابعة" : "Please enter your phone number to continue",
        );
        return;
      }

      setLoading(true);
      try {
        const res = await createWalletPass({
          data: {
            slug,
            phone: skipPhone ? undefined : trimmedPhone,
            brandColor: brandHex,
            accentColor: branding.accentHex,
            templateId: business?.template_id,
            offerAr: business?.offer_ar,
            offerEn: business?.offer_en,
          },
        });

        if (res.ok && res.passSerial) {
          const passData: ActivePass = {
            passSerial: res.passSerial,
            currentStamps: res.currentStamps,
            stampsRequired: res.stampsRequired,
            isReturning: res.isReturning,
            customerName: res.customerName,
            customerPhone: res.customerPhone,
            pkpassUrl: res.pkpassUrl ?? undefined,
            rewardUnlocked: res.rewardUnlocked,
            offerAr: res.offerAr,
            offerEn: res.offerEn,
            updatedAt: new Date().toISOString(),
            programType: res.programType,
            points: res.points,
          };

          setActivePass(passData);
          try {
            localStorage.setItem(storageKey, JSON.stringify(passData));
          } catch {
            // LocalStorage fallback
          }

          if (res.isReturning) {
            toast.success(
              ar
                ? `👋 أهلاً بعودتك! رصيدك الحالي: ${res.currentStamps} / ${res.stampsRequired} أختام`
                : `👋 Welcome back! Balance: ${res.currentStamps} / ${res.stampsRequired} stamps`,
            );
          } else {
            toast.success(
              ar
                ? `🎉 تم تفعيل بطاقتك وختمك الترحيبي (1/${res.stampsRequired})!`
                : `🎉 Pass active with your 1st welcome stamp (1/${res.stampsRequired})!`,
            );

            // Instant Wallet navigation for mobile users
            if (res.pkpassUrl) {
              const url = res.pkpassUrl;
              setTimeout(() => {
                window.location.href = url;
              }, 400);
            }
          }
        } else {
          toast.error(
            res.error || (ar ? "تعذر إنشاء أو استرجاع البطاقة" : "Unable to process pass"),
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : ar
              ? "حدث خطأ أثناء التسجيل"
              : "Failed to claim pass",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      ar,
      brandHex,
      branding.accentHex,
      business?.offer_ar,
      business?.offer_en,
      business?.template_id,
      phone,
      slug,
      storageKey,
    ],
  );

  // Manual live balance refresh action (cashier counter sync)
  const handleRefreshBalance = useCallback(async () => {
    if (!activePass?.passSerial) return;
    setRefreshing(true);
    try {
      const res = await refreshCustomerPassStatus({
        data: { slug, passSerial: activePass.passSerial },
      });

      if (res.ok && res.passSerial) {
        const previousStamps = activePass.currentStamps;
        const newStamps = res.currentStamps;

        const updated: ActivePass = {
          ...activePass,
          currentStamps: newStamps,
          stampsRequired: res.stampsRequired,
          rewardUnlocked: res.rewardUnlocked,
          pkpassUrl: res.pkpassUrl ?? activePass.pkpassUrl ?? undefined,
          updatedAt: res.updatedAt ?? undefined,
        };

        setActivePass(updated);
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch {
          // ignore
        }

        if (newStamps > previousStamps) {
          setStampPulsing(true);
          setTimeout(() => setStampPulsing(false), 2400);
          toast.success(
            ar
              ? `🎉 رائع! تم تسجيل ختم جديد (${newStamps}/${res.stampsRequired})!`
              : `🎉 New stamp added! Now ${newStamps}/${res.stampsRequired}!`,
          );
        } else {
          toast.info(ar ? "الرصيد محدث" : "Balance is up to date");
        }
      } else {
        toast.error(res.error || (ar ? "تعذر تحديث الرصيد" : "Unable to refresh balance"));
      }
    } catch {
      toast.error(ar ? "تعذر الاتصال بالخادم" : "Connection failed");
    } finally {
      setRefreshing(false);
    }
  }, [activePass, ar, slug, storageKey]);

  // Copy pass serial to clipboard
  const handleCopySerial = useCallback(() => {
    if (!activePass?.passSerial) return;
    navigator.clipboard
      .writeText(activePass.passSerial)
      .then(() => {
        setCopied(true);
        toast.success(ar ? "تم نسخ كود البطاقة بنجاح" : "Pass code copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error(ar ? "تعذر نسخ الكود" : "Failed to copy code");
      });
  }, [activePass?.passSerial, ar]);

  // Switch account / reset local session
  const handleSwitchAccount = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setActivePass(null);
    setPhone("");
  }, [storageKey]);

  if (businessLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b] text-zinc-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin" style={{ color: brandHex }} />
          <p className="text-sm font-medium text-zinc-400">
            {ar ? "جاري تحميل بطاقة الولاء..." : "Loading loyalty pass..."}
          </p>
        </div>
      </div>
    );
  }

  if (businessError || !business) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b] px-4 text-zinc-100">
        <div className="max-w-md w-full rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-red-500/10 text-red-400">
            !
          </div>
          <h1 className="text-xl font-bold">
            {ar ? "تعذر تحميل برنامج الولاء" : "Loyalty program unavailable"}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{businessError}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      className="min-h-screen bg-[#09090b] text-zinc-100 antialiased relative overflow-x-hidden font-sans"
      style={{
        backgroundImage: `radial-gradient(circle 500px at 50% -80px, ${brandHex}28, transparent 75%)`,
      }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-5 sm:py-6">
        {/* Top Right Language Switcher Only (Clean, Minimal) */}
        <header className="flex items-center justify-end pb-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-xs cursor-pointer"
            aria-label={ar ? "Switch to English" : "التبديل إلى العربية"}
          >
            {ar ? "English" : "العربية"}
          </button>
        </header>

        {/* Main Body */}
        <main className="flex-1 space-y-6">
          {!activePass ? (
            /* PRE-CLAIM: Restaurant Hero, Authentic Wallet Card & Clean Claim Box */
            <div className="space-y-6">
              {/* 1. RESTAURANT IDENTITY HERO (Top & Centered) */}
              <div className="text-center space-y-2 pt-1">
                {/* 64px x 64px Restaurant Avatar / Logo */}
                {business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt={storeName}
                    className="size-16 rounded-2xl object-cover shadow-xl border border-white/10 mx-auto"
                  />
                ) : (
                  <div
                    className="size-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl mx-auto border border-white/15"
                    style={{
                      background: `linear-gradient(135deg, ${brandHex} 0%, #18181b 100%)`,
                    }}
                  >
                    <span>{stampEmoji}</span>
                  </div>
                )}

                {/* Big, Bold Restaurant Name */}
                <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                  {storeName}
                </h1>

                {/* Clean Subtitle */}
                <p className="text-sm font-medium text-zinc-300 max-w-xs mx-auto leading-snug">
                  {ar ? (
                    <>
                      نادي المكافآت • اجمع{" "}
                      <span className="text-white font-bold">{targetStamps} أختام</span> للحصول على:{" "}
                      <span className="text-white font-bold">{storeOffer}</span>
                    </>
                  ) : (
                    <>
                      Rewards Club • Collect{" "}
                      <span className="text-white font-bold">{targetStamps} stamps</span> for:{" "}
                      <span className="text-white font-bold">{storeOffer}</span>
                    </>
                  )}
                </p>
              </div>

              {/* 2. AUTHENTIC RESTAURANT WALLET CARD (Solid Rich Brand Color) */}
              <div
                className="relative overflow-hidden rounded-3xl border border-white/20 p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all"
                style={{
                  background: `linear-gradient(155deg, ${brandHex} 0%, ${brandHex}dd 50%, #121214 100%)`,
                }}
              >
                {/* Card Top Row */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/15">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-xl bg-black/30 border border-white/20 text-lg shadow-inner">
                      {stampEmoji}
                    </span>
                    <span className="text-base font-extrabold text-white tracking-wide">
                      {stampEmoji} {storeName}
                    </span>
                  </div>

                  <div className="rounded-full border border-white/25 bg-black/35 px-3 py-1 shadow-inner text-end">
                    <span className="text-xs font-mono font-extrabold text-white">
                      {ar ? "الأختام: " : "STAMPS: "}
                      <span className="text-amber-200">1 / {targetStamps}</span>
                    </span>
                  </div>
                </div>

                {/* Pro SVG Strip Preview (if pro tier) */}
                {business.templateMeta.tierMode === "pro" && stripSvg ? (
                  <div
                    className="my-3 overflow-hidden rounded-2xl border border-white/20 shadow-inner"
                    dangerouslySetInnerHTML={{ __html: stripSvg }}
                  />
                ) : (
                  /* Card Visual Stamp Area (STAMP PROGRESS) */
                  <div className="my-4 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-white/80">
                      <span>
                        {ar ? `تقدم الأختام ${stampEmoji}` : `STAMP PROGRESS ${stampEmoji}`}
                      </span>
                      <span className="text-white font-bold">
                        {ar ? `باقي ${targetStamps - 1} أختام` : `${targetStamps - 1} stamps left`}
                      </span>
                    </div>

                    {/* Exact Visual Emoji Stamp Row matching Wallet pass */}
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pt-1">
                      {Array.from({ length: targetStamps }).map((_, index) => {
                        const isFirst = index === 0;
                        const isLast = index === targetStamps - 1;

                        if (isFirst) {
                          return (
                            <div
                              key={index}
                              className="relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 border-white bg-white/30 text-2xl shadow-[0_0_20px_rgba(255,255,255,0.4)] animate-pulse"
                            >
                              <span>{stampEmoji}</span>
                              <span className="text-[8px] font-black text-white bg-black/50 px-1.5 py-0.2 rounded-full uppercase tracking-tighter mt-0.5">
                                {ar ? "مجاناً" : "1st FREE"}
                              </span>
                            </div>
                          );
                        }

                        if (isLast) {
                          return (
                            <div
                              key={index}
                              className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-amber-300/60 bg-black/40 text-xl text-amber-200 shadow-inner"
                            >
                              <span>🎁</span>
                              <span className="text-[8px] font-bold text-amber-200">
                                {targetStamps}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={index}
                            className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-white/20 bg-black/25 text-base text-white/60 shadow-inner"
                          >
                            <span>⚪</span>
                            <span className="text-[8px] font-mono text-white/60">{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Card Footer Row */}
                <div className="pt-3 border-t border-white/15 flex items-center justify-between text-xs text-white">
                  <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                    <Gift className="size-3.5 text-amber-300 shrink-0" />
                    <span className="truncate font-bold text-white">{storeOffer}</span>
                  </div>
                  <div className="text-end font-mono text-[11px] text-white/90 shrink-0 font-semibold">
                    <span>
                      {ar ? `باقي ${targetStamps - 1} أختام` : `${targetStamps - 1} stamps left 🎁`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. CLEAN, SEAMLESS CLAIM CARD RIGHT UNDERNEATH */}
              <div className="rounded-3xl border border-white/10 bg-zinc-900/90 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
                <form onSubmit={(e) => handleClaim(e, false)} className="space-y-4">
                  {/* Phone Input with Dynamic Brand Focus */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="phone"
                        className="text-xs font-bold text-zinc-200 flex items-center gap-1.5"
                      >
                        <Phone className="size-3.5" style={{ color: brandHex }} />
                        <span>{ar ? "رقم الجوال" : "Your Mobile Number"}</span>
                      </Label>
                      <span className="text-[11px] font-medium text-zinc-400">
                        {ar ? "يشمل ختم ترحيبي مجاني" : "Includes 1 free welcome stamp"}
                      </span>
                    </div>

                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      placeholder="05XXXXXXXX"
                      value={phone}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[٠-٩]/g, (d) =>
                          String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
                        );
                        setPhone(cleaned);
                      }}
                      className="h-13 text-center text-lg font-mono font-bold tracking-widest bg-zinc-950/90 border-zinc-800 text-white placeholder:text-zinc-600 rounded-2xl shadow-inner focus-visible:ring-2"
                      style={{
                        outlineColor: brandHex,
                      }}
                      autoFocus
                    />
                  </div>

                  {/* Primary CTA Button (Restaurant Brand Colored) */}
                  <Button
                    type="submit"
                    disabled={loading || !phone.trim()}
                    className="h-14 w-full text-base font-extrabold rounded-2xl shadow-xl transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 text-white border-0"
                    style={{
                      backgroundColor: brandHex,
                      boxShadow: `0 8px 25px -4px ${brandHex}60`,
                    }}
                  >
                    {loading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : isAppleDevice ? (
                      <>
                        <Apple className="size-5" />
                        <span>
                          {ar
                            ? `إضافة إلى Apple Wallet (ختمك 1/${targetStamps} جاهز)`
                            : `Add to Apple Wallet (1/${targetStamps} Stamp Ready)`}
                        </span>
                      </>
                    ) : deviceOS === "android" ? (
                      <>
                        <Smartphone className="size-5" />
                        <span>
                          {ar
                            ? `إضافة إلى Google Wallet (ختمك 1/${targetStamps} جاهز)`
                            : `Add to Google Wallet (1/${targetStamps} Stamp Ready)`}
                        </span>
                      </>
                    ) : (
                      <span>
                        {ar
                          ? `إضافة البطاقة واستلام ختمك المجاني الأول ←`
                          : `Add Pass & Claim 1st Free Stamp →`}
                      </span>
                    )}
                  </Button>

                  {/* Subtle Instant Skip Link */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleClaim(null, true)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      {ar
                        ? "أو الإضافة إلى المحفظة مباشرة بدون رقم جوال ←"
                        : "Or add to Wallet without phone number →"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* POST-CLAIM STATE: Restaurant Header, Apple/Google Wallet CTA & Live Web Pass */
            <div className="space-y-6">
              {/* Restaurant Header */}
              <div className="text-center space-y-2 pt-1">
                {business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt={storeName}
                    className="size-16 rounded-2xl object-cover shadow-xl border border-white/10 mx-auto"
                  />
                ) : (
                  <div
                    className="size-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl mx-auto border border-white/15"
                    style={{
                      background: `linear-gradient(135deg, ${brandHex} 0%, #18181b 100%)`,
                    }}
                  >
                    <span>{stampEmoji}</span>
                  </div>
                )}
                <h2 className="text-2xl font-extrabold text-white">{storeName}</h2>
                <p className="text-xs text-zinc-300 font-medium">
                  {activePass.rewardUnlocked
                    ? ar
                      ? "🎉 المكافأة جاهزة للاستبدال لدى الكاشير!"
                      : "🎉 Your reward is ready to redeem at checkout!"
                    : activePass.isReturning
                      ? ar
                        ? `👋 أهلاً بعودتك! رصيدك الحالي: ${activePass.currentStamps} من ${activePass.stampsRequired} أختام.`
                        : `👋 Welcome back! Balance: ${activePass.currentStamps} of ${activePass.stampsRequired} stamps.`
                      : ar
                        ? `تم تفعيل بطاقتك بنجاح! ختمك الترحيبي الأول جاهز (1/${activePass.stampsRequired}).`
                        : `Pass active! Your 1st welcome stamp is ready (1/${activePass.stampsRequired}).`}
                </p>
              </div>

              {/* Prominent Add to Apple / Google Wallet Button */}
              {activePass.pkpassUrl ? (
                <a
                  href={activePass.pkpassUrl}
                  className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black border border-zinc-700 text-white font-bold text-base shadow-xl hover:bg-zinc-900 transition-all active:scale-[0.98]"
                  style={{
                    boxShadow: `0 8px 25px -4px ${brandHex}40`,
                  }}
                >
                  {isAppleDevice ? (
                    <>
                      <Apple className="size-6 text-white group-hover:scale-105 transition-transform" />
                      <span>{ar ? "إضافة إلى Apple Wallet" : "Add to Apple Wallet"}</span>
                    </>
                  ) : (
                    <>
                      <Smartphone className="size-6 text-white group-hover:scale-105 transition-transform" />
                      <span>{ar ? "إضافة إلى Google Wallet" : "Add to Google Wallet"}</span>
                    </>
                  )}
                </a>
              ) : null}

              {/* Built-in Live Web Pass Card */}
              <div
                className={`relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-5 text-center transition-all ${
                  stampPulsing ? "ring-4 shadow-xl" : ""
                }`}
                style={
                  stampPulsing
                    ? {
                        boxShadow: `0 0 0 4px ${brandHex}88`,
                      }
                    : undefined
                }
              >
                {/* Store Top Bar */}
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
                  <div className="flex items-center gap-2.5 text-start">
                    <span
                      className="grid size-10 place-items-center rounded-xl text-xl shadow-xs"
                      style={{ backgroundColor: `${brandHex}33` }}
                    >
                      {stampEmoji}
                    </span>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">{storeName}</h3>
                      <p className="text-[11px] text-zinc-400">{storeOffer}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRefreshBalance}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
                    title={ar ? "تحديث الرصيد" : "Refresh balance"}
                  >
                    <RefreshCw
                      className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                      style={{ color: brandHex }}
                    />
                    <span>{ar ? "تحديث" : "Refresh"}</span>
                  </button>
                </div>

                {/* Live Stamp Progress Grid */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-3">
                    <span className="font-bold text-zinc-200">
                      {ar ? "رصيد الأختام الحالي" : "Current Stamp Balance"}
                    </span>
                    <span className="font-mono font-extrabold text-sm" style={{ color: brandHex }}>
                      {activePass.currentStamps} / {activePass.stampsRequired}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                    {Array.from({ length: activePass.stampsRequired }).map((_, i) => {
                      const isEarned = i < activePass.currentStamps;
                      const isLast = i === activePass.stampsRequired - 1;

                      if (isEarned) {
                        return (
                          <div
                            key={i}
                            className="flex aspect-square flex-col items-center justify-center rounded-2xl border text-lg transition-all text-white shadow-md"
                            style={{
                              backgroundColor: brandHex,
                              borderColor: brandHex,
                            }}
                          >
                            <span>{stampEmoji}</span>
                            <span className="text-[9px] font-bold text-white/90">{i + 1}</span>
                          </div>
                        );
                      }

                      if (isLast) {
                        return (
                          <div
                            key={i}
                            className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-lg text-amber-300"
                          >
                            <span>🎁</span>
                            <span className="text-[9px] font-bold text-amber-400">
                              {activePass.stampsRequired}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={i}
                          className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/70 text-sm text-zinc-600"
                        >
                          <span>⚪</span>
                          <span className="text-[9px] font-mono text-zinc-600">{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 text-center">
                    {activePass.rewardUnlocked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300">
                        <Gift className="size-3.5" />
                        {ar
                          ? "مكافأتك مستحقة الآن! اعرض الرمز للكاشير"
                          : "Reward unlocked! Show code to cashier"}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">
                        {ar
                          ? `باقي ${Math.max(
                              0,
                              activePass.stampsRequired - activePass.currentStamps,
                            )} أختام للحصول على المكافأة`
                          : `${Math.max(
                              0,
                              activePass.stampsRequired - activePass.currentStamps,
                            )} stamps left until reward`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Scannable High-Contrast QR Code */}
                <div className="space-y-2 pt-1">
                  <div className="inline-block rounded-3xl bg-white p-3.5 shadow-xl">
                    <LocalQrCode text={activePass.passSerial} size={200} />
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">
                    {ar
                      ? "امسح هذا الرمز لدى الكاشير لتسجيل الأختام فوراً"
                      : "Scan this QR code at checkout to earn stamps"}
                  </p>
                </div>

                {/* Monospace PASS CODE Pill with 1-Tap Copy */}
                <div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 max-w-xs mx-auto">
                    <div className="text-start">
                      <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                        {ar ? "كود البطاقة" : "PASS CODE"}
                      </span>
                      <span className="font-mono text-sm font-bold text-white tracking-wider">
                        {activePass.passSerial}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopySerial}
                      className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3.5" style={{ color: brandHex }} />
                          <span style={{ color: brandHex }}>{ar ? "تم" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>{ar ? "نسخ" : "Copy"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live Refresh Balance Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefreshBalance}
                  disabled={refreshing}
                  className="w-full h-11 rounded-xl border-zinc-800 bg-zinc-950 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white cursor-pointer"
                >
                  <RefreshCw
                    className={`me-2 size-3.5 ${refreshing ? "animate-spin" : ""}`}
                    style={{ color: brandHex }}
                  />
                  {ar ? "تحديث الرصيد الآن ↻" : "Refresh Balance Now ↻"}
                </Button>
              </div>

              {/* Switch Number / Account Link */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4 transition-colors cursor-pointer"
                >
                  {ar
                    ? "لست أنت؟ تسجيل برقم جوال آخر"
                    : "Not you? Switch account / use another number"}
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Minimal Footer */}
        <footer className="mt-auto pt-6 pb-2 text-center text-xs text-zinc-600 font-medium">
          <p>
            Powered by <span className="text-zinc-400 font-semibold">PointPass</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
