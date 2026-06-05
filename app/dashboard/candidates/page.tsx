"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminPortalFrame } from "@/components/dashboard/AdminPortalFrame";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useAdminSession } from "@/lib/hooks/useAdminSession";
import { UserCheck, ShieldCheck, ShieldAlert, X, Briefcase, GraduationCap } from "lucide-react";

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
  };
};

function maskDOB(dob: string): string {
  if (!dob) return "";
  const cleaned = dob.trim();
  const yearMatch = cleaned.match(/\b\d{4}\b/);
  if (yearMatch) {
    const year = yearMatch[0];
    const yearIndex = cleaned.indexOf(year);
    return cleaned.split("").map((char, idx) => {
      if (/\d/.test(char) && (idx < yearIndex || idx >= yearIndex + 4)) {
        return "*";
      }
      return char;
    }).join("");
  }
  let count = 0;
  return cleaned.split("").map((char) => {
    if (/\d/.test(char) && count < 4) {
      count++;
      return "*";
    }
    return char;
  }).join("");
}

export default function CandidatesPage() {
  const { me, loading, logout } = useAdminSession();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

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
                      <img src={candidate.digilockerProfile.photo} alt="Profile" className="w-full h-full object-cover" />
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
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Date of Birth</span>
                        <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">{candidate.digilockerProfile.dob ? maskDOB(candidate.digilockerProfile.dob) : "N/A"}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Gender</span>
                        <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">{candidate.digilockerProfile.gender || "N/A"}</span>
                      </div>
                      <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Aadhaar (Masked)</span>
                          <span className="text-[14px] font-mono font-semibold text-slate-800 dark:text-slate-200">{candidate.digilockerProfile.maskedAadhaar || "N/A"}</span>
                        </div>
                        {candidate.digilockerProfile.eaadhaar && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">E-Aadhaar Synced</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 text-sm flex items-center gap-2">
                      <ShieldAlert size={16} className="text-slate-400" />
                      DigiLocker not connected
                    </div>
                  )}
                </section>

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
