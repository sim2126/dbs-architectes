import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin" || session.user.role === "super_admin";
  const projects = await prisma.project.findMany({
    where: isAdmin ? undefined : { assignments: { some: { userId: session.user.id } } },
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

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csv = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column as keyof typeof row])).join(",")),
  ].join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="DBS_Progetti_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
