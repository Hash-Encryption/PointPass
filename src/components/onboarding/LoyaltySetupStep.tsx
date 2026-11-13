import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Palette, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n";
import { type ProgramType } from "@/constants/defaultTemplates";
import { PassPreview } from "@/components/PassPreview";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";
import {
  FREE_TIER_PRESETS,
  getStoredWalletTier,
  nearestFreeColorPreset,
  serializePassTemplateMeta,
  WALLET_COLOR_PRESETS,
  STRIP_STYLES,
  type FreeColorPresetKey,
  type PassTierMode,
  type StampIconKey,
  type StripStyle,
  type StripStyleKey,
  type WalletColorPreset,
  type WalletTierMode,
} from "@/lib/wallet-tier";

export interface CuratedTemplate {
  id: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  pillIcon: string;
  background: string;
  accent: string;
  colorPreset: WalletColorPreset;
  targetStamps: number;
  rewardAr: string;
  rewardEn: string;
}

export interface LoyaltySetupValues {
  businessNameEn: string;
  businessNameAr: string;
  stampsRequired: number;
  rewardNameEn: string;
  rewardNameAr: string;
  stampIcon: StampIconKey;
  stripStyle: StripStyleKey;
  colorPreset: FreeColorPresetKey;
  tierMode: PassTierMode;
  brandColor: string;
  baseTemplateId: string;
}

export const CURATED_TEMPLATES: CuratedTemplate[] = [
  {
    id: "blank",
    labelAr: "من الصفر",
    labelEn: "Blank Slate",
    icon: "⭐",
    pillIcon: "🎨",
    background: "#065F46",
    accent: "#10B981",
    colorPreset: "green",
    targetStamps: 8,
    rewardAr: "مكافأة خاصة بعد 8 زيارات 🎁",
    rewardEn: "Special reward after 8 visits 🎁",
  },
  {
    id: "coffee",
    labelAr: "مقهى ومحمصة",
    labelEn: "Specialty Coffee",
    icon: "☕",
    pillIcon: "☕",
    background: "#1A1412",
    accent: "#D97706",
    colorPreset: "orange",
    targetStamps: 7,
    rewardAr: "قهوة مجانية من اختيارك ☕",
    rewardEn: "Free handcrafted coffee ☕",
  },
  {
    id: "burger",
    labelAr: "مطاعم وبرجر",
    labelEn: "Burger & Bistro",
    icon: "🍔",
    pillIcon: "🍔",
    background: "#18181B",
    accent: "#EF4444",
    colorPreset: "red",
    targetStamps: 5,
    rewardAr: "وجبة برجر مجانية من اختيارك 🍔",
    rewardEn: "Free burger meal of your choice 🍔",
  },
  {
    id: "bakery",
    labelAr: "مخبز وحلويات",
    labelEn: "Bakery & Sweets",
    icon: "🥐",
    pillIcon: "🥐",
    background: "#26201E",
    accent: "#F59E0B",
    colorPreset: "orange",
    targetStamps: 6,
    rewardAr: "قطعة حلى أو مخبوزات مجانية 🥐",
    rewardEn: "Free pastry or dessert box 🥐",
  },
  {
    id: "salon",
    labelAr: "صالون وعناية",
    labelEn: "Salon & Grooming",
    icon: "✂️",
    pillIcon: "✂️",
    background: "#0F172A",
    accent: "#8B5CF6",
    colorPreset: "purple",
    targetStamps: 5,
    rewardAr: "جلسة عناية أو حلاقة مجانية ✂️",
    rewardEn: "Free grooming or beauty session ✂️",
  },
  {
    id: "carwash",
    labelAr: "غسيل سيارات",
    labelEn: "Car Wash",
    icon: "🚗",
    pillIcon: "🚗",
    background: "#082F49",
    accent: "#06B6D4",
    colorPreset: "blue",
    targetStamps: 5,
    rewardAr: "غسيل سيارة مجاني شامل 🚗",
    rewardEn: "Free complete car wash 🚗",
  },
];

const STAMP_COUNTS = [5, 6, 7, 8, 10];
const STAMP_ICONS = ["⭐", "☕", "🍔", "🥐", "✂️", "🚗", "🎁"];

