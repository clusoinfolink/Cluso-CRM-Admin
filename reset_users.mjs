import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Set it in your environment before running this script.");
}

function resolvePassword(envName) {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return `Cluso${crypto.randomBytes(4).toString("hex")}`;
}

const SUPERADMIN_PASSWORD = resolvePassword("RESET_SUPERADMIN_PASSWORD");
const ADMIN_PASSWORD = resolvePassword("RESET_ADMIN_PASSWORD");
const CUSTOMER_PASSWORD = resolvePassword("RESET_CUSTOMER_PASSWORD");
const DELEGATE_PASSWORD = resolvePassword("RESET_DELEGATE_PASSWORD");

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    passwordHash: String,
    role: String,
    parentCustomer: mongoose.Schema.Types.ObjectId,
    selectedServices: Array
  },
  { collection: "users" }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to DB");

  await User.deleteMany({});
  console.log("Deleted all old users.");

  const output = [];

  const addLog = (role, email, pw) => {
    const displayRole = role === "customer" ? "enterprise" : role;
    output.push(`Role: ${displayRole}\nEmail: ${email}\nPassword: ${pw}\n----------------------`);
  };

  const createAccount = async (name, email, password, role, parentCustomer = null) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      parentCustomer,
      selectedServices: []
    });
    addLog(role, email, password);
    return user;
  };

  await createAccount("Super Admin Test", "superadmin@cluso.com", SUPERADMIN_PASSWORD, "superadmin");
  await createAccount("Admin Test", "admin@cluso.com", ADMIN_PASSWORD, "admin");
  const customer = await createAccount(
    "Enterprise Tech Corp",
    "enterprise@techcorp.com",
    CUSTOMER_PASSWORD,
    "customer",
  );
  await createAccount(
    "Delegate Jane",
    "delegate@techcorp.com",
    DELEGATE_PASSWORD,
    "delegate",
    customer._id,
  );

  const txtContent = "=== Cluso Test Credentials ===\n\n" + output.join("\n");
  fs.writeFileSync("test_credentials.txt", txtContent);

  console.log("Written to test_credentials.txt");
  process.exit(0);
}

run().catch(console.error);
