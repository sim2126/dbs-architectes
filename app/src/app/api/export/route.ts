import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import * as XLSX from "xlsx";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      assignments: {
        include: { user: { select: { name: true, initials: true } } },
      },
    },
  });

  const rows = projects.map((p) => ({
    Code: p.code,
    Title: p.title,
    Category: p.category,
    Phase: p.phase,
    Client: p.client ?? "",
    Year: p.year ?? "",
    Commune: p.commune ?? "",
    Typology: p.typology ?? "",
    Terrain: p.terrain ?? "",
    Roof: p.roof ?? "",
    Floors: p.floors ?? "",
    "Area (m²)": p.area ?? "",
    Status: p.status,
    Billing: p.billing ?? "",
    Notes: p.notes ?? "",
    "Assigned To": p.assignments.map((a) => a.user.name ?? a.user.initials).join(", "),
    "Page Link": p.pageLink ?? "",
    "Created At": p.createdAt.toLocaleDateString("it-CH"),
    "Updated At": p.updatedAt.toLocaleDateString("it-CH"),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
    { wch: 8 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 30 },
    { wch: 25 }, { wch: 40 }, { wch: 14 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Progetti");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  pendoTrack("projects_exported", {
    visitorId: session.user.id,
    properties: {
      projectCount: projects.length,
      exportFormat: "xlsx",
    },
  });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DBS_Progetti_${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  });
}
