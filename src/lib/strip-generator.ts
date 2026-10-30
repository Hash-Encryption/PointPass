import { PNG } from "pngjs";

export type StripStyle = "pizzatown" | "nails_white" | "linear_dark";

export interface StripGeneratorOptions {
  targetStamps: number;
  stamps: number;
  brandColor?: string | null | undefined;
  accentColor?: string | null | undefined;
  stampIcon?: string | null | undefined;
  stripStyle?: StripStyle | string | null | undefined;
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseHex(hex?: string | null, fallback = "#121214"): RGBA {
  let clean = (hex || fallback).trim().replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) {
    clean = fallback.replace("#", "");
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return { r, g, b, a: 255 };
}

export function autoContrast(hex?: string | null): string {
  const { r, g, b } = parseHex(hex, "#10B981");
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#121214" : "#FFFFFF";
}

function blendPixel(png: PNG, x: number, y: number, color: RGBA, alphaMultiplier = 1) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (y * png.width + x) * 4;
  const effectiveAlpha = (color.a / 255) * Math.max(0, Math.min(1, alphaMultiplier));
  if (effectiveAlpha <= 0) return;

  if (effectiveAlpha >= 0.999) {
    png.data[idx] = color.r;
    png.data[idx + 1] = color.g;
    png.data[idx + 2] = color.b;
    png.data[idx + 3] = 255;
    return;
  }

  const dstR = png.data[idx]!;
  const dstG = png.data[idx + 1]!;
  const dstB = png.data[idx + 2]!;
  const inv = 1 - effectiveAlpha;

  png.data[idx] = Math.round(color.r * effectiveAlpha + dstR * inv);
  png.data[idx + 1] = Math.round(color.g * effectiveAlpha + dstG * inv);
  png.data[idx + 2] = Math.round(color.b * effectiveAlpha + dstB * inv);
  png.data[idx + 3] = 255;
}

function drawCircle(
  png: PNG,
  cx: number,
  cy: number,
  radius: number,
  fill: RGBA | null,
  stroke: RGBA | null,
  strokeWidth = 0,
) {
  const minX = Math.max(0, Math.floor(cx - radius - 2));
  const maxX = Math.min(png.width - 1, Math.ceil(cx + radius + 2));
  const minY = Math.max(0, Math.floor(cy - radius - 2));
  const maxY = Math.min(png.height - 1, Math.ceil(cy + radius + 2));

  const hasStroke = stroke !== null && strokeWidth > 0;
  const rOuter = radius;
  const rInner = radius - strokeWidth;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist = Math.hypot(x - cx, y - cy);

      if (hasStroke) {
        if (dist > rOuter + 0.5) continue;
        if (dist < rInner - 0.5) {
          if (fill) blendPixel(png, x, y, fill, 1);
        } else {
          // Inside stroke or stroke transition zone
          const outerCoverage = Math.max(0, Math.min(1, rOuter + 0.5 - dist));
          const innerCoverage = Math.max(0, Math.min(1, dist - (rInner - 0.5)));
          const strokeAlpha = Math.min(outerCoverage, innerCoverage);

          if (fill && dist < rInner + 0.5) {
            const fillAlpha = Math.max(0, Math.min(1, rInner + 0.5 - dist));
            blendPixel(png, x, y, fill, fillAlpha);
          }
          blendPixel(png, x, y, stroke!, strokeAlpha);
        }
      } else if (fill) {
        if (dist <= rOuter - 0.5) {
          blendPixel(png, x, y, fill, 1);
        } else if (dist <= rOuter + 0.5) {
          const coverage = Math.max(0, Math.min(1, rOuter + 0.5 - dist));
          blendPixel(png, x, y, fill, coverage);
        }
      }
    }
  }
}

