"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Save, Trash2 } from "lucide-react";
import type { SupportedCurrency } from "@/lib/currencies";

export type ServiceFormField = {
  question: string;
  fieldType: "text" | "long_text" | "number" | "file";
  required: boolean;
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
  const activeServiceId = selectedRegularService ? selectedServiceId : regularServices[0]?.id || "";

  const selectedService = useMemo(
    () => regularServices.find((service) => service.id === activeServiceId) ?? null,
    [activeServiceId, regularServices],
  );

  useEffect(() => {
    if (!preferredServiceId) {
      return;
    }

    const exists = regularServices.some((service) => service.id === preferredServiceId);
    if (exists) {
      setSelectedServiceId(preferredServiceId);
    }
  }, [preferredServiceId, regularServices]);

  const fields = drafts[activeServiceId] ?? selectedService?.formFields ?? [];

  function addField() {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: [...fields, { question: "", fieldType: "text", required: false }],
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

  function updateFieldType(index: number, fieldType: "text" | "long_text" | "number" | "file") {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, fieldType } : item,
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

    const cleaned = fields.map((item) => ({
      question: item.question.trim(),
      fieldType: item.fieldType,
      required: Boolean(item.required),
    }));

    const hasEmptyQuestion = cleaned.some((item) => !item.question);
    if (hasEmptyQuestion) {
      setMessage("Each form field must include a question.");
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
        Create or edit Google-Forms-style questions with short text, long text, number, file upload,
        and required toggles.
      </p>
      <p style={{ color: "#6C757D", marginTop: 0, fontSize: "0.9rem" }}>
        File upload questions accept only PDF, JPG, and PNG files up to 5MB.
      </p>

      {regularServices.length === 0 ? (
        <p style={{ margin: 0, color: "#6C757D" }}>
          Add regular services in Service Catalog before creating forms. Package deals use included service forms.
        </p>
      ) : (
        <form onSubmit={saveForm} style={{ display: "grid", gap: "0.8rem" }}>
          <div>
            <label className="label">Service</label>
            <select
              className="input"
              value={activeServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              required
            >
              {regularServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
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
                        e.target.value as "text" | "long_text" | "number" | "file",
                      )
                    }
                  >
                    <option value="text">Short Text</option>
                    <option value="long_text">Long Text</option>
                    <option value="number">Number</option>
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
