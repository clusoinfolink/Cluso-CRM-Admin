import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    role: String,
    manager: mongoose.Schema.Types.ObjectId,
  },
  { collection: "users" },
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

function parseArgs(argv) {
  const args = {
    map: "",
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--map") {
      args.map = (argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log("Usage:");
  console.log(
    "  npm run team:assign-managers -- --map \"verifier1@x.com=manager1@x.com,verifier2@x.com=manager2@x.com\" [--dry-run]",
  );
  console.log("");
  console.log("Tips:");
  console.log("  - Use comma-separated verifier=manager pairs.");
  console.log("  - Use manager value 'none' to unassign an existing verifier manager.");
  console.log("  - Add --dry-run to preview changes without writing to DB.");
}

function loadEnvFromDotEnvLocal() {
  const root = process.cwd();
  const envPath = path.join(root, ".env.local");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");
    process.env[key] = value;
  }
}

function parseAssignments(mapString) {
  if (!mapString) {
    return [];
  }

  const entries = mapString
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const assignments = [];

  for (const entry of entries) {
    const parts = entry.split("=").map((item) => item.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid map entry '${entry}'. Expected verifierEmail=managerEmail`);
    }

    const verifierEmail = parts[0].toLowerCase();
    const rawManagerValue = parts[1].toLowerCase();

    if (!verifierEmail.includes("@")) {
      throw new Error(`Invalid verifier email '${parts[0]}'.`);
    }

    const isUnassign = rawManagerValue === "none" || rawManagerValue === "null";
    if (!isUnassign && !rawManagerValue.includes("@")) {
      throw new Error(`Invalid manager email '${parts[1]}'.`);
    }

    assignments.push({
      verifierEmail,
      managerEmail: isUnassign ? null : rawManagerValue,
    });
  }

  return assignments;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const assignments = parseAssignments(args.map);
  if (assignments.length === 0) {
    printHelp();
    throw new Error("No assignments provided. Pass --map with at least one verifier=manager pair.");
  }

  loadEnvFromDotEnvLocal();

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Add it to .env.local or environment variables.");
  }

  await mongoose.connect(mongoUri, { dbName: "cluso" });

  const verifierEmails = [...new Set(assignments.map((item) => item.verifierEmail))];
  const managerEmails = [
    ...new Set(assignments.map((item) => item.managerEmail).filter((item) => Boolean(item))),
  ];

  const [verifiers, managers] = await Promise.all([
    User.find({ role: "verifier", email: { $in: verifierEmails } }).lean(),
    managerEmails.length > 0
      ? User.find({ role: "manager", email: { $in: managerEmails } }).lean()
      : Promise.resolve([]),
  ]);

  const verifierByEmail = new Map(verifiers.map((item) => [item.email?.toLowerCase(), item]));
  const managerByEmail = new Map(managers.map((item) => [item.email?.toLowerCase(), item]));

  const results = [];

  for (const assignment of assignments) {
    const verifier = verifierByEmail.get(assignment.verifierEmail);
    if (!verifier) {
      results.push({
        verifierEmail: assignment.verifierEmail,
        managerEmail: assignment.managerEmail,
        status: "failed",
        detail: "Verifier not found or not a verifier role.",
      });
      continue;
    }

    let managerId = null;
    if (assignment.managerEmail) {
      const manager = managerByEmail.get(assignment.managerEmail);
      if (!manager) {
        results.push({
          verifierEmail: assignment.verifierEmail,
          managerEmail: assignment.managerEmail,
          status: "failed",
          detail: "Manager not found or not a manager role.",
        });
        continue;
      }

      managerId = String(manager._id);
    }

    const currentManagerId = verifier.manager ? String(verifier.manager) : null;
    const unchanged = currentManagerId === managerId;

    if (!args.dryRun && !unchanged) {
      await User.updateOne(
        { _id: verifier._id, role: "verifier" },
        { $set: { manager: managerId } },
      );
    }

    results.push({
      verifierEmail: assignment.verifierEmail,
      managerEmail: assignment.managerEmail,
      status: unchanged ? "unchanged" : args.dryRun ? "preview" : "updated",
      detail: unchanged
        ? "Already assigned."
        : args.dryRun
          ? "Would update manager assignment."
          : "Manager assignment updated.",
    });
  }

  const updatedCount = results.filter((item) => item.status === "updated").length;
  const previewCount = results.filter((item) => item.status === "preview").length;
  const unchangedCount = results.filter((item) => item.status === "unchanged").length;
  const failedCount = results.filter((item) => item.status === "failed").length;

  console.log("\nVerifier -> Manager assignment results");
  for (const item of results) {
    const managerLabel = item.managerEmail || "none";
    console.log(
      `- ${item.verifierEmail} => ${managerLabel} | ${item.status.toUpperCase()} | ${item.detail}`,
    );
  }

  console.log("\nSummary");
  console.log(`- Updated: ${updatedCount}`);
  console.log(`- Preview: ${previewCount}`);
  console.log(`- Unchanged: ${unchangedCount}`);
  console.log(`- Failed: ${failedCount}`);

  await mongoose.disconnect();

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch(async (error) => {
  console.error("Failed to assign verifiers to managers:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
