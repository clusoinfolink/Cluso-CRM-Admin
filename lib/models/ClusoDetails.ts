import { InferSchemaType, Model, Schema, model, models } from "mongoose";

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

const WireTransferDetailsSchema = new Schema(
  {
    accountHolderName: { type: String, default: "", trim: true },
    accountNumber: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    ifscCode: { type: String, default: "", trim: true },
    branchName: { type: String, default: "", trim: true },
    swiftCode: { type: String, default: "", trim: true },
    instructions: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const InvoicingPaymentMethodsSchema = new Schema(
  {
    upiId: { type: String, default: "", trim: true },
    upiQrCodeImageUrl: { type: String, default: "", trim: true },
    wireTransfer: {
      type: WireTransferDetailsSchema,
      default: () => ({}),
    },
  },
  { _id: false },
);

const ClusoProfileSchema = new Schema(
  {
    companyInformation: {
      companyName: { type: String, default: "", trim: true },
      gstin: { type: String, default: "", trim: true },
      cinRegistrationNumber: { type: String, default: "", trim: true },
      sacCode: { type: String, default: "", trim: true },
      ltuCode: { type: String, default: "", trim: true },
      address: { type: AddressSchema, default: () => ({}) },
      documents: { type: [CompanyDocumentSchema], default: [] },
    },
    invoicingInformation: {
      billingSameAsCompany: { type: Boolean, default: true },
      invoiceEmail: { type: String, default: "", trim: true },
      address: { type: AddressSchema, default: () => ({}) },
      paymentMethods: {
        type: InvoicingPaymentMethodsSchema,
        default: () => ({}),
      },
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

const ClusoDetailsSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      default: "cluso-details",
      trim: true,
    },
    profile: {
      type: ClusoProfileSchema,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

export type ClusoDetailsDocument = InferSchemaType<typeof ClusoDetailsSchema> & {
  _id: string;
};

const hasSlugPath = Boolean(models.ClusoDetails?.schema.path("slug"));
const hasProfilePath = Boolean(models.ClusoDetails?.schema.path("profile"));
const hasSacCodePath = Boolean(models.ClusoDetails?.schema.path("profile.companyInformation.sacCode"));
const hasLtuCodePath = Boolean(models.ClusoDetails?.schema.path("profile.companyInformation.ltuCode"));
const hasPaymentMethodsPath = Boolean(models.ClusoDetails?.schema.path("profile.invoicingInformation.paymentMethods"));
const hasUpiPath = Boolean(models.ClusoDetails?.schema.path("profile.invoicingInformation.paymentMethods.upiId"));
const hasWirePath = Boolean(models.ClusoDetails?.schema.path("profile.invoicingInformation.paymentMethods.wireTransfer.accountNumber"));

if (
  models.ClusoDetails &&
  (!hasSlugPath ||
    !hasProfilePath ||
    !hasSacCodePath ||
    !hasLtuCodePath ||
    !hasPaymentMethodsPath ||
    !hasUpiPath ||
    !hasWirePath)
) {
  delete models.ClusoDetails;
}

const ClusoDetails =
  (models.ClusoDetails as Model<ClusoDetailsDocument>) ||
  model("ClusoDetails", ClusoDetailsSchema);

export default ClusoDetails;