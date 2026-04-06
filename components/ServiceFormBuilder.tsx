"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  Save,
  Trash2,
  HelpCircle,
  Type,
  FileText,
  Calendar,
  Hash,
  Upload,
  Settings,
  AlertCircle,
  Layers,
  Copy,
  Info,
  House,
  NotebookPen,
  PenLine,
  Phone,
  MapPin,
  IdCard,
  Ban,
  Briefcase,
  User,
  Mail,
  Building2,
  Globe,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { SupportedCurrency } from "@/lib/currencies";
import { SearchableSelect } from "@/components/SearchableSelect";

type ServiceFormFieldType = "text" | "long_text" | "number" | "file" | "date";
type ServiceQuestionIconKey =
  | "none"
  | "diary"
  | "house"
  | "pen"
  | "calendar"
  | "phone"
  | "location"
  | "id-card"
  | "document"
  | "work"
  | "person"
  | "email"
  | "company"
  | "global"
  | "security";

const DEFAULT_QUESTION_ICON: ServiceQuestionIconKey = "diary";

const QUESTION_ICON_OPTIONS: Array<{
  key: ServiceQuestionIconKey;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: "none", label: "None", Icon: Ban },
  { key: "diary", label: "Diary", Icon: NotebookPen },
  { key: "house", label: "House", Icon: House },
  { key: "pen", label: "Pen", Icon: PenLine },
  { key: "calendar", label: "Calendar", Icon: Calendar },
  { key: "phone", label: "Phone", Icon: Phone },
  { key: "location", label: "Location", Icon: MapPin },
  { key: "id-card", label: "ID Card", Icon: IdCard },
  { key: "document", label: "Document", Icon: FileText },
  { key: "work", label: "Work", Icon: Briefcase },
  { key: "person", label: "Person", Icon: User },
  { key: "email", label: "Email", Icon: Mail },
  { key: "company", label: "Company", Icon: Building2 },
  { key: "global", label: "Global", Icon: Globe },
  { key: "security", label: "Security", Icon: ShieldCheck },
];

function normalizeQuestionIconKey(rawIconKey: unknown): ServiceQuestionIconKey {
  if (typeof rawIconKey !== "string") {
    return DEFAULT_QUESTION_ICON;
  }

  const normalized = rawIconKey.trim().toLowerCase() as ServiceQuestionIconKey;
  return QUESTION_ICON_OPTIONS.some((option) => option.key === normalized)
    ? normalized
    : DEFAULT_QUESTION_ICON;
}

export type ServiceFormField = {
  fieldKey?: string;
  question: string;
  iconKey?: ServiceQuestionIconKey;
  fieldType: ServiceFormFieldType;
  required: boolean;
  repeatable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
  allowNotApplicable?: boolean;
  notApplicableText?: string;
};

export type ServiceItemForForm = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  isPackage: boolean;
  allowMultipleEntries?: boolean;
  multipleEntriesLabel?: string;
  formFields: ServiceFormField[];
};

type Props = {
  services: ServiceItemForForm[];
  canManage: boolean;
  onSaved: () => Promise<void>;
  preferredServiceId?: string;
};

function supportsTextConstraints(fieldType: ServiceFormFieldType) {
  return fieldType === "text" || fieldType === "long_text";
}

function supportsRepeatable(fieldType: ServiceFormFieldType) {
  return fieldType !== "file";
}

