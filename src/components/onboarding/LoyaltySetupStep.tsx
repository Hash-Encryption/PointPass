import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Palette,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/i18n";
import { type ProgramType } from "@/constants/defaultTemplates";
import { PassPreview } from "@/components/PassPreview";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

export interface CuratedTemplate {
  id: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  pillIcon: string;
  background: string;
  accent: string;
  targetStamps: number;
  rewardAr: string;
  rewardEn: string;
}

export const CURATED_TEMPLATES: CuratedTemplate[] = [
  {
    id: "custom",
    labelAr: "من الصفر",
    labelEn: "Blank Slate",
    icon: "⭐",
    pillIcon: "🎨",
    background: "#121214",
    accent: "#10B981",
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
    targetStamps: 7,
    rewardAr: "قهوة مجانية من اختيارك ☕",
    rewardEn: "Free coffee of your choice ☕",
  },
  {
    id: "burger",
    labelAr: "مطاعم وبرجر",
    labelEn: "Burger & Bistro",
    icon: "🍔",
    pillIcon: "🍔",
    background: "#18181B",
    accent: "#EF4444",
    targetStamps: 5,
    rewardAr: "وجبة مجانية من اختيارك 🍔",
    rewardEn: "Free meal of your choice 🍔",
  },
  {
    id: "bakery",
    labelAr: "مخبز وحلويات",
    labelEn: "Bakery & Sweets",
    icon: "🥐",
    pillIcon: "🥐",
    background: "#26201E",
    accent: "#F59E0B",
    targetStamps: 6,
    rewardAr: "قطعة حلى مجانية 🥐",
    rewardEn: "Free pastry of your choice 🥐",
  },
  {
    id: "salon",
    labelAr: "صالون وعناية",
    labelEn: "Salon & Grooming",
    icon: "✂️",
    pillIcon: "✂️",
    background: "#0F172A",
    accent: "#8B5CF6",
    targetStamps: 5,
    rewardAr: "جلسة عناية أو حلاقة مجانية ✂️",
    rewardEn: "Free grooming or haircut session ✂️",
  },
  {
    id: "carwash",
    labelAr: "غسيل سيارات",
    labelEn: "Car Wash",
    icon: "🚗",
    pillIcon: "🚗",
    background: "#082F49",
    accent: "#06B6D4",
    targetStamps: 5,
    rewardAr: "غسيل سيارة مجاني شامل 🚗",
    rewardEn: "Free full car wash 🚗",
  },
];

const BACKGROUND_CHIPS = [
  { hex: "#121214", name: "Obsidian" },
  { hex: "#1A1412", name: "Dark Roast" },
  { hex: "#18181B", name: "Charcoal" },
  { hex: "#0F172A", name: "Deep Slate" },
  { hex: "#082F49", name: "Deep Ocean" },
  { hex: "#26201E", name: "Mocha" },
];

const ACCENT_CHIPS = [
  { hex: "#10B981", name: "Emerald" },
  { hex: "#D97706", name: "Warm Gold" },
  { hex: "#EF4444", name: "Red Flame" },
  { hex: "#F59E0B", name: "Honey" },
  { hex: "#8B5CF6", name: "Royal Violet" },
  { hex: "#06B6D4", name: "Electric Cyan" },
  { hex: "#EC4899", name: "Hot Pink" },
];

const STAMP_COUNTS = [5, 6, 7, 8, 10];
const STAMP_ICONS = ["⭐", "☕", "🍔", "🥐", "✂️", "🚗", "🎁"];

interface LoyaltySetupStepProps {
  businessId: string;
  businessNameAr: string;
  businessNameEn: string;
  initialProgram?: ProgramType;
  initialBrandColor?: string;
  initialAccentColor?: string;
  initialTargetStamps?: number;
  initialStampIcon?: string;
  onSuccess: (config: {
    program: ProgramType;
    brandColor: string;
    accentColor: string;
    targetStamps: number;
    stampIcon: string;
    suggestedRewardAr: string;
    suggestedRewardEn: string;
  }) => void;
  onBack: () => void;
}

