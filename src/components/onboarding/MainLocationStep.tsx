import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, MapPin, Store, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";
import { saveOnboardingStepFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface MainLocationStepProps {
  businessId: string;
  onSuccess: () => void;
  onBack: () => void;
}

export function MainLocationStep({ businessId, onSuccess, onBack }: MainLocationStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [loading, setLoading] = useState(true);
  const [nameAr, setNameAr] = useState("الفرع الرئيسي");
  const [nameEn, setNameEn] = useState("Main Location");
  const [addressAr, setAddressAr] = useState("");
  const [addressEn, setAddressEn] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("branches")
        .select("name_ar,name_en,address_ar,address_en")
        .eq("business_id", businessId)
        .eq("code", "main")
        .maybeSingle();

      if (active && data) {
        setNameAr(data.name_ar || "الفرع الرئيسي");
        setNameEn(data.name_en || "Main Location");
        setAddressAr(data.address_ar || "");
        setAddressEn(data.address_en || "");
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [businessId]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();

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
          step: "location",
          mainBranchNameAr: nameAr.trim(),
          mainBranchNameEn: nameEn.trim(),
          mainBranchAddressAr: addressAr.trim() || undefined,
          mainBranchAddressEn: addressEn.trim() || undefined,
        },
      });

      toast.success(ar ? "تم تأكيد بيانات الفرع الرئيسي" : "Main location confirmed");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center">
        <Loader2 className="size-7 animate-spin text-primary" />
        <p className="mt-3 text-xs text-muted-foreground">
          {ar ? "جاري تحميل الفرع الرئيسي..." : "Loading main location..."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleContinue} className="space-y-6">
      <div className="flex items-center gap-3 pb-2 border-b border-border/60">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Store className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{t("stepLocation")}</h2>
            <Badge
              variant="outline"
              className="text-[11px] font-normal text-primary border-primary/30"
            >
              {ar ? "تم إنشاؤه تلقائياً" : "Auto-created"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "تم تجهيز الفرع الرئيسي لمنشأتك تلقائياً. يمكنك تأكيد أو تعديل تفاصيله."
              : "Your Main Location was auto-configured. You can confirm or adjust details."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="branch-name-ar">
              {ar ? "اسم الفرع (بالعربية)" : "Location Name (Arabic)"}
            </Label>
            <Input
              id="branch-name-ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="branch-name-en">
              {ar ? "اسم الفرع (بالإنجليزية)" : "Location Name (English)"}
            </Label>
            <Input
              id="branch-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              dir="ltr"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="branch-addr-ar">
              {ar
                ? "العنوان أو الحي (بالعربية) — اختياري"
                : "Address / District (Arabic) — Optional"}
            </Label>
            <Input
              id="branch-addr-ar"
              value={addressAr}
              onChange={(e) => setAddressAr(e.target.value)}
              placeholder={ar ? "مثال: طريق الملك فهد، الرياض" : "e.g. King Fahd Rd"}
              maxLength={200}
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="branch-addr-en">
              {ar
                ? "العنوان أو الحي (بالإنجليزية) — اختياري"
                : "Address / District (English) — Optional"}
            </Label>
            <Input
              id="branch-addr-en"
              value={addressEn}
              onChange={(e) => setAddressEn(e.target.value)}
              placeholder="e.g. King Fahd Rd, Riyadh"
              maxLength={200}
              dir="ltr"
            />
          </div>
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
