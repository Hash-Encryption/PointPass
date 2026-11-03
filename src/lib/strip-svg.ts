import { iconToEmoji, type StripStyle, type WalletColorPreset } from "./wallet-tier.ts";

export interface StripGeneratorOptions {
  targetStamps: number;
  stamps: number;
  brandColor?: string | null | undefined;
  accentColor?: string | null | undefined;
  stampIcon?: string | null | undefined;
  stripStyle?: StripStyle | string | null | undefined;
}

export function resolveStampIcon(
  iconOrEmoji?: string | null,
  offerText?: string | null,
  brandColor?: string | null,
): string {
  const combined = `${iconOrEmoji ?? ""} ${offerText ?? ""} ${brandColor ?? ""}`.toLowerCase();

  if (combined.includes("☕") || combined.includes("coffee") || combined.includes("#1a1412")) {
    return "coffee";
  }
  if (combined.includes("🍔") || combined.includes("burger") || combined.includes("#18181b")) {
    return "burger";
  }
  if (
    combined.includes("🥐") ||
    combined.includes("bakery") ||
    combined.includes("sweets") ||
    combined.includes("#26201e")
  ) {
    return "bakery";
  }
  if (combined.includes("✂️") || combined.includes("salon") || combined.includes("#0f172a")) {
    return "salon";
  }
  if (combined.includes("🚗") || combined.includes("car") || combined.includes("#082f49")) {
    return "car";
  }
  if (combined.includes("🎁") || combined.includes("gift")) {
    return "gift";
  }
  return "star";
}

interface Slot {
  index: number;
  cx: number;
  cy: number;
  radius: number;
}

export function generateStampStripSvg(options: StripGeneratorOptions): string {
  const width = 1080;
  const height = 360;

  const brand = (options.brandColor || "#121214").trim();
  const accent = (options.accentColor || "#10B981").trim();
  const style: StripStyle =
    options.stripStyle === "nails_white" || options.stripStyle === "linear_dark"
      ? options.stripStyle
      : "pizzatown";

  const target = Math.max(3, Math.min(options.targetStamps || 8, 12));
  const currentStamps = Math.max(0, options.stamps || 0);
  const iconKey = resolveStampIcon(options.stampIcon, null, options.brandColor);
  const iconEmoji = iconToEmoji(iconKey);

  // Compute slot positions
  const slots: Slot[] = [];

  if (target <= 5) {
    // 1 single row
    const radius = 48;
    const cy = 180;
    const margin = 140;
    const usableWidth = width - margin * 2;
    const spacing = target > 1 ? usableWidth / (target - 1) : 0;

    for (let i = 0; i < target; i++) {
      slots.push({
        index: i,
        cx: target === 1 ? width / 2 : Math.round(margin + i * spacing),
        cy,
        radius,
      });
    }
  } else {
    // 2 rows
    const radius = 42;
    const row1Count = Math.ceil(target / 2);
    const row2Count = target - row1Count;
    const row1Y = 112;
    const row2Y = 248;

    const margin1 = 150;
    const usableWidth1 = width - margin1 * 2;
    const spacing1 = row1Count > 1 ? usableWidth1 / (row1Count - 1) : 0;

    for (let i = 0; i < row1Count; i++) {
      slots.push({
        index: i,
        cx: Math.round(margin1 + i * spacing1),
        cy: row1Y,
        radius,
      });
    }

    const margin2 = row2Count === row1Count ? margin1 : margin1 + spacing1 / 2;
    const usableWidth2 = width - margin2 * 2;
    const spacing2 = row2Count > 1 ? usableWidth2 / (row2Count - 1) : 0;

    for (let j = 0; j < row2Count; j++) {
      slots.push({
        index: row1Count + j,
        cx: row2Count === 1 ? width / 2 : Math.round(margin2 + j * spacing2),
        cy: row2Y,
        radius,
      });
    }
  }

  // Build card container markup
  let cardMarkup = "";
  if (style === "nails_white") {
    cardMarkup = `<rect x="32" y="20" width="1016" height="320" rx="26" fill="#FFFFFF" />`;
  } else if (style === "linear_dark") {
    cardMarkup = `<rect x="36" y="22" width="1008" height="316" rx="24" fill="rgba(24,24,27,0.88)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />`;
  } else {
    // pizzatown
    cardMarkup = `<rect x="30" y="18" width="1020" height="324" rx="24" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />`;
  }

  // Build slots markup
  const slotsMarkup = slots
    .map((slot) => {
      const isStamped = slot.index < currentStamps;
      const isFinal = slot.index === target - 1;
      const displayEmoji = isFinal ? "🎁" : iconEmoji;
      const fontSize = Math.round(slot.radius * 0.95);

      if (style === "pizzatown") {
        if (isStamped) {
          return `
            <g>
              <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="#FFFFFF" />
              <text x="${slot.cx}" y="${slot.cy + 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${displayEmoji}</text>
            </g>`;
        }
        return `
          <g>
            <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="rgba(17,17,19,0.94)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" />
            <text x="${slot.cx}" y="${slot.cy + 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" opacity="${isFinal ? "0.45" : "0.32"}">${displayEmoji}</text>
          </g>`;
      }

      if (style === "nails_white") {
        if (isStamped) {
          return `
            <g>
              <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="${accent}" />
              <text x="${slot.cx}" y="${slot.cy + 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${displayEmoji}</text>
            </g>`;
        }
        return `
          <g>
            <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="#F3F4F6" stroke="#E5E7EB" stroke-width="1.5" />
            <text x="${slot.cx}" y="${slot.cy + 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" opacity="0.32">${displayEmoji}</text>
          </g>`;
      }

      // linear_dark
      if (isStamped) {
        return `
          <g>
            <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="${accent}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
            <text x="${slot.cx}" y="${slot.cy + 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${displayEmoji}</text>
          </g>`;
      }

      if (isFinal) {
        return `
          <g>
            <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.22)" stroke-width="2.5" />
            <text x="${slot.cx}" y="${slot.cy + 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" opacity="0.45">🎁</text>
          </g>`;
      }

      const numFontSize = Math.round(slot.radius * 0.72);
      return `
        <g>
          <circle cx="${slot.cx}" cy="${slot.cy}" r="${slot.radius}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.22)" stroke-width="2.5" />
          <text x="${slot.cx}" y="${slot.cy + 1}" font-size="${numFontSize}" font-weight="bold" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" opacity="0.5">${slot.index + 1}</text>
        </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${brand}" />
  ${cardMarkup}
  ${slotsMarkup}
</svg>`;
}

export function generateStampStripSvgDataUri(options: StripGeneratorOptions): string {
  const svg = generateStampStripSvg(options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
