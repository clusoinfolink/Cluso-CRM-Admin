"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Plus, Trash, Tag, FileText, LayoutList } from "lucide-react";
import { useSearchParams } from "next/navigation";
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

function ServicesPageContent() {
  const { me, loading, logout } = useAdminSession();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const servicesQuery = useQuery<ServiceItem[]>({
    queryKey: SERVICES_QUERY_KEY,
    queryFn: fetchServices,
    staleTime: SERVICES_STALE_TIME_MS,
    enabled: Boolean(me),
  });

  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data]);
  const [activeTab, setActiveTab] = useState<"catalog" | "forms">("catalog");

  const [message, setMessage] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newPackageName, setNewPackageName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDefaultPrice, setNewServiceDefaultPrice] = useState("");
  const [newServiceDefaultCurrency, setNewServiceDefaultCurrency] = useState<SupportedCurrency>("INR");
  const [newServiceIsPackage, setNewServiceIsPackage] = useState(false);
  const [newServiceIncludedIds, setNewServiceIncludedIds] = useState<string[]>([]);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  
  const [pendingFormService, setPendingFormService] = useState<{ id: string; name: string } | null>(null);
  const formBuilderRef = useRef<HTMLDivElement | null>(null);

  const assignableCatalogServices = useMemo(
    () =>
      services.filter(
        (service) => !service.hiddenFromCustomerPortal && !service.isDefaultPersonalDetails,
      ),
    [services],
  );

  const regularServices = useMemo(
    () => assignableCatalogServices.filter((service) => !service.isPackage),
    [assignableCatalogServices],
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

  const requestedTab = searchParams.get("tab");
  const requestedServiceId = searchParams.get("serviceId");

  useEffect(() => {
    if (requestedTab === "forms") {
      setActiveTab("forms");
    }
  }, [requestedTab]);

  useEffect(() => {
    if (!requestedServiceId) {
      return;
    }

    const requestedService = services.find(
      (service) => !service.isPackage && service.id === requestedServiceId,
    );

    if (!requestedService) {
      return;
    }

    setPendingFormService((prev) =>
      prev?.id === requestedService.id
        ? prev
        : { id: requestedService.id, name: requestedService.name },
    );
    setActiveTab("forms");
  }, [requestedServiceId, services]);

  function toggleIncludedService(serviceId: string, checked: boolean) {
    setNewServiceIncludedIds((prev) => checked ? (prev.includes(serviceId) ? prev : [...prev, serviceId]) : prev.filter((id) => id !== serviceId));
  }

  async function handleDeleteService(serviceId: string, serviceName: string) {
    if (!window.confirm(`Are you sure you want to delete "${serviceName}"?\n\nThis will permanently remove it from the catalog.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/services?id=${encodeURIComponent(serviceId)}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete service.");
        return;
      }
      queryClient.setQueryData<ServiceItem[]>(SERVICES_QUERY_KEY, (old) => (old ? old.filter((s) => s.id !== serviceId) : []));
      alert("Service deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while deleting the service.");
    }
  }

  async function createService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const normalizedName = (newServiceIsPackage ? newPackageName : newServiceName).trim();
    if (!normalizedName) {
      setMessage(newServiceIsPackage ? "Please enter a package name." : "Please enter a service name.");
      return;
    }

    const payload: {
      name: string;
      description: string;
      defaultCurrency: SupportedCurrency;
      defaultPrice?: number;
      isPackage?: boolean;
      includedServiceIds?: string[];
    } = {
      name: normalizedName,
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
    setNewPackageName("");
    setNewServiceDescription("");
    setNewServiceDefaultPrice("");
    setNewServiceDefaultCurrency("INR");
    setNewServiceIsPackage(false);
    setNewServiceIncludedIds([]);
    
    if (data.item?.id && !data.item.isPackage) {
      setPendingFormService({ id: data.item.id, name: data.item.name });
      setActiveTab("forms"); 
    } else {
      setPendingFormService(null);
      setActiveTab("catalog");
    }
    
    setMessage(data.message ?? "Service added successfully.");
    await loadServices();
  }

  if (loading || servicesQuery.isLoading || !me) {
    return <main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>;
  }

  const isAdmin = me.role === "admin" || me.role === "superadmin";

  const renderCatalogList = () => (
    <div style={{ marginTop: "2.5rem", animation: "fadeIn 0.3s ease" }}>
      <h3 style={{ marginTop: 0, marginBottom: "0.5rem", color: "#1E293B", fontSize: "1.1rem" }}>All Services & Packages</h3>
      <p style={{ color: "#64748B", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
        Currently active services that can be assigned to companies.
      </p>

      {assignableCatalogServices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94A3B8" }}>No services available in the catalog.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {assignableCatalogServices.map((service) => {
            const isExpanded = expandedServiceId === service.id;
            return (
              <div
                key={service.id}
                onClick={() => setExpandedServiceId(isExpanded ? null : service.id)}
                style={{
                  background: isExpanded ? "#FAFAFA" : "#FFFFFF",
                  borderRadius: "12px",
                  border: "1px solid",
                  borderColor: isExpanded ? "#93C5FD" : "#E2E8F0",
                  padding: "1.25rem",
                  boxShadow: isExpanded ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" : "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1rem",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.borderColor = "#93C5FD"; }}
                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.borderColor = "#E2E8F0"; }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <div style={{ background: service.isPackage ? "#E0E7FF" : "#F3F4F6", padding: "0.5rem", borderRadius: "8px" }}>
                        {service.isPackage ? <Package size={20} color="#4338CA" /> : <Tag size={20} color="#475569" />}
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#1E293B" }}>{service.name}</h4>
                        {service.isPackage && <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.05em" }}>Package Deal</div>}
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        title="Delete Service"
                        onClick={(e) => { e.stopPropagation(); handleDeleteService(service.id, service.name); }}
                        style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", padding: "0.2rem", transition: "all 0.2s", borderRadius: "4px" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#FEE2E2"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        <Trash size={18} />
                      </button>
                    )}
                  </div>
                  <p style={{ margin: "0.75rem 0", color: "#64748B", fontSize: "0.9rem", display: "-webkit-box", WebkitLineClamp: isExpanded ? 5 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {service.description || "No description provided."}
                  </p>
                </div>

                <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B", fontWeight: 500 }}>Default Price</span>
                    <span style={{ color: "#1E293B", fontWeight: 600 }}>
                      {service.defaultPrice !== null ? `${service.defaultCurrency} ${service.defaultPrice}` : "Not set"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B", fontWeight: 500 }}>Structure</span>
                    <span style={{ color: "#1E293B", fontWeight: 500 }}>
                      {service.isPackage ? `${service.includedServiceIds?.length ?? 0} Services` : `${service.formFields?.length ?? 0} Fields`}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: "1px dashed #CBD5E1", paddingTop: "1rem", marginTop: "0.5rem", animation: "fadeIn 0.2s ease" }}>
                    {service.isPackage ? (
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.5rem" }}>Included Services</div>
                        <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", color: "#475569", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                          {service.includedServiceIds?.length ? (
                            service.includedServiceIds.map((id) => (
                              <li key={id}>{serviceNameById.get(id) || "Unknown service"}</li>
                            ))
                          ) : (
                            <li>No services attached</li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setPendingFormService({ id: service.id, name: service.name }); 
                            setActiveTab("forms"); 
                          }}
                          style={{ background: "#4A90E2", color: "#FFF", border: "none", borderRadius: "6px", padding: "0.5rem 1rem", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", transition: "all 0.2s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "#3B82F6"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "#4A90E2"}
                        >
                          <FileText size={16} /> Edit Form Setup
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderCreateAndCatalog = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {isAdmin && (
        <div style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0", padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "1.1rem", color: "#1E293B", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Plus size={18} color="#4A90E2" /> Add New {newServiceIsPackage ? "Package Deal" : "Service"}
          </h3>
          <form onSubmit={createService} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.2rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {!newServiceIsPackage && (
                  <div>
                    <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Service Name</label>
                    <input
                      className="input"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      required={!newServiceIsPackage}
                      style={{ background: "#F8FAFC", width: "100%" }}
                      placeholder="Enter service name"
                    />
                  </div>
                )}
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Description (Optional)</label>
                  <textarea className="input" value={newServiceDescription} onChange={(e) => setNewServiceDescription(e.target.value)} rows={3} style={{ background: "#F8FAFC", width: "100%", resize: "vertical" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Default Price</label>
                    <input className="input" type="number" min={0} step="0.01" value={newServiceDefaultPrice} onChange={(e) => setNewServiceDefaultPrice(e.target.value)} style={{ background: "#F8FAFC", width: "100%" }} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Default Currency</label>
                    <select className="input" value={newServiceDefaultCurrency} onChange={(e) => setNewServiceDefaultCurrency(e.target.value as SupportedCurrency)} style={{ background: "#F8FAFC", width: "100%" }}>
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div>
                <div style={{ background: "#F8FAFC", borderRadius: "8px", border: "1px solid #E2E8F0", padding: "1rem", height: "100%" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, color: "#1E293B", marginBottom: "0.5rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={newServiceIsPackage} onChange={(e) => {
                      const checked = e.target.checked;
                      setNewServiceIsPackage(checked);
                      if (checked && !newPackageName.trim() && newServiceName.trim()) {
                        setNewPackageName(newServiceName.trim());
                      }
                      if (!checked) {
                        setNewServiceIncludedIds([]);
                      }
                    }} style={{ width: "16px", height: "16px" }} />
                    Create as Package Deal
                  </label>
                  <p style={{ margin: 0, color: "#64748B", fontSize: "0.85rem", marginBottom: "1rem" }}>
                    Combine multiple services into one offering. Packages expand into their respective included forms during orders.
                  </p>

                  {newServiceIsPackage && (
                    <div style={{ padding: "0.75rem", background: "#FFFFFF", borderRadius: "6px", border: "1px solid #E2E8F0" }}>
                      <div style={{ marginBottom: "0.85rem" }}>
                        <label className="label" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Package Name</label>
                        <input
                          className="input"
                          value={newPackageName}
                          onChange={(e) => setNewPackageName(e.target.value)}
                          required={newServiceIsPackage}
                          style={{ background: "#F8FAFC", width: "100%" }}
                          placeholder="Enter package name"
                        />
                      </div>
                      {regularServices.length < 2 ? (
                        <p style={{ margin: 0, color: "#DC2626", fontSize: "0.85rem" }}>You need at least 2 regular services to map a package.</p>
                      ) : (
                        <>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "0.5rem" }}>Linked Services ({newServiceIncludedIds.length})</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "200px", overflowY: "auto", paddingRight: "0.5rem" }}>
                            {regularServices.map((service) => (
                              <label key={`pkg-${service.id}`} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", borderRadius: "6px", background: newServiceIncludedIds.includes(service.id) ? "#EFF6FF" : "#F8FAFC", border: "1px solid", borderColor: newServiceIncludedIds.includes(service.id) ? "#BFDBFE" : "#E2E8F0", cursor: "pointer", transition: "all 0.2s" }}>
                                <input type="checkbox" checked={newServiceIncludedIds.includes(service.id)} onChange={(e) => toggleIncludedService(service.id, e.target.checked)} style={{ margin: 0 }} />
                                <span style={{ fontSize: "0.85rem", color: "#1E293B", fontWeight: 500 }}>{service.name}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Plus size={18} /> {newServiceIsPackage ? "Create Package Deal" : "Create Service"}
              </button>
            </div>
          </form>
        </div>
      )}

      {renderCatalogList()}
    </div>
  );

  const renderFormsBuilder = () => (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <p style={{ color: "#64748B", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
        Configure the exact dataset questions verifiers must fill during processing.
      </p>

      {pendingFormService && (
        <div style={{ marginBottom: "1.5rem", borderLeft: "4px solid #4A90E2", background: "#EFF6FF", borderRadius: "0 8px 8px 0", padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#1E3A8A", fontSize: "0.95rem" }}>Pending form configuration</div>
            <div style={{ color: "#1E40AF", fontSize: "0.85rem" }}>Let&apos;s build the data capture form for &quot;{pendingFormService.name}&quot;</div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setPendingFormService(null)} style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
            Dismiss
          </button>
        </div>
      )}

      {services.length > 0 ? (
        <div ref={formBuilderRef}>
          <ServiceFormBuilder
            services={services}
            canManage={isAdmin}
            onSaved={loadServices}
            preferredServiceId={pendingFormService?.id}
          />
        </div>
      ) : (
         <div style={{ textAlign: "center", padding: "4rem", color: "#94A3B8" }}>Please create a service first to configure form structures.</div>
      )}
    </div>
  );

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Service Workspace"
      subtitle="Manage your catalog offerings, pricing blueprints, and data capture definitions."
    >
      <div 
        className="glass-card" 
        style={{ 
          padding: "1.5rem", 
          background: "rgba(255, 255, 255, 0.75)", 
          backdropFilter: "blur(12px)", 
          WebkitBackdropFilter: "blur(12px)", 
          border: "1px solid rgba(255, 255, 255, 0.4)", 
          borderRadius: "16px",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.07)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem", color: "#1E293B", fontSize: "1.25rem" }}>
              <Package size={24} color="#4A90E2" />
              Service Capabilities
            </h2>
          </div>
          
          <div style={{ display: "flex", background: "#F1F5F9", padding: "0.25rem", borderRadius: "10px", gap: "0.25rem", overflowX: "auto" }}>
            <button onClick={() => setActiveTab("catalog")} style={{ border: "none", background: activeTab === "catalog" ? "#FFFFFF" : "transparent", color: activeTab === "catalog" ? "#0F172A" : "#64748B", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", boxShadow: activeTab === "catalog" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <LayoutList size={16} /> Directory & Creation
            </button>
            <button onClick={() => setActiveTab("forms")} style={{ border: "none", background: activeTab === "forms" ? "#FFFFFF" : "transparent", color: activeTab === "forms" ? "#0F172A" : "#64748B", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", boxShadow: activeTab === "forms" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <FileText size={16} /> Dataset Forms
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: "0.8rem", background: "#F1F5F9", borderLeft: `4px solid ${message.includes("success") || message.includes("added") ? "#16A34A" : "#EAB308"}`, borderRadius: "0 0.4rem 0.4rem 0", marginBottom: "1.5rem", color: "#334155", fontWeight: 500, animation: "fadeIn 0.3s ease" }}>
            {message}
          </div>
        )}

        <div style={{ minHeight: "450px" }}>
          {activeTab === "catalog" && renderCreateAndCatalog()}
          {activeTab === "forms" && renderFormsBuilder()}
        </div>
      </div>
    </AdminPortalFrame>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<main className="shell" style={{ padding: "4rem 0" }}>Loading...</main>}>
      <ServicesPageContent />
    </Suspense>
  );
}