interface LoyaltySetupStepProps {
  businessId?: string;
  businessNameAr?: string;
  businessNameEn?: string;
  initialProgram?: ProgramType;
  initialBrandColor?: string;
  initialAccentColor?: string;
  initialTargetStamps?: number;
  initialStampIcon?: string;
  onSuccess?: (config: {
    program: ProgramType;
    brandColor: string;
    accentColor: string;
    targetStamps: number;
    stampIcon: string;
    suggestedRewardAr: string;
    suggestedRewardEn: string;
  }) => void;
  onBack?: () => void;
  values?: LoyaltySetupValues;
  onChange?: (next: Partial<LoyaltySetupValues>) => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}

export function LoyaltySetupStep({
  businessId,
  businessNameAr = "",
  businessNameEn = "",
  initialProgram = "stamp",
  initialBrandColor = "#121214",
  initialAccentColor = "#10B981",
  initialTargetStamps = 8,
  initialStampIcon = "⭐",
  onSuccess,
  onBack,
  values,
  onChange,
  onSubmit,
  isSubmitting = false,
  errorMessage = null,
}: LoyaltySetupStepProps) {
  const { locale } = useLocale();
  const ar = locale === "ar";

  const [tierMode, setTierMode] = useState<WalletTierMode>(
    () => values?.tierMode ?? getStoredWalletTier(),
  );
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    () => values?.baseTemplateId ?? "blank",
  );
  const [program] = useState<ProgramType>(initialProgram);
  const [brandColor, setBrandColor] = useState(() => values?.brandColor ?? initialBrandColor);
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [colorPreset, setColorPreset] = useState<WalletColorPreset>(
    () => values?.colorPreset ?? "green",
  );
  const [stripStyle, setStripStyle] = useState<StripStyle>(() => values?.stripStyle ?? "pizzatown");
  const [targetStamps, setTargetStamps] = useState(
    () => values?.stampsRequired ?? initialTargetStamps,
  );
  const [stampIcon, setStampIcon] = useState(() => values?.stampIcon ?? initialStampIcon);
  const [suggestedRewardAr, setSuggestedRewardAr] = useState(
    () => values?.rewardNameAr ?? "مكافأة خاصة بعد 8 زيارات 🎁",
  );
  const [suggestedRewardEn, setSuggestedRewardEn] = useState(
    () => values?.rewardNameEn ?? "Special reward after 8 visits 🎁",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onTierChange(e: Event) {
      const custom = e as CustomEvent<WalletTierMode>;
      if (custom.detail) setTierMode(custom.detail);
    }
    window.addEventListener("pointpass:tier-change", onTierChange);
    return () => window.removeEventListener("pointpass:tier-change", onTierChange);
  }, []);

  function handlePresetSelect(presetKey: FreeColorPresetKey) {
    const presetHex = FREE_TIER_PRESETS[presetKey];
    setColorPreset(presetKey);
    setBrandColor(presetHex);
    setActiveTemplateId("custom");
    onChange?.({
      colorPreset: presetKey,
      brandColor: presetHex,
    });
  }

  function handleCustomHexChange(hexInput: string) {
    const fallbackPreset = nearestFreeColorPreset(hexInput);
    setBrandColor(hexInput);
    setColorPreset(fallbackPreset);
    setActiveTemplateId("custom");
    onChange?.({
      brandColor: hexInput,
      colorPreset: fallbackPreset,
    });
  }

  function handleTierModeToggle(mode: PassTierMode) {
    if (mode === "free") {
      const syncedPreset = nearestFreeColorPreset(brandColor);
      setTierMode("free");
      setColorPreset(syncedPreset);
      setBrandColor(FREE_TIER_PRESETS[syncedPreset]);
      onChange?.({
        tierMode: "free",
        colorPreset: syncedPreset,
        brandColor: FREE_TIER_PRESETS[syncedPreset],
      });
    } else {
      setTierMode("pro");
      const fallbackPreset = nearestFreeColorPreset(brandColor);
      setColorPreset(fallbackPreset);
      onChange?.({
        tierMode: "pro",
        colorPreset: fallbackPreset,
      });
    }
  }

  function applyTemplate(tpl: CuratedTemplate) {
    setActiveTemplateId(tpl.id);
    setBrandColor(tpl.background);
    setAccentColor(tpl.accent);
    setColorPreset(tpl.colorPreset);
    setTargetStamps(tpl.targetStamps);
    setStampIcon(tpl.icon);
    setSuggestedRewardAr(tpl.rewardAr);
    setSuggestedRewardEn(tpl.rewardEn);
    onChange?.({
      baseTemplateId: tpl.id,
      brandColor: tpl.background,
      colorPreset: tpl.colorPreset,
      stampsRequired: tpl.targetStamps,
      stampIcon: tpl.icon,
      rewardNameAr: tpl.rewardAr,
      rewardNameEn: tpl.rewardEn,
    });
  }

  async function handleContinue() {
    if (onSubmit) {
      onSubmit();
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error(
          ar ? "انتهت الجلسة. يرجى تسجيل الدخول مجدداً." : "Session expired. Sign in again.",
        );
      }

      const resolvedColorPreset: FreeColorPresetKey =
        tierMode === "free" ? colorPreset : nearestFreeColorPreset(brandColor);

      const effectiveBrandColor =
        tierMode === "free"
          ? FREE_TIER_PRESETS[resolvedColorPreset]
          : brandColor || FREE_TIER_PRESETS[resolvedColorPreset];

      const effectiveAccentColor =
        tierMode === "free"
          ? WALLET_COLOR_PRESETS[resolvedColorPreset]?.accent || "#10B981"
          : accentColor;

      // Cross-device template metadata persistence inside template_id
      const metaString = serializePassTemplateMeta({
        baseId: activeTemplateId,
        stampIcon,
        stripStyle,
        colorPreset: resolvedColorPreset,
        tierMode,
        brandColor: effectiveBrandColor,
      });

      if (businessId) {
        await saveOnboardingStepFn({
          data: {
            accessToken: session.access_token,
            businessId,
            step: "loyalty",
            programType: program,
            brandColor: effectiveBrandColor,
            accentColor: effectiveAccentColor,
            targetStamps,
            templateId: metaString,
            offerAr: suggestedRewardAr,
            offerEn: suggestedRewardEn,
          },
        });

        try {
          await supabase
            .from("businesses")
            .update({
              template_id: metaString,
              offer_ar: suggestedRewardAr,
              offer_en: suggestedRewardEn,
            })
            .eq("id", businessId);
        } catch (err) {
          console.warn("Template meta persistence note:", err);
        }
      }

      toast.success(ar ? "تم حفظ تصميم البطاقة بنجاح!" : "Pass design saved!");
      onSuccess?.({
        program,
        brandColor: effectiveBrandColor,
        accentColor: effectiveAccentColor,
        targetStamps,
        stampIcon,
        suggestedRewardAr,
        suggestedRewardEn,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const isFree = tierMode === "free";
  const effectiveBg = isFree ? FREE_TIER_PRESETS[colorPreset] : brandColor;
  const effectiveAccent = isFree ? WALLET_COLOR_PRESETS[colorPreset].accent : accentColor;
  const ArrowIcon = ar ? ArrowLeft : ArrowRight;
  const effectiveBusinessNameAr = values?.businessNameAr || businessNameAr;
  const effectiveBusinessNameEn = values?.businessNameEn || businessNameEn;

  return (
    <div className="space-y-6">
      {/* Unified Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 text-emerald-400 flex items-center justify-center shrink-0">
            <Palette className="size-5.5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {ar ? "استوديو تصميم البطاقة" : "Card Design Studio"}
            </h2>
            <p className="text-xs text-zinc-400">
              {ar
                ? "اختر قالباً جاهزاً أو خصص ألوان البطاقة وعدد الأختام بضغطة واحدة."
                : "Choose a curated template or customize your card colors & stamps."}
            </p>
          </div>
        </div>

        {/* Tier Mode Selector (Simple Free vs Pro Studio) */}
        <div className="inline-flex rounded-xl bg-zinc-900 border border-zinc-800 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleTierModeToggle("free")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              isFree ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {ar ? "بسيط (مجاني)" : "Simple (Free)"}
          </button>
          <button
            type="button"
            onClick={() => handleTierModeToggle("pro")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              !isFree
                ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {ar ? "استوديو برو ✨" : "Pro Studio ✨"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl bg-red-950/50 border border-red-500/30 px-4 py-3 text-xs font-medium text-red-300">
          {errorMessage}
        </div>
      )}

      {/* MOBILE ONLY: Sticky Live Pass Preview */}
      <div className="lg:hidden sticky top-14 z-20 bg-zinc-950/95 backdrop-blur-md pt-2 pb-4 -mx-5 px-5 border-b border-zinc-800/80 shadow-xl">
        <div className="max-w-xs mx-auto">
          <PassPreview
            locale={locale}
            showToggle={false}
            onSelectStamps={(newStamps) => {
              setTargetStamps(newStamps);
              onChange?.({ stampsRequired: newStamps });
            }}
            design={{
              businessName: effectiveBusinessNameAr,
              businessNameEn: effectiveBusinessNameEn,
              logoUrl: null,
              background: effectiveBg,
              accent: effectiveAccent,
              headline: ar ? suggestedRewardAr : suggestedRewardEn,
              headlineEn: suggestedRewardEn,
              subline: ar ? "شكراً لولائك" : "Thanks for your loyalty",
              sublineEn: "Thanks for your loyalty",
              program,
              targetStamps,
              sarPerPoint: 10,
              pointsPerReward: 100,
              progress: 1,
              stampIcon,
              stripStyle,
              tierMode,
              colorPreset,
            }}
          />
        </div>
      </div>

      {/* 1. Curated Industry Templates */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="size-3 text-emerald-400" />
            <span>{ar ? "نماذج جاهزة حسب نشاطك" : "Curated Templates by Industry"}</span>
          </Label>
          <span className="text-[11px] text-zinc-500 font-mono">
            {CURATED_TEMPLATES.find((t) => t.id === activeTemplateId)?.[
              ar ? "labelAr" : "labelEn"
            ] || (ar ? "مخصص" : "Custom")}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CURATED_TEMPLATES.map((tpl) => {
            const isActive = activeTemplateId === tpl.id;
            return (
              <button
                type="button"
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 sm:p-3 text-start transition-all ${
                  isActive
                    ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60"
                }`}
              >
                <span className="grid size-9 place-items-center rounded-xl bg-zinc-900 border border-zinc-800 text-base shrink-0 shadow-xs">
                  {tpl.pillIcon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">
                    {ar ? tpl.labelAr : tpl.labelEn}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: tpl.background }}
                    />
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: tpl.accent }}
                    />
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {tpl.targetStamps} {ar ? "أختام" : "stamps"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Area: Controls on Left, Desktop Pass Preview on Right */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Editor Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* 2. Compact 2-Column Row: Target Stamps + Stamp Icon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-800/90 shadow-sm">
            {/* Target Stamps */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                {ar ? "عدد الأختام المطلوبة" : "Target Stamps"}
              </Label>
              <div className="flex gap-1.5">
                {STAMP_COUNTS.map((cnt) => (
                  <button
                    type="button"
                    key={cnt}
                    onClick={() => {
                      setTargetStamps(cnt);
                      onChange?.({ stampsRequired: cnt });
                    }}
                    className={`flex-1 h-9 rounded-xl font-bold text-xs transition-all flex items-center justify-center ${
                      targetStamps === cnt
                        ? "bg-emerald-500 text-zinc-950 shadow-[0_0_12px_rgba(16,185,129,0.3)] font-black scale-105"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* Stamp Icon */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                {ar ? "رمز الختم" : "Stamp Icon"}
              </Label>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {STAMP_ICONS.map((ic) => (
                  <button
                    type="button"
                    key={ic}
                    onClick={() => {
                      setStampIcon(ic);
                      onChange?.({ stampIcon: ic });
                    }}
                    className={`size-9 rounded-xl text-base transition-all flex items-center justify-center shrink-0 ${
                      stampIcon === ic
                        ? "bg-zinc-800 border-2 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25)] scale-105"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Color Preset Picker */}
          <div className="space-y-2 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
            <Label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {isFree
                ? ar
                  ? "ألوان المحفظة الرسمية (Wallet Presets)"
                  : "Card Color Preset"
                : ar
                  ? "اللون البديل للمحفظة المجانية (تزامن تلقائي)"
                  : "Free Tier Backup Preset (Auto-Synced)"}
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(Object.keys(FREE_TIER_PRESETS) as FreeColorPresetKey[]).map((presetKey) => {
                const hex = FREE_TIER_PRESETS[presetKey];
                const presetInfo = WALLET_COLOR_PRESETS[presetKey];
                const isSelected = colorPreset === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => handlePresetSelect(presetKey)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold transition ${
                      isSelected
                        ? "border-emerald-500 bg-zinc-800 text-white ring-1 ring-emerald-500/40 shadow-xs"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
                    }`}
                  >
                    <span
                      className="size-3.5 rounded-full shrink-0 border border-white/20"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="capitalize text-[11px] truncate">
                      {ar ? presetInfo?.nameAr || presetKey : presetKey}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pro Studio Controls */}
          {!isFree && (
            <div className="space-y-4 bg-zinc-950/60 p-4 rounded-2xl border border-amber-500/30">
              {/* Strip Layout Style */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-zinc-200">
                  {ar ? "نمط شريط الأختام (Retina Strip Style)" : "Strip Layout Style"}
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {STRIP_STYLES.map((st) => {
                    const isSelected = stripStyle === st.id;
                    return (
                      <button
                        type="button"
                        key={st.id}
                        onClick={() => {
                          setStripStyle(st.id);
                          onChange?.({ stripStyle: st.id });
                        }}
                        className={`p-3 rounded-xl border text-start transition-all ${
                          isSelected
                            ? "border-amber-500 bg-zinc-800 text-white ring-1 ring-amber-500/40 shadow-xs"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
                        }`}
                      >
                        <p className="text-xs font-bold text-white">{ar ? st.nameAr : st.nameEn}</p>
                        <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2">
                          {ar ? st.descriptionAr : st.descriptionEn}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom #hex Colors */}
              <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-zinc-800">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-zinc-400">
                      {ar ? "لون خلفية البطاقة (Brand Hex)" : "Custom Brand Hex Color"}
                    </Label>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Backup: {colorPreset}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        /^#[0-9A-Fa-f]{6}$/.test(brandColor)
                          ? brandColor
                          : FREE_TIER_PRESETS[colorPreset]
                      }
                      onChange={(e) => handleCustomHexChange(e.target.value)}
                      className="size-9 p-0.5 rounded-lg bg-zinc-900 border border-zinc-700 cursor-pointer"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => handleCustomHexChange(e.target.value)}
                      dir="ltr"
                      placeholder="#e65100"
                      maxLength={7}
                      className="font-mono text-xs h-9 bg-zinc-900 border-zinc-800 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] text-zinc-400">
                    {ar ? "لون الختم والتمييز (Accent Hex)" : "Accent Hex"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="size-9 p-0.5 rounded-lg bg-zinc-900 border border-zinc-700 cursor-pointer"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      dir="ltr"
                      className="font-mono text-xs h-9 bg-zinc-900 border-zinc-800 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Sticky Pass Preview */}
        <div className="hidden lg:block lg:col-span-5 sticky top-20">
          <div className="p-4 rounded-3xl bg-zinc-950/70 border border-zinc-800/80 shadow-inner space-y-2">
            <PassPreview
              locale={locale}
              onSelectStamps={(newStamps) => {
                setTargetStamps(newStamps);
                onChange?.({ stampsRequired: newStamps });
              }}
              design={{
                businessName: effectiveBusinessNameAr,
                businessNameEn: effectiveBusinessNameEn,
                logoUrl: null,
                background: effectiveBg,
                accent: effectiveAccent,
                headline: ar ? suggestedRewardAr : suggestedRewardEn,
                headlineEn: suggestedRewardEn,
                subline: ar ? "شكراً لولائك" : "Thanks for your loyalty",
                sublineEn: "Thanks for your loyalty",
                program,
                targetStamps,
                sarPerPoint: 10,
                pointsPerReward: 100,
                progress: 2,
                stampIcon,
                stripStyle,
                tierMode,
                colorPreset,
              }}
            />
            <p className="text-center text-[10px] text-zinc-500">
              {ar
                ? "انقر على أي ختم في البطاقة لتعديل عدد الأختام مباشرة"
                : "Click any stamp on the pass to adjust target count"}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={saving || isSubmitting}
            className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded-xl"
          >
            {ar ? "← السابق" : "← Previous"}
          </Button>
        ) : (
          <div />
        )}

        <Button
          onClick={handleContinue}
          disabled={saving || isSubmitting}
          className="h-12 px-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
        >
          {saving || isSubmitting ? (
            <Loader2 className="size-4 animate-spin text-zinc-950" />
          ) : (
            <>
              <span>{ar ? "متابعة لتحديد المكافأة" : "Continue to Reward Rules"}</span>
              <ArrowIcon className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
