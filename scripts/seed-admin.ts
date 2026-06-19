// Seed script: creates the administrator account for PayFlow SMT.
// Idempotent — safe to run multiple times. Updates password/role if the account exists.
//
// Usage: bun run scripts/seed-admin.ts
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { TEMPLATES } from "../src/lib/templates";

const ADMIN_EMAIL = "admin@payflow.smt";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Administrator";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    const updated = await db.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        passwordHash,
        role: "admin",
        name: ADMIN_NAME,
      },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log("✓ Admin account updated:");
    console.log(updated);
  } else {
    const created = await db.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
        role: "admin",
      },
      select: { id: true, email: true, name: true, role: true },
    });

    // Give the admin a starter project with the payment template pre-applied.
    const tpl = TEMPLATES[0];
    await db.project.create({
      data: {
        name: "Admin Workspace",
        description: "Default project for the PayFlow SMT administrator.",
        userId: created.id,
        workflows: {
          create: [
            {
              name: tpl.name,
              nodesJson: JSON.stringify(tpl.nodes),
              edgesJson: JSON.stringify(tpl.edges),
            },
          ],
        },
      },
    });

    console.log("✓ Admin account created:");
    console.log(created);
  }

  console.log("\n────────────────────────────────────────");
  console.log("  Admin credentials for PayFlow SMT");
  console.log("────────────────────────────────────────");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  Role:     admin`);
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
