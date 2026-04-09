"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, FileText, KeyRound, Save, ShieldCheck } from "lucide-react";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import type { ClusoDetailsResponse, CompanyPartnerProfile } from "@/lib/types";

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_COUNT = 5;

const COUNTRY_OPTIONS = [
  "India",
  "United Arab Emirates",
  "United States",
  "United Kingdom",
  "Singapore",
];

const PHONE_CODE_OPTIONS = [
  "India (+91)",
  "UAE (+971)",
  "US (+1)",
  "UK (+44)",
  "Singapore (+65)",
];

const HEARD_ABOUT_OPTIONS = [
  "Google / Search",
  "LinkedIn",
  "Client referral",
  "Email campaign",
  "Industry event",
  "Other",
];

const YEARLY_BACKGROUND_OPTIONS = [
  "1 - 25",
  "26 - 100",
  "101 - 250",
  "251 - 500",
  "500+",
];

const INDUSTRY_OPTIONS = [
  "Information Technology",
  "Banking / Financial Services",
  "Healthcare",
  "Manufacturing",
  "Retail / E-commerce",
  "Staffing / Recruitment",
  "Education",
  "Other",
];

function createEmptyProfile(): CompanyPartnerProfile {
  return {
    companyInformation: {
      companyName: "",
      gstin: "",
      cinRegistrationNumber: "",
      address: {
        line1: "",
        line2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "India",
      },
      documents: [],
    },
    invoicingInformation: {
      billingSameAsCompany: true,
      invoiceEmail: "",
      address: {
        line1: "",
        line2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "India",
      },
    },
    primaryContactInformation: {
      firstName: "",
      lastName: "",
      designation: "",
      email: "",
      officePhone: {
        countryCode: "India (+91)",
        number: "",
      },
      mobilePhone: {
        countryCode: "India (+91)",
        number: "",
      },
      whatsappPhone: {
        countryCode: "India (+91)",
        number: "",
      },
    },
    additionalQuestions: {
      heardAboutUs: "",
      referredBy: "",
      yearlyBackgroundsExpected: "",
      promoCode: "",
      primaryIndustry: "",
    },
    updatedAt: null,
  };
}

