import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Set it in your environment before running this script.");
}

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    role: String,
    parentCustomer: mongoose.Schema.Types.ObjectId,
    selectedServices: Array,
  },
  { collection: "users" },
);

const VerificationRequestSchema = new mongoose.Schema(
  {
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, default: "" },
    candidatePhone: { type: String, default: "" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionNote: { type: String, default: "" },
    selectedServices: [
      {
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
        serviceName: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, enum: ["INR", "USD"], default: "INR" },
      },
    ],
  },
  { collection: "verificationrequests", timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const VerificationRequest =
  mongoose.models.VerificationRequest ||
  mongoose.model("VerificationRequest", VerificationRequestSchema);

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function pickServices(customerUser) {
  if (!customerUser.selectedServices || customerUser.selectedServices.length === 0) {
    return [];
  }

  return customerUser.selectedServices.slice(0, Math.min(2, customerUser.selectedServices.length));
}

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "cluso" });
  console.log("Connected to DB");

  const customer = await User.findOne({ email: "enterprise@techcorp.com", role: "customer" }).lean();
  if (!customer) {
    throw new Error("Enterprise account not found. Run reset_users.mjs first.");
  }

  const delegate = await User.findOne({
    email: "delegate@techcorp.com",
    role: "delegate",
    parentCustomer: customer._id,
  }).lean();

  const services = pickServices(customer);

  const seedData = [
    {
      candidateName: "Ayesha Khan",
      candidateEmail: "ayesha.khan@example.com",
      candidatePhone: "+91-9900011111",
      customer: customer._id,
      createdBy: customer._id,
      status: "pending",
      rejectionNote: "",
      selectedServices: services,
      createdAt: makeDate(1),
      updatedAt: makeDate(1),
    },
    {
      candidateName: "Rohan Mehta",
      candidateEmail: "rohan.mehta@example.com",
      candidatePhone: "+91-9900022222",
      customer: customer._id,
      createdBy: delegate?._id || customer._id,
      status: "approved",
      rejectionNote: "",
      selectedServices: services,
      createdAt: makeDate(4),
      updatedAt: makeDate(2),
    },
    {
      candidateName: "Priya Nair",
      candidateEmail: "priya.nair@example.com",
      candidatePhone: "+91-9900033333",
      customer: customer._id,
      createdBy: customer._id,
      status: "rejected",
      rejectionNote: "Insufficient employment documents.",
      selectedServices: services,
      createdAt: makeDate(6),
      updatedAt: makeDate(3),
    },
    {
      candidateName: "Imran Siddiqui",
      candidateEmail: "imran.siddiqui@example.com",
      candidatePhone: "+91-9900044444",
      customer: customer._id,
      createdBy: delegate?._id || customer._id,
      status: "approved",
      rejectionNote: "",
      selectedServices: services,
      createdAt: makeDate(16),
      updatedAt: makeDate(12),
    },
    {
      candidateName: "Neha Sharma",
      candidateEmail: "neha.sharma@example.com",
      candidatePhone: "+91-9900055555",
      customer: customer._id,
      createdBy: customer._id,
      status: "rejected",
      rejectionNote: "Candidate email did not match supporting records.",
      selectedServices: services,
      createdAt: makeDate(22),
      updatedAt: makeDate(17),
    },
  ];

  const existingCandidates = seedData.map((item) => item.candidateEmail);
  await VerificationRequest.deleteMany({
    customer: customer._id,
    candidateEmail: { $in: existingCandidates },
  });

  const inserted = await VerificationRequest.insertMany(seedData);
  console.log(`Inserted ${inserted.length} test verification requests.`);
  console.log("Recent requests (<14d): 3, Archived requests (>=14d): 2");

  await mongoose.disconnect();
  console.log("Done");
}

run().catch(async (err) => {
  console.error("Failed to seed test requests:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
