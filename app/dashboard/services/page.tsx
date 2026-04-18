"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Plus, Trash, Tag, FileText, LayoutList } from "lucide-react";
import { useSearchParams } from "next/navigation";
import ServiceFormBuilder from "@/components/ServiceFormBuilder";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
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

  // Read URL parameters on initial mount
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "forms") {
      setActiveTab("forms");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const requestedServiceId = searchParams.get("serviceId");
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
   
  }, [searchParams, services]);

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
    <div className="mt-8 animate-in fade-in duration-300">
      <h3 className="mt-0 mb-2 text-slate-800 text-lg font-semibold">All Services & Packages</h3>
      <p className="text-slate-500 text-sm mb-6">
        Currently active services that can be composed into forms and assigned to companies.
      </p>

      {assignableCatalogServices.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white/50">No services available in the catalog.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {assignableCatalogServices.map((service) => {
            const isExpanded = expandedServiceId === service.id;
            return (
              <div
                key={service.id}
                onClick={() => setExpandedServiceId(isExpanded ? null : service.id)}
                className={`flex flex-col justify-between rounded-2xl border p-5 cursor-pointer transition-all duration-200 relative overflow-hidden ${
                  isExpanded ? "bg-slate-50 border-blue-300 shadow-md ring-2 ring-blue-50" : "bg-white border-slate-200 shadow-sm hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex gap-3 items-center">
                      <div className={`p-2 rounded-xl flex items-center justify-center shadow-sm ${service.isPackage ? "bg-indigo-100 text-indigo-700" : "bg-blue-50 text-blue-600"}`}>
                        {service.isPackage ? <Package size={20} /> : <Tag size={20} />}
                      </div>
                      <div>
                        <h4 className="m-0 text-base text-slate-800 font-bold tracking-tight">{service.name}</h4>
                        {service.isPackage && <div className="text-[0.65rem] font-extrabold text-indigo-600 uppercase tracking-wider mt-0.5">Package Deal</div>}
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        title="Delete Service"
                        onClick={(e) => { e.stopPropagation(); handleDeleteService(service.id, service.name); }}
                        className="bg-transparent border-none text-red-400 hover:bg-red-50 hover:text-red-500 rounded-md p-1.5 cursor-pointer transition-colors"
                      >
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                  <p className={`my-3 text-slate-500 text-sm ${isExpanded ? "" : "line-clamp-2"}`}>
                    {service.description || <span className="italic opacity-70">No description provided.</span>}
                  </p>
                </div>

                <div className="pt-3 flex flex-col gap-2 mt-auto border-t border-slate-100">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400 font-medium">Default Price</span>
                    <span className="text-slate-700 font-semibold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-xs shadow-sm">
                      {service.defaultPrice !== null ? `${service.defaultCurrency} ${service.defaultPrice}` : "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400 font-medium">Composition</span>
                    <span className="text-slate-700 font-medium">
                      {service.isPackage ? `${service.includedServiceIds?.length ?? 0} Mapped Services` : `${service.formFields?.length ?? 0} Form Fields`}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-dashed border-slate-200 animate-in fade-in duration-200">
                    {service.isPackage ? (
                      <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Included Components</div>
                        <ul className="m-0 pl-1 text-sm text-slate-600 flex flex-col gap-1.5 list-none">
                          {service.includedServiceIds?.length ? (
                            service.includedServiceIds.map((id) => (
                              <li key={id} className="flex items-center gap-2 before:content-['•'] before:text-indigo-400">
                                {serviceNameById.get(id) || "Unknown service"}
                              </li>
                            ))
                          ) : (
                            <li className="italic text-slate-400 text-xs">No services attached</li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      <div className="flex justify-center mt-2">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setPendingFormService({ id: service.id, name: service.name }); 
                            setActiveTab("forms"); 
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-lg py-2.5 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow"
                        >
                          <FileText size={16} /> Edit Data Capture Form
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
    <div className="animate-in fade-in duration-300">
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-8">
          <h3 className="mt-0 mb-4 text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Plus size={18} className="text-blue-500" /> Add New {newServiceIsPackage ? "Package Deal" : "Service"}
          </h3>
          <form onSubmit={createService} className="flex flex-col gap-5">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-4">
                {!newServiceIsPackage && (
                  <div>
                    <label className="text-sm font-semibold text-slate-600 mb-1.5 block">Service Name</label>
                    <input
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      required={!newServiceIsPackage}
                      placeholder="Enter service name"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-slate-600 mb-1.5 block">Description (Optional)</label>
                  <textarea 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all resize-y" 
                    value={newServiceDescription} 
                    onChange={(e) => setNewServiceDescription(e.target.value)} 
                    rows={3} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-600 mb-1.5 block">Default Price</label>
                    <input 
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all" 
                      type="number" min={0} step="0.01" 
                      value={newServiceDefaultPrice} 
                      onChange={(e) => setNewServiceDefaultPrice(e.target.value)} 
                      placeholder="0.00" 
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-600 mb-1.5 block">Default Currency</label>
                    <select 
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all" 
                      value={newServiceDefaultCurrency} 
                      onChange={(e) => setNewServiceDefaultCurrency(e.target.value as SupportedCurrency)}
                    >
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-full">
                  <label className="flex items-center gap-2 font-semibold text-slate-800 mb-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={newServiceIsPackage} 
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setNewServiceIsPackage(checked);
                        if (checked && !newPackageName.trim() && newServiceName.trim()) {
                          setNewPackageName(newServiceName.trim());
                        }
                        if (!checked) {
                          setNewServiceIncludedIds([]);
                        }
                      }} 
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" 
                    />
                    Create as Package Deal
                  </label>
                  <p className="m-0 text-slate-500 text-sm mb-4">
                    Combine multiple services into one offering. Packages expand into their respective included forms during orders.
                  </p>

                  {newServiceIsPackage && (
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <div className="mb-3">
                        <label className="text-sm font-semibold text-slate-600 mb-1.5 block">Package Name</label>
                        <input
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                          value={newPackageName}
                          onChange={(e) => setNewPackageName(e.target.value)}
                          required={newServiceIsPackage}
                          placeholder="Enter package name"
                        />
                      </div>
                      {regularServices.length < 2 ? (
                        <p className="m-0 text-red-500 text-sm">You need at least 2 regular services to map a package.</p>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-slate-700 mb-2">Linked Services ({newServiceIncludedIds.length})</div>
                          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {regularServices.map((service) => (
                              <label 
                                key={`pkg-${service.id}`} 
                                className={`flex items-center gap-2 p-2 rounded-md border transition-all cursor-pointer ${
                                  newServiceIncludedIds.includes(service.id) ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200 hover:border-blue-100"
                                }`}
                              >
                                <input 
                                  type="checkbox" 
                                  checked={newServiceIncludedIds.includes(service.id)} 
                                  onChange={(e) => toggleIncludedService(service.id, e.target.checked)} 
                                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 m-0" 
                                />
                                <span className="text-sm font-medium text-slate-800">{service.name}</span>
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

            <div className="flex justify-end mt-2">
              <button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 border-none shadow-sm cursor-pointer"
              >
                <Plus size={18} /> {newServiceIsPackage ? "Create Package Target" : "Create Service Definition"}
              </button>
            </div>
          </form>
        </div>
      )}

      {renderCatalogList()}
    </div>
  );

  const renderFormsBuilder = () => (
    <div className="animate-in fade-in duration-300">
      <p className="text-slate-500 text-sm mb-6">
        Configure the exact dataset questions verifiers must fill during processing.
      </p>

      {pendingFormService && (
        <div className="mb-6 border-l-4 border-blue-500 bg-blue-50 rounded-r-lg p-4 flex justify-between items-center shadow-sm">
          <div>
            <div className="font-semibold text-blue-900 text-sm tracking-tight">Pending Form Configuration</div>
            <div className="text-blue-800 text-xs mt-1">Let&apos;s build the data capture form for &quot;<strong>{pendingFormService.name}</strong>&quot;</div>
          </div>
          <button 
            type="button" 
            className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 rounded-md py-1.5 px-3 text-xs font-semibold cursor-pointer transition-colors shadow-sm" 
            onClick={() => setPendingFormService(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {services.length > 0 ? (
        <div ref={formBuilderRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <ServiceFormBuilder
            services={services}
            canManage={isAdmin}
            onSaved={loadServices}
            preferredServiceId={pendingFormService?.id}
          />
        </div>
      ) : (
         <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white/50">Please create a service first to configure form structures.</div>
      )}
    </div>
  );

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Service Workspace"
      subtitle="Govern organizational capabilities, package pricing outlines, and compliance data forms."
    >
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 flex-1 rounded-3xl shadow-sm overflow-hidden mt-2">
        <div className="px-6 md:px-8 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50">
          <h2 className="m-0 flex items-center gap-3 text-slate-800 text-xl font-bold tracking-tight">
            <div className="bg-blue-600 rounded-lg p-2 text-white shadow-sm">
              <Package size={22} />
            </div>
            Workspace Center
          </h2>
          <div className="flex bg-slate-100/80 p-1.5 rounded-xl gap-1 overflow-x-auto ring-1 ring-black/5">
            <button
              onClick={() => setActiveTab("catalog")}
              className={`whitespace-nowrap flex-1 md:flex-none border-0 transition-all rounded-lg px-5 py-2 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ${activeTab === "catalog" ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5" : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
            >
              <LayoutList size={16} /> Directory & Setup
            </button>
            <button
              onClick={() => setActiveTab("forms")}
              className={`whitespace-nowrap flex-1 md:flex-none border-0 transition-all rounded-lg px-5 py-2 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ${activeTab === "forms" ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5" : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
            >
              <FileText size={16} /> Data Capture Forms
            </button>
          </div>
        </div>
        <div className="p-6 md:p-8 min-h-[500px] bg-slate-50/30">
          {message && (
            <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 shadow-sm ${message.toLowerCase().includes("error") || message.toLowerCase().includes("failed") ? "bg-red-50 text-red-800 border border-red-100" : "bg-green-50 text-green-800 border border-green-100"}`}>
              <span className="font-medium text-sm">{message}</span>
            </div>
          )}
          {activeTab === "catalog" && renderCreateAndCatalog()}
          {activeTab === "forms" && renderFormsBuilder()}
        </div>
      </div>
    </AdminPortalFrame>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<main className="flex items-center justify-center p-16 text-slate-500">Loading...</main>}>
      <ServicesPageContent />
    </Suspense>
  );
}