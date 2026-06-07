import { getCurrentUser } from "@/lib/dal";
import { getPaymentsForExport } from "@/lib/payments-list";
import {
  PAY_METHOD_LABEL as PAY_METHOD,
  PAYMENT_STATUS_LABEL as STATUS_LABEL,
} from "@/lib/labels";

const COLUMNS = [
  "Üzv",
  "ID",
  "Period",
  "Müddət",
  "Ödəniş tarixi",
  "Üsul",
  "Məbləğ",
  "Status",
];

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const sp = new URL(request.url).searchParams;

  const rows = await getPaymentsForExport(user.gymId, {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    method: sp.get("method") ?? undefined,
    range: sp.get("range") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") ?? undefined,
  });

  const lines = [COLUMNS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.memberName,
        r.publicId,
        r.periodLabel,
        iso(r.dueDate),
        r.paidAt ? iso(r.paidAt) : "",
        r.method ? PAY_METHOD[r.method] ?? r.method : "",
        r.amount.toFixed(2),
        STATUS_LABEL[r.eff],
      ]
        .map((v) => csvCell(String(v)))
        .join(",")
    );
  }

  // BOM so Excel reads the Azerbaijani characters as UTF-8; CRLF line endings.
  const csv = "﻿" + lines.join("\r\n");
  const filename = `odenisler-${iso(new Date())}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
