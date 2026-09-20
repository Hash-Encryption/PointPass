import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  QrCode,
  Copy,
  Download,
  ExternalLink,
  Sparkles,
  Building2,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    downloadQrCanvas(canvasInstance, `${business.slug}-qr.png`);
    toast.success(ar ? "تم تحميل رمز QR بنجاح!" : "QR code downloaded!");
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

      toast.success(t("onboardingCompleted"));
      onFinish();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setCompleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1.5 pb-3 border-b border-border/60">
        <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="text-xl font-bold">{t("stepLaunch")}</h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {ar
            ? "تم إعداد برنامج الولاء وبطاقتك الرقمية بنجاح. بطاقتك جاهزة الآن لاستقبال العملاء!"
            : "Your loyalty program and digital pass are ready for customer enrollment!"}
        </p>
      </div>

      {/* Summary Review Cards */}
      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
            <Building2 className="size-3.5 text-primary" />
            {t("stepBusiness")}
          </div>
          <div className="font-bold text-sm text-foreground">
            {ar ? business.name_ar : business.name_en}
          </div>
          <div className="text-muted-foreground font-mono text-[11px]" dir="ltr">
            slug: {business.slug}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 font-medium">
            <Store className="size-3.5 text-primary" />
            {t("stepLocation")}
          </div>
          <div className="font-bold text-sm text-foreground">
            {ar ? "الفرع الرئيسي" : "Main Location"}
          </div>
          <div className="text-muted-foreground">{t("active")} (1 / 1)</div>
        </div>
      </div>

      {/* QR & Join Code Box */}
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-4">
        <div className="flex justify-center">
          <LocalQrCode text={joinUrl} size={180} onReady={(canvas) => setCanvasInstance(canvas)} />
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-2.5 flex items-center justify-between gap-2">
          <div className="truncate font-mono text-xs text-foreground" dir="ltr">
            {joinUrl}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={copyJoinLink}
            className="shrink-0 text-xs h-7 px-2"
          >
            <Copy className="size-3.5 me-1" />
            {ar ? "نسخ" : "Copy"}
          </Button>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} className="text-xs h-9">
            <Download className="size-3.5 me-1.5" />
            {ar ? "تحميل رمز QR" : "Download QR"}
          </Button>
          <Button size="sm" variant="outline" asChild className="text-xs h-9">
            <a href={joinUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5 me-1.5" />
              {ar ? "معاينة صفحة العميل" : "Preview Page"}
            </a>
          </Button>
        </div>
      </div>

      <div className="pt-3 border-t border-border/60 flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={completing}>
          {t("prevStep")}
        </Button>

        <Button onClick={handleComplete} disabled={completing} className="h-11 px-6 font-semibold">
          {completing ? (
            <Loader2 className="size-4 animate-spin me-2" />
          ) : ar ? (
            <>
              {t("confirmAndComplete")}
              <ArrowLeft className="size-4 ms-2" />
            </>
          ) : (
            <>
              {t("confirmAndComplete")}
              <ArrowRight className="size-4 ms-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