function normalizeLengthValue(raw: string) {
  if (!raw.trim()) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function createFieldKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `fld_${crypto.randomUUID()}`;
  }

  return `fld_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyField(
  question = "",
  iconKey: ServiceQuestionIconKey = DEFAULT_QUESTION_ICON,
): ServiceFormField {
  return {
    fieldKey: createFieldKey(),
    question,
    iconKey,
    fieldType: "text",
    required: false,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "Not Applicable",
  };
}

export default function ServiceFormBuilder({
  services,
  canManage,
  onSaved,
  preferredServiceId,
}: Props) {
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ServiceFormField[]>>({});
  const [serviceEntryModeDrafts, setServiceEntryModeDrafts] = useState<Record<string, boolean>>({});
  const [serviceEntryLabelDrafts, setServiceEntryLabelDrafts] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const regularServices = useMemo(
    () => services.filter((service) => !service.isPackage),
    [services],
  );

  const selectedRegularService = regularServices.some((service) => service.id === selectedServiceId);
  const preferredRegularService =
    preferredServiceId && regularServices.some((service) => service.id === preferredServiceId)
      ? preferredServiceId
      : "";
  const activeServiceId = selectedRegularService
    ? selectedServiceId
    : preferredRegularService || regularServices[0]?.id || "";

  const selectedService = useMemo(
    () => regularServices.find((service) => service.id === activeServiceId) ?? null,
    [activeServiceId, regularServices],
  );

  const fields = (drafts[activeServiceId] ?? selectedService?.formFields ?? []).map((field) => ({
    ...field,
    fieldKey: field.fieldKey?.trim() || "",
    iconKey: normalizeQuestionIconKey(field.iconKey),
    repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
    minLength: typeof field.minLength === "number" ? field.minLength : null,
    maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
    forceUppercase: Boolean(field.forceUppercase),
    allowNotApplicable: Boolean(field.allowNotApplicable),
    notApplicableText:
      typeof field.notApplicableText === "string"
        ? field.notApplicableText
        : "Not Applicable",
  }));

  const multipleEntriesLabel = activeServiceId
    ? serviceEntryLabelDrafts[activeServiceId] ?? selectedService?.multipleEntriesLabel
    : "";

  const allowMultipleEntries = activeServiceId
    ? serviceEntryModeDrafts[activeServiceId] ?? Boolean(selectedService?.allowMultipleEntries)
    : false;

  function addField() {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: [...fields, createEmptyField()],
    }));
  }

  function addFieldForSameQuestion(index: number) {
    if (!activeServiceId) {
      return;
    }

    const sourceQuestion = fields[index]?.question?.trim() ?? "";
    const sourceIcon = normalizeQuestionIconKey(fields[index]?.iconKey);
    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: [...fields, createEmptyField(sourceQuestion, sourceIcon)],
    }));
  }

  function updateFieldQuestion(index: number, question: string) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, question } : item,
      ),
    }));
  }

  function updateFieldIcon(index: number, iconKey: ServiceQuestionIconKey) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, iconKey } : item,
      ),
    }));
  }

  function updateFieldType(index: number, fieldType: ServiceFormFieldType) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              fieldType,
              repeatable: supportsRepeatable(fieldType)
                ? Boolean(item.repeatable)
                : false,
              minLength: supportsTextConstraints(fieldType) ? item.minLength ?? null : null,
              maxLength: supportsTextConstraints(fieldType) ? item.maxLength ?? null : null,
              forceUppercase: supportsTextConstraints(fieldType)
                ? Boolean(item.forceUppercase)
                : false,
            }
          : item,
      ),
    }));
  }

  function updateFieldRequired(index: number, required: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, required } : item,
      ),
    }));
  }

  function updateFieldRepeatable(index: number, repeatable: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              repeatable: supportsRepeatable(item.fieldType) ? repeatable : false,
            }
          : item,
      ),
    }));
  }

  function updateFieldMinLength(index: number, minLength: string) {
    if (!activeServiceId) {
      return;
    }

    const nextMinLength = normalizeLengthValue(minLength);

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, minLength: nextMinLength } : item,
      ),
    }));
  }

  function updateFieldMaxLength(index: number, maxLength: string) {
    if (!activeServiceId) {
      return;
    }

    const nextMaxLength = normalizeLengthValue(maxLength);

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, maxLength: nextMaxLength } : item,
      ),
    }));
  }

  function updateFieldForceUppercase(index: number, forceUppercase: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, forceUppercase } : item,
      ),
    }));
  }

  function updateFieldAllowNotApplicable(index: number, allowNotApplicable: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              allowNotApplicable,
              notApplicableText: item.notApplicableText?.trim() || "Not Applicable",
            }
          : item,
      ),
    }));
  }

  function updateFieldNotApplicableText(index: number, notApplicableText: string) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              notApplicableText,
            }
          : item,
      ),
    }));
  }

  function removeField(index: number) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.filter((_, idx) => idx !== index),
    }));
  }

  function updateServiceAllowMultipleEntries(enabled: boolean) {
    if (!activeServiceId) {
      return;
    }

    setServiceEntryModeDrafts((prev) => ({
      ...prev,
      [activeServiceId]: enabled,
    }));
  }

  async function updateServiceMultipleEntriesLabel(label: string) {
    if (!activeServiceId) return;
    setServiceEntryLabelDrafts((prev) => ({ ...prev, [activeServiceId]: label }));
  }

  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!activeServiceId) {
      setMessage("Please select a service first.");
      return;
    }

    const cleaned = fields.map((item) => {
      const minLength =
        supportsTextConstraints(item.fieldType) && typeof item.minLength === "number"
          ? item.minLength
          : null;
      const maxLength =
        supportsTextConstraints(item.fieldType) && typeof item.maxLength === "number"
          ? item.maxLength
          : null;

      return {
        fieldKey: item.fieldKey?.trim() || createFieldKey(),
        question: item.question.trim(),
        iconKey: normalizeQuestionIconKey(item.iconKey),
        fieldType: item.fieldType,
        required: Boolean(item.required),
        repeatable: supportsRepeatable(item.fieldType) ? Boolean(item.repeatable) : false,
        minLength,
        maxLength,
        forceUppercase: supportsTextConstraints(item.fieldType)
          ? Boolean(item.forceUppercase)
          : false,
        allowNotApplicable: Boolean(item.allowNotApplicable),
        notApplicableText: Boolean(item.allowNotApplicable)
          ? item.notApplicableText?.trim() ?? ""
          : "",
      };
    });

    const hasEmptyQuestion = cleaned.some((item) => !item.question);
    if (hasEmptyQuestion) {
      setMessage("Each form field must include a question.");
      return;
    }

    const invalidLengthField = cleaned.find(
      (item) =>
        item.minLength !== null &&
        item.maxLength !== null &&
        item.minLength > item.maxLength,
    );

    if (invalidLengthField) {
      setMessage(`"${invalidLengthField.question}" has min length greater than max length.`);
      return;
    }

    const invalidNotApplicableField = cleaned.find(
      (item) => item.allowNotApplicable && !item.notApplicableText.trim(),
    );

    if (invalidNotApplicableField) {
      setMessage(`"${invalidNotApplicableField.question}" must include default text for Not Applicable.`);
      return;
    }

    setSaving(true);
    const res = await fetch("/api/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: activeServiceId,
        allowMultipleEntries,
        formFields: cleaned,
      }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setSaving(false);

    if (!res.ok) {
      setMessage(data.error ?? "Could not save service form.");
      return;
    }

    setDrafts((prev) => ({ ...prev, [activeServiceId]: cleaned }));
    setServiceEntryModeDrafts((prev) => ({
      ...prev,
      [activeServiceId]: allowMultipleEntries,
    }));
    setMessage(data.message ?? "Service form updated.");
    await onSaved();
  }

  if (!canManage) {
    return null;
  }

  return (
    <section style={{ marginBottom: "1.5rem", animation: "fadeIn 0.3s ease" }}>
      <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "10px", boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ background: "#EEF2FF", padding: "0.75rem", borderRadius: "8px", color: "#3B82F6" }}>
            <ClipboardList size={28} />
          </div>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: "0.25rem", color: "#1E293B", fontSize: "1.25rem", fontWeight: 600 }}>
              Service Form Builder
            </h2>
            <p style={{ color: "#64748B", margin: 0, fontSize: "0.95rem", lineHeight: "1.5" }}>
              Configure exact dataset questions verifiers must fill during processing. Add robust constraints, repeatability, and customize field behaviors to ensure data validity.
            </p>
          </div>
        </div>

        {regularServices.length === 0 ? (
          <div style={{ padding: "1rem", background: "#FEF2F2", color: "#DC2626", borderRadius: "8px", border: "1px solid #FECACA", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} />
            Add regular services in Service Catalog before creating forms. Package deals use included service forms.
          </div>
        ) : (
          <form onSubmit={saveForm} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid #E2E8F0" }}>
              <label style={{ fontSize: "0.95rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Settings size={18} color="#64748B" />
                Select Service to Configure
              </label>
              <div style={{ maxWidth: "400px" }}>
                <SearchableSelect
                  value={activeServiceId}
                  onChange={(val) => setSelectedServiceId(val)}
                  options={regularServices.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Select a service..."
                />
              </div>
            </div>

            <div
              style={{
                border: "1px solid #BFDBFE",
                borderRadius: "8px",
                background: "#EFF6FF",
                padding: "1rem",
                display: "grid",
                  gap: "0.8rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      fontWeight: 600,
                      color: "#1E3A8A",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(allowMultipleEntries)}
                      onChange={(e) => updateServiceAllowMultipleEntries(e.target.checked)}
                      style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer", accentColor: "#2563EB" }}
                    />
                    <Layers size={18} color="#3B82F6" />
                    Allow whole-service repetition (+ Add another entry)
                  </label>
                  <div style={{ color: "#3B82F6", fontSize: "0.85rem", paddingLeft: "1.7rem", marginTop: "0.2rem" }}>
                    Candidates can duplicate the entire form as a block. (File upload fields remain single-entry).
                  </div>
                </div>

                {allowMultipleEntries && (
                  <div style={{ paddingLeft: "1.7rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1E3A8A" }}>Custom Plural Label ("Whole-service entries" fallback)</label>
                    <input
                      className="input"
                      style={{ padding: "0.5rem 0.8rem", border: "1px solid #93C5FD", borderRadius: "6px", fontSize: "0.9rem", width: "100%", maxWidth: "400px" }}
                      value={multipleEntriesLabel ?? ""}
                      onChange={(e) => updateServiceMultipleEntriesLabel(e.target.value)}
                      placeholder="e.g. Address History, Employment Records"
                    />
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: "1rem" }}>
                {fields.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem", background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: "8px", color: "#94A3B8" }}>
                    <ClipboardList size={32} style={{ marginBottom: "0.5rem" }} />
                    <span>No fields yet. Click Add Field to start this service form.</span>
                  </div>
                )}

                {fields.map((field, index) => (
                <div
                  key={field.fieldKey || `${activeServiceId}-${index}`}
                  style={{
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    background: "#ffffff",
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  <div style={{ padding: "0.4rem 1rem", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Field #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", padding: "0.2rem", borderRadius: "4px", transition: "background 0.2s" }}
                      title="Remove Field"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ padding: "1.25rem", display: "grid", gap: "1.25rem", gridTemplateColumns: "1fr 1fr", alignItems: "flex-start" }}>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <HelpCircle size={16} color="#64748B" /> Question Prompt
                      </label>
                      <input
                        style={{ padding: "0.6rem 0.8rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.95rem", width: "100%" }}
                        value={field.question}
                        onChange={(e) => updateFieldQuestion(index, e.target.value)}
                        placeholder="Example: Corporate Name"
                        required
                      />
                    </div>

                    <div
                      style={{
                        gridColumn: "1 / -1",
                        border: "1px solid #E2E8F0",
                        borderRadius: "8px",
                        background: "#F8FAFC",
                        padding: "0.9rem 1rem",
                        display: "grid",
                        gap: "0.6rem",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "0.86rem",
                          fontWeight: 600,
                          color: "#334155",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                        }}
                      >
                        <NotebookPen size={15} color="#64748B" />
                        Question Icon
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gap: "0.5rem",
                          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                        }}
                      >
                        {QUESTION_ICON_OPTIONS.map((option) => {
                          const isActive = field.iconKey === option.key;

                          return (
                            <button
                              key={`${field.fieldKey || `${activeServiceId}-${index}`}-${option.key}`}
                              type="button"
                              onClick={() => updateFieldIcon(index, option.key)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.38rem",
                                padding: "0.45rem 0.55rem",
                                borderRadius: "8px",
                                border: isActive ? "1px solid #3B82F6" : "1px solid #CBD5E1",
                                background: isActive ? "#EFF6FF" : "#FFFFFF",
                                color: isActive ? "#1D4ED8" : "#475569",
                                fontSize: "0.8rem",
                                fontWeight: isActive ? 700 : 600,
                                cursor: "pointer",
                              }}
                              aria-label={`Select ${option.label} icon`}
                            >
                              <option.Icon size={14} />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748B" }}>
                        Selected icon appears beside this question in candidate forms. Choose None to hide icon.
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        {field.fieldType === "text" && <Type size={16} color="#64748B" />}
                        {field.fieldType === "long_text" && <FileText size={16} color="#64748B" />}
                        {field.fieldType === "number" && <Hash size={16} color="#64748B" />}
                        {field.fieldType === "date" && <Calendar size={16} color="#64748B" />}
                        {field.fieldType === "file" && <Upload size={16} color="#64748B" />}
                        Field Type
                      </label>
                      <select
                        style={{ padding: "0.6rem 0.8rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.95rem", width: "100%", backgroundColor: "#fff" }}
                        value={field.fieldType}
                        onChange={(e) => updateFieldType(index, e.target.value as ServiceFormFieldType)}
                      >
                        <option value="text">Short Text</option>
                        <option value="long_text">Long Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="file">File Upload</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
                         <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155" }}>Behavior</label>
                         <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.5rem 0.8rem",
                              background: field.required ? "#FEF2F2" : "#F8FAFC",
                              border: field.required ? "1px solid #FECACA" : "1px solid #E2E8F0",
                              borderRadius: "6px",
                              color: field.required ? "#DC2626" : "#64748B",
                              cursor: "pointer",
                              fontWeight: 500,
                              userSelect: "none"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(field.required)}
                              onChange={(e) => updateFieldRequired(index, e.target.checked)}
                              style={{ accentColor: "#DC2626", width: "1rem", height: "1rem" }}
                            />
                            Must answer
                          </label>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => addFieldForSameQuestion(index)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 0.8rem", background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: "6px", color: "#475569", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        <Copy size={16} />
                        Duplicate
                      </button>
                    </div>

                    {/* Constraint Toggles Box */}
                    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "-0.5rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.5rem" }}>
                        
                        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500, color: "#334155", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(field.allowNotApplicable)}
                              onChange={(e) => updateFieldAllowNotApplicable(index, e.target.checked)}
                              style={{ width: "1rem", height: "1rem" }}
                            />
                            Allow "Not Applicable" mapping
                          </label>
                          {field.allowNotApplicable && (
                            <div style={{ paddingLeft: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ fontSize: "0.85rem", color: "#64748B" }}>Prefill value:</span>
                              <input
                                style={{ padding: "0.3rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "4px", fontSize: "0.85rem" }}
                                value={field.notApplicableText ?? ""}
                                onChange={(e) => updateFieldNotApplicableText(index, e.target.value)}
                                placeholder="Not Applicable"
                              />
                            </div>
                          )}
                        </div>

                        {supportsRepeatable(field.fieldType) && (
                          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "6px", padding: "0.75rem 1rem" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500, color: "#166534", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={Boolean(field.repeatable)}
                                onChange={(e) => updateFieldRepeatable(index, e.target.checked)}
                                style={{ accentColor: "#16A34A", width: "1rem", height: "1rem" }}
                              />
                              Enable multiple entries for this specific question
                            </label>
                            <p style={{ margin: "0.2rem 0 0 1.5rem", fontSize: "0.8rem", color: "#15803D" }}>Candidates can dynamically add more values locally.</p>
                          </div>
                        )}

                        {supportsTextConstraints(field.fieldType) && (
                          <div style={{ background: "#FDF4FF", border: "1px solid #FBCFE8", borderRadius: "6px", padding: "0.8rem 1rem", display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#86198F", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <Settings size={14} /> Constraints
                            </span>
                            
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <label style={{ fontSize: "0.85rem", color: "#701A75" }}>Min:</label>
                              <input
                                style={{ width: "60px", padding: "0.3rem 0.5rem", border: "1px solid #F9A8D4", borderRadius: "4px", fontSize: "0.85rem" }}
                                type="number" min={1} step={1}
                                value={field.minLength ?? ""}
                                onChange={(e) => updateFieldMinLength(index, e.target.value)}
                                placeholder="Any"
                              />
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <label style={{ fontSize: "0.85rem", color: "#701A75" }}>Max:</label>
                              <input
                                style={{ width: "60px", padding: "0.3rem 0.5rem", border: "1px solid #F9A8D4", borderRadius: "4px", fontSize: "0.85rem" }}
                                type="number" min={1} step={1}
                                value={field.maxLength ?? ""}
                                onChange={(e) => updateFieldMaxLength(index, e.target.value)}
                                placeholder="Any"
                              />
                            </div>

                            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "#701A75", cursor: "pointer", fontWeight: 500 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(field.forceUppercase)}
                                onChange={(e) => updateFieldForceUppercase(index, e.target.checked)}
                                style={{ accentColor: "#D946EF" }}
                              />
                              Force ALL CAPS
                            </label>
                          </div>
                        )}

                        {field.fieldType === "date" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#FEF9C3", color: "#854D0E", padding: "0.6rem 1rem", borderRadius: "6px", fontSize: "0.85rem", border: "1px solid #FEF08A" }}>
                            <Info size={16} /> Displays an interactive calendar picker.
                          </div>
                        )}

                        {field.fieldType === "file" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#E0E7FF", color: "#1D4ED8", padding: "0.6rem 1rem", borderRadius: "6px", fontSize: "0.85rem", border: "1px solid #BFDBFE" }}>
                            <Info size={16} /> File Upload: Supports PDF, JPG, PNG up to 5MB.
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", borderTop: "1px solid #E2E8F0", paddingTop: "1.5rem", marginTop: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <button
                  type="button"
                  onClick={addField}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1", padding: "0.75rem 1.25rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                >
                  <Plus size={18} /> Add Field
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#2563EB", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", opacity: saving ? 0.7 : 1 }}
                >
                  <Save size={18} /> {saving ? "Saving Changes..." : "Save Configuration"}
                </button>
              </div>

              {message && (
                <div style={{ padding: "0.8rem 1rem", borderRadius: "6px", border: "1px solid", display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.95rem", fontWeight: 500,
                  ...(message.toLowerCase().includes("updated") ? { background: "#F0FDF4", color: "#166534", borderColor: "#BBF7D0" } : { background: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" })
                }}>
                  <Info size={18} />
                  {message}
                </div>
              )}
            </div>

          </form>
        )}
      </div>
    </section>
  );
}
