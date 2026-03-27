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

export type RequestStatus = "pending" | "approved" | "rejected";

export type RequestItem = {
  _id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  createdByName?: string;
  status: RequestStatus;
  rejectionNote: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
};

export type ServiceFormField = {
  question: string;
  fieldType: "text" | "number";
};

export type ServiceItem = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  formFields: ServiceFormField[];
};

export type CompanyServiceSelection = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: SupportedCurrency;
};

export type CompanyItem = {
  id: string;
  name: string;
  email: string;
  selectedServices: CompanyServiceSelection[];
};
