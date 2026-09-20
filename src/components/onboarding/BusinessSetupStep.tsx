import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { bootstrapOwnerBusinessFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface BusinessSetupStepProps {
  onSuccess: (business: {
    business_id: string;
    slug: string;
    name_ar: string;
    name_en: string;
    effective_plan: string;
    onboarding_step: string;
  }) => void;
}

export function BusinessSetupStep({ onSuccess }: BusinessSetupStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [slug, setSlug] = useState("");
  const [isCustomSlug, setIsCustomSlug] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function handleNameEnChange(val: string) {
    setNameEn(val);
    if (!isCustomSlug) {
      setSlug(slugify(val));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleanSlug = slugify(slug);
    if (!cleanSlug || cleanSlug.length < 2) {
      toast.error(
        ar
          ? "يرجى إدخال معرّف رابط صالح (حرفين على الأقل)"
          : "Please enter a valid slug (at least 2 characters)",
      );
      return;
    }

    if (nameAr.trim().length < 2 || nameEn.trim().length < 2) {
      toast.error(
        ar
          ? "يرجى كتابة اسم المنشأة بالعربية والإنجليزية"
          : "Please provide both Arabic and English business names",
      );
      return;
    }

    setSubmitting(true);
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

      const res = await bootstrapOwnerBusinessFn({
        data: {
          accessToken: session.access_token,
          slug: cleanSlug,
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim(),
          plan: "starter",
        },
      });

      if (res.ok && res.business) {
        toast.success(ar ? "تم إنشاء المنشأة بنجاح!" : "Business created successfully!");
        onSuccess(res.business);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already taken|duplicate|unique/i.test(msg)) {
        toast.error(
          ar
            ? "معرّف الرابط (Slug) مستخدم بالفعل، يرجى اختيار معرّف آخر."
            : "This URL slug is already taken. Please choose another one.",
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-border/60">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Building2 className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t("stepBusiness")}</h2>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "أدخل الاسم الرسمي لمنشأتك ومعرف الرابط الخاص بصفحة العملاء."
              : "Enter your official business name and customer join link slug."}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Name Arabic */}
        <div className="space-y-1.5">
          <Label htmlFor="biz-name-ar">
            {t("businessNameAr")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="biz-name-ar"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={ar ? "مثال: مقهى الركن الهادئ" : "e.g. Calm Corner Cafe"}
            required
            minLength={2}
            maxLength={120}
            dir="rtl"
          />
        </div>

        {/* Name English */}
        <div className="space-y-1.5">
          <Label htmlFor="biz-name-en">
            {t("businessNameEn")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="biz-name-en"
            value={nameEn}
            onChange={(e) => handleNameEnChange(e.target.value)}
            placeholder="e.g. Calm Corner Cafe"
            required
            minLength={2}
            maxLength={120}
            dir="ltr"
          />
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <Label htmlFor="biz-slug">
            {t("businessSlug")} <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-muted-foreground font-mono shrink-0 hidden sm:inline"
              dir="ltr"
            >
              pointpass.me/join/
            </span>
            <Input
              id="biz-slug"
              value={slug}
              onChange={(e) => {
                setIsCustomSlug(true);
                setSlug(e.target.value);
              }}
              placeholder="calm-corner"
              required
              minLength={2}
              maxLength={64}
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("slugHelp")}</p>
        </div>
      </div>

      <div className="pt-3 border-t border-border/60 flex justify-end">
        <Button
          type="submit"
          disabled={submitting}
          className="h-11 px-6 font-semibold w-full sm:w-auto"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin me-2" />
          ) : ar ? (
            <>
              {t("createBusinessBtn")}
              <ArrowLeft className="size-4 ms-2" />
            </>
          ) : (
            <>
              {t("createBusinessBtn")}
              <ArrowRight className="size-4 ms-2" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
