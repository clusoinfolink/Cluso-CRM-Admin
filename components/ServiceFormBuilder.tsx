"use client";

import { FormEvent, useMemo, useState } from "react";
import { ClipboardList, Plus, Save, Trash2 } from "lucide-react";
import type { SupportedCurrency } from "@/lib/currencies";
import { SearchableSelect } from "@/components/SearchableSelect";

type ServiceFormFieldType = "text" | "long_text" | "number" | "file" | "date";

export type ServiceFormField = {
  question: string;
  fieldType: ServiceFormFieldType;
  required: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
};

export type ServiceItemForForm = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  isPackage: boolean;
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

export default function ServiceFormBuilder({
  services,
  canManage,
  onSaved,
  preferredServiceId,
}: Props) {
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ServiceFormField[]>>({});
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
    minLength: typeof field.minLength === "number" ? field.minLength : null,
    maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
    forceUppercase: Boolean(field.forceUppercase),
  }));

  function addField() {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: [
        ...fields,
        {
          question: "",
          fieldType: "text",
          required: false,
          minLength: null,
          maxLength: null,
          forceUppercase: false,
        },
      ],
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

  function removeField(index: number) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.filter((_, idx) => idx !== index),
    }));
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
        question: item.question.trim(),
        fieldType: item.fieldType,
        required: Boolean(item.required),
        minLength,
        maxLength,
        forceUppercase: supportsTextConstraints(item.fieldType)
          ? Boolean(item.forceUppercase)
          : false,
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

    setSaving(true);
    const res = await fetch("/api/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: activeServiceId,
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
    setMessage(data.message ?? "Service form updated.");
    await onSaved();
  }

  if (!canManage) {
    return null;
  }

  return (
    <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
      <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <ClipboardList size={24} color="#4A90E2" />
        Service Form Builder
      </h2>
      <p style={{ color: "#6C757D", marginTop: 0 }}>
        Create or edit Google-Forms-style questions with short text, long text, number, date, file upload,
        and required toggles.
      </p>
      <p style={{ color: "#6C757D", marginTop: 0, fontSize: "0.9rem" }}>
        Add constraints for text fields like min/max length and force ALL CAPS. File uploads accept PDF/JPG/PNG up to 5MB.
      </p>

      {regularServices.length === 0 ? (
        <p style={{ margin: 0, color: "#6C757D" }}>
          Add regular services in Service Catalog before creating forms. Package deals use included service forms.
        </p>
      ) : (
        <form onSubmit={saveForm} style={{ display: "grid", gap: "0.8rem" }}>
          <div>
            <label className="label">Service</label>
            <SearchableSelect
              value={activeServiceId}
              onChange={(val) => setSelectedServiceId(val)}
              options={regularServices.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Select a service..."
            />
          </div>

          <div style={{ display: "grid", gap: "0.6rem" }}>
            {fields.length === 0 && (
              <div style={{ color: "#6C757D" }}>
                No fields yet. Click Add Field to start this service form.
              </div>
            )}

            {fields.map((field, index) => (
              <div
                key={`${activeServiceId}-${index}`}
                style={{
                  border: "1px solid #E0E0E0",
                  borderRadius: "0.65rem",
                  padding: "0.75rem",
                  background: "#F8F9FA",
                  display: "grid",
                  gap: "0.6rem",
                  gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, 200px) minmax(120px, 140px) auto",
                  alignItems: "end",
                }}
              >
                <div>
                  <label className="label">Question</label>
                  <input
                    className="input"
                    value={field.question}
                    onChange={(e) => updateFieldQuestion(index, e.target.value)}
                    placeholder="Example: Candidate university name"
                    required
                  />
                </div>
                <div>
                  <label className="label">Field Type</label>
                  <select
                    className="input"
                    value={field.fieldType}
                    onChange={(e) =>
                      updateFieldType(
                        index,
                        e.target.value as ServiceFormFieldType,
                      )
                    }
                  >
                    <option value="text">Short Text</option>
                    <option value="long_text">Long Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="file">File Upload</option>
                  </select>
                </div>
                <div>
                  <label className="label">Required</label>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      fontWeight: 600,
                      color: "#2D405E",
                      minHeight: "2.6rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => updateFieldRequired(index, e.target.checked)}
                    />
                    Must answer
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => removeField(index)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Trash2 size={16} />
                  Remove
                </button>

                {supportsTextConstraints(field.fieldType) ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      border: "1px solid #DDE5EF",
                      borderRadius: "0.5rem",
                      background: "#EEF6FF",
                      padding: "0.6rem 0.65rem",
                      display: "grid",
                      gap: "0.6rem",
                    }}
                  >
                    <strong style={{ color: "#2D405E", fontSize: "0.88rem" }}>
                      Field Constraints
                    </strong>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: "0.55rem",
                        alignItems: "end",
                      }}
                    >
                      <div>
                        <label className="label">Min Length</label>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          step={1}
                          value={field.minLength ?? ""}
                          onChange={(e) => updateFieldMinLength(index, e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="label">Max Length</label>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          step={1}
                          value={field.maxLength ?? ""}
                          onChange={(e) => updateFieldMaxLength(index, e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          fontWeight: 600,
                          color: "#2D405E",
                          minHeight: "2.6rem",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(field.forceUppercase)}
                          onChange={(e) => updateFieldForceUppercase(index, e.target.checked)}
                        />
                        Force ALL CAPS
                      </label>
                    </div>
                  </div>
                ) : null}

                {field.fieldType === "date" ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      color: "#6C757D",
                      fontSize: "0.86rem",
                      background: "#EFF8FF",
                      border: "1px solid #DDE5EF",
                      borderRadius: "0.5rem",
                      padding: "0.5rem 0.6rem",
                    }}
                  >
                    Candidates will see a calendar picker for this field.
                  </div>
                ) : null}

                {field.fieldType === "file" ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      color: "#6C757D",
                      fontSize: "0.86rem",
                      background: "#E8F0FE",
                      border: "1px solid #E0E0E0",
                      borderRadius: "0.5rem",
                      padding: "0.5rem 0.6rem",
                    }}
                  >
                    Allowed files: PDF, JPG, PNG. Maximum size: 5MB.
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addField}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Plus size={16} />
              Add Field
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Service Form"}
            </button>
          </div>

          {message && (
            <p
              style={{
                margin: 0,
                color: message.toLowerCase().includes("updated") ? "#5CB85C" : "#2D405E",
                fontWeight: 600,
              }}
            >
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
