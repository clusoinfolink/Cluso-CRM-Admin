"use client";

import { FormEvent, useMemo, useState } from "react";
import { ClipboardList, Plus, Save, Trash2 } from "lucide-react";
import type { SupportedCurrency } from "@/lib/currencies";

export type ServiceFormField = {
  question: string;
  fieldType: "text" | "number";
};

export type ServiceItemForForm = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  formFields: ServiceFormField[];
};

type Props = {
  services: ServiceItemForForm[];
  canManage: boolean;
  onSaved: () => Promise<void>;
};

export default function ServiceFormBuilder({ services, canManage, onSaved }: Props) {
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ServiceFormField[]>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const activeServiceId = selectedServiceId || services[0]?.id || "";

  const selectedService = useMemo(
    () => services.find((service) => service.id === activeServiceId) ?? null,
    [activeServiceId, services],
  );

  const fields = drafts[activeServiceId] ?? selectedService?.formFields ?? [];

  function addField() {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: [...fields, { question: "", fieldType: "text" }],
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

  function updateFieldType(index: number, fieldType: "text" | "number") {
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
      <p style={{ color: "#5a748f", marginTop: 0 }}>
        Create or edit the form structure for each service. Use question + field type (text or number).
      </p>

      {services.length === 0 ? (
        <p style={{ margin: 0, color: "#5a748f" }}>Add services in Service Catalog before creating forms.</p>
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
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: "0.6rem" }}>
            {fields.length === 0 && (
              <div style={{ color: "#5a748f" }}>
                No fields yet. Click Add Field to start this service form.
              </div>
            )}

            {fields.map((field, index) => (
              <div
                key={`${activeServiceId}-${index}`}
                style={{
                  border: "1px solid #d4e2f2",
                  borderRadius: "0.65rem",
                  padding: "0.75rem",
                  background: "#f8fbff",
                  display: "grid",
                  gap: "0.6rem",
                  gridTemplateColumns: "minmax(220px, 1fr) minmax(140px, 180px) auto",
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
                    onChange={(e) => updateFieldType(index, e.target.value as "text" | "number")}
                  >
                    <option value="text">Text Field</option>
                    <option value="number">Number Field</option>
                  </select>
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
                color: message.toLowerCase().includes("updated") ? "#0f7b3d" : "#b02525",
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
