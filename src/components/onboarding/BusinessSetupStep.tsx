import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Store, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import { bootstrapOwnerBusinessFn, saveOnboardingStepFn } from "@/lib/onboarding.functions";
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
  const [showSecondary, setShowSecondary] = useState(false);
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
    if (!isCustomSlug && val) {
      const generated = slugify(val);
      if (generated) setSlug(generated);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 1. Dynamic System Locale Auto-Mirroring Engine:
    // If Arabic active: nameAr is primary required, nameEn auto-mirrors if empty.
    // If English active: nameEn is primary required, nameAr auto-mirrors if empty.
    const trimmedAr = nameAr.trim();
    const trimmedEn = nameEn.trim();

    if (ar && trimmedAr.length < 2) {
      toast.error("يرجى إدخال اسم المتجر (حرفين على الأقل)");
      return;
    }

    if (!ar && trimmedEn.length < 2) {
      toast.error("Please enter a store name (at least 2 characters)");
      return;
    }

    const finalNameAr = ar ? trimmedAr : trimmedAr || trimmedEn;
    const finalNameEn = ar ? trimmedEn || trimmedAr : trimmedEn;

    // Clean or auto-generate slug so merchant is NEVER blocked
    let cleanSlug = slugify(slug);
    if (!cleanSlug || cleanSlug.length < 2) {
      cleanSlug = slugify(finalNameEn);
    }
    if (!cleanSlug || cleanSlug.length < 2) {
      cleanSlug = `store-${Math.floor(1000 + Math.random() * 9000)}`;
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

      // Step 1: Create business
      const res = await bootstrapOwnerBusinessFn({
        data: {
          accessToken: session.access_token,
          slug: cleanSlug,
          nameAr: finalNameAr,
          nameEn: finalNameEn,
          plan: "single_location",
        },
      });

      if (res.ok && res.business) {
        // Step 1.B: Background Plan Selection (skip manual plan step in UI)
        try {
          await saveOnboardingStepFn({
            data: {
              accessToken: session.access_token,
              businessId: res.business.business_id,
              step: "plan",
              requestedPlan: "single_location",
            },
          });
        } catch (planErr) {
          console.warn("Background plan configuration note:", planErr);
        }

        toast.success(ar ? "تم إنشاء المتجر بنجاح!" : "Store created successfully!");
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

  const ArrowIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
        <div className="size-11 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 text-emerald-400 flex items-center justify-center shrink-0">
          <Store className="size-5.5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {ar ? "بيانات المتجر" : "Store Identity"}
          </h2>
          <p className="text-xs text-zinc-400">
            {ar
              ? "أدخل اسم متجرك ورابط انضمام العملاء للبدء بتصميم بطاقتك."
              : "Enter your store name and customer join link to start designing."}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Dynamic Bilingual Locale Engine */}
        {ar ? (
          /* Arabic Active: Arabic is required primary */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name-ar" className="text-xs font-semibold text-zinc-300">
                اسم المتجر بالعربي <span className="text-emerald-400">*</span>
              </Label>
              <Input
                id="biz-name-ar"
                value={nameAr}
                onChange={(e) => {
                  setNameAr(e.target.value);
                  if (!isCustomSlug && !nameEn) {
                    // prefill slug fallback if empty
                    const romanized = slugify(e.target.value);
                    if (romanized) setSlug(romanized);
                  }
                }}
                placeholder="مثال: مقهى الركن الهادئ"
                required
                minLength={2}
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
                <span>إضافة الاسم بالإنجليزي (اختياري)</span>
              </button>
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="biz-name-en" className="text-xs font-semibold text-zinc-300">
                    اسم المتجر بالإنجليزي (اختياري)
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
                  id="biz-name-en"
                  value={nameEn}
                  onChange={(e) => handleNameEnChange(e.target.value)}
                  placeholder="e.g. Calm Corner Cafe"
                  maxLength={120}
                  dir="ltr"
                  className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
                />
              </div>
            )}
          </div>
        ) : (
          /* English Active: English is required primary */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name-en" className="text-xs font-semibold text-zinc-300">
                Store Name (English) <span className="text-emerald-400">*</span>
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
                <span>Add Arabic name (optional)</span>
              </button>
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="biz-name-ar" className="text-xs font-semibold text-zinc-300">
                    Arabic Store Name (Optional)
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
                  id="biz-name-ar"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: مقهى الركن الهادئ"
                  maxLength={120}
                  dir="rtl"
                  className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
                />
              </div>
            )}
          </div>
        )}

        {/* Customer Join Link Slug */}
        <div className="space-y-1.5 pt-2">
          <Label htmlFor="biz-slug" className="text-xs font-semibold text-zinc-300">
            {ar ? "معرّف رابط العملاء (Slug)" : "Customer Join Link (Slug)"}{" "}
            <span className="text-emerald-400">*</span>
          </Label>
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-zinc-500 font-mono shrink-0 hidden sm:inline px-3 py-3 rounded-xl bg-zinc-950 border border-zinc-800 select-none"
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
              className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 font-mono text-sm h-11 transition-colors flex-1"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            {ar
              ? "الرابط المخصص لصفحة الانضمام وحفظ البطاقة في محفظة Apple Wallet."
              : "Direct link for customers to add your loyalty pass to Apple Wallet."}
          </p>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="pt-4 border-t border-zinc-800 flex justify-end">
        <Button
          type="submit"
          disabled={submitting}
          className="h-12 px-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin text-zinc-950" />
          ) : (
            <>
              <span>{ar ? "متابعة لتصميم البطاقة" : "Continue to Card Studio"}</span>
              <ArrowIcon className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