function drawRoundedRect(
  png: PNG,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  fill: RGBA | null,
  stroke: RGBA | null,
  strokeWidth = 0,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Determine corner distance if in a corner
      let dist = 0;
      let inCorner = false;

      if (x < x0 + r && y < y0 + r) {
        dist = Math.hypot(x - (x0 + r), y - (y0 + r));
        inCorner = true;
      } else if (x > x1 - r && y < y0 + r) {
        dist = Math.hypot(x - (x1 - r), y - (y0 + r));
        inCorner = true;
      } else if (x < x0 + r && y > y1 - r) {
        dist = Math.hypot(x - (x0 + r), y - (y1 - r));
        inCorner = true;
      } else if (x > x1 - r && y > y1 - r) {
        dist = Math.hypot(x - (x1 - r), y - (y1 - r));
        inCorner = true;
      }

      if (inCorner && dist > r + 0.5) continue;

      const alpha = inCorner ? Math.max(0, Math.min(1, r + 0.5 - dist)) : 1;

      const isBorder =
        stroke &&
        strokeWidth > 0 &&
        (x < x0 + strokeWidth ||
          x > x1 - strokeWidth ||
          y < y0 + strokeWidth ||
          y > y1 - strokeWidth ||
          (inCorner && dist >= r - strokeWidth));

      if (isBorder && stroke) {
        blendPixel(png, x, y, stroke, alpha);
      } else if (fill) {
        blendPixel(png, x, y, fill, alpha);
      }
    }
  }
}

