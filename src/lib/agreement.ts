// Printable payment agreement + email draft for a closed deal.
// The "PDF" is the browser's print → Save as PDF on a clean A4 layout — no extra deps.
import type { PaymentInstallment } from "@/types";

export const defaultInstallments: Omit<PaymentInstallment, "id">[] = [
  { label: "Advance", pct: 50 },
  { label: "On materials made", pct: 25 },
  { label: "On delivery", pct: 20 },
  { label: "After completion", pct: 5 },
];

export interface AgreementInput {
  quoteNumber: number | null;
  projectTitle: string;
  clientName: string;
  finalAmount: number;
  installments: PaymentInstallment[];
  notes?: string | null;
  validUntil?: string | null;
}

const fmt = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");

export function installmentAmount(finalAmount: number, pct: number): number {
  return (finalAmount * pct) / 100;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildAgreementHtml(input: AgreementInput): string {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const rows = input.installments
    .map(
      (i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(i.label)}</td>
        <td class="r">${i.pct}%</td>
        <td class="r"><b>${fmt(installmentAmount(input.finalAmount, i.pct))}</b></td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Payment Agreement${input.quoteNumber ? ` — Quote #${input.quoteNumber}` : ""}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1917; line-height: 1.55; font-size: 14px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4318FF; padding-bottom: 14px; }
  .brand { font-size: 22px; font-weight: 800; }
  .brand small { display: block; font-size: 12px; font-weight: 400; color: #78716c; }
  .meta { text-align: right; font-size: 12px; color: #78716c; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #4318FF; margin: 26px 0 8px; }
  .box { border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .grid .k { color: #78716c; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #78716c; border-bottom: 2px solid #e7e5e4; padding: 8px 10px; }
  td { padding: 9px 10px; border-bottom: 1px solid #f5f5f4; }
  .r { text-align: right; }
  .total { display: flex; justify-content: space-between; align-items: baseline; background: #4318FF; color: #fff; border-radius: 8px; padding: 12px 18px; margin-top: 14px; }
  .total .v { font-size: 22px; font-weight: 700; }
  .sig { display: flex; justify-content: space-between; margin-top: 60px; gap: 40px; }
  .sig div { flex: 1; border-top: 1px solid #a8a29e; padding-top: 6px; font-size: 12px; color: #78716c; }
  .notes { font-size: 12.5px; color: #57534e; white-space: pre-wrap; }
  .print-hint { position: fixed; top: 8px; right: 8px; background: #fef3c7; padding: 6px 10px; border-radius: 6px; font-size: 12px; }
  @media print { .print-hint { display: none; } }
</style>
</head>
<body>
  <p class="print-hint">Press Ctrl/Cmd+P → "Save as PDF"</p>
  <div class="head">
    <div class="brand">FabWorks — Iron &amp; Steel Fabrication<small>Payment agreement</small></div>
    <div class="meta">
      ${input.quoteNumber ? `Quote ref: #${input.quoteNumber}<br>` : ""}
      Date: ${today}
      ${input.validUntil ? `<br>Valid until: ${esc(input.validUntil)}` : ""}
    </div>
  </div>

  <h2>Project</h2>
  <div class="box grid">
    <div><span class="k">Client</span><br><b>${esc(input.clientName || "—")}</b></div>
    <div><span class="k">Work</span><br><b>${esc(input.projectTitle || "—")}</b></div>
  </div>

  <h2>Agreed price &amp; payment schedule</h2>
  <table>
    <thead><tr><th>#</th><th>Stage</th><th class="r">Share</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total"><span>Total agreed price</span><span class="v">${fmt(input.finalAmount)}</span></div>

  ${input.notes ? `<h2>Terms &amp; notes</h2><p class="notes">${esc(input.notes)}</p>` : ""}

  <div class="sig">
    <div>Client signature</div>
    <div>For FabWorks</div>
  </div>
</body>
</html>`;
}

export function buildAgreementEmail(input: AgreementInput, clientEmail?: string | null): string {
  const lines = input.installments.map(
    (i) => `- ${i.label} (${i.pct}%): ${fmt(installmentAmount(input.finalAmount, i.pct))}`
  );
  const body = [
    `Dear ${input.clientName || "Sir/Madam"},`,
    ``,
    `Thank you for confirming the work${input.projectTitle ? ` — ${input.projectTitle}` : ""}.`,
    ``,
    `As agreed, the total price is ${fmt(input.finalAmount)}${input.quoteNumber ? ` (quote ref #${input.quoteNumber})` : ""}.`,
    ``,
    `Payment schedule:`,
    ...lines,
    ``,
    ...(input.notes ? [input.notes, ``] : []),
    `Regards,`,
    `FabWorks — Iron & Steel Fabrication`,
  ].join("\n");

  const subject = `Payment terms${input.projectTitle ? ` — ${input.projectTitle}` : ""}`;
  return `mailto:${clientEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openAgreementPrintView(input: AgreementInput): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildAgreementHtml(input));
  win.document.close();
  win.focus();
}
