import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Gift, Coins, Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { type ProgramType } from "@/constants/defaultTemplates";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface RewardSetupStepProps {
  businessId: string;
  program: ProgramType;
  initialOfferAr?: string;
  initialOfferEn?: string;
  initialTargetStamps?: number;
  initialSarPerPoint?: number;
  initialPointsPerReward?: number;
  onSuccess: (rewardConfig: {
    offerAr: string;
    offerEn: string;
    targetStamps?: number | undefined;
    sarPerPoint?: number | undefined;
    pointsPerReward?: number | undefined;
  }) => void;
  onBack: () => void;
}

export function RewardSetupStep({
  businessId,
  program,
  initialOfferAr = "",
  initialOfferEn = "",
  initialTargetStamps = 9,
  initialSarPerPoint = 10,
  initialPointsPerReward = 100,
  onSuccess,
  onBack,
}: RewardSetupStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const defaultOfferAr =
    program === "stamp"
      ? "قهوة مجانية بعد ٩ أختام"
      : program === "points"
        ? "خصم ٢٠ ريال عند جمع ١٠٠ نقطة"
        : "خصم ٢٠٪ ترحيبي ثم ختم مع كل زيارة";

  const defaultOfferEn =
    program === "stamp"
      ? "Free Coffee after 9 Stamps"
      : program === "points"
        ? "20 SAR off at 100 Points"
        : "20% off welcome coupon, then stamps";

  const [offerAr, setOfferAr] = useState(initialOfferAr || defaultOfferAr);
  const [offerEn, setOfferEn] = useState(initialOfferEn || defaultOfferEn);
  const [targetStamps, setTargetStamps] = useState(initialTargetStamps);
  const [sarPerPoint, setSarPerPoint] = useState(initialSarPerPoint);
  const [pointsPerReward, setPointsPerReward] = useState(initialPointsPerReward);
  const [saving, setSaving] = useState(false);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();

    if (!offerAr.trim() || !offerEn.trim()) {
      toast.error(
        ar
          ? "يرجى كتابة نص المكافأة بالعربية والإنجليزية"
          : "Please enter reward text in Arabic & English",
      );
      return;
    }

    if (program === "stamp" && targetStamps < 1) {
      toast.error(ar ? "عدد الأختام يجب أن يكون ١ على الأقل" : "Target stamps must be at least 1");
      return;
    }

    if (program === "points" && (sarPerPoint < 1 || pointsPerReward < 1)) {
      toast.error(
        ar ? "يرجى إدخال قيم موجبة صالحة للنقاط" : "Please provide positive values for points",
      );
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
          offerAr: offerAr.trim(),
          offerEn: offerEn.trim(),
          targetStamps:
            program === "stamp" || program === "coupon_morph" ? targetStamps : undefined,
          sarPerPoint: program === "points" ? sarPerPoint : undefined,
          pointsPerReward: program === "points" ? pointsPerReward : undefined,
        },
      });

      toast.success(ar ? "تم حفظ إعدادات المكافأة بنجاح" : "Reward settings saved");
      onSuccess({
        offerAr: offerAr.trim(),
        offerEn: offerEn.trim(),
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

  return (
    <form onSubmit={handleContinue} className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-border/60">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Gift className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("stepReward")}</h2>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "حدد شروط المكافأة التي تظهر على بطاقة العميل عند إضافتها لمحفظته."
              : "Set up the reward rules displayed on the customer's wallet pass."}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Stamp Program specifics */}
        {(program === "stamp" || program === "coupon_morph") && (
          <div className="space-y-1.5">
            <Label htmlFor="target-stamps">
              {ar ? "عدد الأختام المطلوبة للمكافأة" : "Target Stamps for Reward"}
            </Label>
            <Input
              id="target-stamps"
              type="number"
              min={1}
              max={30}
              value={targetStamps}
              onChange={(e) => setTargetStamps(parseInt(e.target.value) || 1)}
              required
              className="max-w-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {ar ? "مثال: ٩ أختام ليحصل العميل على المكافأة في الزيارة العاشرة" : "e.g. 9 stamps"}
            </p>
          </div>
        )}

        {/* Points Program specifics */}
        {program === "points" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sar-per-point">
                {ar ? "المبلغ لكل نقطة (ريال)" : "SAR Spent per Point"}
              </Label>
              <Input
                id="sar-per-point"
                type="number"
                min={1}
                value={sarPerPoint}
                onChange={(e) => setSarPerPoint(parseInt(e.target.value) || 1)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {ar ? "مثال: ١٠ ريال = نقطة واحدة" : "e.g. 10 SAR = 1 point"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="points-per-reward">
                {ar ? "النقاط المطلوبة للاستبدال" : "Points Required for Reward"}
              </Label>
              <Input
                id="points-per-reward"
                type="number"
                min={1}
                value={pointsPerReward}
                onChange={(e) => setPointsPerReward(parseInt(e.target.value) || 100)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {ar ? "مثال: ١٠٠ نقطة للحصول على الخصم" : "e.g. 100 points"}
              </p>
            </div>
          </div>
        )}

        {/* Offer text bilingual */}
        <div className="space-y-1.5">
          <Label htmlFor="offer-ar">
            {ar ? "عنوان المكافأة (بالعربية)" : "Reward Headline (Arabic)"}
          </Label>
          <Input
            id="offer-ar"
            value={offerAr}
            onChange={(e) => setOfferAr(e.target.value)}
            required
            maxLength={120}
            dir="rtl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="offer-en">
            {ar ? "عنوان المكافأة (بالإنجليزية)" : "Reward Headline (English)"}
          </Label>
          <Input
            id="offer-en"
            value={offerEn}
            onChange={(e) => setOfferEn(e.target.value)}
            required
            maxLength={120}
            dir="ltr"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-border/60 flex items-center justify-between">
        <Button variant="outline" type="button" onClick={onBack} disabled={saving}>
          {t("prevStep")}
        </Button>

        <Button type="submit" disabled={saving} className="h-11 px-6 font-semibold">
          {saving ? (
            <Loader2 className="size-4 animate-spin me-2" />
          ) : ar ? (
            <>
              {t("nextStep")}
              <ArrowLeft className="size-4 ms-2" />
            </>
          ) : (
            <>
              {t("nextStep")}
              <ArrowRight className="size-4 ms-2" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
