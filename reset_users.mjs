import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import fs from "fs";

const MONGODB_URI = "mongodb+srv://Cluso:Litera%402016@cluster0.qettuov.mongodb.net/cluso?appName=Cluster0";

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

  await createAccount("Super Admin Test", "superadmin@cluso.com", "admin123", "superadmin");
  await createAccount("Admin Test", "admin@cluso.com", "admin123", "admin");
  const customer = await createAccount("Enterprise Tech Corp", "enterprise@techcorp.com", "cust123", "customer");
  await createAccount("Delegate Jane", "delegate@techcorp.com", "del123", "delegate", customer._id);

  const txtContent = "=== Cluso Test Credentials ===\n\n" + output.join("\n");
  fs.writeFileSync("test_credentials.txt", txtContent);

  console.log("Written to test_credentials.txt");
  process.exit(0);
}

run().catch(console.error);
