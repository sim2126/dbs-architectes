import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@dbsarc.com" },
    update: {},
    create: {
      email: "admin@dbsarc.com",
      name: "Admin DBS",
      password: adminPassword,
      role: "super_admin",
      initials: "AD",
      isActive: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    },
  });

  const pmPassword = await bcrypt.hash("pm123", 10);
  const users = [
    { email: "vn@dbsarc.com", name: "VN", initials: "VN", role: "viewer" },
    { email: "eb@dbsarc.com", name: "Edoardo Bernasconi", initials: "EB", role: "project_manager" },
    { email: "sf@dbsarc.com", name: "Sergio Facchetti", initials: "SF", role: "collaborator" },
    { email: "mi@dbsarc.com", name: "Marco Iebba", initials: "MI", role: "collaborator" },
    { email: "shr@dbsarc.com", name: "S HR", initials: "SHR", role: "viewer" },
    { email: "ps@dbsarc.com", name: "PS User", initials: "PS", role: "project_manager" },
    { email: "ar@dbsarc.com", name: "AR User", initials: "AR", role: "collaborator" },
    { email: "gl@dbsarc.com", name: "GL User", initials: "GL", role: "collaborator" },
    { email: "nd@dbsarc.com", name: "ND User", initials: "ND", role: "viewer" },
    { email: "wsh@dbsarc.com", name: "WSH User", initials: "WSH", role: "viewer" },
    { email: "fsh@dbsarc.com", name: "FSH User", initials: "FSH", role: "collaborator" },
    { email: "jz@dbsarc.com", name: "JZ User", initials: "JZ", role: "project_manager" },
    { email: "imd@dbsarc.com", name: "IMD User", initials: "IMD", role: "collaborator" },
    { email: "pz@dbsarc.com", name: "PZ User", initials: "PZ", role: "viewer" },
    { email: "col@dbsarc.com", name: "C C", initials: "COL", role: "viewer" },
    { email: "ev@dbsarc.com", name: "EV User", initials: "EV", role: "collaborator" },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        ...u,
        password: pmPassword,
        isActive: true,
        canCreate: u.role === "project_manager",
        canEdit: u.role !== "viewer",
        canDelete: false,
      },
    });
  }

  const projects = [
    { code: "DBS328", title: "DBS328 Haute-Nendaz Fin Bec", category: "Residenziale", phase: "ETUDE / AP", client: "Privé", year: 2024, commune: "Haute-Nendaz", typology: "Ville monofamiliari", terrain: "In pendenza", roof: "A falde" },
    { code: "DBS2024-66", title: "DBS2024-66 Grimisuat Sabatier", category: "Residenziale", phase: "MAE", client: "Sabatier", year: 2024, commune: "Grimisuat", typology: "Ville bifamiliari", terrain: "In piano", roof: "Piano" },
    { code: "DBS283-10", title: "DBS283-10 Riddes Gare", category: "Residenziale", phase: "CHANTIER", client: "Riddes Dev", year: 2023, commune: "Riddes", typology: "Condomini", terrain: "In piano", roof: "Piano" },
    { code: "DBS182", title: "DBS182 Corin 3174", category: "Residenziale", phase: "EXE / DG / DV / 3D", client: "Corin Partners", year: 2022, commune: "Corin", typology: "Ville monofamiliari", terrain: "In pendenza", roof: "A falde" },
    { code: "DBS010", title: "DBS010 Baroque Giorgetti", category: "Residenziale", phase: "TERMINATO", client: "Giorgetti", year: 2021, commune: "Sion", typology: "Condomini", terrain: "In piano", roof: "Piano" },
    { code: "DBS2025-104", title: "DBS2025-104 Saviese Crettaz d'y Railles 9409", category: "Residenziale", phase: "ETUDE / AP", client: "Crettaz", year: 2025, commune: "Savièse", typology: "Ville monofamiliari", terrain: "In pendenza", roof: "A falde" },
    { code: "DBS020", title: "DBS020 Martigny Clairvaz", category: "Residenziale", phase: "MAE", client: "Clairvaz", year: 2023, commune: "Martigny", typology: "Ville bifamiliari", terrain: "In piano", roof: "Piano" },
    { code: "DBS087", title: "DBS087 Turin Mazetta", category: "Commerciale", phase: "ETUDE / AP", client: "Mazetta Group", year: 2024, commune: "Turin", typology: "Condomini", terrain: "In piano", roof: "Piano" },
    { code: "DBS145-00", title: "DBS145-00 Sion Commercial", category: "Commerciale", phase: "STUCK", client: "Sion Dev", year: 2022, commune: "Sion", typology: "Condomini", terrain: "In piano", roof: "Piano" },
    { code: "DBS1VML", title: "1 Villa Moderna Lago di Como", category: "Residenziale", phase: "ETUDE / AP", client: "Lago Partners", year: 2024, commune: "Como", typology: "Ville monofamiliari", terrain: "In pendenza", roof: "A falde" },
    { code: "DBS150", title: "DBS150 Sion Centre", category: "Commerciale", phase: "EXE / DG / DV / 3D", client: "Sion Centre SA", year: 2023, commune: "Sion", typology: "Condomini", terrain: "In piano", roof: "Piano" },
    { code: "DBS200", title: "DBS200 Lens Villa", category: "Residenziale", phase: "CHANTIER", client: "Privé", year: 2023, commune: "Lens", typology: "Ville monofamiliari", terrain: "In pendenza", roof: "A falde" },
    { code: "DBS210", title: "DBS210 Sierre Residence", category: "Residenziale", phase: "MAE", client: "Sierre Dev", year: 2024, commune: "Sierre", typology: "Condomini", terrain: "In piano", roof: "Piano" },
    { code: "DBS220", title: "DBS220 Vex Chalet", category: "Residenziale", phase: "ETUDE / AP", client: "Privé", year: 2025, commune: "Vex", typology: "Ville monofamiliari", terrain: "In pendenza", roof: "A falde" },
    { code: "DBS230", title: "DBS230 Montana Apartments", category: "Residenziale", phase: "EXE / DG / DV / 3D", client: "Montana Invest", year: 2023, commune: "Montana", typology: "Condomini", terrain: "In pendenza", roof: "Piano" },
  ];

  for (const p of projects) {
    await prisma.project.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  const adminUser = await prisma.user.findUnique({ where: { email: "admin@dbsarc.com" } });
  const allProjects = await prisma.project.findMany();
  const allUsers = await prisma.user.findMany({ where: { isActive: true } });

  for (let i = 0; i < allProjects.length; i++) {
    const user1 = allUsers[i % allUsers.length];
    const user2 = allUsers[(i + 3) % allUsers.length];
    await prisma.projectAssignment.upsert({
      where: { projectId_userId: { projectId: allProjects[i].id, userId: user1.id } },
      update: {},
      create: { projectId: allProjects[i].id, userId: user1.id },
    });
    if (user1.id !== user2.id) {
      await prisma.projectAssignment.upsert({
        where: { projectId_userId: { projectId: allProjects[i].id, userId: user2.id } },
        update: {},
        create: { projectId: allProjects[i].id, userId: user2.id },
      });
    }
  }

  if (adminUser) {
    const agendaCount = await prisma.workItem.count({
      where: { legacyAgendaId: { not: null } },
    });
    if (agendaCount === 0) {
      const agendaSeeds = [
        { title: "Riunione team DBS328", description: "Review Haute-Nendaz", dueDate: new Date(Date.now() + 2 * 86400000), type: "meeting" as const, priority: "high", color: "#3b82f6" },
        { title: "Deadline Grimisuat MAE", description: "Consegna elaborati", dueDate: new Date(Date.now() + 7 * 86400000), type: "deadline" as const, priority: "critical", color: "#ef4444" },
        { title: "Sopralluogo Riddes Gare", dueDate: new Date(Date.now() + 3 * 86400000), type: "milestone" as const, priority: "medium", color: "#22c55e" },
        { title: "Presentazione cliente Como", dueDate: new Date(Date.now() + 14 * 86400000), type: "meeting" as const, priority: "high", color: "#f59e0b" },
      ];
      await prisma.workItem.createMany({
        data: agendaSeeds.map((item) => {
          const id = randomUUID();
          return {
            ...item,
            id,
            legacyAgendaId: id,
            legacyAgendaType: item.type,
            status: "pending",
            userId: adminUser.id,
          };
        }),
      });
    }

    const activityCount = await prisma.activity.count();
    if (activityCount === 0) {
      await prisma.activity.createMany({
        data: [
          { type: "created", description: "Progetto DBS328 creato", userId: adminUser.id },
          { type: "updated", description: "DBS283-10 aggiornato - fase CHANTIER", userId: adminUser.id },
          { type: "assigned", description: "EB assegnato a DBS2024-66", userId: adminUser.id },
          { type: "created", description: "Progetto DBS2025-104 creato", userId: adminUser.id },
          { type: "updated", description: "Nota aggiunta al progetto DBS010", userId: adminUser.id },
        ],
      });
    }
  }

  // Seed default public channels
  if (adminUser) {
    const defaultChannels = [
      { name: "general", description: "General team discussion", type: "public" },
      { name: "announcements", description: "Company-wide announcements", type: "public" },
      { name: "design-team", description: "Architecture & design discussions", type: "public" },
      { name: "projects", description: "Project updates and coordination", type: "public" },
    ];
    for (const ch of defaultChannels) {
      const existing = await prisma.channel.findFirst({ where: { name: ch.name } });
      if (!existing) {
        await prisma.channel.create({
          data: {
            name: ch.name,
            description: ch.description,
            type: ch.type,
            creator: { connect: { id: adminUser.id } },
          },
        });
      }
    }
  }

  console.log("✅ Seed completato!");
  console.log("🔑 Login: admin@dbsarc.com / admin123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
