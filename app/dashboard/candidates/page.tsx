"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { 
  UserCheck, 
  ShieldCheck, 
  ShieldAlert, 
  X, 
  Briefcase, 
  GraduationCap, 
  Eye, 
  EyeOff, 
  FileText, 
  Copy, 
  Check 
} from "lucide-react";

// Types
type CandidateSummary = {
  _id: string;
  name: string;
  email: string;
  digilockerProfile?: {
    verified: boolean;
  };
  createdAt: string;
};

type CandidateDetail = CandidateSummary & {
  candidateProfile?: {
    keySkills?: string[];
    employment?: any[];
    education?: any[];
  };
  digilockerProfile?: {
    verified: boolean;
    name?: string;
    dob?: string;
    gender?: string;
    email?: string;
    mobile?: string;
    maskedAadhaar?: string;
    digilockerid?: string;
    referenceKey?: string;
    eaadhaar?: string;
    photo?: string;
    panNumber?: string;
    drivingLicence?: string;
    preferredUsername?: string;
    documents?: any[];
    linkedAt?: string;
  };
};

function formatDOBForDisplay(dobStr: string): string {
  if (!dobStr) return "";
  const cleaned = dobStr.trim();

  // 1. Matches DD-MM-YYYY or DD/MM/YYYY
  const dmYMatch = cleaned.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmYMatch) {
    const day = dmYMatch[1].padStart(2, "0");
    const month = dmYMatch[2].padStart(2, "0");
    const year = dmYMatch[3];
    return `${day}-${month}-${year}`;
  }

  // 2. Matches YYYY-MM-DD or YYYY/MM/DD
  const YmdMatch = cleaned.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (YmdMatch) {
    const year = YmdMatch[1];
    const month = YmdMatch[2].padStart(2, "0");
    const day = YmdMatch[3].padStart(2, "0");
    return `${day}-${month}-${year}`;
  }

  // 3. Matches 8 consecutive digits (e.g. 17102003)
  if (/^\d{8}$/.test(cleaned)) {
    const part1 = cleaned.substring(0, 4);
    const yearNum = parseInt(part1, 10);
    if (yearNum >= 1900 && yearNum <= 2100) {
      const year = part1;
      const month = cleaned.substring(4, 6);
      const day = cleaned.substring(6, 8);
      return `${day}-${month}-${year}`;
    } else {
      const day = cleaned.substring(0, 2);
      const month = cleaned.substring(2, 4);
      const year = cleaned.substring(4, 8);
      return `${day}-${month}-${year}`;
    }
  }

  return cleaned;
}

function maskDOB(dob: string): string {
  if (!dob) return "";
  const formatted = formatDOBForDisplay(dob);
  const yearMatch = formatted.match(/\b\d{4}\b/);
  if (yearMatch) {
    const year = yearMatch[0];
    const yearIndex = formatted.indexOf(year);
    return formatted.split("").map((char, idx) => {
      if (/\d/.test(char) && (idx < yearIndex || idx >= yearIndex + 4)) {
        return "*";
      }
      return char;
    }).join("");
  }
  let count = 0;
  return formatted.split("").map((char) => {
    if (/\d/.test(char) && count < 4) {
      count++;
      return "*";
    }
    return char;
  }).join("");
}

function maskMobile(mobile: string): string {
  if (!mobile) return "";
  const cleaned = mobile.trim();
  const digitMatches = cleaned.match(/\d/g);
  if (digitMatches && digitMatches.length >= 10) {
    const last10StartIndex = digitMatches.length - 10;
    let digitIndex = 0;
    let maskedDigits = 0;
    return cleaned.split("").map((char) => {
      if (/\d/.test(char)) {
        const isPartofLast10 = digitIndex >= last10StartIndex;
        digitIndex++;
        if (isPartofLast10 && maskedDigits < 6) {
          maskedDigits++;
          return "*";
        }
      }
      return char;
    }).join("");
  }
  return cleaned.replace(/^.{6}/, "******");
}

function maskPAN(pan: string): string {
  if (!pan) return "";
  const cleaned = pan.trim();
  if (cleaned.length >= 10) {
    return "******" + cleaned.slice(-4);
  }
  return "******";
}

function maskDL(dl: string): string {
  if (!dl) return "";
  const cleaned = dl.trim();
  if (cleaned.length > 4) {
    return "*".repeat(cleaned.length - 4) + cleaned.slice(-4);
  }
  return "******";
}

