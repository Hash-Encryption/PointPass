import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Store,
  Sparkles,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import { LocalQrCode, downloadQrCanvas } from "@/components/LocalQrCode";
import { completeOnboardingFn } from "@/lib/onboarding.functions";
import { supabase } from "@/lib/supabase";

interface LaunchStepProps {
  business: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string;
    plan: string;
    program_type: string;
    offer_ar: string;
    offer_en: string;
  };
  onFinish: () => void;
  onBack: () => void;
}

export function LaunchStep({ business, onFinish, onBack }: LaunchStepProps) {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [completing, setCompleting] = useState(false);
  const [canvasInstance, setCanvasInstance] = useState<HTMLCanvasElement | null>(null);

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${business.slug}`
      : `https://pointpass.me/join/${business.slug}`;

  function copyJoinLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(joinUrl);
      toast.success(ar ? "تم نسخ الرابط بنجاح!" : "Link copied to clipboard!");
    }
  }

  function handleDownload() {
    downloadQrCanvas(canvasInstance, `${business.slug}-counter-qr.png`);
    toast.success(ar ? "تم تحميل رمز QR للكاونتر بنجاح!" : "Counter QR downloaded!");
  }

  async function handleComplete() {
    setCompleting(true);
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

      await completeOnboardingFn({
        data: {
          accessToken: session.access_token,
          businessId: business.id,
        },
      });

      toast.success(
        ar
          ? "تم إكمال الإعداد بنجاح! مرحباً بك في لوحة تحكم متجرك."
          : "Setup completed! Welcome to your dashboard.",
      );
      onFinish();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setCompleting(false);
    }
  }

  const ArrowIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-6">
      {/* Celebration Header */}
      <div className="text-center space-y-2 pb-4 border-b border-zinc-800">
        <div className="size-14 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.2)]">
          <CheckCircle2 className="size-8" />
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          {ar ? "بطاقتك جاهزة للإطلاق! 🎉" : "Your Pass is Ready to Launch! 🎉"}
        </h2>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
          {ar
            ? "تم إعداد برنامج الولاء وبطاقتك الرقمية بنجاح. اطبع رمز QR وضعه على الكاونتر للبدء."
            : "Your loyalty program and Apple Wallet pass are ready for customer enrollment."}
        </p>
      </div>

      {/* Prominent Counter QR Showcase Box */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8 text-center space-y-5 shadow-2xl backdrop-blur-md">
        <div className="inline-block relative">
          <div className="p-3.5 rounded-2xl bg-white shadow-[0_0_35px_rgba(255,255,255,0.15)] inline-block">
            <LocalQrCode
              text={joinUrl}
              size={190}
              onReady={(canvas) => setCanvasInstance(canvas)}
            />
          </div>
          <div className="absolute -bottom-2 inset-x-0 mx-auto w-fit bg-zinc-900 border border-zinc-700 px-3 py-0.5 rounded-full text-[10px] font-mono text-zinc-300 shadow-sm flex items-center gap-1.5">
            <QrCode className="size-3 text-emerald-400" />
            <span>COUNTER QR</span>
          </div>
        </div>

        {/* Counter Guide Callout per specification */}
        <div className="max-w-md mx-auto p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
            <Sparkles className="size-3.5" />
            <span>{ar ? "دليل الكاونتر" : "Counter Placement Guide"}</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {ar
              ? "ضع هذا الرمز على الكاونتر. يمسح العميل الرمز بكاميرا الجوال ليضيف بطاقة الولاء إلى Apple Wallet أو Google Wallet في ثوانٍ."
              : "Place this QR code on your counter. Customers scan it with their phone camera to add the loyalty pass to Apple Wallet or Google Wallet in seconds."}
          </p>
        </div>

        {/* Direct Action Buttons: Download QR & Copy Link */}
        <div className="flex flex-wrap justify-center gap-2.5 max-w-md mx-auto">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            className="h-11 px-4 text-xs font-semibold rounded-xl border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white flex items-center gap-2 shadow-xs"
          >
            <Download className="size-4 text-emerald-400" />
            <span>{ar ? "تحميل رمز QR للكاونتر (PNG)" : "Download Counter QR (PNG)"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={copyJoinLink}
            className="h-11 px-4 text-xs font-semibold rounded-xl border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white flex items-center gap-2 shadow-xs"
          >
            <Copy className="size-4 text-emerald-400" />
            <span>{ar ? "نسخ رابط الانضمام" : "Copy Join Link"}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            asChild
            className="h-11 px-3 text-xs text-zinc-400 hover:text-white rounded-xl"
          >
            <a href={joinUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5 me-1 text-zinc-500" />
              <span>{ar ? "معاينة صفحة العميل" : "Preview Customer Page"}</span>
            </a>
          </Button>
        </div>

        {/* Join URL display bar */}
        <div className="rounded-xl border border-zinc-850 bg-zinc-950 p-2.5 max-w-md mx-auto flex items-center justify-between gap-2 text-start">
          <div className="truncate font-mono text-[11px] text-zinc-400 select-all" dir="ltr">
            {joinUrl}
          </div>
          <button
            type="button"
            onClick={copyJoinLink}
            className="shrink-0 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded-md hover:bg-emerald-500/10 transition-colors"
          >
            {ar ? "نسخ" : "Copy"}
          </button>
        </div>
      </div>

      {/* Program Summary Recap */}
      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <div className="rounded-2xl border border-zinc-850 bg-zinc-950/60 p-3.5 space-y-1">
          <div className="text-zinc-400 flex items-center gap-1.5 font-medium">
            <Store className="size-3.5 text-emerald-400" />
            <span>{ar ? "اسم المتجر والمعرف" : "Store Name & Slug"}</span>
          </div>
          <div className="font-bold text-sm text-white">
            {ar ? business.name_ar : business.name_en}
          </div>
          <div className="text-zinc-500 font-mono text-[11px]" dir="ltr">
            slug: {business.slug}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-850 bg-zinc-950/60 p-3.5 space-y-1">
          <div className="text-zinc-400 flex items-center gap-1.5 font-medium">
            <Sparkles className="size-3.5 text-emerald-400" />
            <span>{ar ? "المكافأة المسجلة" : "Configured Reward"}</span>
          </div>
          <div className="font-bold text-sm text-white">
            {ar
              ? business.offer_ar || "مكافأة برنامج الولاء"
              : business.offer_en || "Loyalty reward"}
          </div>
          <div className="text-emerald-400 font-medium text-[11px]">
            {ar ? "مفعل وجاهز للاستقبال" : "Active & Ready"}
          </div>
        </div>
      </div>

      {/* Navigation Footer & Primary Action CTA */}
      <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={completing}
          className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded-xl"
        >
          {ar ? "← السابق" : "← Previous"}
        </Button>

        {/* Primary Action CTA per specification */}
        <Button
          onClick={handleComplete}
          disabled={completing}
          className="h-12 px-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm sm:text-base shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all flex items-center justify-center gap-2"
        >
          {completing ? (
            <Loader2 className="size-4 animate-spin text-zinc-950" />
          ) : (
            <>
              <span>{ar ? "فتح لوحة التحكم ←" : "Open Dashboard →"}</span>
              <ArrowIcon className="size-4.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
