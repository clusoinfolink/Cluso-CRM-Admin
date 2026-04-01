"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
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

  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data]);
  const [message, setMessage] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDefaultPrice, setNewServiceDefaultPrice] = useState("");
  const [newServiceDefaultCurrency, setNewServiceDefaultCurrency] = useState<SupportedCurrency>("INR");
  const [newServiceIsPackage, setNewServiceIsPackage] = useState(false);
  const [newServiceIncludedIds, setNewServiceIncludedIds] = useState<string[]>([]);
  const [catalogServicesCollapsed, setCatalogServicesCollapsed] = useState(true);
  const [pendingFormService, setPendingFormService] = useState<{ id: string; name: string } | null>(null);
  const formBuilderRef = useRef<HTMLDivElement | null>(null);

  const regularServices = useMemo(
    () => services.filter((service) => !service.isPackage),
    [services],
  );

  const serviceNameById = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );

  const loadServices = useCallback(async (force = true) => {
    await queryClient.fetchQuery({
      queryKey: SERVICES_QUERY_KEY,
      queryFn: fetchServices,
      staleTime: force ? 0 : SERVICES_STALE_TIME_MS,
    });
  }, [queryClient]);

  function toggleIncludedService(serviceId: string, checked: boolean) {
    setNewServiceIncludedIds((prev) => {
      if (checked) {
        if (prev.includes(serviceId)) {
          return prev;
        }

        return [...prev, serviceId];
      }

      return prev.filter((id) => id !== serviceId);
    });
  }

  async function createService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const payload: {
      name: string;
      description: string;
      defaultCurrency: SupportedCurrency;
      defaultPrice?: number;
      isPackage?: boolean;
      includedServiceIds?: string[];
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

    if (newServiceIsPackage) {
      if (newServiceIncludedIds.length < 2) {
        setMessage("Select at least two services to create a package deal.");
        return;
      }

      payload.isPackage = true;
      payload.includedServiceIds = newServiceIncludedIds;
    }

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { message?: string; error?: string; item?: ServiceItem };
    if (!res.ok) {
      setMessage(data.error ?? "Could not create service.");
      return;
    }

    setNewServiceName("");
    setNewServiceDescription("");
    setNewServiceDefaultPrice("");
    setNewServiceDefaultCurrency("INR");
    setNewServiceIsPackage(false);
    setNewServiceIncludedIds([]);
    if (data.item?.id && !data.item.isPackage) {
      setPendingFormService({ id: data.item.id, name: data.item.name });
    } else {
      setPendingFormService(null);
    }
    setMessage(data.message ?? "Service added.");
    await loadServices();
  }

  function jumpToFormBuilder() {
    if (!pendingFormService) {
      return;
    }

    formBuilderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            <div style={{ gridColumn: "1 / -1" }}>
              <div
                style={{
                  border: "1px solid #D9E2F2",
                  background: "#F8FBFF",
                  borderRadius: "0.65rem",
                  padding: "0.75rem",
                  display: "grid",
                  gap: "0.6rem",
                }}
              >
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, color: "#2D405E" }}>
                  <input
                    type="checkbox"
                    checked={newServiceIsPackage}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNewServiceIsPackage(checked);
                      if (!checked) {
                        setNewServiceIncludedIds([]);
                      }
                    }}
                  />
                  Create as package deal
                </label>
                <p style={{ margin: 0, color: "#6C757D", fontSize: "0.9rem" }}>
                  Package deals appear as one checkbox on partner side but expand into included services when an order is created.
                </p>

                {newServiceIsPackage && (
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    {regularServices.length === 0 ? (
                      <div style={{ color: "#6C757D" }}>
                        Add at least two regular services before creating a package deal.
                      </div>
                    ) : (
                      <>
                        <div style={{ color: "#2D405E", fontWeight: 600, fontSize: "0.9rem" }}>
                          Choose included services ({newServiceIncludedIds.length} selected)
                        </div>
                        <div style={{ display: "grid", gap: "0.45rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                          {regularServices.map((service) => (
                            <label
                              key={`package-${service.id}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "flex-start",
                                gap: "0.45rem",
                                border: "1px solid #E0E0E0",
                                borderRadius: "0.55rem",
                                padding: "0.45rem 0.55rem",
                                background: "#FFFFFF",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={newServiceIncludedIds.includes(service.id)}
                                onChange={(e) => toggleIncludedService(service.id, e.target.checked)}
                              />
                              <span style={{ color: "#2D405E" }}>
                                <strong>{service.name}</strong>
                              </span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="btn btn-primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                <Plus size={18} />
                {newServiceIsPackage ? "Add Package Deal" : "Add Service"}
              </button>
            </div>
          </form>

          {pendingFormService && (
            <div
              style={{
                marginBottom: "1rem",
                border: "1px solid #D6E4FF",
                background: "#EEF4FF",
                borderRadius: "0.65rem",
                padding: "0.7rem 0.8rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.8rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "#2D405E", fontWeight: 600 }}>
                Service &quot;{pendingFormService.name}&quot; created. Create its form now?
              </span>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={jumpToFormBuilder}
                >
                  Create Form Now
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPendingFormService(null)}
                >
                  Later
                </button>
              </div>
            </div>
          )}

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
                    {service.isPackage ? (
                      <div style={{ marginTop: "0.25rem", color: "#1E4DB7", fontWeight: 600, fontSize: "0.85rem" }}>
                        Package Deal
                      </div>
                    ) : null}
                    <div style={{ color: "#6C757D", fontSize: "0.9rem" }}>{service.description || "No description"}</div>
                    <div style={{ color: "#2D405E", fontSize: "0.88rem", marginTop: "0.2rem" }}>
                      Default: {service.defaultPrice !== null ? `${service.defaultCurrency} ${service.defaultPrice}` : "Not set"}
                    </div>
                    <div style={{ color: "#2D405E", fontSize: "0.88rem", marginTop: "0.2rem" }}>
                      {service.isPackage
                        ? `Includes: ${
                            service.includedServiceIds
                              .map((serviceId) => serviceNameById.get(serviceId) ?? "Unknown service")
                              .join(", ") || "No linked services"
                          }`
                        : `Form Fields: ${service.formFields?.length ?? 0}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(me.role === "admin" || me.role === "superadmin" || me.role === "verifier") && (
        <div ref={formBuilderRef}>
          <ServiceFormBuilder
            services={services}
            canManage
            onSaved={loadServices}
            preferredServiceId={pendingFormService?.id}
          />
        </div>
      )}
    </AdminPortalFrame>
  );
}
