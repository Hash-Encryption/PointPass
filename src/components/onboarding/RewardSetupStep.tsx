import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Gift, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { type ProgramType } from "@/constants/defaultTemplates";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface RewardSetupStepProps {
  businessId: string;
  program?: ProgramType;
  initialOfferAr?: string;
  initialOfferEn?: string;
  initialTargetStamps?: number;
  initialSarPerPoint?: number;
  initialPointsPerReward?: number;
  stampIcon?: string;
  onSuccess: (rewardConfig: {
    offerAr: string;
    offerEn: string;
    targetStamps?: number | undefined;
    sarPerPoint?: number | undefined;
    pointsPerReward?: number | undefined;
  }) => void;
  onBack: () => void;
}

const QUICK_REWARD_SUGGESTIONS = [
  { ar: "قهوة مجانية من اختيارك ☕", en: "Free coffee of your choice ☕" },
  { ar: "وجبة مجانية من اختيارك 🍔", en: "Free meal of your choice 🍔" },
  { ar: "قطعة حلى مجانية 🥐", en: "Free pastry or dessert 🥐" },
  { ar: "خصم ٢٠ ريال على الفاتورة 🏷️", en: "20 SAR off your bill 🏷️" },
  { ar: "جلسة عناية أو غسيل مجاني 🚗", en: "Free grooming or wash service 🚗" },
];