export default function CandidatesPage() {
  const { me, loading, logout } = useAdminSession();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  
  // Reveal/unmask status for sensitive fields (dob, mobile, pan, dl)
  const [revealSensitive, setRevealSensitive] = useState<Record<string, boolean>>({});
  
  // Temporary state for document URI clipboard copying feedback
  const [copiedDocUri, setCopiedDocUri] = useState<string | null>(null);

  const toggleReveal = (fieldKey: string) => {
    setRevealSensitive((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDocUri(text);
    setTimeout(() => setCopiedDocUri(null), 2000);
  };

  const { data, isLoading } = useQuery<{ candidates: CandidateSummary[] }>({
    queryKey: ["candidates-list"],
    queryFn: async () => {
      const res = await fetch("/api/candidates");
      if (!res.ok) throw new Error("Failed to load candidates");
      return res.json();
    },
    enabled: !!me,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<{ candidate: CandidateDetail }>({
    queryKey: ["candidate-detail", selectedCandidateId],
    queryFn: async () => {
      const res = await fetch(`/api/candidates?id=${selectedCandidateId}`);
      if (!res.ok) throw new Error("Failed to load details");
      return res.json();
    },
    enabled: !!selectedCandidateId,
  });

  if (loading || !me) {
    return <LoadingScreen title="Loading candidates..." subtitle="Gathering candidate data" />;
  }

  const candidate = detailData?.candidate;

  return (
    <AdminPortalFrame
      me={me}
      onLogout={logout}
      title="Candidate Roster"
      subtitle="View all candidates and their verified information in the database."
    >
      <div className="glass-card flex flex-col h-[calc(100vh-140px)] relative overflow-hidden" style={{ minHeight: "600px" }}>
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <UserCheck className="text-teal-600" size={20} />
            Registered Candidates
          </h2>
          <div className="text-sm text-slate-500 font-medium">
            {data?.candidates?.length || 0} Total
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-0 relative">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">Loading roster...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[13px] font-semibold sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">DigiLocker Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.candidates?.map((c) => (
                  <tr 
                    key={c._id} 
                    className="hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-colors cursor-pointer group"
                    onClick={() => setSelectedCandidateId(c._id)}
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                      {c.name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 text-sm">
                      {c.email}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.digilockerProfile?.verified ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <ShieldCheck size={14} /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <ShieldAlert size={14} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="text-teal-600 dark:text-teal-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))}
                {data?.candidates?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No candidates found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Backdrop for Slide-out Drawer (mobile) */}
        {selectedCandidateId && (
          <div 
            className="absolute inset-0 bg-slate-900/20 dark:bg-black/40 backdrop-blur-[1px] z-10 transition-opacity"
            onClick={() => setSelectedCandidateId(null)}
          />
        )}

        {/* Slide-out Drawer */}
        <div 
          className={`absolute top-0 right-0 h-full w-[450px] max-w-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] z-20 flex flex-col ${selectedCandidateId ? "translate-x-0" : "translate-x-full"}`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
            <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Candidate Details</h3>
            <button 
              onClick={() => setSelectedCandidateId(null)}
              className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {detailLoading ? (
              <div className="flex flex-col gap-4 animate-pulse">
                <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
                <div className="h-40 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
                <div className="h-40 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
              </div>
            ) : candidate ? (
              <>
                {/* Profile Header */}
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800">
                  <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-300 font-bold text-xl shrink-0 overflow-hidden shadow-inner">
                    {candidate.digilockerProfile?.photo ? (
                      <img 
                        src={candidate.digilockerProfile.photo.startsWith("data:") 
                          ? candidate.digilockerProfile.photo 
                          : `data:image/jpeg;base64,${candidate.digilockerProfile.photo}`} 
                        alt="Profile" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      candidate.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg leading-tight">{candidate.name}</h4>
                    <p className="text-teal-600 dark:text-teal-400 text-sm font-medium mt-0.5">{candidate.email}</p>
                  </div>
                </div>

                {/* DigiLocker Data */}
                <section>
                  <h5 className="flex items-center gap-2 text-[15px] font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <ShieldCheck className="text-emerald-500" size={18} />
                    DigiLocker Information
                  </h5>
                  {candidate.digilockerProfile?.verified ? (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Verified Name with Compare Indicator */}
                      {(() => {
                        const namesMatch = candidate.name.trim().toLowerCase() === (candidate.digilockerProfile.name || "").trim().toLowerCase();
                        return (
                          <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                            <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Verified Name</span>
                            <div className="flex items-center justify-between">
                              <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                                {candidate.digilockerProfile.name || "N/A"}
                              </span>
                              {namesMatch ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <ShieldCheck size={12} /> Matches registration
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50">
                                  ⚠️ Name Mismatch
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Date of Birth (Masked DOB with Toggle) */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Date of Birth</span>
                          <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                            {candidate.digilockerProfile.dob 
                              ? (revealSensitive.dob ? formatDOBForDisplay(candidate.digilockerProfile.dob) : maskDOB(candidate.digilockerProfile.dob))
                              : "N/A"}
                          </span>
                        </div>
                        {candidate.digilockerProfile.dob && (
                          <button 
                            onClick={() => toggleReveal("dob")}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                            title={revealSensitive.dob ? "Mask Date of Birth" : "Reveal Date of Birth"}
                          >
                            {revealSensitive.dob ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                      </div>

                      {/* Gender */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Gender</span>
                        <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                          {(() => {
                            const g = candidate.digilockerProfile.gender;
                            if (g === "M") return "Male";
                            if (g === "F") return "Female";
                            if (g === "O") return "Other";
                            return g || "N/A";
                          })()}
                        </span>
                      </div>

                      {/* Mobile (Masked Mobile with Toggle) */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Mobile</span>
                          <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                            {candidate.digilockerProfile.mobile 
                              ? (revealSensitive.mobile ? candidate.digilockerProfile.mobile : maskMobile(candidate.digilockerProfile.mobile))
                              : "N/A"}
                          </span>
                        </div>
                        {candidate.digilockerProfile.mobile && (
                          <button 
                            onClick={() => toggleReveal("mobile")}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                            title={revealSensitive.mobile ? "Mask Mobile" : "Reveal Mobile"}
                          >
                            {revealSensitive.mobile ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                      </div>

                      {/* Email */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Email</span>
                        <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 truncate block max-w-full" title={candidate.digilockerProfile.email}>
                          {candidate.digilockerProfile.email || "N/A"}
                        </span>
                      </div>

                      {/* Aadhaar */}
                      <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Aadhaar (Masked)</span>
                          <span className="text-[14px] font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {candidate.digilockerProfile.maskedAadhaar || "N/A"}
                          </span>
                        </div>
                        {candidate.digilockerProfile.eaadhaar && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                            E-Aadhaar Synced
                          </span>
                        )}
                      </div>

                      {/* PAN Number (if exists) */}
                      {candidate.digilockerProfile.panNumber && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">PAN Card</span>
                            <span className="text-[14px] font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {revealSensitive.pan ? candidate.digilockerProfile.panNumber : maskPAN(candidate.digilockerProfile.panNumber)}
                            </span>
                          </div>
                          <button 
                            onClick={() => toggleReveal("pan")}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                            title={revealSensitive.pan ? "Mask PAN" : "Reveal PAN"}
                          >
                            {revealSensitive.pan ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      )}

                      {/* Driving Licence (if exists) */}
                      {candidate.digilockerProfile.drivingLicence && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Driving Licence</span>
                            <span className="text-[14px] font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {revealSensitive.dl ? candidate.digilockerProfile.drivingLicence : maskDL(candidate.digilockerProfile.drivingLicence)}
                            </span>
                          </div>
                          <button 
                            onClick={() => toggleReveal("dl")}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                            title={revealSensitive.dl ? "Mask Driving Licence" : "Reveal Driving Licence"}
                          >
                            {revealSensitive.dl ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      )}

                      {/* DigiLocker ID / Username */}
                      {(candidate.digilockerProfile.digilockerid || candidate.digilockerProfile.preferredUsername) && (
                        <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                          <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">DigiLocker ID / Username</span>
                          <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                            {candidate.digilockerProfile.digilockerid && (
                              <span><strong className="text-slate-400 font-normal">ID:</strong> {candidate.digilockerProfile.digilockerid}</span>
                            )}
                            {candidate.digilockerProfile.preferredUsername && (
                              <span><strong className="text-slate-400 font-normal">Username:</strong> {candidate.digilockerProfile.preferredUsername}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Reference Key */}
                      {candidate.digilockerProfile.referenceKey && (
                        <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                          <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Reference Key</span>
                          <span className="text-[13px] font-mono font-semibold text-slate-700 dark:text-slate-300 break-all">
                            {candidate.digilockerProfile.referenceKey}
                          </span>
                        </div>
                      )}

                      {/* Linking Timestamp */}
                      {candidate.digilockerProfile.linkedAt && (
                        <div className="col-span-2 text-right text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                          Linked on {new Date(candidate.digilockerProfile.linkedAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 text-sm flex items-center gap-2">
                      <ShieldAlert size={16} className="text-slate-400" />
                      DigiLocker not connected
                    </div>
                  )}
                </section>

                {/* DigiLocker Issued Documents */}
                {candidate.digilockerProfile?.verified && candidate.digilockerProfile.documents && candidate.digilockerProfile.documents.length > 0 && (
                  <section>
                    <h5 className="flex items-center gap-2 text-[15px] font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <FileText className="text-indigo-500" size={18} />
                      Verified Documents ({candidate.digilockerProfile.documents.length})
                    </h5>
                    <div className="space-y-3">
                      {candidate.digilockerProfile.documents.map((doc, idx) => (
                        <div 
                          key={`doc-${idx}`} 
                          className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-start gap-3 relative group"
                        >
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shrink-0">
                            <FileText size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[14px] text-slate-800 dark:text-slate-200 truncate" title={doc.name || doc.description}>
                              {doc.name || doc.description || "Unnamed Document"}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 uppercase">
                                {doc.doctype || "DOC"}
                              </span>
                              {doc.date && (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Issued: {doc.date}
                                </span>
                              )}
                            </div>
                            {doc.issuer && (
                              <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-1.5 truncate" title={doc.issuer}>
                                {doc.issuer}
                              </div>
                            )}
                            {doc.uri && (
                              <div className="flex items-center gap-1.5 mt-2 bg-slate-50 dark:bg-slate-800/30 p-1.5 rounded-md border border-slate-100 dark:border-slate-800/50">
                                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate flex-1 select-all" title={doc.uri}>
                                  {doc.uri}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(doc.uri)}
                                  className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="Copy Document URI"
                                >
                                  {copiedDocUri === doc.uri ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Candidate Profile / Personal Details */}
                <section>
                  <h5 className="flex items-center gap-2 text-[15px] font-bold text-slate-800 dark:text-slate-200 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <Briefcase className="text-blue-500" size={18} />
                    Personal Details (As Filled)
                  </h5>
                  
                  {(!candidate.candidateProfile || (!candidate.candidateProfile.employment?.length && !candidate.candidateProfile.education?.length && !candidate.candidateProfile.keySkills?.length)) ? (
                    <div className="text-slate-500 text-sm italic py-2">No personal details filled yet.</div>
                  ) : (
                    <div className="space-y-4">
                      {candidate.candidateProfile.keySkills && candidate.candidateProfile.keySkills.length > 0 && (
                        <div>
                          <span className="block text-[12px] font-semibold text-slate-500 mb-2">Key Skills</span>
                          <div className="flex flex-wrap gap-1.5">
                            {candidate.candidateProfile.keySkills.map((s, idx) => (
                              <span key={idx} className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800 text-xs font-medium">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {candidate.candidateProfile.employment && candidate.candidateProfile.employment.length > 0 && (
                        <div>
                          <span className="block text-[12px] font-semibold text-slate-500 mb-2">Employment History</span>
                          <div className="space-y-2">
                            {candidate.candidateProfile.employment.map((emp, i) => (
                              <div key={i} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                <div className="font-semibold text-[14px] text-slate-800 dark:text-slate-200">{emp.companyName || "Unknown Company"}</div>
                                <div className="text-[13px] text-slate-600 dark:text-slate-400 mt-0.5">{emp.designation}</div>
                                <div className="text-[12px] text-slate-400 mt-1">{emp.startDate} - {emp.currentlyWorking ? "Present" : emp.endDate}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {candidate.candidateProfile.education && candidate.candidateProfile.education.length > 0 && (
                        <div>
                          <span className="block text-[12px] font-semibold text-slate-500 mb-2">Education</span>
                          <div className="space-y-2">
                            {candidate.candidateProfile.education.map((edu, i) => (
                              <div key={i} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                <div className="font-semibold text-[14px] text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                  <GraduationCap size={14} className="text-slate-400" />
                                  {edu.institution || "Unknown Institution"}
                                </div>
                                <div className="text-[13px] text-slate-600 dark:text-slate-400 mt-0.5">{edu.degree} {edu.fieldOfStudy && `in ${edu.fieldOfStudy}`}</div>
                                <div className="text-[12px] text-slate-400 mt-1">{edu.startYear} - {edu.endYear}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </AdminPortalFrame>
  );
}