export function LoyaltySetupStep({
  businessId,
  businessNameAr,
  businessNameEn,
  initialProgram = "stamp",
  initialBrandColor = "#121214",
  initialAccentColor = "#10B981",
  initialTargetStamps = 8,
  initialStampIcon = "⭐",
  onSuccess,
  onBack,
}: LoyaltySetupStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [activeTemplateId, setActiveTemplateId] = useState<string>("custom");
  const [program, setProgram] = useState<ProgramType>(initialProgram);
  const [brandColor, setBrandColor] = useState(initialBrandColor);
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [targetStamps, setTargetStamps] = useState(initialTargetStamps);
  const [stampIcon, setStampIcon] = useState(initialStampIcon);
  const [suggestedRewardAr, setSuggestedRewardAr] = useState("مكافأة خاصة بعد 8 زيارات 🎁");
  const [suggestedRewardEn, setSuggestedRewardEn] = useState("Special reward after 8 visits 🎁");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  function applyTemplate(tpl: CuratedTemplate) {
    setActiveTemplateId(tpl.id);
    setBrandColor(tpl.background);
    setAccentColor(tpl.accent);
    setTargetStamps(tpl.targetStamps);
    setStampIcon(tpl.icon);
    setSuggestedRewardAr(tpl.rewardAr);
    setSuggestedRewardEn(tpl.rewardEn);
  }

  async function handleContinue() {
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

      await saveOnboardingStepFn({
        data: {
          accessToken: session.access_token,
          businessId,
          step: "loyalty",
          programType: program,
          brandColor,
          accentColor,
          targetStamps,
        },
      });

      toast.success(ar ? "تم حفظ تصميم البطاقة بنجاح!" : "Pass design saved!");
      onSuccess({
        program,
        brandColor,
        accentColor,
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

  const ArrowIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
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

      {/* MOBILE ONLY: Sticky Live Pass Preview anchored at the top */}
      <div className="lg:hidden sticky top-14 z-20 bg-zinc-950/95 backdrop-blur-md pt-2 pb-4 -mx-5 px-5 border-b border-zinc-800/80 shadow-xl">
        <div className="max-w-xs mx-auto">
          <PassPreview
            locale={locale}
            showToggle={false}
            onSelectStamps={(newStamps) => setTargetStamps(newStamps)}
            design={{
              businessName: businessNameAr,
              businessNameEn: businessNameEn,
              logoUrl: null,
              background: brandColor,
              accent: accentColor,
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
            }}
          />
          <p className="text-center text-[10px] text-zinc-500 mt-1.5">
            {ar
              ? "اضغط على الأختام في البطاقة لتعديل العدد مباشرة"
              : "Tap stamps on the card to change target count"}
          </p>
        </div>
      </div>

      {/* Curated Templates Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="size-3 text-emerald-400" />
            <span>{ar ? "نماذج جاهزة حسب نشاطك" : "Curated Templates by Industry"}</span>
          </Label>
          <span className="text-[11px] text-zinc-500 font-mono">
            {activeTemplateId === "custom"
              ? ar
                ? "تخصيص حر"
                : "Custom"
              : CURATED_TEMPLATES.find((t) => t.id === activeTemplateId)?.[
                  ar ? "labelAr" : "labelEn"
                ]}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar sm:grid sm:grid-cols-3">
          {CURATED_TEMPLATES.map((tpl) => {
            const isActive = activeTemplateId === tpl.id;
            return (
              <button
                type="button"
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 sm:p-3 text-start transition-all shrink-0 sm:shrink ${
                  isActive
                    ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60"
                }`}
              >
                <span className="grid size-9 place-items-center rounded-xl bg-zinc-900 border border-zinc-800 text-base shrink-0 shadow-xs">
                  {tpl.pillIcon}
                </span>
                <div className="min-w-0">
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
          {/* Direct Tap Manipulation: Stamp Count */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-zinc-300">
              {ar ? "عدد الأختام المطلوبة للمكافأة" : "Target Stamps for Reward"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {STAMP_COUNTS.map((cnt) => (
                <button
                  type="button"
                  key={cnt}
                  onClick={() => setTargetStamps(cnt)}
                  className={`size-10 rounded-xl font-bold text-xs transition-all flex items-center justify-center ${
                    targetStamps === cnt
                      ? "bg-emerald-500 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-105"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white"
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Direct Tap Manipulation: Stamp Icon */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-zinc-300">
              {ar ? "شكل الختم داخل البطاقة" : "Stamp Icon"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {STAMP_ICONS.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  onClick={() => setStampIcon(ic)}
                  className={`size-10 rounded-xl text-base transition-all flex items-center justify-center ${
                    stampIcon === ic
                      ? "bg-zinc-800 border-2 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25)] scale-105"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palettes Chips */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                {ar ? "لون خلفية البطاقة" : "Card Background Color"}
              </Label>
              <div className="flex flex-wrap gap-2">
                {BACKGROUND_CHIPS.map((chip) => (
                  <button
                    type="button"
                    key={chip.hex}
                    onClick={() => {
                      setBrandColor(chip.hex);
                      setActiveTemplateId("custom");
                    }}
                    title={chip.name}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all ${
                      brandColor.toLowerCase() === chip.hex.toLowerCase()
                        ? "border-emerald-500 bg-zinc-800 text-white ring-1 ring-emerald-500/40"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
                    }`}
                  >
                    <span
                      className="size-3 rounded-full border border-white/20"
                      style={{ backgroundColor: chip.hex }}
                    />
                    <span className="text-[11px] font-medium">{chip.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                {ar ? "لون الختم والتمييز (Accent)" : "Stamp Accent Color"}
              </Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_CHIPS.map((chip) => (
                  <button
                    type="button"
                    key={chip.hex}
                    onClick={() => {
                      setAccentColor(chip.hex);
                      setActiveTemplateId("custom");
                    }}
                    title={chip.name}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all ${
                      accentColor.toLowerCase() === chip.hex.toLowerCase()
                        ? "border-emerald-500 bg-zinc-800 text-white ring-1 ring-emerald-500/40"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
                    }`}
                  >
                    <span
                      className="size-3 rounded-full border border-white/20"
                      style={{ backgroundColor: chip.hex }}
                    />
                    <span className="text-[11px] font-medium">{chip.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progressive Disclosure: Advanced Options */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
            >
              <Sliders className="size-3.5" />
              <span>
                {ar ? "خيارات متقدمة وألوان مخصصة" : "Advanced Customization (Hex codes)"}
              </span>
              {showAdvanced ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-400">
                      {ar ? "كود لون الخلفية (Hex)" : "Background Hex"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="size-9 p-0.5 rounded-lg bg-zinc-900 border border-zinc-700 cursor-pointer"
                      />
                      <Input
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        dir="ltr"
                        className="font-mono text-xs h-9 bg-zinc-900 border-zinc-800 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-400">
                      {ar ? "كود لون الختم (Hex)" : "Accent Hex"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
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
        </div>

        {/* Desktop Sticky Pass Preview */}
        <div className="hidden lg:block lg:col-span-5 sticky top-20">
          <div className="p-4 rounded-3xl bg-zinc-950/70 border border-zinc-800/80 shadow-inner space-y-2">
            <PassPreview
              locale={locale}
              onSelectStamps={(newStamps) => setTargetStamps(newStamps)}
              design={{
                businessName: businessNameAr,
                businessNameEn: businessNameEn,
                logoUrl: null,
                background: brandColor,
                accent: accentColor,
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
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={saving}
          className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded-xl"
        >
          {ar ? "← السابق" : "← Previous"}
        </Button>

        <Button
          onClick={handleContinue}
          disabled={saving}
          className="h-12 px-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
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
