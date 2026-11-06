import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Apple,
  Check,
  Copy,
  Gift,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { resolveSlugFromHost } from "@/lib/supabase";
import {
  createWalletPass,
  getPublicBusinessBySlug,
  refreshCustomerPassStatus,
} from "@/lib/wallet.functions";
import { type StripStyle, type WalletColorPreset, type WalletTierMode } from "@/lib/wallet-tier";
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
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activePass, setActivePass] = useState<ActivePass | null>(null);
  const [copied, setCopied] = useState(false);
  const [stampPulsing, setStampPulsing] = useState(false);

  // Detect user device OS: iOS / Safari vs Android vs Desktop
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

  // Color theme & visual properties
  const brandHex = business?.templateMeta?.brandHex || business?.brand_color || "#18181b";
  const accentHex = business?.templateMeta?.accentHex || business?.accent_color || "#10B981";
  const stampEmoji = business?.templateMeta?.stampEmoji || "⭐";
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
        accentColor: accentHex,
        stampIcon: business.templateMeta.stampIcon,
        stripStyle: business.templateMeta.stripStyle,
      });
    } catch {
      return "";
    }
  }, [activePass, business, brandHex, accentHex]);

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
            customerName: name.trim() || undefined,
            brandColor: business?.brand_color,
            accentColor: business?.accent_color,
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
      business?.accent_color,
      business?.brand_color,
      business?.offer_ar,
      business?.offer_en,
      business?.template_id,
      name,
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
    setName("");
  }, [storageKey]);

  if (businessLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090b] text-zinc-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-emerald-400" />
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
      className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-emerald-500 selection:text-black antialiased relative overflow-x-hidden font-sans"
      style={{
        backgroundImage: `radial-gradient(circle 500px at 50% -50px, ${accentHex}18, transparent 75%)`,
      }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-5 sm:py-7">
        {/* A. TOP BAR (Clean, Authentic Trust — No Fake Domains!) */}
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-3.5">
          {/* Left: Official Loyalty Club Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-400 shadow-xs backdrop-blur-md">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <ShieldCheck className="size-3.5" />
            <span>{ar ? "برنامج الولاء الرسمي" : "Official Loyalty Club"}</span>
          </div>

          {/* Right: 1-Tap Bilingual Toggle */}
          <button
            type="button"
            onClick={toggle}
            className="rounded-full border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-xs cursor-pointer"
            aria-label={ar ? "Switch to English" : "التبديل إلى العربية"}
          >
            {ar ? "English" : "العربية"}
          </button>
        </header>

        {/* Main Body */}
        <main className="mt-5 flex-1 space-y-5">
          {!activePass ? (
            /* PRE-CLAIM STATE: Hero Value Hook, Lifelike Card, 3-Step Micro Explainer & Unified Claim Box */
            <div className="space-y-5">
              {/* B. HERO VALUE PROPOSITION (Above the Fold Sales Hook) */}
              <div className="text-center space-y-2.5 pt-1">
                {/* Store Identity Badge */}
                <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/80 px-3.5 py-1.5 shadow-inner">
                  {business.logo_url ? (
                    <img
                      src={business.logo_url}
                      alt={storeName}
                      className="size-5 rounded-md object-cover"
                    />
                  ) : (
                    <span className="text-base">{stampEmoji}</span>
                  )}
                  <span className="text-xs font-bold text-zinc-200">{storeName}</span>
                </div>

                {/* Punchy Reward Headline */}
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                  {ar ? (
                    <>
                      احصل على مكافأتك المجانية:{" "}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
                        {storeOffer}
                      </span>
                    </>
                  ) : (
                    <>
                      Unlock Your Free Reward:{" "}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
                        {storeOffer}
                      </span>
                    </>
                  )}
                </h1>

                {/* Glowing Welcome Gift Pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                  <Sparkles className="size-3.5 text-amber-400" />
                  <span>
                    {ar
                      ? `🎁 هدية الترحيب: ختمك الأول (1/${targetStamps}) مجاناً عند الإضافة الآن!`
                      : `🎁 BONUS: Your 1st Stamp (1/${targetStamps}) is FREE when you join today!`}
                  </span>
                </div>
              </div>

              {/* C. CENTERPIECE: LIFELIKE VISUAL WALLET CARD PREVIEW */}
              <div
                className="relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all"
                style={{
                  background: `linear-gradient(145deg, ${brandHex} 0%, #121214 90%)`,
                }}
              >
                {/* Ambient Top Light */}
                <div
                  className="pointer-events-none absolute -top-20 -right-20 size-44 rounded-full blur-3xl opacity-35"
                  style={{ backgroundColor: accentHex }}
                />

                {/* Card Top Row: Logo & Stamps Counter Badge */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    {business.logo_url ? (
                      <img
                        src={business.logo_url}
                        alt={storeName}
                        className="size-10 rounded-xl object-cover border border-white/20 bg-black/40 shadow-xs"
                      />
                    ) : (
                      <span className="grid size-10 place-items-center rounded-xl border border-white/20 bg-black/40 text-xl shadow-xs">
                        {stampEmoji}
                      </span>
                    )}
                    <div>
                      <span className="text-sm font-extrabold text-white tracking-wide block leading-tight">
                        {stampEmoji} {storeName}
                      </span>
                      <span className="text-[10px] text-white/70 uppercase tracking-wider font-mono">
                        {ar ? "بطاقة الولاء الرسمية" : "Official Pass"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-full border border-white/20 bg-black/40 px-3 py-1 shadow-inner text-end">
                    <span className="text-xs font-mono font-extrabold text-white">
                      {ar ? "الأختام: " : "STAMPS: "}
                      <span className="text-emerald-300">1 / {targetStamps}</span>
                    </span>
                  </div>
                </div>

                {/* Pro SVG Strip Preview (if pro tier) */}
                {business.templateMeta.tierMode === "pro" && stripSvg ? (
                  <div
                    className="my-3 overflow-hidden rounded-2xl border border-white/15 shadow-inner"
                    dangerouslySetInnerHTML={{ __html: stripSvg }}
                  />
                ) : (
                  /* Visual Progress Section (STAMP PROGRESS) */
                  <div className="my-4 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-white/70">
                      <span>
                        {ar ? `تقدم الأختام ${stampEmoji}` : `STAMP PROGRESS ${stampEmoji}`}
                      </span>
                      <span className="text-emerald-300 font-bold">
                        {ar
                          ? `باقي ${targetStamps - 1} أختام للمكافأة`
                          : `${targetStamps - 1} left for reward`}
                      </span>
                    </div>

                    {/* Exact Visual Emoji Stamp Grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 pt-1">
                      {Array.from({ length: targetStamps }).map((_, index) => {
                        const isFirst = index === 0;
                        const isLast = index === targetStamps - 1;

                        if (isFirst) {
                          return (
                            <div
                              key={index}
                              className="relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 border-emerald-400 bg-emerald-500/30 text-xl shadow-[0_0_18px_rgba(16,185,129,0.4)] animate-pulse"
                            >
                              <span>{stampEmoji}</span>
                              <span className="text-[8px] font-extrabold text-emerald-200 tracking-tighter">
                                {ar ? "مجاناً!" : "FREE!"}
                              </span>
                            </div>
                          );
                        }

                        if (isLast) {
                          return (
                            <div
                              key={index}
                              className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-amber-400/50 bg-black/40 text-xl text-amber-300 shadow-inner"
                            >
                              <span>🎁</span>
                              <span className="text-[8px] font-bold text-amber-300">
                                {targetStamps}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={index}
                            className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/30 text-base text-white/50 shadow-inner"
                          >
                            <span>⚪</span>
                            <span className="text-[8px] font-mono text-white/40">{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Card Bottom Row: Reward & Remaining */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white">
                  <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                    <Gift className="size-3.5 text-amber-300 shrink-0" />
                    <span className="truncate font-semibold text-white/95">{storeOffer}</span>
                  </div>
                  <div className="text-end font-mono text-[11px] text-white/80 shrink-0">
                    <span>
                      {ar ? `باقي ${targetStamps - 1} 🎁` : `${targetStamps - 1} to unlock 🎁`}
                    </span>
                  </div>
                </div>
              </div>

              {/* D. 3-STEP MICRO EXPLAINER (Why & How It Works in 2 Seconds) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-start">
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 shadow-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">📲</span>
                    <span className="text-xs font-bold text-zinc-200">
                      {ar ? "بدون تطبيق" : "No App Download"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-tight">
                    {ar
                      ? "تُحفظ مباشرة في محفظة آبل أو جوجل بضغطة واحدة."
                      : "Saves directly to Apple Wallet or Google Wallet in 1 tap."}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 shadow-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">⚡</span>
                    <span className="text-xs font-bold text-zinc-200">
                      {ar ? "مسح في ثانية" : "1-Second Scan"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-tight">
                    {ar
                      ? "اعرض بطاقتك أو اذكر رقم جوالك لدى الكاشير لجمع الأختام."
                      : "Show pass or give phone number at cashier to collect stamps."}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 shadow-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">🎁</span>
                    <span className="text-xs font-bold text-zinc-200">
                      {ar ? "مكافأة فورية" : "Instant Rewards"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-tight">
                    {ar
                      ? `اجمع ${targetStamps} أختام واستلم ${storeOffer} تلقائياً.`
                      : `Collect ${targetStamps} stamps and claim your reward automatically.`}
                  </p>
                </div>
              </div>

              {/* E. UNIFIED, SINGLE-ACTION CLAIM BOX */}
              <div className="rounded-3xl border border-zinc-800/90 bg-zinc-900/90 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
                <form onSubmit={(e) => handleClaim(e, false)} className="space-y-4">
                  {/* Phone Input with Phone Icon & Reassuring Helper */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="phone"
                        className="text-xs font-bold text-zinc-200 flex items-center gap-1.5"
                      >
                        <Phone className="size-3.5 text-emerald-400" />
                        <span>{ar ? "رقم الجوال لتثبيت رصيدك" : "Mobile Number"}</span>
                      </Label>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {ar ? "مطلوب للمزامنة" : "Required for backup"}
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
                        // Live Arabic-Indic numerals conversion (٠-٩ -> 0-9)
                        const cleaned = e.target.value.replace(/[٠-٩]/g, (d) =>
                          String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
                        );
                        setPhone(cleaned);
                      }}
                      className="h-13 text-center text-lg font-mono font-bold tracking-widest bg-zinc-950/90 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-emerald-500 rounded-2xl shadow-inner"
                      autoFocus
                    />

                    <p className="text-[11px] text-zinc-400 leading-relaxed pt-0.5">
                      {ar
                        ? "أدخل رقم جوالك لحفظ ختمك المجاني الأول وضمان عدم ضياع نقاطك."
                        : "Enter your mobile number to lock in your 1st free stamp & never lose your points."}
                    </p>
                  </div>

                  {/* Optional Compact Name Input */}
                  <div className="space-y-1">
                    <Label htmlFor="name" className="text-xs font-medium text-zinc-400">
                      {ar ? "الاسم (اختياري)" : "Your Name (Optional)"}
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder={ar ? "مثال: محمد" : "e.g. Alex"}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10 bg-zinc-950/80 border-zinc-800 text-white placeholder:text-zinc-600 rounded-xl text-xs"
                    />
                  </div>

                  {/* ONE UNMISTAKABLE PRIMARY CTA BUTTON */}
                  <Button
                    type="submit"
                    disabled={loading || !phone.trim()}
                    className="h-14 w-full text-base font-extrabold rounded-2xl shadow-xl transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: accentHex,
                      color: "#09090b",
                      boxShadow: `0 0 25px ${accentHex}40`,
                    }}
                  >
                    {loading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : isAppleDevice ? (
                      <>
                        <Apple className="size-5" />
                        <span>
                          {ar
                            ? `إضافة إلى Apple Wallet وتفعيل ختمك الأول (1/${targetStamps})`
                            : `Add to Apple Wallet & Claim 1st Stamp (1/${targetStamps})`}
                        </span>
                      </>
                    ) : deviceOS === "android" ? (
                      <>
                        <Smartphone className="size-5" />
                        <span>
                          {ar
                            ? `إضافة إلى Google Wallet وتفعيل ختمك الأول (1/${targetStamps})`
                            : `Add to Google Wallet & Claim 1st Stamp (1/${targetStamps})`}
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-5" />
                        <span>
                          {ar
                            ? `استلام بطاقتي وختمي المجاني الأول (1/${targetStamps}) ←`
                            : `Claim My Card & 1st Free Stamp (1/${targetStamps}) →`}
                        </span>
                      </>
                    )}
                  </Button>

                  {/* Subtle 1-Click Anonymous Skip Link */}
                  <div className="text-center pt-0.5">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleClaim(null, true)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      {ar
                        ? "تخطي حفظ الرقم — إضافة البطاقة فوراً ←"
                        : "Skip phone backup — add pass instantly →"}
                    </button>
                  </div>

                  {/* Trust Micro-Copy */}
                  <p className="text-center text-[11px] font-medium text-zinc-400 border-t border-zinc-800/60 pt-3">
                    {ar
                      ? "🔒 مجاني 100% • بدون تحميل تطبيق • يعمل مع محفظة آبل وجوجل"
                      : "🔒 100% Free • No app required • Works in Apple & Google Wallet"}
                  </p>
                </form>
              </div>
            </div>
          ) : (
            /* POST-CLAIM STATE: Celebration Banner, Apple/Google Wallet CTA & Built-In Web Pass */
            <div className="space-y-5">
              {/* Celebration Banner */}
              <div
                className={`rounded-3xl border p-5 text-center shadow-xl backdrop-blur-xl transition-all ${
                  activePass.rewardUnlocked
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-amber-500/10"
                    : activePass.isReturning
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-emerald-500/10"
                      : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-emerald-500/15"
                }`}
              >
                <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-zinc-950/80 border border-zinc-800 text-2xl">
                  {activePass.rewardUnlocked ? "🎁" : activePass.isReturning ? "👋" : "🎉"}
                </div>
                <h2 className="text-lg font-extrabold text-white">
                  {activePass.rewardUnlocked
                    ? ar
                      ? "المكافأة جاهزة للاستبدال!"
                      : "REWARD READY TO REDEEM!"
                    : activePass.isReturning
                      ? ar
                        ? "أهلاً بعودتك!"
                        : "Welcome Back!"
                      : ar
                        ? `تم تفعيل ختمك الترحيبي بنجاح! (1/${activePass.stampsRequired})`
                        : `Welcome Stamp Unlocked! (1/${activePass.stampsRequired})`}
                </h2>
                <p className="mt-1 text-xs text-zinc-300">
                  {activePass.rewardUnlocked
                    ? ar
                      ? "اعرض هذه البطاقة أو الرمز أدناه للكاشير لاستلام مكافأتك فوراً."
                      : "Show this pass or QR code below to the cashier to claim your reward."
                    : activePass.isReturning
                      ? ar
                        ? `رصيدك الحالي: ${activePass.currentStamps} من ${activePass.stampsRequired} أختام.`
                        : `Current Balance: ${activePass.currentStamps} / ${activePass.stampsRequired} stamps.`
                      : ar
                        ? `لديك الآن 1 من ${activePass.stampsRequired} أختام في برنامج ${storeName}.`
                        : `You now have 1 of ${activePass.stampsRequired} stamps for ${storeName}.`}
                </p>
              </div>

              {/* Prominent Add to Apple / Google Wallet Button */}
              {activePass.pkpassUrl ? (
                <a
                  href={activePass.pkpassUrl}
                  className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black border border-zinc-700/80 text-white font-bold text-base shadow-xl hover:bg-zinc-900 transition-all active:scale-[0.98]"
                  style={{
                    boxShadow: `0 0 25px ${accentHex}30, 0 4px 20px rgba(0,0,0,0.5)`,
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
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  <span>
                    {ar
                      ? "البطاقة الرقمية نشطة — جاهزة للمسح أدناه"
                      : "Web Pass Active — Ready to Scan Below"}
                  </span>
                </div>
              )}

              {/* Built-in Live Web Pass Card (Android & Universal Scannable Pass) */}
              <div
                className={`relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-5 text-center transition-all ${
                  stampPulsing ? "ring-4 ring-emerald-500/40 shadow-emerald-500/20" : ""
                }`}
              >
                {/* Store Branding Inside Web Pass */}
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3.5">
                  <div className="flex items-center gap-2.5 text-start">
                    <span className="grid size-10 place-items-center rounded-xl bg-zinc-950 border border-zinc-800 text-xl">
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
                      className={`size-3.5 text-emerald-400 ${refreshing ? "animate-spin" : ""}`}
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
                    <span className="font-mono font-extrabold text-sm" style={{ color: accentHex }}>
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
                            className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-emerald-400/80 bg-emerald-500/25 text-lg shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-all"
                          >
                            <span>{stampEmoji}</span>
                            <span className="text-[9px] font-bold text-emerald-300">{i + 1}</span>
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
                <div className="space-y-2.5 pt-1">
                  <div className="inline-block rounded-3xl bg-white p-3.5 shadow-xl">
                    <LocalQrCode text={activePass.passSerial} size={210} />
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
                          <Check className="size-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{ar ? "تم" : "Copied"}</span>
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
                    className={`me-2 size-3.5 text-emerald-400 ${refreshing ? "animate-spin" : ""}`}
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

        {/* F. FOOTER: PointPass Branding */}
        <footer className="mt-auto pt-6 pb-3 text-center text-xs text-zinc-500 font-medium">
          <p>
            {ar ? "مدعوم بواسطة " : "Powered by "}
            <span className="font-bold text-zinc-300">PointPass</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
