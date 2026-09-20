import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface LocalQrCodeProps {
  text: string;
  size?: number;
  className?: string;
  onReady?: (canvas: HTMLCanvasElement) => void;
}

export function LocalQrCode({ text, size = 260, className = "", onReady }: LocalQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !text) return;
    void QRCode.toCanvas(canvasRef.current, text, {
      width: size,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    }).then(() => {
      if (canvasRef.current && onReady) {
        onReady(canvasRef.current);
      }
    });
  }, [text, size, onReady]);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-xs ${className}`}
    >
      <canvas ref={canvasRef} className="rounded-lg" />
    </div>
  );
}

export function downloadQrCanvas(canvas: HTMLCanvasElement | null, filename = "pointpass-qr.png") {
  if (!canvas) return;
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