// 20x20 Icon Bitmaps
const ICON_PATTERNS: Record<string, string[]> = {
  check: [
    "....................",
    "....................",
    "..................#.",
    ".................##.",
    "................###.",
    "...............####.",
    "..#...........#####.",
    "..##.........######.",
    "..###.......######..",
    "...###.....######...",
    "....###...######....",
    ".....###.######.....",
    "......########......",
    ".......######.......",
    "........####........",
    ".........##.........",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  star: [
    ".........##.........",
    "........####........",
    "........####........",
    ".......######.......",
    ".##################.",
    "..################..",
    "...##############...",
    "....############....",
    ".....##########.....",
    "....############....",
    "...##############...",
    "..################..",
    "..####..####..####..",
    ".###.....##.....###.",
    ".##..............##.",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  coffee: [
    "....#.....#.....#...",
    ".....#.....#.....#..",
    "....#.....#.....#...",
    "....................",
    ".##############.....",
    ".##############.##..",
    ".##############.###.",
    ".##############..##.",
    ".##############.##..",
    ".##############.##..",
    ".##############.....",
    "..############......",
    "...##########.......",
    "....########........",
    "....................",
    ".##################.",
    ".##################.",
    "....................",
    "....................",
    "....................",
  ],
  burger: [
    "....................",
    "......########......",
    "....############....",
    "...##############...",
    "..################..",
    "..################..",
    "....................",
    ".##################.",
    ".##################.",
    "....................",
    "..################..",
    "..################..",
    "...##############...",
    "....############....",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  bakery: [
    "....................",
    "........####........",
    "......########......",
    "....############....",
    "...##############...",
    "..################..",
    ".##################.",
    ".####...####...####.",
    ".##......##......##.",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  salon: [
    ".##..............##.",
    ".####..........####.",
    ".##.##........##.##.",
    ".##.##........##.##.",
    ".####..........####.",
    "..##............##..",
    "...##..........##...",
    "....##........##....",
    ".....##......##.....",
    "......########......",
    ".......######.......",
    "......########......",
    ".....###....###.....",
    "....###......###....",
    "...###........###...",
    "..###..........###..",
    ".###............###.",
    "....................",
    "....................",
    "....................",
  ],
  car: [
    "....................",
    "....................",
    ".......######.......",
    ".....##########.....",
    "....############....",
    "...##..######..##...",
    ".##################.",
    ".##################.",
    ".##################.",
    "..####........####..",
    "..####........####..",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  gift: [
    "......##..##........",
    ".....###..###.......",
    "....####..####......",
    "......##..##........",
    ".##################.",
    ".##################.",
    ".######.##.########.",
    ".######.##.########.",
    ".##################.",
    ".######.##.########.",
    ".######.##.########.",
    ".######.##.########.",
    ".######.##.########.",
    ".##################.",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
};

// 5x7 Number Font
const DIGIT_FONT: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "..#", "###", "#..", "#..", "###"],
  "3": ["###", "..#", "..#", "###", "..#", "..#", "###"],
  "4": ["#.#", "#.#", "#.#", "###", "..#", "..#", "..#"],
  "5": ["###", "#..", "#..", "###", "..#", "..#", "###"],
  "6": ["###", "#..", "#..", "###", "#.#", "#.#", "###"],
  "7": ["###", "..#", "..#", ".#.", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "#.#", "###", "#.#", "#.#", "###"],
  "9": ["###", "#.#", "#.#", "###", "..#", "..#", "###"],
};

function drawBitmap(
  png: PNG,
  pattern: string[],
  cx: number,
  cy: number,
  scale: number,
  color: RGBA,
) {
  const pHeight = pattern.length;
  const pWidth = pattern[0]?.length ?? 0;
  const startX = Math.round(cx - (pWidth * scale) / 2);
  const startY = Math.round(cy - (pHeight * scale) / 2);

  for (let r = 0; r < pHeight; r++) {
    const row = pattern[r]!;
    for (let c = 0; c < pWidth; c++) {
      if (row[c] === "#") {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            blendPixel(png, startX + c * scale + dx, startY + r * scale + dy, color, 1);
          }
        }
      }
    }
  }
}

function drawNumber(png: PNG, num: number, cx: number, cy: number, scale: number, color: RGBA) {
  const str = String(num);
  const digitWidth = 3 * scale;
  const spacing = 1 * scale;
  const totalWidth = str.length * digitWidth + (str.length - 1) * spacing;
  let currentX = Math.round(cx - totalWidth / 2);
  const startY = Math.round(cy - (7 * scale) / 2);

  for (let i = 0; i < str.length; i++) {
    const digit = DIGIT_FONT[str[i]!];
    if (digit) {
      for (let r = 0; r < 7; r++) {
        const row = digit[r]!;
        for (let c = 0; c < 3; c++) {
          if (row[c] === "#") {
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                blendPixel(png, currentX + c * scale + dx, startY + r * scale + dy, color, 1);
              }
            }
          }
        }
      }
    }
    currentX += digitWidth + spacing;
  }
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

export function generateStampStripPng(options: StripGeneratorOptions): Buffer {
  const width = 1080;
  const height = 360;
  const png = new PNG({ width, height });

  const brandRgba = parseHex(options.brandColor, "#121214");
  const accentHex = options.accentColor || "#10B981";
  const accentRgba = parseHex(accentHex, "#10B981");
  const contrastHex = autoContrast(accentHex);
  const contrastRgba = parseHex(contrastHex, "#FFFFFF");

  const style: StripStyle =
    options.stripStyle === "nails_white" || options.stripStyle === "linear_dark"
      ? options.stripStyle
      : "pizzatown";

  // 1. Fill base canvas with brandColor
  for (let i = 0; i < width * height * 4; i += 4) {
    png.data[i] = brandRgba.r;
    png.data[i + 1] = brandRgba.g;
    png.data[i + 2] = brandRgba.b;
    png.data[i + 3] = 255;
  }

  // 2. Draw card container surface per style
  if (style === "nails_white") {
    // Nails White Card: Crisp white rounded card container
    drawRoundedRect(
      png,
      32,
      20,
      width - 33,
      height - 21,
      26,
      { r: 255, g: 255, b: 255, a: 255 },
      null,
      0,
    );
  } else if (style === "linear_dark") {
    // Linear Dark: Elevated dark charcoal card over brand background
    drawRoundedRect(
      png,
      36,
      22,
      width - 37,
      height - 23,
      24,
      { r: 24, g: 24, b: 27, a: 220 },
      { r: 255, g: 255, b: 255, a: 26 },
      1.5,
    );
  } else {
    // Pizzatown: Full-bleed brand background with subtle inner boundary
    drawRoundedRect(
      png,
      30,
      18,
      width - 31,
      height - 19,
      24,
      null,
      { r: 255, g: 255, b: 255, a: 20 },
      1.5,
    );
  }

  const target = Math.max(3, Math.min(options.targetStamps || 8, 12));
  const currentStamps = Math.max(0, options.stamps || 0);
  const iconKey = resolveStampIcon(options.stampIcon, null, options.brandColor);
  const iconPattern = ICON_PATTERNS[iconKey] || ICON_PATTERNS["star"]!;
  const giftPattern = ICON_PATTERNS["gift"]!;

  // 3. Compute slot coordinates
  interface Slot {
    index: number;
    cx: number;
    cy: number;
    radius: number;
  }
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

  // 4. Render slots per chosen style
  for (const slot of slots) {
    const isStamped = slot.index < currentStamps;
    const isFinalRewardSlot = slot.index === target - 1;
    const pat = isFinalRewardSlot ? giftPattern : iconPattern;
    const iconScale = Math.round((slot.radius * 2 * 0.44) / 20) || 2;

    if (style === "pizzatown") {
      // Pizzatown: High-contrast circular badges.
      // Earned: Crisp white circle with saturated icon inside.
      // Remaining: Deep dark circle with muted icon visible in every slot.
      if (isStamped) {
        drawCircle(png, slot.cx, slot.cy, slot.radius, { r: 255, g: 255, b: 255, a: 255 }, null, 0);
        drawBitmap(png, pat, slot.cx, slot.cy, iconScale, accentRgba);
      } else {
        drawCircle(
          png,
          slot.cx,
          slot.cy,
          slot.radius,
          { r: 17, g: 17, b: 19, a: 240 },
          { r: 255, g: 255, b: 255, a: 40 },
          1.5,
        );
        drawBitmap(
          png,
          pat,
          slot.cx,
          slot.cy,
          iconScale,
          isFinalRewardSlot ? { r: 255, g: 255, b: 255, a: 95 } : { r: 255, g: 255, b: 255, a: 70 },
        );
      }
    } else if (style === "nails_white") {
      // Nails White Card:
      // Earned: Filled with vibrant accent color, white icon inside.
      // Remaining: Light grey badge with bold charcoal icon inside.
      if (isStamped) {
        drawCircle(png, slot.cx, slot.cy, slot.radius, accentRgba, null, 0);
        drawBitmap(png, pat, slot.cx, slot.cy, iconScale, { r: 255, g: 255, b: 255, a: 255 });
      } else {
        drawCircle(
          png,
          slot.cx,
          slot.cy,
          slot.radius,
          { r: 243, g: 244, b: 246, a: 255 },
          { r: 229, g: 231, b: 235, a: 255 },
          1.5,
        );
        drawBitmap(png, pat, slot.cx, slot.cy, iconScale, { r: 24, g: 24, b: 27, a: 200 });
      }
    } else {
      // Linear Dark:
      // Earned: Accent filled with subtle border.
      // Remaining: Dark translucent center with subtle ring, stamp number inside.
      if (isStamped) {
        drawCircle(
          png,
          slot.cx,
          slot.cy,
          slot.radius,
          accentRgba,
          { r: 255, g: 255, b: 255, a: 80 },
          1.5,
        );
        drawBitmap(png, pat, slot.cx, slot.cy, iconScale, contrastRgba);
      } else {
        drawCircle(
          png,
          slot.cx,
          slot.cy,
          slot.radius,
          { r: 255, g: 255, b: 255, a: 12 },
          { r: 255, g: 255, b: 255, a: 56 },
          2.5,
        );
        if (isFinalRewardSlot) {
          drawBitmap(png, giftPattern, slot.cx, slot.cy, iconScale, {
            r: 255,
            g: 255,
            b: 255,
            a: 90,
          });
        } else {
          drawNumber(png, slot.index + 1, slot.cx, slot.cy, 3, {
            r: 255,
            g: 255,
            b: 255,
            a: 95,
          });
        }
      }
    }
  }

  return PNG.sync.write(png);
}

export function generateStampStripDataUri(options: StripGeneratorOptions): string {
  const buf = generateStampStripPng(options);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
