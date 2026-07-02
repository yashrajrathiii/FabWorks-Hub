// Quotation math ported 1:1 from the owner's v1 calculator prototype.
// Weight: cross-section area (m²) × length (m) × density (kg/m³).
// Price: material + per-kg overhead (monthly costs ÷ throughput × complexity)
//        + fittings + delivery + services, then profit margin, then optional GST.
import type { QuoteData, QuotePart } from "@/types";

export const SHAPES = [
  { value: "box", label: "Box pipe / tube (hollow)" },
  { value: "sqbar", label: "Square bar (solid)" },
  { value: "rndbar", label: "Round bar (solid)" },
  { value: "flat", label: "Flat bar / strip" },
  { value: "angle", label: "Angle (L)" },
  { value: "manual", label: "Manual weight (kg)" },
] as const;

export const MATERIALS = [
  { density: 7850, label: "Mild steel / iron" },
  { density: 7200, label: "Cast iron" },
  { density: 8000, label: "Stainless steel" },
  { density: 8960, label: "Copper" },
] as const;

export const COMPLEXITY_OPTIONS = [
  { value: 1, label: "Simple / bulk material (1.0×)" },
  { value: 1.5, label: "Standard fabrication (1.5×)" },
  { value: 2, label: "Complex / heavy fabrication (2.0×)" },
  { value: 2.5, label: "Intricate + finishing (2.5×)" },
] as const;

/** Dimension fields per member shape: [key, label, default]. len is metres, the rest mm. */
export const DIM_TEMPLATES: Record<string, [string, string, number][]> = {
  box: [
    ["len", "Length (m)", 1],
    ["w", "Width (mm)", 50],
    ["h", "Height (mm)", 50],
    ["t", "Wall thk (mm)", 2],
  ],
  sqbar: [
    ["len", "Length (m)", 1],
    ["side", "Side (mm)", 16],
  ],
  rndbar: [
    ["len", "Length (m)", 1],
    ["dia", "Diameter (mm)", 12],
  ],
  flat: [
    ["len", "Length (m)", 1],
    ["w", "Width (mm)", 32],
    ["t", "Thickness (mm)", 5],
  ],
  angle: [
    ["len", "Length (m)", 1],
    ["leg", "Leg (mm)", 40],
    ["t", "Thickness (mm)", 5],
  ],
  manual: [["kg", "Weight per piece (kg)", 10]],
};

const mm = (x: number | undefined) => (x ?? 0) / 1000;

/** kg for ONE piece */
export function unitWeight(part: Pick<QuotePart, "shape" | "dims" | "density">): number {
  const d = part.dims;
  const L = d.len ?? 0;
  let area = 0; // cross-section m²
  switch (part.shape) {
    case "box": {
      const W = mm(d.w), H = mm(d.h), t = mm(d.t);
      area = W * H - Math.max(0, W - 2 * t) * Math.max(0, H - 2 * t);
      break;
    }
    case "sqbar": {
      const s = mm(d.side);
      area = s * s;
      break;
    }
    case "rndbar": {
      const r = mm(d.dia) / 2;
      area = Math.PI * r * r;
      break;
    }
    case "flat":
      area = mm(d.w) * mm(d.t);
      break;
    case "angle": {
      const leg = mm(d.leg), t = mm(d.t);
      area = 2 * leg * t - t * t;
      break;
    }
    case "manual":
      return d.kg ?? 0;
  }
  return area * L * part.density;
}

/** Count of repeating members across a span at centre-to-centre spacing, or null if not used. */
export function piecesFromSpan(dims: QuotePart["dims"]): number | null {
  const cc = dims.cc ?? 0;
  const span = dims.span ?? 0;
  if (cc > 0 && span > 0) return Math.floor((span * 1000) / cc) + 1;
  return null;
}

/** Effective pieces for a part (entered qty × span count when spacing is used). */
export function partPieces(part: QuotePart): number {
  const spanCount = piecesFromSpan(part.dims);
  return spanCount ? part.qty * spanCount : part.qty;
}

export function partTotalKg(part: QuotePart): number {
  return unitWeight(part) * partPieces(part);
}

export function buildSpec(part: QuotePart): string {
  const d = part.dims;
  const mat = MATERIALS.find((m) => m.density === part.density)?.label ?? "";
  let spec = "";
  switch (part.shape) {
    case "box": spec = `${d.w}×${d.h} box, ${d.t}mm wall, ${d.len}m`; break;
    case "sqbar": spec = `${d.side}mm sq bar, ${d.len}m`; break;
    case "rndbar": spec = `Ø${d.dia}mm bar, ${d.len}m`; break;
    case "flat": spec = `${d.w}×${d.t} flat, ${d.len}m`; break;
    case "angle": spec = `${d.leg}×${d.leg}×${d.t} angle, ${d.len}m`; break;
    case "manual": spec = `${d.kg} kg/pc`; break;
  }
  const spanCount = piecesFromSpan(d);
  if (spanCount) spec += ` · ${spanCount} pcs @ ${d.cc}mm C/C`;
  return `${mat} · ${spec}`;
}

export interface QuoteTotals {
  totalKg: number;
  perKgBaseOverhead: number;
  perKgOverhead: number;
  material: number;
  overhead: number;
  fittings: number;
  delivery: number;
  services: number;
  subtotal: number;
  profit: number;
  gst: number;
  total: number;
  effectivePerKg: number;
}

export function computeQuote(data: QuoteData): QuoteTotals {
  const totalKg = data.parts.reduce((sum, p) => sum + partTotalKg(p), 0);
  const { labourPerMonth, elecPerMonth, throughputKg } = data.overhead;
  const perKgBaseOverhead = (labourPerMonth + elecPerMonth) / (throughputKg || 1);
  const perKgOverhead = perKgBaseOverhead * data.complexity;

  const material = totalKg * data.ratePerKg;
  const overhead = totalKg * perKgOverhead;
  const services = data.services.reduce((sum, s) => sum + (s.amount || 0), 0);
  const subtotal = material + overhead + data.fittings + data.delivery + services;
  const profit = subtotal * (data.marginPct / 100);
  const beforeTax = subtotal + profit;
  const gst = beforeTax * (data.gstPct / 100);
  const total = beforeTax + gst;

  return {
    totalKg,
    perKgBaseOverhead,
    perKgOverhead,
    material,
    overhead,
    fittings: data.fittings,
    delivery: data.delivery,
    services,
    subtotal,
    profit,
    gst,
    total,
    effectivePerKg: totalKg > 0 ? total / totalKg : 0,
  };
}

export const defaultQuoteData: QuoteData = {
  parts: [],
  ratePerKg: 65,
  complexity: 1.5,
  marginPct: 15,
  fittings: 0,
  delivery: 0,
  services: [],
  gstPct: 18,
  overhead: { labourPerMonth: 250000, elecPerMonth: 20000, throughputKg: 4000 },
};
