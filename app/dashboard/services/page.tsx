"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useState } from "react";
import { ChevronDown, ChevronUp, Package, Plus, Tag } from "lucide-react";
import ServiceFormBuilder from "@/components/ServiceFormBuilder";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { getAlertTone } from "@/lib/alerts";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "@/lib/currencies";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { ServiceItem } from "@/lib/types";

const SERVICES_QUERY_KEY = ["admin-services"];
const SERVICES_STALE_TIME_MS = 5 * 60 * 1000;

async function fetchServices() {
  const serviceRes = await fetch("/api/services", { cache: "no-store" });
  if (!serviceRes.ok) {
    throw new Error("Could not load services.");
  }

  const serviceJson = (await serviceRes.json()) as { items: ServiceItem[] };
  return serviceJson.items ?? [];
}

export default function ServicesPage() {
  const { me, loading, logout } = useAdminSession();
  const queryClient = useQueryClient();
  const servicesQuery = useQuery<ServiceItem[]>({
    queryKey: SERVICES_QUERY_KEY,
    queryFn: fetchServices,
    staleTime: SERVICES_STALE_TIME_MS,
    enabled: Boolean(me),
  });

  const services = servicesQuery.data ?? [];
  const [message, setMessage] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDefaultPrice, setNewServiceDefaultPrice] = useState("");
  const [newServiceDefaultCurrency, setNewServiceDefaultCurrency] = useState<SupportedCurrency>("INR");
  const [catalogServicesCollapsed, setCatalogServicesCollapsed] = useState(true);

  const loadServices = useCallback(async (force = true) => {
    await queryClient.fetchQuery({
      queryKey: SERVICES_QUERY_KEY,
      queryFn: fetchServices,
      staleTime: force ? 0 : SERVICES_STALE_TIME_MS,
    });
  }, [queryClient]);

  async function createService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const payload: {
      name: string;
      description: string;
      defaultCurrency: SupportedCurrency;
      defaultPrice?: number;
    } = {
      name: newServiceName,
      description: newServiceDescription,
      defaultCurrency: newServiceDefaultCurrency,
    };

    const trimmedPrice = newServiceDefaultPrice.trim();
    if (trimmedPrice) {
      const parsed = Number(trimmedPrice);
      if (Number.isNaN(parsed) || parsed < 0) {
        setMessage("Please enter a valid default price.");
        return;
      }
      payload.defaultPrice = parsed;
    }

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Could not create service.");
      return;
    }

    setNewServiceName("");
    setNewServiceDescription("");
    setNewServiceDefaultPrice("");
    setNewServiceDefaultCurrency("INR");
    setMessage(data.message ?? "Service added.");
    await loadServices();
  }

  if (loading || servicesQuery.isLoading || !me) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Service Workspace"
      subtitle="Manage service catalog and form structures without dashboard clutter."
    >
      {message ? <p className={`inline-alert ${getAlertTone(message)}`}>{message}</p> : null}

      {(me.role === "admin" || me.role === "superadmin") && (
        <section className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
          <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Package size={24} color="#4A90E2" />
            Service Catalog
          </h2>
          <p style={{ color: "#6C757D" }}>
            Add reusable services first. Later, assign services and custom pricing per company account.
          </p>

          <form
            onSubmit={createService}
            style={{
              display: "grid",
              gap: "0.8rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="label">Service Name</label>
              <input className="input" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={newServiceDescription} onChange={(e) => setNewServiceDescription(e.target.value)} />
            </div>
            <div>
              <label className="label">Default Price (Optional)</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={newServiceDefaultPrice}
                onChange={(e) => setNewServiceDefaultPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Default Currency</label>
              <select
                className="input"
                value={newServiceDefaultCurrency}
                onChange={(e) => setNewServiceDefaultCurrency(e.target.value as SupportedCurrency)}
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                <Plus size={18} />
                Add Service
              </button>
            </div>
          </form>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>All Services ({services.length})</h3>
            {services.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCatalogServicesCollapsed((prev) => !prev)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {catalogServicesCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                {catalogServicesCollapsed ? "Expand List" : "Collapse List"}
              </button>
            )}
          </div>

          {!catalogServicesCollapsed && (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {services.length === 0 && <p style={{ margin: 0 }}>No services added yet.</p>}
              {services.map((service) => (
                <div
                  key={service.id}
                  style={{
                    border: "1px solid #E0E0E0",
                    borderRadius: "0.65rem",
                    padding: "0.65rem 0.8rem",
                    background: "#F8F9FA",
                    display: "flex",
                    gap: "0.8rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ marginTop: "0.15rem" }}>
                    <Tag size={18} color="#4A90E2" />
                  </div>
                  <div>
                    <strong>{service.name}</strong>
                    <div style={{ color: "#6C757D", fontSize: "0.9rem" }}>{service.description || "No description"}</div>
                    <div style={{ color: "#2D405E", fontSize: "0.88rem", marginTop: "0.2rem" }}>
                      Default: {service.defaultPrice !== null ? `${service.defaultCurrency} ${service.defaultPrice}` : "Not set"}
                    </div>
                    <div style={{ color: "#2D405E", fontSize: "0.88rem", marginTop: "0.2rem" }}>
                      Form Fields: {service.formFields?.length ?? 0}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(me.role === "admin" || me.role === "superadmin" || me.role === "verifier") && (
        <ServiceFormBuilder services={services} canManage onSaved={loadServices} />
      )}
    </AdminPortalFrame>
  );
}
