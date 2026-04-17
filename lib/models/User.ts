import { InferSchemaType, Model, Schema, models, model } from "mongoose";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const AddressSchema = new Schema(
  {
    line1: { type: String, default: "", trim: true },
    line2: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    postalCode: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const PhoneSchema = new Schema(
  {
    countryCode: { type: String, default: "India (+91)", trim: true },
    number: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const CompanyDocumentSchema = new Schema(
  {
    fileName: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true, min: 0 },
    fileType: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const PartnerProfileSchema = new Schema(
  {
    companyInformation: {
      companyName: { type: String, default: "", trim: true },
      gstin: { type: String, default: "", trim: true },
      cinRegistrationNumber: { type: String, default: "", trim: true },
      address: { type: AddressSchema, default: () => ({}) },
      documents: { type: [CompanyDocumentSchema], default: [] },
    },
    invoicingInformation: {
      billingSameAsCompany: { type: Boolean, default: true },
      invoiceEmail: { type: String, default: "", trim: true },
      gstEnabled: { type: Boolean, default: false },
      gstRate: { type: Number, default: 18, min: 0, max: 100 },
      address: { type: AddressSchema, default: () => ({}) },
    },
    primaryContactInformation: {
      firstName: { type: String, default: "", trim: true },
      lastName: { type: String, default: "", trim: true },
      designation: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true },
      officePhone: { type: PhoneSchema, default: () => ({}) },
      mobilePhone: { type: PhoneSchema, default: () => ({}) },
      whatsappPhone: { type: PhoneSchema, default: () => ({}) },
    },
    additionalQuestions: {
      heardAboutUs: { type: String, default: "", trim: true },
      referredBy: { type: String, default: "", trim: true },
      yearlyBackgroundsExpected: { type: String, default: "", trim: true },
      promoCode: { type: String, default: "", trim: true },
      primaryIndustry: { type: String, default: "", trim: true },
    },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "superadmin",
        "admin",
        "manager",
        "verifier",
        "customer",
        "delegate",
        "delegate_user",
        "candidate",
      ],
      required: true,
    },
    manager: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedCompanies: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    parentCustomer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    selectedServices: [
      {
        serviceId: {
          type: Schema.Types.ObjectId,
          ref: "Service",
          required: true,
        },
        serviceName: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, enum: SUPPORTED_CURRENCIES, default: "INR" },
        countryRates: [
          {
            country: { type: String, required: true, trim: true },
            price: { type: Number, required: true, min: 0 },
            currency: { type: String, enum: SUPPORTED_CURRENCIES, required: true },
          },
        ],
      },
    ],
    partnerProfile: {
      type: PartnerProfileSchema,
      default: () => ({}),
    },
    companyAccessStatus: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: string };

const existingUserRoleValues = models.User?.schema.path("role")?.options?.enum;
const hasCandidateRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("candidate");
const hasDelegateUserRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("delegate_user");
const hasManagerRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("manager");
const hasPartnerProfilePath = Boolean(models.User?.schema.path("partnerProfile"));
const hasManagerPath = Boolean(models.User?.schema.path("manager"));
const hasPartnerProfileGstEnabledPath = Boolean(
  models.User?.schema.path("partnerProfile.invoicingInformation.gstEnabled"),
);
const hasPartnerProfileGstRatePath = Boolean(
  models.User?.schema.path("partnerProfile.invoicingInformation.gstRate"),
);
const hasCompanyAccessStatusPath = Boolean(models.User?.schema.path("companyAccessStatus"));
const hasCountryRatesPath = Boolean(models.User?.schema.path("selectedServices.countryRates"));

if (
  models.User &&
  (!models.User.schema.path("selectedServices") ||
    !models.User.schema.path("assignedCompanies") ||
    !hasCandidateRole ||
    !hasDelegateUserRole ||
    !hasManagerRole ||
    !hasPartnerProfilePath ||
    !hasManagerPath ||
    !hasPartnerProfileGstEnabledPath ||
    !hasPartnerProfileGstRatePath ||
    !hasCompanyAccessStatusPath ||
    !hasCountryRatesPath)
) {
  delete models.User;
}

const User = (models.User as Model<UserDocument>) || model("User", UserSchema);

export default User;