function isEmailLike(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

function isProfileComplete(profile: CompanyPartnerProfile) {
  const companyAddress = profile.companyInformation.address;
  const invoiceAddress = profile.invoicingInformation.billingSameAsCompany
    ? companyAddress
    : profile.invoicingInformation.address;

  return Boolean(
    profile.companyInformation.companyName.trim().length >= 2 &&
      companyAddress.line1.trim() &&
      companyAddress.city.trim() &&
      companyAddress.state.trim() &&
      companyAddress.postalCode.trim() &&
      companyAddress.country.trim() &&
      profile.companyInformation.documents.length > 0 &&
      isEmailLike(profile.invoicingInformation.invoiceEmail) &&
      invoiceAddress.line1.trim() &&
      invoiceAddress.city.trim() &&
      invoiceAddress.state.trim() &&
      invoiceAddress.postalCode.trim() &&
      invoiceAddress.country.trim() &&
      profile.primaryContactInformation.firstName.trim() &&
      profile.primaryContactInformation.lastName.trim() &&
      profile.primaryContactInformation.designation.trim() &&
      isEmailLike(profile.primaryContactInformation.email) &&
      profile.primaryContactInformation.mobilePhone.number.trim() &&
      profile.additionalQuestions.heardAboutUs.trim() &&
      profile.additionalQuestions.yearlyBackgroundsExpected.trim() &&
      profile.additionalQuestions.primaryIndustry.trim(),
  );
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function SettingsPage() {
  const { me, loading, logout } = useAdminSession();
  const isSuperAdmin = me?.role === "superadmin";

  const [profile, setProfile] = useState<CompanyPartnerProfile>(createEmptyProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const selectedDocumentLabel = useMemo(() => {
    const count = profile.companyInformation.documents.length;
    if (count === 0) {
      return "No file chosen";
    }

    return `${count} file${count === 1 ? "" : "s"} selected`;
  }, [profile.companyInformation.documents.length]);

  const profileSaveState = useMemo(() => {
    if (!profile.updatedAt) {
      return "not_saved" as const;
    }

    return isProfileComplete(profile) ? ("complete" as const) : ("draft" as const);
  }, [profile]);

  useEffect(() => {
    if (!me || !isSuperAdmin) {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileMessage("");

      try {
        const res = await fetch("/api/settings/cluso-details", { cache: "no-store" });
        const data = (await res.json()) as ClusoDetailsResponse & {
          error?: string;
        };

        if (!res.ok) {
          if (!cancelled) {
            setProfileMessage(data.error ?? "Could not load Cluso details.");
          }
          return;
        }

        if (!cancelled) {
          setProfile(data.profile ?? createEmptyProfile());
        }
      } catch {
        if (!cancelled) {
          setProfileMessage("Could not load Cluso details.");
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, me]);

  function updateCompanyAddress(
    field: keyof CompanyPartnerProfile["companyInformation"]["address"],
    value: string,
  ) {
    setProfile((prev) => {
      const nextCompanyAddress = {
        ...prev.companyInformation.address,
        [field]: value,
      };

      return {
        ...prev,
        companyInformation: {
          ...prev.companyInformation,
          address: nextCompanyAddress,
        },
        invoicingInformation: {
          ...prev.invoicingInformation,
          address: prev.invoicingInformation.billingSameAsCompany
            ? nextCompanyAddress
            : prev.invoicingInformation.address,
        },
      };
    });
  }

  function updateInvoicingAddress(
    field: keyof CompanyPartnerProfile["invoicingInformation"]["address"],
    value: string,
  ) {
    setProfile((prev) => ({
      ...prev,
      invoicingInformation: {
        ...prev.invoicingInformation,
        address: {
          ...prev.invoicingInformation.address,
          [field]: value,
        },
      },
    }));
  }

  function updatePhone(
    field: "officePhone" | "mobilePhone" | "whatsappPhone",
    key: "countryCode" | "number",
    value: string,
  ) {
    setProfile((prev) => ({
      ...prev,
      primaryContactInformation: {
        ...prev.primaryContactInformation,
        [field]: {
          ...prev.primaryContactInformation[field],
          [key]: value,
        },
      },
    }));
  }

  function onCompanyDocumentsChange(e: ChangeEvent<HTMLInputElement>) {
    const pickedFiles = Array.from(e.target.files ?? []);
    if (pickedFiles.length === 0) {
      e.target.value = "";
      return;
    }

    let skippedOversize = false;
    let skippedOverflow = false;

    setProfile((prev) => {
      const nextDocuments = [...prev.companyInformation.documents];

      for (const file of pickedFiles) {
        if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
          skippedOversize = true;
          continue;
        }

        const fileType = file.type || "application/octet-stream";
        const exists = nextDocuments.some(
          (doc) =>
            doc.fileName === file.name &&
            doc.fileType === fileType &&
            doc.fileSize === file.size,
        );

        if (exists) {
          continue;
        }

        if (nextDocuments.length >= MAX_DOCUMENT_COUNT) {
          skippedOverflow = true;
          continue;
        }

        nextDocuments.push({
          fileName: file.name,
          fileSize: file.size,
          fileType,
        });
      }

      return {
        ...prev,
        companyInformation: {
          ...prev.companyInformation,
          documents: nextDocuments,
        },
      };
    });

    if (skippedOversize) {
      setProfileMessage("Some files were skipped because they exceed 10 MB.");
    } else if (skippedOverflow) {
      setProfileMessage("Only 5 company documents are allowed.");
    } else {
      setProfileMessage("");
    }

    e.target.value = "";
  }

  function removeDocument(index: number) {
    setProfile((prev) => ({
      ...prev,
      companyInformation: {
        ...prev.companyInformation,
        documents: prev.companyInformation.documents.filter(
          (_, docIndex) => docIndex !== index,
        ),
      },
    }));
  }

  function onBillingSameChange(checked: boolean) {
    setProfile((prev) => ({
      ...prev,
      invoicingInformation: {
        ...prev.invoicingInformation,
        billingSameAsCompany: checked,
        address: checked
          ? prev.companyInformation.address
          : prev.invoicingInformation.address,
      },
    }));
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileMessage("");

    setSavingProfile(true);

    const payloadProfile: CompanyPartnerProfile = {
      ...profile,
      invoicingInformation: {
        ...profile.invoicingInformation,
        address: profile.invoicingInformation.billingSameAsCompany
          ? profile.companyInformation.address
          : profile.invoicingInformation.address,
      },
    };

    const res = await fetch("/api/settings/cluso-details", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: payloadProfile }),
    });

    const data = (await res.json()) as ClusoDetailsResponse & {
      message?: string;
      error?: string;
    };
    setSavingProfile(false);

    if (!res.ok) {
      setProfileMessage(data.error ?? "Could not save Cluso details.");
      return;
    }

    const nextProfile = data.profile ?? payloadProfile;
    setProfile(nextProfile);
    if (isProfileComplete(nextProfile)) {
      setProfileMessage(data.message ?? "Cluso details updated successfully.");
      return;
    }

    setProfileMessage("Saved as draft. You can complete the remaining fields later.");
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordMessage("New password and confirm password must match.");
      return;
    }

    setChangingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setChangingPassword(false);

    if (!res.ok) {
      setPasswordMessage(data.error ?? "Could not change password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage(data.message ?? "Password changed successfully.");
  }

  if (loading || !me) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Admin Settings"
      subtitle="Manage account security and superadmin-level Cluso invoicing profile details."
    >
      {isSuperAdmin ? (
        <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.65rem",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Building2 size={20} color="#4A90E2" />
              Cluso Company Profile
            </h2>
            <span className="neo-badge">
              {profileSaveState === "not_saved"
                ? "Not saved yet"
                : profileSaveState === "draft"
                  ? `Saved as Draft - ${new Date(profile.updatedAt as string).toLocaleDateString()}`
                  : `Profile Complete - ${new Date(profile.updatedAt as string).toLocaleDateString()}`}
            </span>
          </div>
          <p style={{ color: "#6C757D", margin: "0.4rem 0 0.95rem" }}>
            This data is stored in MongoDB as Cluso details and can be reused while generating
            invoices.
          </p>

          {profileLoading ? (
            <p style={{ margin: 0, color: "#64748B" }}>Loading Cluso details...</p>
          ) : (
            <form onSubmit={saveProfile} style={{ display: "grid", gap: "0.9rem" }} noValidate>
              <section
                style={{
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  background: "#FFFFFF",
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                <h3 style={{ margin: 0, color: "#2D405E", fontSize: "0.98rem" }}>
                  Company Information
                </h3>
                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-company-name">
                      Company Name *
                    </label>
                    <input
                      id="cluso-company-name"
                      className="input"
                      placeholder="Registered company name"
                      value={profile.companyInformation.companyName}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          companyInformation: {
                            ...prev.companyInformation,
                            companyName: e.target.value,
                          },
                        }))
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-gstin">
                      GSTIN (if applicable)
                    </label>
                    <input
                      id="cluso-gstin"
                      className="input"
                      placeholder="22AAAAA0000A1Z5"
                      value={profile.companyInformation.gstin}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          companyInformation: {
                            ...prev.companyInformation,
                            gstin: e.target.value.toUpperCase(),
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cluso-company-line1">
                    Street Address 1 *
                  </label>
                  <input
                    id="cluso-company-line1"
                    className="input"
                    placeholder="Building no., street name"
                    value={profile.companyInformation.address.line1}
                    onChange={(e) => updateCompanyAddress("line1", e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cluso-company-line2">
                    Street Address 2
                  </label>
                  <input
                    id="cluso-company-line2"
                    className="input"
                    placeholder="Area, locality, landmark (optional)"
                    value={profile.companyInformation.address.line2}
                    onChange={(e) => updateCompanyAddress("line2", e.target.value)}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-company-city">
                      City *
                    </label>
                    <input
                      id="cluso-company-city"
                      className="input"
                      placeholder="City"
                      value={profile.companyInformation.address.city}
                      onChange={(e) => updateCompanyAddress("city", e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-company-state">
                      State / Province / Region *
                    </label>
                    <input
                      id="cluso-company-state"
                      className="input"
                      placeholder="State / Province / Region"
                      value={profile.companyInformation.address.state}
                      onChange={(e) => updateCompanyAddress("state", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-company-postal">
                      Postal / ZIP Code *
                    </label>
                    <input
                      id="cluso-company-postal"
                      className="input"
                      placeholder="Postal / ZIP code"
                      value={profile.companyInformation.address.postalCode}
                      onChange={(e) => updateCompanyAddress("postalCode", e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-company-country">
                      Country *
                    </label>
                    <select
                      id="cluso-company-country"
                      className="input"
                      value={profile.companyInformation.address.country}
                      onChange={(e) => updateCompanyAddress("country", e.target.value)}
                      required
                    >
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cluso-cin">
                    CIN / Registration Number
                  </label>
                  <input
                    id="cluso-cin"
                    className="input"
                    placeholder="Company Identification Number"
                    value={profile.companyInformation.cinRegistrationNumber}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...prev,
                        companyInformation: {
                          ...prev.companyInformation,
                          cinRegistrationNumber: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </section>

              <section
                style={{
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  background: "#FFFFFF",
                  display: "grid",
                  gap: "0.65rem",
                }}
              >
                <h3 style={{ margin: 0, color: "#2D405E", fontSize: "0.98rem" }}>
                  Company Documents
                </h3>
                <p style={{ margin: 0, color: "#64748B", fontSize: "0.86rem" }}>
                  Upload any one of the following: GST Certificate, Certificate of Incorporation,
                  MOA/AOA, Trade License, or MSME/Udyam Registration.
                </p>

                <div style={{ border: "1px dashed #CBD5E1", borderRadius: "10px", padding: "0.8rem" }}>
                  <label className="label" htmlFor="cluso-company-documents">
                    Click to upload document(s)
                  </label>
                  <input
                    id="cluso-company-documents"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    onChange={onCompanyDocumentsChange}
                  />
                  <p style={{ margin: "0.45rem 0 0", color: "#64748B", fontSize: "0.82rem" }}>
                    {selectedDocumentLabel}
                  </p>

                  {profile.companyInformation.documents.length > 0 ? (
                    <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1rem", display: "grid", gap: "0.5rem" }}>
                      {profile.companyInformation.documents.map((doc, index) => (
                        <li
                          key={`${doc.fileName}-${doc.fileSize}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.55rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              color: "#334155",
                              fontSize: "0.84rem",
                            }}
                          >
                            <FileText size={14} /> {doc.fileName} ({formatFileSize(doc.fileSize)})
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => removeDocument(index)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p style={{ margin: "0.65rem 0 0", color: "#64748B", fontSize: "0.82rem" }}>
                    PDF, JPG, PNG - max 10 MB each, up to 5 files.
                  </p>
                </div>
              </section>

              <section
                style={{
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  background: "#FFFFFF",
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                <h3 style={{ margin: 0, color: "#2D405E", fontSize: "0.98rem" }}>
                  Invoicing Information
                </h3>

                <label
                  htmlFor="cluso-billing-same"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                >
                  <input
                    id="cluso-billing-same"
                    type="checkbox"
                    checked={profile.invoicingInformation.billingSameAsCompany}
                    onChange={(e) => onBillingSameChange(e.target.checked)}
                  />
                  Billing address same as company address
                </label>

                <div>
                  <label className="label" htmlFor="cluso-invoice-email">
                    Invoice Email Address *
                  </label>
                  <input
                    id="cluso-invoice-email"
                    className="input"
                    type="email"
                    placeholder="accounts@cluso.com"
                    value={profile.invoicingInformation.invoiceEmail}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...prev,
                        invoicingInformation: {
                          ...prev.invoicingInformation,
                          invoiceEmail: e.target.value,
                        },
                      }))
                    }
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cluso-invoice-line1">
                    Street Address 1 *
                  </label>
                  <input
                    id="cluso-invoice-line1"
                    className="input"
                    placeholder="Building no., street name"
                    value={profile.invoicingInformation.address.line1}
                    onChange={(e) => updateInvoicingAddress("line1", e.target.value)}
                    disabled={profile.invoicingInformation.billingSameAsCompany}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cluso-invoice-line2">
                    Street Address 2
                  </label>
                  <input
                    id="cluso-invoice-line2"
                    className="input"
                    placeholder="Area, locality, landmark (optional)"
                    value={profile.invoicingInformation.address.line2}
                    onChange={(e) => updateInvoicingAddress("line2", e.target.value)}
                    disabled={profile.invoicingInformation.billingSameAsCompany}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-invoice-city">
                      City *
                    </label>
                    <input
                      id="cluso-invoice-city"
                      className="input"
                      placeholder="City"
                      value={profile.invoicingInformation.address.city}
                      onChange={(e) => updateInvoicingAddress("city", e.target.value)}
                      disabled={profile.invoicingInformation.billingSameAsCompany}
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-invoice-state">
                      State / Province / Region *
                    </label>
                    <input
                      id="cluso-invoice-state"
                      className="input"
                      placeholder="State / Province / Region"
                      value={profile.invoicingInformation.address.state}
                      onChange={(e) => updateInvoicingAddress("state", e.target.value)}
                      disabled={profile.invoicingInformation.billingSameAsCompany}
                      required
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-invoice-postal">
                      Postal / ZIP Code *
                    </label>
                    <input
                      id="cluso-invoice-postal"
                      className="input"
                      placeholder="Postal / ZIP code"
                      value={profile.invoicingInformation.address.postalCode}
                      onChange={(e) => updateInvoicingAddress("postalCode", e.target.value)}
                      disabled={profile.invoicingInformation.billingSameAsCompany}
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-invoice-country">
                      Country *
                    </label>
                    <select
                      id="cluso-invoice-country"
                      className="input"
                      value={profile.invoicingInformation.address.country}
                      onChange={(e) => updateInvoicingAddress("country", e.target.value)}
                      disabled={profile.invoicingInformation.billingSameAsCompany}
                      required
                    >
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section
                style={{
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  background: "#FFFFFF",
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                <h3 style={{ margin: 0, color: "#2D405E", fontSize: "0.98rem" }}>
                  Primary Contact Information
                </h3>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-contact-first">
                      First Name *
                    </label>
                    <input
                      id="cluso-contact-first"
                      className="input"
                      placeholder="First name"
                      value={profile.primaryContactInformation.firstName}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          primaryContactInformation: {
                            ...prev.primaryContactInformation,
                            firstName: e.target.value,
                          },
                        }))
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-contact-last">
                      Last Name *
                    </label>
                    <input
                      id="cluso-contact-last"
                      className="input"
                      placeholder="Last name"
                      value={profile.primaryContactInformation.lastName}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          primaryContactInformation: {
                            ...prev.primaryContactInformation,
                            lastName: e.target.value,
                          },
                        }))
                      }
                      required
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-contact-designation">
                      Designation / Title *
                    </label>
                    <input
                      id="cluso-contact-designation"
                      className="input"
                      placeholder="e.g., Director"
                      value={profile.primaryContactInformation.designation}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          primaryContactInformation: {
                            ...prev.primaryContactInformation,
                            designation: e.target.value,
                          },
                        }))
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-contact-email">
                      Email Address *
                    </label>
                    <input
                      id="cluso-contact-email"
                      className="input"
                      type="email"
                      placeholder="name@cluso.com"
                      value={profile.primaryContactInformation.email}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          primaryContactInformation: {
                            ...prev.primaryContactInformation,
                            email: e.target.value,
                          },
                        }))
                      }
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cluso-office-phone">
                    Office Phone (with STD)
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <select
                      className="input"
                      value={profile.primaryContactInformation.officePhone.countryCode}
                      onChange={(e) =>
                        updatePhone("officePhone", "countryCode", e.target.value)
                      }
                      style={{ maxWidth: "220px", minWidth: "170px" }}
                    >
                      {PHONE_CODE_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <input
                      id="cluso-office-phone"
                      className="input"
                      placeholder="Phone number"
                      value={profile.primaryContactInformation.officePhone.number}
                      onChange={(e) => updatePhone("officePhone", "number", e.target.value)}
                      style={{ flex: "1 1 220px" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cluso-mobile-phone">
                    Mobile Number *
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <select
                      className="input"
                      value={profile.primaryContactInformation.mobilePhone.countryCode}
                      onChange={(e) =>
                        updatePhone("mobilePhone", "countryCode", e.target.value)
                      }
                      style={{ maxWidth: "220px", minWidth: "170px" }}
                    >
                      {PHONE_CODE_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <input
                      id="cluso-mobile-phone"
                      className="input"
                      placeholder="Phone number"
                      value={profile.primaryContactInformation.mobilePhone.number}
                      onChange={(e) => updatePhone("mobilePhone", "number", e.target.value)}
                      required
                      style={{ flex: "1 1 220px" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cluso-whatsapp-phone">
                    WhatsApp Number (if different)
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <select
                      className="input"
                      value={profile.primaryContactInformation.whatsappPhone.countryCode}
                      onChange={(e) =>
                        updatePhone("whatsappPhone", "countryCode", e.target.value)
                      }
                      style={{ maxWidth: "220px", minWidth: "170px" }}
                    >
                      {PHONE_CODE_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <input
                      id="cluso-whatsapp-phone"
                      className="input"
                      placeholder="Phone number"
                      value={profile.primaryContactInformation.whatsappPhone.number}
                      onChange={(e) => updatePhone("whatsappPhone", "number", e.target.value)}
                      style={{ flex: "1 1 220px" }}
                    />
                  </div>
                </div>
              </section>

              <section
                style={{
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  background: "#FFFFFF",
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                <h3 style={{ margin: 0, color: "#2D405E", fontSize: "0.98rem" }}>
                  Additional Questions
                </h3>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-heard-about">
                      How did you hear about us? *
                    </label>
                    <select
                      id="cluso-heard-about"
                      className="input"
                      value={profile.additionalQuestions.heardAboutUs}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          additionalQuestions: {
                            ...prev.additionalQuestions,
                            heardAboutUs: e.target.value,
                          },
                        }))
                      }
                      required
                    >
                      <option value="">Select source</option>
                      {HEARD_ABOUT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-referred-by">
                      If referred, list by whom
                    </label>
                    <input
                      id="cluso-referred-by"
                      className="input"
                      placeholder="Name of referring client or person"
                      value={profile.additionalQuestions.referredBy}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          additionalQuestions: {
                            ...prev.additionalQuestions,
                            referredBy: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="cluso-yearly-backgrounds">
                      Approximate backgrounds expected per year *
                    </label>
                    <select
                      id="cluso-yearly-backgrounds"
                      className="input"
                      value={profile.additionalQuestions.yearlyBackgroundsExpected}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          additionalQuestions: {
                            ...prev.additionalQuestions,
                            yearlyBackgroundsExpected: e.target.value,
                          },
                        }))
                      }
                      required
                    >
                      <option value="">Select range</option>
                      {YEARLY_BACKGROUND_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor="cluso-promo-code">
                      Promo Code (if any)
                    </label>
                    <input
                      id="cluso-promo-code"
                      className="input"
                      placeholder="Enter code"
                      value={profile.additionalQuestions.promoCode}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          additionalQuestions: {
                            ...prev.additionalQuestions,
                            promoCode: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cluso-primary-industry">
                    Primary industry / business type *
                  </label>
                  <select
                    id="cluso-primary-industry"
                    className="input"
                    value={profile.additionalQuestions.primaryIndustry}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...prev,
                        additionalQuestions: {
                          ...prev.additionalQuestions,
                          primaryIndustry: e.target.value,
                        },
                      }))
                    }
                    required
                  >
                    <option value="">Select industry</option>
                    {INDUSTRY_OPTIONS.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {profileMessage ? (
                <p className={`inline-alert ${getAlertTone(profileMessage)}`}>{profileMessage}</p>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={savingProfile}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                >
                  <Save size={16} />
                  {savingProfile ? "Saving..." : "Save Cluso Details"}
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section className="glass-card" style={{ padding: "1.2rem" }}>
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShieldCheck size={20} color="#4A90E2" />
          Security Settings
        </h2>
        <p style={{ color: "#6C757D", marginTop: 0 }}>
          Use a strong password and avoid reusing previous credentials.
        </p>

        <form onSubmit={changePassword} style={{ display: "grid", gap: "0.8rem" }}>
          <div>
            <label className="label" htmlFor="current-password">
              Current Password
            </label>
            <input
              id="current-password"
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="new-password">
              New Password
            </label>
            <input
              id="new-password"
              className="input"
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="confirm-password">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              className="input"
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {passwordMessage ? (
            <p className={`inline-alert ${getAlertTone(passwordMessage)}`}>{passwordMessage}</p>
          ) : null}

          <button
            className="btn btn-primary"
            disabled={changingPassword}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <KeyRound size={16} />
            {changingPassword ? "Updating..." : "Change Password"}
          </button>
        </form>
      </section>
    </AdminPortalFrame>
  );
}
