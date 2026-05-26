"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Send, Inbox, MessageSquare, ArrowLeft, RefreshCw, Mail } from "lucide-react";

type EmailParticipant = { name: string; email: string };
type EmailMessage = {
  id: string; subject: string; from: EmailParticipant; to: EmailParticipant[];
  body: string; bodyType: string; receivedAt: string; isRead: boolean;
  conversationId: string; isSent: boolean;
};
type Conversation = {
  conversationId: string; subject: string; participants: EmailParticipant[];
  messages: EmailMessage[]; lastMessageAt: string; unreadCount: number;
};

type CandidateFormAnswer = {
  fieldKey?: string;
  question: string;
  value: string;
};

type VerificationEmailModalProps = {
  open: boolean; onClose: () => void; requestId: string;
  candidateName?: string; candidateEmail?: string; serviceName?: string;
  serviceInstanceKey?: string;
  respondentName?: string; respondentEmail?: string;
  serviceId?: string;
  candidateFormAnswers?: CandidateFormAnswer[];
};

const cleanValue = (val: string): string => {
  if (!val) return "";
  let cleaned = val.trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => cleanValue(String(item))).filter(Boolean).join(", ");
    }
    if (typeof parsed === "string") {
      return cleanValue(parsed);
    }
    if (parsed !== null && parsed !== undefined) {
      return cleanValue(String(parsed));
    }
  } catch (e) {
    // Ignore JSON parse errors and fallback
  }
  
  // Strip brackets if present
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  
  // Strip quotes and backticks repeatedly if nested
  let prev;
  do {
    prev = cleaned;
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
        (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith("`") && cleaned.endsWith("`"))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
  } while (cleaned !== prev);

  return cleaned;
};

