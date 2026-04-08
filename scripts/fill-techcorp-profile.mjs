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
    partnerProfile: mongoose.Schema.Types.Mixed,
  },
  { collection: "users" },
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const dummyPartnerProfile = {
  companyInformation: {
    companyName: "Customer Tech Corp",
    gstin: "29AAACC1234F1Z5",
    cinRegistrationNumber: "U72900KA2020PTC123456",
    address: {
      line1: "5th Floor, Orion Business Park",
      line2: "Sector 21",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560102",
      country: "India",
    },
    documents: [
      {
        fileName: "techcorp-incorporation-certificate.pdf",
        fileSize: 245760,
        fileType: "application/pdf",
      },
      {
        fileName: "techcorp-gstin-certificate.pdf",
        fileSize: 198656,
        fileType: "application/pdf",
      },
    ],
  },
  invoicingInformation: {
    billingSameAsCompany: false,
    invoiceEmail: "billing@techcorp.com",
    address: {
      line1: "Accounts Department, Tower B",
      line2: "Finance Block",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560103",
      country: "India",
    },
  },
  primaryContactInformation: {
    firstName: "Aman",
    lastName: "Rao",
    designation: "Head of HR Operations",
    email: "aman.rao@techcorp.com",
    officePhone: {
      countryCode: "India (+91)",
      number: "08041234567",
    },
    mobilePhone: {
      countryCode: "India (+91)",
      number: "9876543210",
    },
    whatsappPhone: {
      countryCode: "India (+91)",
      number: "9876543210",
    },
  },
  additionalQuestions: {
    heardAboutUs: "LinkedIn",
    referredBy: "Siscoverifier",
    yearlyBackgroundsExpected: "250",
    promoCode: "TECHCORP25",
    primaryIndustry: "Information Technology Services",
  },
  updatedAt: new Date(),
};

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: "cluso" });
  console.log("Connected to database.");

  const company = await User.findOne({
    role: "customer",
    $or: [{ email: /^customer@techcorp\.com$/i }, { name: /^customer tech corp$/i }],
  });

  if (!company) {
    throw new Error("Customer Tech Corp account not found.");
  }

  company.partnerProfile = dummyPartnerProfile;
  await company.save();

  console.log(`Updated partner profile for ${company.name} (${company.email}).`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(async (error) => {
  console.error("Failed to seed Customer Tech Corp profile:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
