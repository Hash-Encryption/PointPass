import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Stamp, Coins, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { PASS_TEMPLATES, type ProgramType } from "@/constants/defaultTemplates";
import { PassPreview } from "@/components/PassPreview";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface LoyaltySetupStepProps {
  businessId: string;
  businessNameAr: string;
  businessNameEn: string;
  initialProgram?: ProgramType;
  initialBrandColor?: string;
  initialAccentColor?: string;
  onSuccess: (program: ProgramType, brandColor: string, accentColor: string) => void;
  onBack: () => void;
}

const COLOR_PRESETS = [
  { brand: "#059669", accent: "#F59E0B", name: "Emerald & Amber" },
  { brand: "#1E3A8A", accent: "#38BDF8", name: "Deep Blue & Sky" },
  { brand: "#4C1D95", accent: "#F43F5E", name: "Purple & Rose" },
  { brand: "#0F172A", accent: "#10B981", name: "Slate & Mint" },
  { brand: "#9A3412", accent: "#FBBF24", name: "Rust & Gold" },
];

export function LoyaltySetupStep({
  businessId,
  businessNameAr,
  businessNameEn,
  initialProgram = "stamp",
  initialBrandColor = "#059669",
  initialAccentColor = "#F59E0B",
  onSuccess,
  onBack,
}: LoyaltySetupStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [program, setProgram] = useState<ProgramType>(initialProgram);
  const [brandColor, setBrandColor] = useState(initialBrandColor);
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [saving, setSaving] = useState(false);

  const programs: Array<{ type: ProgramType; icon: typeof Stamp; title: string; desc: string }> = [
    {
      type: "stamp",
      icon: Stamp,
      title: ar ? "بطاقة أختام رقمية" : "Digital Stamp Card",
      desc: ar
        ? "كل زيارة ختم، وعند اكتمال الأختام يحصل على مكافأة"
        : "Buy X get 1 free loyalty stamps",
    },
    {
      type: "points",
      icon: Coins,
      title: ar ? "نقاط ومكافآت مالية" : "Points & Cashback",
      desc: ar
        ? "اكسب نقاطاً مقابل كل ريال واستبدلها بمكافآت"
        : "Earn points per SAR spent to redeem",
    },
    {
      type: "coupon_morph",
      icon: Gift,
      title: ar ? "قسيمة تتحول لولاء" : "Coupon to Loyalty",
      desc: ar
        ? "خصم ترحيبي يتحول تلقائياً لبطاقة ولاء دائمة"
        : "Welcome voucher morphs into a pass",
    },
  ];

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
        },
      });

      toast.success(ar ? "تم حفظ نوع البرنامج وتصميم البطاقة" : "Loyalty program saved");
      onSuccess(program, brandColor, accentColor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const tpl = PASS_TEMPLATES[program];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-border/60">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Stamp className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("stepLoyalty")}</h2>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "اختر نوع برنامج الولاء وتنسيق ألوان بطاقتك الرقمية في محفظة العميل."
              : "Choose your loyalty model and brand colors for digital wallet passes."}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Program selection & Brand colors */}
        <div className="space-y-5">
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold">{ar ? "نوع البرنامج" : "Program Model"}</Label>
            <div className="grid gap-2.5">
              {programs.map((p) => {
                const isSelected = program === p.type;
                const Icon = p.icon;
                return (
                  <div
                    key={p.type}
                    onClick={() => {
                      setProgram(p.type);
                      const t = PASS_TEMPLATES[p.type];
                      setBrandColor(t.colors.background);
                      setAccentColor(t.colors.accent);
                    }}
                    className={`rounded-xl border p-3 cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/80 bg-card hover:border-border"
                    }`}
                  >
                    <div
                      className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm">{p.title}</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Color Palettes */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              {ar ? "نسق الألوان المعتمد" : "Card Colors"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  onClick={() => {
                    setBrandColor(preset.brand);
                    setAccentColor(preset.accent);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                    brandColor === preset.brand
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border/80 hover:border-border"
                  }`}
                >
                  <span
                    className="size-3.5 rounded-full"
                    style={{ backgroundColor: preset.brand }}
                  />
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: preset.accent }}
                  />
                  <span className="text-[11px] font-medium">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live Pass Preview */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-muted/20 border border-border/50">
          <span className="text-[11px] font-semibold text-muted-foreground mb-3">
            {ar ? "معاينة البطاقة في المحفظة" : "Wallet Card Live Preview"}
          </span>
          <div className="scale-90 sm:scale-95 origin-top">
            <PassPreview
              locale={locale}
              design={{
                businessName: businessNameAr,
                businessNameEn: businessNameEn,
                logoUrl: null,
                background: brandColor,
                accent: accentColor,
                headline: tpl.program.reward.ar,
                headlineEn: tpl.program.reward.en,
                subline: "شكراً لولائك",
                sublineEn: "Thanks for your loyalty",
                program,
                targetStamps: tpl.program.targetStamps ?? 9,
                sarPerPoint: tpl.program.sarPerPoint ?? 10,
                pointsPerReward: tpl.program.pointsPerReward ?? 100,
                progress: 0,
              }}
            />
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-border/60 flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          {t("prevStep")}
        </Button>

        <Button onClick={handleContinue} disabled={saving} className="h-11 px-6 font-semibold">
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
    </div>
  );
}
