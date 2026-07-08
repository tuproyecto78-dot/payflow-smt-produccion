// Seed script: creates the administrator account for PayFlow SMT.
// Idempotent — safe to run multiple times.
//
// Behavior:
// - Creates or updates the admin account (password, role, name).
// - Ensures the admin has a project.
// - Ensures the "Cobro por WhatsApp con IA" template flow exists.
//   If it already exists, it is NOT overwritten (user modifications are preserved).
//   Pass --reset-template to force-overwrite the template flow with the latest version.
// - Removes any leftover empty "Admin Flow" from older seeds.
//
// Usage:
//   bun run scripts/seed-admin.ts               # idempotent setup
//   bun run scripts/seed-admin.ts --reset-template  # force-reset the template flow
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { TEMPLATES } from "../src/lib/templates";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@payflow.smt";
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || "admin123";
const ADMIN_NAME = "Administrator";
const ADMIN_PROJECT_NAME = "Admin Workspace";
const RESET_TEMPLATE = process.argv.includes("--reset-template");

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // 1. Create or update the admin user.
  let admin = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    admin = await db.user.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash, role: "admin", name: ADMIN_NAME },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log("✓ Admin account updated:", admin.email);
  } else {
    admin = await db.user.create({
      data: { email: ADMIN_EMAIL, passwordHash, name: ADMIN_NAME, role: "admin" },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log("✓ Admin account created:", admin.email);
  }

  // 2. Ensure the admin has a project.
  let project = await db.project.findFirst({
    where: { userId: admin.id, name: ADMIN_PROJECT_NAME },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: ADMIN_PROJECT_NAME,
        description: "Proyecto predeterminado del administrador de PayFlow SMT.",
        userId: admin.id,
      },
    });
    console.log("✓ Project created:", project.name);
  } else {
    console.log("✓ Project exists:", project.name);
  }

  // 3. Remove leftover empty "Admin Flow" from older seeds.
  const leftover = await db.workflow.findMany({
    where: { projectId: project.id, name: "Admin Flow" },
    select: { id: true, name: true },
  });
  if (leftover.length > 0) {
    await db.workflow.deleteMany({ where: { id: { in: leftover.map((w) => w.id) } } });
    console.log(`✓ Removed ${leftover.length} empty "Admin Flow" workflow(s).`);
  }

  // 4. Ensure ALL template flows exist (idempotent — one row per template name).
  for (const tpl of TEMPLATES) {
    const existing = await db.workflow.findFirst({
      where: { projectId: project.id, name: tpl.name },
      select: { id: true, name: true, updatedAt: true },
    });

    if (!existing) {
      await db.workflow.create({
        data: {
          name: tpl.name,
          projectId: project.id,
          nodesJson: JSON.stringify(tpl.nodes),
          edgesJson: JSON.stringify(tpl.edges),
        },
      });
      console.log(`✓ Template flow created: "${tpl.name}"`);
    } else if (RESET_TEMPLATE) {
      await db.workflow.update({
        where: { id: existing.id },
        data: {
          nodesJson: JSON.stringify(tpl.nodes),
          edgesJson: JSON.stringify(tpl.edges),
        },
      });
      console.log(`✓ Template flow RESET to latest: "${tpl.name}"`);
    } else {
      console.log(`✓ Template flow already exists (preserved): "${tpl.name}"`);
      console.log(`  Last updated: ${existing.updatedAt.toISOString()}`);
    }
  }
  console.log(`  Tip: use --reset-template to overwrite all templates with the latest version.`);

  // Summary
  const allWorkflows = await db.workflow.findMany({
    where: { projectId: project.id },
    select: { id: true, name: true },
  });
  console.log("\n────────────────────────────────────────");
  console.log("  Admin credentials for PayFlow SMT");
  console.log("────────────────────────────────────────");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  Role:     admin`);
  console.log(`  Workflows in "${project.name}":`);
  for (const w of allWorkflows) {
    console.log(`    - ${w.name} (${w.id})`);
  }
  console.log("────────────────────────────────────────\n");
}

main()
  .catch((err) => {
    console.error("✗ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
