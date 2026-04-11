import type { SupportedCurrency } from "@/lib/currencies";

export type AdminRole = "admin" | "superadmin" | "manager" | "verifier";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

export type MeResponse = {
  user: AdminUser;
};

export type RequestStatus = "pending" | "approved" | "rejected" | "verified";

export type ServiceVerificationStatus = "pending" | "verified" | "unverified";

export type ServiceVerificationAttempt = {
  status: Exclude<ServiceVerificationStatus, "pending">;
  verificationMode: string;
  comment: string;
  verifierNote?: string;
  attemptedAt: string;
  verifierId?: string | null;
  verifierName?: string;
  managerId?: string | null;
  managerName?: string;
  screenshotFileName?: string;
  screenshotMimeType?: string;
  screenshotFileSize?: number | null;
  screenshotData?: string;
};

export type ServiceVerification = {
  serviceId: string;
  serviceName: string;
  status: ServiceVerificationStatus;
  verificationMode: string;
  comment: string;
  attempts: ServiceVerificationAttempt[];
};

export type ReportMetadata = {
  generatedAt?: string | null;
  generatedBy?: string | null;
  generatedByName?: string;
  reportNumber?: string;
  customerSharedAt?: string | null;
};

export type InvoiceSnapshot = {
  currency: SupportedCurrency;
  subtotal: number;
  items: Array<{
    serviceId: string;
    serviceName: string;
    price: number;
  }>;
  billingEmail?: string;
  companyName?: string;
};

export type ReverificationAppeal = {
  status: "open" | "resolved";
  submittedAt: string;
  submittedBy?: string | null;
  submittedByName?: string;
  services?: Array<{
    serviceId: string;
    serviceName: string;
  }>;
  serviceId?: string;
  serviceName?: string;
  comment: string;
  attachmentFileName?: string;
  attachmentMimeType?: string;
  attachmentFileSize?: number | null;
  attachmentData?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByName?: string;
};

export type RequestItem = {
  _id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  verifierNames?: string[];
  createdByName?: string;
  status: RequestStatus;
  rejectionNote: string;
  candidateFormStatus?: "pending" | "submitted";
  candidateSubmittedAt?: string | null;
  enterpriseApprovedAt?: string | null;
  enterpriseDecisionLockedAt?: string | null;
  selectedServices?: CompanyServiceSelection[];
  serviceVerifications?: ServiceVerification[];
  reportMetadata?: ReportMetadata;
  reportData?: Record<string, unknown> | null;
  reverificationAppeal?: ReverificationAppeal | null;
  invoiceSnapshot?: InvoiceSnapshot | null;
  candidateFormResponses?: Array<{
    serviceId: string;
    serviceName: string;
    answers: Array<{
      fieldKey?: string;
      question: string;
      fieldType: "text" | "long_text" | "number" | "file" | "date";
      required?: boolean;
      repeatable?: boolean;
      notApplicable?: boolean;
      notApplicableText?: string;
      value: string;
      fileName?: string;
      fileMimeType?: string;
      fileSize?: number | null;
      fileData?: string;
    }>;
  }>;
  createdAt: string;
  customerName: string;
  customerEmail: string;
};

export type ServiceFormField = {
  fieldKey?: string;
  question: string;
  iconKey?: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
  required: boolean;
  repeatable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
  allowNotApplicable?: boolean;
  notApplicableText?: string;
};

export type ServiceItem = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  isPackage: boolean;
  allowMultipleEntries?: boolean;
  multipleEntriesLabel?: string;
  hiddenFromCustomerPortal?: boolean;
  isDefaultPersonalDetails?: boolean;
  includedServiceIds: string[];
  formFields: ServiceFormField[];
};

export type CompanyServiceSelection = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: SupportedCurrency;
};

export type CompanyProfileAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type CompanyProfilePhone = {
  countryCode: string;
  number: string;
};

export type CompanyProfileDocument = {
  fileName: string;
  fileSize: number;
  fileType: string;
};

export type CompanyPartnerProfile = {
  companyInformation: {
    companyName: string;
    gstin: string;
    cinRegistrationNumber: string;
    address: CompanyProfileAddress;
    documents: CompanyProfileDocument[];
  };
  invoicingInformation: {
    billingSameAsCompany: boolean;
    invoiceEmail: string;
    address: CompanyProfileAddress;
    gstEnabled?: boolean;
    gstRate?: number;
  };
  primaryContactInformation: {
    firstName: string;
    lastName: string;
    designation: string;
    email: string;
    officePhone: CompanyProfilePhone;
    mobilePhone: CompanyProfilePhone;
    whatsappPhone: CompanyProfilePhone;
  };
  additionalQuestions: {
    heardAboutUs: string;
    referredBy: string;
    yearlyBackgroundsExpected: string;
    promoCode: string;
    primaryIndustry: string;
  };
  updatedAt: string | null;
};

export type ClusoDetailsResponse = {
  profile: CompanyPartnerProfile;
};

export type InvoicePartyDetails = {
  companyName: string;
  loginEmail: string;
  gstin: string;
  cinRegistrationNumber: string;
  address: string;
  invoiceEmail: string;
  billingSameAsCompany: boolean;
  billingAddress: string;
};

export type InvoiceLineItem = {
  serviceId: string;
  serviceName: string;
  usageCount: number;
  price: number;
  lineTotal: number;
  currency: SupportedCurrency;
};

export type InvoiceCurrencyTotal = {
  currency: SupportedCurrency;
  subtotal: number;
};

export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  billingMonth: string;
  gstEnabled: boolean;
  gstRate: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  enterpriseDetails: InvoicePartyDetails;
  clusoDetails: InvoicePartyDetails;
  lineItems: InvoiceLineItem[];
  totalsByCurrency: InvoiceCurrencyTotal[];
  generatedByName: string;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceWorkspaceResponse = {
  invoices: InvoiceRecord[];
  clusoDefaultDetails: InvoicePartyDetails;
};

export type CompanyItem = {
  id: string;
  name: string;
  email: string;
  selectedServices: CompanyServiceSelection[];
  partnerProfile: CompanyPartnerProfile;
  stats?: {
    totalRequests: number;
    assignedVerifiers: string[];
    lastRequestDate: string | null;
    lastRequestStatus: string | null;
  };
};
