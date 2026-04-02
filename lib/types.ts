import type { SupportedCurrency } from "@/lib/currencies";

export type AdminRole = "admin" | "superadmin" | "verifier";

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

export type RequestItem = {
  _id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  createdByName?: string;
  status: RequestStatus;
  rejectionNote: string;
  candidateFormStatus?: "pending" | "submitted";
  candidateSubmittedAt?: string | null;
  selectedServices?: CompanyServiceSelection[];
  candidateFormResponses?: Array<{
    serviceId: string;
    serviceName: string;
    answers: Array<{
      question: string;
      fieldType: "text" | "long_text" | "number" | "file" | "date";
      required?: boolean;
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
  question: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
  required: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
};

export type ServiceItem = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  isPackage: boolean;
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

export type CompanyItem = {
  id: string;
  name: string;
  email: string;
  selectedServices: CompanyServiceSelection[];
  partnerProfile: CompanyPartnerProfile;
};