export function RewardSetupStep({
  businessId,
  program = "stamp",
  initialOfferAr = "",
  initialOfferEn = "",
  initialTargetStamps = 8,
  initialSarPerPoint = 10,
  initialPointsPerReward = 100,
  stampIcon = "⭐",
  onSuccess,
  onBack,
}: RewardSetupStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const defaultOfferAr = initialOfferAr || "مكافأة خاصة بعد إكمال الأختام 🎁";
  const defaultOfferEn = initialOfferEn || "Special reward upon card completion 🎁";

  const [offerAr, setOfferAr] = useState(defaultOfferAr);
  const [offerEn, setOfferEn] = useState(defaultOfferEn);
  const [targetStamps, setTargetStamps] = useState(initialTargetStamps);
  const [sarPerPoint, setSarPerPoint] = useState(initialSarPerPoint);
  const [pointsPerReward, setPointsPerReward] = useState(initialPointsPerReward);
  const [showSecondary, setShowSecondary] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();

    // 1. Dynamic System Locale Auto-Mirroring Engine:
    // If Arabic active: offerAr is primary required, offerEn auto-mirrors if empty.
    // If English active: offerEn is primary required, offerAr auto-mirrors if empty.
    const trimmedAr = offerAr.trim();
    const trimmedEn = offerEn.trim();

    if (ar && trimmedAr.length < 2) {
      toast.error("يرجى كتابة نص المكافأة (حرفين على الأقل)");
      return;
    }

    if (!ar && trimmedEn.length < 2) {
      toast.error("Please enter reward details (at least 2 characters)");
      return;
    }

    const finalOfferAr = ar ? trimmedAr : trimmedAr || trimmedEn;
    const finalOfferEn = ar ? trimmedEn || trimmedAr : trimmedEn;

    if (program === "stamp" && targetStamps < 1) {
      toast.error(ar ? "عدد الأختام يجب أن يكون ١ على الأقل" : "Target stamps must be at least 1");
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

      await saveOnboardingStepFn({
        data: {
          accessToken: session.access_token,
          businessId,
          step: "reward",
          offerAr: finalOfferAr,
          offerEn: finalOfferEn,
          targetStamps:
            program === "stamp" || program === "coupon_morph" ? targetStamps : undefined,
          sarPerPoint: program === "points" ? sarPerPoint : undefined,
          pointsPerReward: program === "points" ? pointsPerReward : undefined,
        },
      });

      toast.success(ar ? "تم حفظ المكافأة بنجاح!" : "Reward rules saved!");
      onSuccess({
        offerAr: finalOfferAr,
        offerEn: finalOfferEn,
        targetStamps: program === "stamp" || program === "coupon_morph" ? targetStamps : undefined,
        sarPerPoint: program === "points" ? sarPerPoint : undefined,
        pointsPerReward: program === "points" ? pointsPerReward : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const ArrowIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <form onSubmit={handleContinue} className="space-y-6">
      {/* Header with friendly human copy */}
      <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
        <div className="size-11 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 text-emerald-400 flex items-center justify-center shrink-0">
          <Gift className="size-5.5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {ar
              ? "ما هي الهدية التي يحصل عليها عميلك عند إكمال البطاقة؟"
              : "What reward does your customer earn upon completing the card?"}
          </h2>
          <p className="text-xs text-zinc-400">
            {ar
              ? "اكتب الهدية أو الخصم الذي يظهر على بطاقة العميل في Apple Wallet بمجرد جمع الأختام."
              : "Specify the gift or discount displayed on the customer's wallet pass."}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Quick Suggestion Pills */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="size-3 text-emerald-400" />
            <span>{ar ? "اقتراحات سريعة بنقرة واحدة" : "Quick suggestions (1-tap fill)"}</span>
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REWARD_SUGGESTIONS.map((sug, i) => (
              <button
                type="button"
                key={i}
                onClick={() => {
                  setOfferAr(sug.ar);
                  setOfferEn(sug.en);
                }}
                className="text-xs rounded-xl border border-zinc-800 bg-zinc-950/70 hover:bg-zinc-800/80 hover:text-white text-zinc-300 px-3 py-1.5 transition-colors"
              >
                {ar ? sug.ar : sug.en}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic System Locale Engine Input Fields */}
        {ar ? (
          /* Arabic Active */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="offer-ar" className="text-xs font-semibold text-zinc-300">
                عنوان المكافأة بالعربي <span className="text-emerald-400">*</span>
              </Label>
              <Input
                id="offer-ar"
                value={offerAr}
                onChange={(e) => setOfferAr(e.target.value)}
                placeholder="مثال: قهوة مجانية من اختيارك ☕"
                required
                maxLength={120}
                dir="rtl"
                className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
              />
            </div>

            {/* Expandable English Secondary Field */}
            {!showSecondary ? (
              <button
                type="button"
                onClick={() => setShowSecondary(true)}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors py-1"
              >
                <Plus className="size-3.5" />
                <span>+ إضافة اسم المكافأة بالإنجليزي (اختياري)</span>
              </button>
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="offer-en" className="text-xs font-semibold text-zinc-300">
                    Reward Name in English (Optional)
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowSecondary(false)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-400"
                  >
                    إخفاء
                  </button>
                </div>
                <Input
                  id="offer-en"
                  value={offerEn}
                  onChange={(e) => setOfferEn(e.target.value)}
                  placeholder="e.g. Free coffee of your choice ☕"
                  maxLength={120}
                  dir="ltr"
                  className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
                />
              </div>
            )}
          </div>
        ) : (
          /* English Active */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="offer-en" className="text-xs font-semibold text-zinc-300">
                Reward Headline (English) <span className="text-emerald-400">*</span>
              </Label>
              <Input
                id="offer-en"
                value={offerEn}
                onChange={(e) => setOfferEn(e.target.value)}
                placeholder="e.g. Free coffee of your choice ☕"
                required
                maxLength={120}
                dir="ltr"
                className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
              />
            </div>

            {/* Expandable Arabic Secondary Field */}
            {!showSecondary ? (
              <button
                type="button"
                onClick={() => setShowSecondary(true)}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors py-1"
              >
                <Plus className="size-3.5" />
                <span>+ Add Arabic reward name (optional)</span>
              </button>
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="offer-ar" className="text-xs font-semibold text-zinc-300">
                    اسم المكافأة بالعربي (اختياري)
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowSecondary(false)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-400"
                  >
                    Hide
                  </button>
                </div>
                <Input
                  id="offer-ar"
                  value={offerAr}
                  onChange={(e) => setOfferAr(e.target.value)}
                  placeholder="مثال: قهوة مجانية من اختيارك ☕"
                  maxLength={120}
                  dir="rtl"
                  className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
                />
              </div>
            )}
          </div>
        )}

        {/* Target Stamps Badge / Confirmation */}
        {program === "stamp" && (
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white block">
                {ar ? "عدد الأختام للاستحقاق" : "Stamps required"}
              </span>
              <span className="text-[11px] text-zinc-400">
                {ar
                  ? `يحصل العميل على الهدية عند إكمال ${targetStamps} أختام`
                  : `Customer earns reward upon collecting ${targetStamps} stamps`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-extrabold text-sm flex items-center justify-center">
                {targetStamps}
              </span>
              <span className="text-base">{stampIcon}</span>
            </div>
          </div>
        )}
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
          type="submit"
          disabled={saving}
          className="h-12 px-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin text-zinc-950" />
          ) : (
            <>
              <span>{ar ? "متابعة وتجهيز رمز QR للإطلاق" : "Continue to Launch & QR"}</span>
              <ArrowIcon className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