export function VerificationEmailModal({
  open, onClose, requestId, candidateName, candidateEmail, serviceName, serviceInstanceKey,
  respondentName, respondentEmail, serviceId, candidateFormAnswers,
}: VerificationEmailModalProps) {
  const [view, setView] = useState<"inbox" | "compose" | "conversation">("inbox");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  
  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<string>("custom");
  const [templateRespondentName, setTemplateRespondentName] = useState("");
  const [templateCandidateDesignation, setTemplateCandidateDesignation] = useState("");
  const [templateRespondentDesignation, setTemplateRespondentDesignation] = useState("");
  const [templateOrganisationName, setTemplateOrganisationName] = useState("");
  const [templateEmploymentPeriod, setTemplateEmploymentPeriod] = useState("");

  // Reply state
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);

  const isEducation = useMemo(() => {
    const name = String(serviceName || "").toLowerCase();
    return name.includes("education") || name.includes("academic") || name.includes("degree") || name.includes("university") || name.includes("college") || name.includes("school") || name.includes("qualification");
  }, [serviceName]);

  const fetchEmails = useCallback(async () => {
    if (!requestId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/verification-emails?requestId=${encodeURIComponent(requestId)}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to load emails."); return; }
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch { setError("Network error loading emails."); } finally { setLoading(false); }
  }, [requestId]);

  useEffect(() => { if (open && requestId) { fetchEmails(); setView("inbox"); setSelectedConversation(null); } }, [open, requestId, fetchEmails]);

  useEffect(() => {
    if (open && view === "compose") {
      setComposeTo(respondentEmail || "");
      setSelectedTemplate("custom");
      
      const cleanRespName = cleanValue(respondentName || "");
      const cleanCandName = cleanValue(candidateName || "");
      
      setTemplateRespondentName(cleanRespName);
      setTemplateCandidateDesignation("");
      setTemplateRespondentDesignation("");
      setTemplateOrganisationName("");
      setTemplateEmploymentPeriod("");
      
      const defaultBody = cleanRespName
        ? `Dear ${cleanRespName},\n\nI hope this email finds you well.\n\nWe are conducting a background verification for ${cleanCandName || "a candidate"} who has listed you as a contact/reference.\n\nCould you please help us verify their details? Let us know if you require any specific documents.\n\nThank you for your assistance.\n\nBest regards,\nCluso Infolink Team`
        : "";
      setComposeBody(defaultBody);
      setComposeSubject(serviceName ? `Verification Request – ${serviceName}${cleanCandName ? ` – ${cleanCandName}` : ""}` : `Verification Request${cleanCandName ? ` – ${cleanCandName}` : ""}`);

      // Auto-populate template variables from candidate form data
      if (serviceId && candidateFormAnswers && candidateFormAnswers.length > 0) {
        (async () => {
          try {
            const res = await fetch("/api/services");
            if (!res.ok) return;
            const data = await res.json();
            const services = Array.isArray(data.items) ? data.items : Array.isArray(data.services) ? data.services : [];
            const svc = services.find((s: { id?: string }) => s.id === serviceId);
            if (!svc || !Array.isArray(svc.formFields)) return;

            const answerMap = new Map<string, string>();
            for (const answer of candidateFormAnswers) {
              if (answer.fieldKey) {
                answerMap.set(answer.fieldKey, answer.value || "");
              }
            }

            for (const field of svc.formFields) {
              const mapping = String(field.templateVariableMapping ?? "").trim();
              if (!mapping || !field.fieldKey) continue;
              const answerValue = cleanValue(answerMap.get(field.fieldKey) ?? "");
              if (!answerValue) continue;

              switch (mapping) {
                case "respondentName":
                  setTemplateRespondentName(answerValue);
                  break;
                case "respondentDesignation":
                  setTemplateRespondentDesignation(answerValue);
                  break;
                case "candidateDesignation":
                  setTemplateCandidateDesignation(answerValue);
                  break;
                case "organisationName":
                  setTemplateOrganisationName(answerValue);
                  break;
                case "employmentPeriod":
                  setTemplateEmploymentPeriod(answerValue);
                  break;
              }
            }
          } catch {
            // Silently fail — template variables just won't auto-populate
          }
        })();
      }
    }
  }, [open, view, candidateEmail, candidateName, serviceName, respondentEmail, respondentName, serviceId, candidateFormAnswers]);

  const generateEmailContent = useCallback(() => {
    if (selectedTemplate === "custom") {
      return;
    }

    const cName = candidateName || "[Candidate Name]";
    const rName = templateRespondentName || respondentName || "[Respondent Name]";
    const cDesig = templateCandidateDesignation || (isEducation ? "[Degree/Course]" : "[Candidate Designation]");
    const rDesig = templateRespondentDesignation || (isEducation ? "[Respondent Title]" : "[Respondent Designation]");
    const org = templateOrganisationName || (isEducation ? "[School/University]" : "[Organisation Name]");
    const period = templateEmploymentPeriod || (isEducation ? "[Study Period]" : "[Employment Period]");

    if (selectedTemplate === "tenure") {
      if (isEducation) {
        setComposeSubject(`Academic Record & Degree Verification – ${cName}`);
        setComposeBody(
          `Dear ${rName}, ${rDesig}\n\n` +
          `I hope this email finds you well.\n\n` +
          `We are currently conducting a standard academic verification for ${cName}, who has listed their degree/qualification from ${org} as ${cDesig}.\n\n` +
          `To help us complete our onboarding process, could you please confirm the following details regarding their academic history?\n\n` +
          `1. Was ${cName} enrolled at ${org} for the degree/course of ${cDesig} during the period of ${period}?\n` +
          `2. Did they successfully complete the program and obtain the degree/qualification? If so, what was their graduation date?\n` +
          `3. What was their final score, CGPA, or grade obtained?\n\n` +
          `Your prompt response is highly appreciated and will remain strictly confidential.\n\n` +
          `Best regards,\n` +
          `Cluso Infolink Team`
        );
      } else {
        setComposeSubject(`Employment History Verification – ${cName}`);
        setComposeBody(
          `Dear ${rName}, ${rDesig}\n\n` +
          `I hope this email finds you well.\n\n` +
          `We are currently conducting a standard background verification for ${cName}, who has applied for a position with our organization and listed their tenure with ${org} as ${cDesig}.\n\n` +
          `To help us complete our onboarding process, could you please confirm the following details regarding their employment?\n\n` +
          `1. Was ${cName} employed at ${org} as a ${cDesig} during the period of ${period}?\n` +
          `2. What was their primary reason for leaving?\n` +
          `3. Are they considered eligible for rehire?\n\n` +
          `Your prompt response is highly appreciated and will remain strictly confidential.\n\n` +
          `Best regards,\n` +
          `Cluso Infolink Team`
        );
      }
    } else if (selectedTemplate === "conduct") {
      if (isEducation) {
        setComposeSubject(`Academic Reference Inquiry – ${cName}`);
        setComposeBody(
          `Dear ${rName}, ${rDesig}\n\n` +
          `I hope you are doing well.\n\n` +
          `${cName} is currently undergoing a background evaluation and has nominated you as an academic reference from their time at ${org}.\n\n` +
          `We would greatly appreciate your professional assessment of ${cName}'s conduct, cooperative spirit, and academic performance:\n\n` +
          `1. How would you describe ${cName}'s academic conduct, discipline, and cooperativeness during their program? Were they cooperative and friendly?\n` +
          `2. Can you speak to their communication skills and ability to work on team projects or research?\n` +
          `3. How did they handle challenging assignments or tight deadlines?\n\n` +
          `Your insights will help us ensure a mutually supportive cultural fit. Thank you for your valuable time.\n\n` +
          `Sincerely,\n` +
          `Cluso Infolink Team`
        );
      } else {
        setComposeSubject(`Professional Reference Inquiry – ${cName}`);
        setComposeBody(
          `Dear ${rName}, ${rDesig}\n\n` +
          `I hope you are doing well.\n\n` +
          `${cName} is currently undergoing a background evaluation for the role of ${cDesig} and has nominated you as a professional reference from their tenure at ${org}.\n\n` +
          `We would greatly appreciate your professional assessment of ${cName}'s conduct and interpersonal skills:\n\n` +
          `1. How would you describe ${cName}'s professional conduct and their ability to work collaboratively in a team? Were they friendly, cooperative, and professional?\n` +
          `2. Can you speak to their communication skills and relationship-building with peers and leadership?\n` +
          `3. How did they handle conflict or tight deadlines?\n\n` +
          `Your insights will help us ensure a mutually supportive cultural fit. Thank you for your valuable time.\n\n` +
          `Sincerely,\n` +
          `Cluso Infolink Team`
        );
      }
    } else if (selectedTemplate === "compliance") {
      if (isEducation) {
        setComposeSubject(`Academic Integrity and Attendance Verification – ${cName}`);
        setComposeBody(
          `Dear ${rName}, ${rDesig}\n\n` +
          `I hope you are having a productive day.\n\n` +
          `In connection with our compliance and onboarding audits, we are conducting a reference and record check for ${cName}, who previously attended ${org} for ${cDesig}.\n\n` +
          `Please assist us by providing feedback on the following compliance indicators:\n\n` +
          `1. Did ${cName} maintain a consistent and satisfactory attendance record, with no unexcused or excessive absences?\n` +
          `2. Were there any documented disciplinary issues, academic integrity violations (such as plagiarism), or code of conduct breaches?\n` +
          `3. Did they engage in or were they associated with any suspicious or unauthorized activities within the campus?\n\n` +
          `We maintain absolute confidentiality over your response. Thank you in advance for your cooperation.\n\n` +
          `Best regards,\n` +
          `Cluso Infolink Team`
        );
      } else {
        setComposeSubject(`Integrity and Attendance Verification – ${cName}`);
        setComposeBody(
          `Dear ${rName}, ${rDesig}\n\n` +
          `I hope you are having a productive day.\n\n` +
          `In connection with our compliance and safety onboarding audits, we are conducting a reference check for ${cName}, who previously served as a ${cDesig} at ${org}.\n\n` +
          `Please assist us by providing feedback on the following compliance indicators:\n\n` +
          `1. Did ${cName} maintain a consistent and satisfactory attendance record, with no unexcused or excessive absences?\n` +
          `2. Were there any documented disciplinary issues, security violations, or compliance breaches during their tenure?\n` +
          `3. Did they engage in or were they associated with any suspicious or unauthorized activities within the workplace?\n\n` +
          `We maintain absolute confidentiality over your response. Thank you in advance for your cooperation.\n\n` +
          `Best regards,\n` +
          `Cluso Infolink Team`
        );
      }
    }
  }, [
    selectedTemplate,
    candidateName,
    respondentName,
    templateRespondentName,
    templateCandidateDesignation,
    templateRespondentDesignation,
    templateOrganisationName,
    templateEmploymentPeriod,
    isEducation
  ]);

  useEffect(() => {
    generateEmailContent();
  }, [generateEmailContent]);

  const handleSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) { setError("Please fill To, Subject and Body."); return; }
    setSending(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/verification-emails", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, to: composeTo.trim(), subject: composeSubject.trim(), body: composeBody.trim(), serviceInstanceKey: serviceInstanceKey || "" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to send."); return; }
      setSuccess("Email sent successfully!"); setComposeBody(""); setTimeout(() => { setSuccess(""); setView("inbox"); fetchEmails(); }, 1500);
    } catch { setError("Network error sending email."); } finally { setSending(false); }
  };

  const handleReply = async (messageId: string) => {
    if (!replyBody.trim()) { setError("Please enter a reply."); return; }
    setReplying(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/verification-emails/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, body: replyBody.trim(), requestId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to send reply."); return; }
      setSuccess("Reply sent!"); setReplyBody(""); setTimeout(() => { setSuccess(""); fetchEmails(); }, 1500);
    } catch { setError("Network error sending reply."); } finally { setReplying(false); }
  };

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

  if (!open) return null;

  const formatDate = (d: string) => { try { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }); } catch { return d; } };
  const stripHtml = (html: string) => { const tmp = typeof document !== "undefined" ? document.createElement("div") : null; if (tmp) { tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ""; } return html.replace(/<[^>]*>/g, ""); };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "stretch",
        pointerEvents: "none"
      }}
    >
      <div
        className="email-compose-drawer"
        style={{
          background: "#fff",
          width: "550px",
          maxWidth: "95vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-10px 0 40px rgba(0,0,0,0.15)",
          borderLeft: "1px solid #CBD5E1",
          pointerEvents: "auto",
          overflow: "hidden",
          position: "relative"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #E2E8F0", background: "linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {view !== "inbox" && (
              <button onClick={() => { if (view === "conversation") { setSelectedConversation(null); setView("inbox"); } else { setView("inbox"); } }} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "8px", padding: "0.35rem", cursor: "pointer", color: "#fff", display: "flex" }}>
                <ArrowLeft size={18} />
              </button>
            )}
            <Mail size={22} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>Verification Email</div>
              <div style={{ fontSize: "0.72rem", opacity: 0.85 }}>indiaops@cluso.in{candidateName ? ` • ${candidateName}` : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {view === "inbox" && (
              <>
                <button onClick={fetchEmails} disabled={loading} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "8px", padding: "0.4rem", cursor: "pointer", color: "#fff", display: "flex" }} title="Refresh">
                  <RefreshCw size={16} className={loading ? "spin" : ""} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
                </button>
                <button onClick={() => setView("compose")} style={{ background: "#fff", color: "#1E40AF", border: "none", borderRadius: "8px", padding: "0.35rem 0.85rem", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Send size={14} /> Compose
                </button>
              </>
            )}
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "8px", padding: "0.35rem", cursor: "pointer", color: "#fff", display: "flex" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status messages */}
        {error && <div style={{ padding: "0.6rem 1.25rem", background: "#FEF2F2", color: "#B91C1C", fontSize: "0.82rem", borderBottom: "1px solid #FECACA" }}>{error} <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#B91C1C", fontWeight: 700 }}>×</button></div>}
        {success && <div style={{ padding: "0.6rem 1.25rem", background: "#ECFDF5", color: "#065F46", fontSize: "0.82rem", borderBottom: "1px solid #A7F3D0" }}>{success}</div>}

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {/* INBOX VIEW */}
          {view === "inbox" && (
            <div style={{ padding: "0" }}>
              {loading ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "#64748B" }}>
                  <div style={{ width: "32px", height: "32px", border: "3px solid #E2E8F0", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1rem" }} />
                  Loading emails...
                </div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "#94A3B8" }}>
                  <Inbox size={48} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.4rem" }}>No emails yet</div>
                  <div style={{ fontSize: "0.85rem" }}>Send your first verification email to get started.</div>
                  <button onClick={() => setView("compose")} style={{ marginTop: "1rem", background: "#3B82F6", color: "#fff", border: "none", borderRadius: "8px", padding: "0.5rem 1.2rem", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>
                    <Send size={14} style={{ marginRight: "0.35rem", verticalAlign: "middle" }} />Compose Email
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ padding: "0.6rem 1.25rem", fontSize: "0.78rem", color: "#64748B", borderBottom: "1px solid #F1F5F9", fontWeight: 600 }}>
                    {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}{totalUnread > 0 ? ` • ${totalUnread} unread` : ""}
                  </div>
                  {conversations.map((conv) => {
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    const otherParticipants = conv.participants.filter(p => p.email.toLowerCase() !== "indiaops@cluso.in");
                    return (
                      <div key={conv.conversationId}
                        onClick={() => { setSelectedConversation(conv); setView("conversation"); setReplyBody(""); }}
                        style={{ padding: "0.85rem 1.25rem", borderBottom: "1px solid #F1F5F9", cursor: "pointer", display: "flex", gap: "0.85rem", alignItems: "flex-start", transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: conv.unreadCount > 0 ? "#3B82F6" : "#CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontWeight: 700, fontSize: "0.8rem" }}>
                          {(otherParticipants[0]?.name || otherParticipants[0]?.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontWeight: conv.unreadCount > 0 ? 700 : 500, color: "#1E293B", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {otherParticipants.map(p => p.name || p.email).join(", ") || "Unknown"}
                            </span>
                            <span style={{ fontSize: "0.72rem", color: "#94A3B8", flexShrink: 0 }}>{formatDate(conv.lastMessageAt)}</span>
                          </div>
                          <div style={{ fontSize: "0.82rem", fontWeight: conv.unreadCount > 0 ? 600 : 400, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.subject || "(No subject)"}</div>
                          <div style={{ fontSize: "0.78rem", color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "0.15rem" }}>
                            {stripHtml(lastMsg?.body || "").slice(0, 120)}
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", alignItems: "center" }}>
                            <span style={{ fontSize: "0.7rem", color: "#64748B" }}><MessageSquare size={11} style={{ verticalAlign: "middle", marginRight: "3px" }} />{conv.messages.length}</span>
                            {conv.unreadCount > 0 && <span style={{ fontSize: "0.68rem", background: "#3B82F6", color: "#fff", borderRadius: "10px", padding: "0.1rem 0.45rem", fontWeight: 700 }}>{conv.unreadCount} new</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* COMPOSE VIEW */}
          {view === "compose" && (
            <div style={{ padding: "1.25rem", display: "grid", gap: "0.85rem" }}>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>To</label>
                <input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="Enter recipient email address" style={{ padding: "0.5rem 0.75rem", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "0.88rem", outline: "none", transition: "border 0.15s" }} onFocus={e => (e.target.style.borderColor = "#3B82F6")} onBlur={e => (e.target.style.borderColor = "#CBD5E1")} />
              </div>

              {/* Template Selector */}
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>Email Template</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #CBD5E1",
                    borderRadius: "8px",
                    fontSize: "0.88rem",
                    outline: "none",
                    background: "#fff",
                    cursor: "pointer",
                    transition: "border 0.15s"
                  }}
                  onFocus={e => (e.target.style.borderColor = "#3B82F6")}
                  onBlur={e => (e.target.style.borderColor = "#CBD5E1")}
                >
                  <option value="custom">Standard / Custom Verification</option>
                  <option value="tenure">
                    {isEducation 
                      ? "Template 1: Academic History & Degree Verification" 
                      : "Template 1: Employment History & Tenure Verification"}
                  </option>
                  <option value="conduct">
                    {isEducation 
                      ? "Template 2: Student Conduct & Character Reference" 
                      : "Template 2: Behavioral & Professional Conduct Reference"}
                  </option>
                  <option value="compliance">
                    {isEducation 
                      ? "Template 3: Attendance, Integrity & Campus Compliance Audit" 
                      : "Template 3: Attendance, Integrity & Compliance Audit"}
                  </option>
                </select>
              </div>

              {/* Dynamic Template Required Fields */}
              {selectedTemplate !== "custom" && (
                <div style={{
                  padding: "0.85rem",
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "10px",
                  display: "grid",
                  gap: "0.75rem",
                  gridTemplateColumns: "1fr 1fr"
                }}>
                  <div style={{ gridColumn: "span 2", fontSize: "0.78rem", fontWeight: 700, color: "#1E293B", borderBottom: "1px solid #E2E8F0", paddingBottom: "0.3rem", display: "flex", gap: "0.3rem", alignItems: "center" }}>
                    <span>📝</span> Template Variables
                  </div>
                  
                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#475569" }}>Respondent Name</label>
                    <input
                      value={templateRespondentName}
                      onChange={e => setTemplateRespondentName(e.target.value)}
                      placeholder={isEducation ? "e.g. Dr. Rakesh Verma" : "e.g. Rakesh Verma"}
                      style={{ padding: "0.4rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.82rem", outline: "none" }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#475569" }}>
                      {isEducation ? "Respondent Title / Relation" : "Respondent Designation"}
                    </label>
                    <input
                      value={templateRespondentDesignation}
                      onChange={e => setTemplateRespondentDesignation(e.target.value)}
                      placeholder={isEducation ? "e.g. Professor / Registrar / Head of Dept." : "e.g. HR Manager / Supervisor"}
                      style={{ padding: "0.4rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.82rem", outline: "none" }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#475569" }}>
                      {isEducation ? "Degree / Course / Qualification" : "Candidate Designation"}
                    </label>
                    <input
                      value={templateCandidateDesignation}
                      onChange={e => setTemplateCandidateDesignation(e.target.value)}
                      placeholder={isEducation ? "e.g. B.Tech Computer Science" : "e.g. Senior Software Engineer"}
                      style={{ padding: "0.4rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.82rem", outline: "none" }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#475569" }}>
                      {isEducation ? "School / College / University" : "Organization / Company"}
                    </label>
                    <input
                      value={templateOrganisationName}
                      onChange={e => setTemplateOrganisationName(e.target.value)}
                      placeholder={isEducation ? "e.g. Delhi University" : "e.g. TechCorp Solutions"}
                      style={{ padding: "0.4rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.82rem", outline: "none" }}
                    />
                  </div>

                  {selectedTemplate === "tenure" && (
                    <div style={{ display: "grid", gap: "0.25rem", gridColumn: "span 2" }}>
                      <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#475569" }}>
                        {isEducation ? "Study Period" : "Employment Period"}
                      </label>
                      <input
                        value={templateEmploymentPeriod}
                        onChange={e => setTemplateEmploymentPeriod(e.target.value)}
                        placeholder={isEducation ? "e.g. 2018 – 2022" : "e.g. June 2021 – March 2024"}
                        style={{ padding: "0.4rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.82rem", outline: "none" }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>Subject</label>
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Email subject" style={{ padding: "0.5rem 0.75rem", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "0.88rem", outline: "none", transition: "border 0.15s" }} onFocus={e => (e.target.style.borderColor = "#3B82F6")} onBlur={e => (e.target.style.borderColor = "#CBD5E1")} />
              </div>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>From</label>
                <div style={{ padding: "0.5rem 0.75rem", background: "#F1F5F9", borderRadius: "8px", fontSize: "0.85rem", color: "#64748B" }}>indiaops@cluso.in</div>
              </div>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>Body</label>
                <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)} placeholder="Type your verification email here..." rows={10} style={{ padding: "0.75rem", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "0.88rem", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6, transition: "border 0.15s" }} onFocus={e => (e.target.style.borderColor = "#3B82F6")} onBlur={e => (e.target.style.borderColor = "#CBD5E1")} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                <button onClick={() => setView("inbox")} style={{ padding: "0.5rem 1rem", border: "1px solid #CBD5E1", borderRadius: "8px", background: "#fff", color: "#475569", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSend} disabled={sending} style={{ padding: "0.5rem 1.2rem", border: "none", borderRadius: "8px", background: sending ? "#93C5FD" : "#3B82F6", color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Send size={14} />{sending ? "Sending..." : "Send Email"}
                </button>
              </div>
            </div>
          )}

          {/* CONVERSATION VIEW */}
          {view === "conversation" && selectedConversation && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ padding: "0.85rem 1.25rem", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                <div style={{ fontWeight: 700, color: "#1E293B", fontSize: "0.95rem" }}>{selectedConversation.subject || "(No subject)"}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748B", marginTop: "0.2rem" }}>
                  {selectedConversation.participants.map(p => p.name || p.email).join(", ")} • {selectedConversation.messages.length} message{selectedConversation.messages.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "1rem 1.25rem", display: "grid", gap: "0.85rem" }}>
                {selectedConversation.messages.map((msg) => (
                  <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.isSent ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "85%", background: msg.isSent ? "#EFF6FF" : "#F8FAFC", border: `1px solid ${msg.isSent ? "#BFDBFE" : "#E2E8F0"}`, borderRadius: msg.isSent ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "0.75rem 1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.4rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: msg.isSent ? "#1E40AF" : "#475569" }}>
                          {msg.isSent ? "You (indiaops@cluso.in)" : (msg.from.name || msg.from.email)}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#94A3B8", flexShrink: 0 }}>{formatDate(msg.receivedAt)}</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#334155", lineHeight: 1.6, wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: msg.body }} />
                    </div>
                  </div>
                ))}
              </div>
              {/* Quick reply */}
              <div style={{ padding: "0.85rem 1.25rem", borderTop: "1px solid #E2E8F0", background: "#FAFBFC" }}>
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end" }}>
                  <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Type a quick reply..." rows={2} style={{ flex: 1, padding: "0.55rem 0.75rem", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "0.85rem", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 }} onFocus={e => (e.target.style.borderColor = "#3B82F6")} onBlur={e => (e.target.style.borderColor = "#CBD5E1")} />
                  <button
                    onClick={() => { const lastMsg = selectedConversation.messages[selectedConversation.messages.length - 1]; if (lastMsg) handleReply(lastMsg.id as string); }}
                    disabled={replying || !replyBody.trim()}
                    style={{ padding: "0.55rem 1rem", border: "none", borderRadius: "8px", background: replying || !replyBody.trim() ? "#93C5FD" : "#3B82F6", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: replying || !replyBody.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}
                  >
                    <Send size={14} />{replying ? "Sending..." : "Reply"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .email-compose-drawer {
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}
