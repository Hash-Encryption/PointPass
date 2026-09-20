import { useState, useRef } from "react";
import { toast } from "sonner";
import { LocalQrCode, downloadQrCanvas } from "@/components/LocalQrCode";
import { Button } from "@/components/ui/button";
import { Copy, Download, ExternalLink, QrCode, Smartphone, Sparkles } from "lucide-react";

interface JoinQrPanelProps {
  slug: string;
  businessName: string;
  ar: boolean;
}

export function JoinQrPanel({ slug, businessName, ar }: JoinQrPanelProps) {
  const [canvasInstance, setCanvasInstance] = useState<HTMLCanvasElement | null>(null);

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${slug}`
      : `https://pointpass.me/join/${slug}`;

  function copyJoinLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(joinUrl);
      toast.success(ar ? "تم نسخ الرابط بنجاح!" : "Link copied to clipboard!");
    }
  }

  function handleDownload() {
    downloadQrCanvas(canvasInstance, `${slug}-loyalty-qr.png`);
    toast.success(ar ? "تم تحميل رمز QR بنجاح!" : "QR code downloaded!");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold flex items-center justify-center gap-2">
          <QrCode className="size-6 text-primary" />
          {ar ? "رمز ورابط انضمام العملاء" : "Customer Join Link & QR Code"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {ar
            ? "اطبع الرمز عند الكاشير أو شارك الرابط ليقوم العملاء بحفظ بطاقتك في Apple Wallet و Google Wallet فوراً."
            : "Place at checkout or share the link so customers can instantly add your card to Apple & Google Wallet."}
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-xs text-center space-y-5">
        {/* Local QR Code Canvas */}
        <div className="flex justify-center">
          <LocalQrCode text={joinUrl} size={240} onReady={(canvas) => setCanvasInstance(canvas)} />
        </div>

        {/* URL Display */}
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-start flex items-center justify-between gap-2">
          <div className="truncate font-mono text-xs text-foreground" dir="ltr">
            {joinUrl}
          </div>
          <Button size="sm" variant="ghost" onClick={copyJoinLink} className="shrink-0 text-xs">
            <Copy className="size-3.5 me-1" />
            {ar ? "نسخ" : "Copy"}
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={handleDownload} className="h-11 px-6 font-semibold">
            <Download className="size-4 me-2" />
            {ar ? "تحميل رمز QR (PNG)" : "Download QR Code (PNG)"}
          </Button>

          <Button asChild variant="outline" className="h-11 px-6">
            <a href={joinUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4 me-2" />
              {ar ? "معاينة صفحة العميل" : "Preview Customer Page"}
            </a>
          </Button>
        </div>
      </div>

      {/* Reassuring operational notes */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <Sparkles className="size-4 text-primary" />
          {ar ? "مزايا انضمام العملاء السلسة" : "Seamless Customer Join Experience"}
        </div>
        <ul className="list-disc ps-5 space-y-1">
          <li>
            {ar
              ? "انضمام فوري بدون الحاجة لإنشاء حساب أو كلمة مرور."
              : "Instant join without requiring account creation or password."}
          </li>
          <li>
            {ar
              ? "مزامنة تلقائية عند إدخال العميل لرقم جواله دون تكرار الحسابات."
              : "Automatic sync when customers provide their phone without duplicating accounts."}
          </li>
          <li>
            {ar
              ? "الرمز مولد محلياً داخل التطبيق بدون الاعتماد على أي خدمات خارجية."
              : "QR generated locally without external third-party network dependencies."}
          </li>
        </ul>
      </div>
    </div>
  );
}
