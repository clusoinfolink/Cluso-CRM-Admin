import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

// Load environment variables from cluso-admin/.env.local
dotenv.config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI is not set in cluso-admin/.env.local");
  process.exit(1);
}

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
  console.log("Connecting to DB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.");

  const email = "ahmad@cluso.in".toLowerCase();
  const password = "Cluso@2026";
  const role = "superadmin";

  const passwordHash = await bcrypt.hash(password, 10);

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    console.log(`User ${email} already exists. Updating to superadmin with new password...`);
    existingUser.role = role;
    existingUser.passwordHash = passwordHash;
    await existingUser.save();
    console.log("User updated successfully!");
  } else {
    console.log(`Creating new superadmin account: ${email}...`);
    await User.create({
      name: "Ahmad",
      email,
      passwordHash,
      role,
      parentCustomer: null,
      selectedServices: []
    });
    console.log("Superadmin user created successfully!");
  }

  await mongoose.disconnect();
  console.log("Disconnected from DB. Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
