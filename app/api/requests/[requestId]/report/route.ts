import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import VerificationRequest from "@/lib/models/VerificationRequest";
import User from "@/lib/models/User";

type SelectedServiceLike = {
  serviceId: unknown;
  serviceName: string;
  price: number;
  currency: string;
};

type ServiceVerificationLike = {
  serviceId: unknown;
  serviceName: string;
  serviceEntryIndex?: unknown;
  serviceEntryCount?: unknown;
  serviceInstanceKey?: unknown;
  status?: "pending" | "in-progress" | "verified" | "unverified";
  verificationMode?: string;
  comment?: string;
  attempts?: Array<{
    status?: "in-progress" | "verified" | "unverified";
    verificationMode?: string;
    comment?: string;
    attemptedAt?: Date;
    verifierName?: string;
    managerName?: string;
  }>;
};

type CandidateFormResponseLike = {
  serviceId: unknown;
  serviceName: string;
  serviceEntryCount?: unknown;
  answers?: Array<{
    fieldKey?: string;
    question?: string;
    fieldType?: string;
    repeatable?: boolean;
    value?: string;
    fileName?: string;
    fileData?: string;
  }>;
};

type NormalizedServiceVerification = {
  serviceId: string;
  serviceName: string;
  serviceEntryIndex: number;
  serviceEntryCount: number;
  serviceInstanceKey: string;
  status: "pending" | "in-progress" | "verified" | "unverified";
  verificationMode: string;
  comment: string;
  candidateAnswers: Array<{
    question: string;
    value: string;
    fieldType: string;
    fileName: string;
    fileData: string;
  }>;
  attempts: Array<{
    status: "in-progress" | "verified" | "unverified";
    verificationMode: string;
    comment: string;
    attemptedAt: Date;
    verifierName: string;
    managerName: string;
  }>;
};

type ReportAnswer = {
  question: string;
  value: string;
  fieldType: string;
  fileName: string;
  fileData: string;
};

type ReportPayload = {
  reportNumber: string;
  generatedAt: string;
  generatedByName: string;
  candidate: {
    name: string;
    email: string;
    phone: string;
  };
  company: {
    name: string;
    email: string;
  };
  status: string;
  createdAt: string;
  personalDetails: ReportAnswer[];
  services: Array<{
    serviceId: string;
    serviceEntryIndex: number;
    serviceEntryCount: number;
    serviceInstanceKey: string;
    serviceName: string;
    status: string;
    verificationMode: string;
    comment: string;
    candidateAnswers: ReportAnswer[];
    attempts: Array<{
      attemptedAt: string;
      status: string;
      verificationMode: string;
      comment: string;
      verifierName: string;
      managerName: string;
    }>;
  }>;
};

type PersonalDetailAnswer = ReportAnswer;

const PERSONAL_DETAILS_SERVICE_NAME = "personal details";
const PERSONAL_DETAILS_FIELD_KEY_PREFIX = "personal_";
const PERSONAL_DETAILS_QUESTION_SEQUENCE = [
  "Full name (as per government ID)",
  "Date of birth",
  "Mobile number",
  "Current residential address",
  "Primary government ID number",
  "Email address",
  "Nationality",
  "Gender",
] as const;
const PERSONAL_DETAILS_QUESTION_ORDER = new Map(
  PERSONAL_DETAILS_QUESTION_SEQUENCE.map((question, index) => [
    question.trim().toLowerCase(),
    index,
  ]),
);

type InvoiceSnapshot = {
  currency: string;
  subtotal: number;
  items: Array<{
    serviceId: string;
    serviceName: string;
    price: number;
  }>;
  billingEmail: string;
  companyName: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeServiceId(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  const normalizedLower = normalized.toLowerCase();
  if (
    normalizedLower === "undefined" ||
    normalizedLower === "null" ||
    normalizedLower === "nan"
  ) {
    return "";
  }

  return normalized;
}

function normalizePositiveInteger(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function buildServiceInstanceKey(serviceId: string, serviceEntryIndex: number) {
  return `${serviceId}::${normalizePositiveInteger(serviceEntryIndex)}`;
}

function parseServiceInstanceKey(rawValue: unknown, serviceId: string) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const prefix = `${serviceId}::`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }

  const indexPart = Number(trimmed.slice(prefix.length));
  if (!Number.isFinite(indexPart) || indexPart <= 0) {
    return null;
  }

  return Math.floor(indexPart);
}

function toServiceDisplayName(
  serviceName: string,
  serviceEntryIndex: number,
  serviceEntryCount: number,
) {
  const trimmedName = serviceName.trim() || "Service";
  if (serviceEntryCount <= 1) {
    return trimmedName;
  }

  const suffix = ` ${serviceEntryIndex}`;
  if (trimmedName.endsWith(suffix)) {
    return trimmedName;
  }

  return `${trimmedName}${suffix}`;
}

function normalizeQuestionKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePersonalDetailAnswer(
  answer: Partial<PersonalDetailAnswer>,
): PersonalDetailAnswer {
  return {
    question: (answer.question ?? "").trim() || "Field",
    value: (answer.value ?? "").trim() || "-",
    fieldType: (answer.fieldType ?? "").trim() || "text",
    fileName: (answer.fileName ?? "").trim(),
    fileData: (answer.fileData ?? "").trim(),
  };
}

function isPersonalDetailsServiceName(serviceName: string) {
  return normalizeQuestionKey(serviceName) === PERSONAL_DETAILS_SERVICE_NAME;
}

function isLikelyPersonalDetailsQuestion(question: string) {
  const normalizedQuestion = normalizeQuestionKey(question);
  return PERSONAL_DETAILS_QUESTION_ORDER.has(normalizedQuestion);
}

function isPersonalDetailsAnswerEntry(
  answer: Partial<PersonalDetailAnswer> & { fieldKey?: string },
) {
  const fieldKey = (answer.fieldKey ?? "").trim().toLowerCase();
  if (fieldKey.startsWith(PERSONAL_DETAILS_FIELD_KEY_PREFIX)) {
    return true;
  }

  return isLikelyPersonalDetailsQuestion(answer.question ?? "");
}

function sortPersonalDetailsAnswers(answers: PersonalDetailAnswer[]) {
  return answers
    .slice()
    .sort((first, second) => {
      const firstKey = normalizeQuestionKey(first.question);
      const secondKey = normalizeQuestionKey(second.question);
      const firstRank = PERSONAL_DETAILS_QUESTION_ORDER.get(firstKey) ?? Number.MAX_SAFE_INTEGER;
      const secondRank = PERSONAL_DETAILS_QUESTION_ORDER.get(secondKey) ?? Number.MAX_SAFE_INTEGER;
      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return firstKey.localeCompare(secondKey);
    });
}

function dedupePersonalDetailsAnswers(answers: PersonalDetailAnswer[]) {
  const dedupedByQuestion = new Map<string, PersonalDetailAnswer>();

  for (const answer of answers) {
    const normalized = normalizePersonalDetailAnswer(answer);
    const questionKey = normalizeQuestionKey(normalized.question);
    if (!questionKey) {
      continue;
    }

    const existing = dedupedByQuestion.get(questionKey);
    if (!existing) {
      dedupedByQuestion.set(questionKey, normalized);
      continue;
    }

    if ((existing.value === "-" || !existing.value.trim()) && normalized.value !== "-") {
      dedupedByQuestion.set(questionKey, normalized);
    }
  }

  return sortPersonalDetailsAnswers(Array.from(dedupedByQuestion.values()));
}

function splitReportServicesAndPersonalDetails<
  TService extends { serviceName: string; candidateAnswers: PersonalDetailAnswer[] },
>(services: TService[]) {
  const filteredServices: TService[] = [];
  const personalDetails: PersonalDetailAnswer[] = [];

  for (const service of services) {
    const serviceName = service.serviceName ?? "";
    const serviceAnswers = Array.isArray(service.candidateAnswers)
      ? service.candidateAnswers.map((answer) => normalizePersonalDetailAnswer(answer))
      : [];
    const looksLikePersonalDetails =
      serviceAnswers.length > 0 && serviceAnswers.every((answer) => isPersonalDetailsAnswerEntry(answer));

    if (isPersonalDetailsServiceName(serviceName) || looksLikePersonalDetails) {
      personalDetails.push(...serviceAnswers);
      continue;
    }

    filteredServices.push(service);
  }

  return {
    services: filteredServices,
    personalDetails: dedupePersonalDetailsAnswers(personalDetails),
  };
}

function parseRepeatableAnswerValues(rawValue: string, repeatable?: boolean) {
  if (!repeatable) {
    return [] as string[];
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue.startsWith("[")) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(trimmedValue);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  } catch {
    return [] as string[];
  }
}

function resolveAnswerValueForEntry(
  answer: NonNullable<CandidateFormResponseLike["answers"]>[number],
  entryIndex: number,
) {
  const rawValue = asString(answer.value, "");
  const repeatableValues = parseRepeatableAnswerValues(rawValue, Boolean(answer.repeatable));
  if (repeatableValues.length === 0) {
    return rawValue;
  }

  return repeatableValues[entryIndex] ?? "";
}

function asDate(value: unknown) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseStoredReportData(value: unknown): ReportPayload | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const candidate = asRecord(root.candidate);
  const company = asRecord(root.company);

  const personalDetailsRaw = Array.isArray(root.personalDetails)
    ? root.personalDetails
    : [];
  const personalDetailsFromPayload = personalDetailsRaw
    .map((answerValue) => {
      const answer = asRecord(answerValue);
      if (!answer) {
        return null;
      }

      return normalizePersonalDetailAnswer({
        question: asString(answer.question),
        value: asString(answer.value),
        fieldType: asString(answer.fieldType, "text"),
        fileName: asString(answer.fileName),
        fileData: asString(answer.fileData),
      });
    })
    .filter((answer): answer is PersonalDetailAnswer => Boolean(answer));

  const servicesRaw = Array.isArray(root.services) ? root.services : [];
  const services = servicesRaw
    .map((serviceValue) => {
      const service = asRecord(serviceValue);
      if (!service) {
        return null;
      }

      const serviceId = asString(service.serviceId);
      const serviceEntryIndex = normalizePositiveInteger(service.serviceEntryIndex, 1);
      const serviceEntryCount = Math.max(
        1,
        normalizePositiveInteger(service.serviceEntryCount, 1),
        serviceEntryIndex,
      );
      const serviceInstanceKey =
        asString(service.serviceInstanceKey) ||
        (serviceId ? buildServiceInstanceKey(serviceId, serviceEntryIndex) : "");

      const candidateAnswersRaw = Array.isArray(service.candidateAnswers)
        ? service.candidateAnswers
        : [];
      const candidateAnswers = candidateAnswersRaw
        .map((answerValue) => {
          const answer = asRecord(answerValue);
          if (!answer) {
            return null;
          }

          return {
            question: asString(answer.question),
            value: asString(answer.value),
            fieldType: asString(answer.fieldType, "text"),
            fileName: asString(answer.fileName),
            fileData: asString(answer.fileData),
          };
        })
        .filter(
          (
            answer,
          ): answer is {
            question: string;
            value: string;
            fieldType: string;
            fileName: string;
            fileData: string;
          } => Boolean(answer),
        );

      const attemptsRaw = Array.isArray(service.attempts) ? service.attempts : [];
      const attempts = attemptsRaw
        .map((attemptValue) => {
          const attempt = asRecord(attemptValue);
          if (!attempt) {
            return null;
          }

          return {
            attemptedAt: asString(attempt.attemptedAt),
            status: asString(attempt.status),
            verificationMode: asString(attempt.verificationMode),
            comment: asString(attempt.comment),
            verifierName: asString(attempt.verifierName),
            managerName: asString(attempt.managerName),
          };
        })
        .filter(
          (
            attempt,
          ): attempt is {
            attemptedAt: string;
            status: string;
            verificationMode: string;
            comment: string;
            verifierName: string;
            managerName: string;
          } => Boolean(attempt),
        );

      return {
        serviceId,
        serviceEntryIndex,
        serviceEntryCount,
        serviceInstanceKey,
        serviceName: asString(service.serviceName),
        status: asString(service.status),
        verificationMode: asString(service.verificationMode),
        comment: asString(service.comment),
        candidateAnswers,
        attempts,
      };
    })
    .filter(
      (
        service,
      ): service is {
        serviceId: string;
        serviceEntryIndex: number;
        serviceEntryCount: number;
        serviceInstanceKey: string;
        serviceName: string;
        status: string;
        verificationMode: string;
        comment: string;
        candidateAnswers: Array<{
          question: string;
          value: string;
          fieldType: string;
          fileName: string;
          fileData: string;
        }>;
        attempts: Array<{
          attemptedAt: string;
          status: string;
          verificationMode: string;
          comment: string;
          verifierName: string;
          managerName: string;
        }>;
      } => Boolean(service),
    );

  const splitSections = splitReportServicesAndPersonalDetails(services);
  const personalDetails =
    personalDetailsFromPayload.length > 0
      ? dedupePersonalDetailsAnswers(personalDetailsFromPayload)
      : splitSections.personalDetails;

  return {
    reportNumber: asString(root.reportNumber),
    generatedAt: asString(root.generatedAt),
    generatedByName: asString(root.generatedByName),
    candidate: {
      name: asString(candidate?.name),
      email: asString(candidate?.email),
      phone: asString(candidate?.phone),
    },
    company: {
      name: asString(company?.name),
      email: asString(company?.email),
    },
    status: asString(root.status),
    createdAt: asString(root.createdAt),
    personalDetails,
    services: splitSections.services,
  };
}

function normalizeReportDataForGeneration(
  storedValue: unknown,
  fallback: ReportPayload,
): ReportPayload {
  const parsed = parseStoredReportData(storedValue);
  if (!parsed) {
    return fallback;
  }

  const nowIso = new Date().toISOString();
  const fallbackServices = fallback.services;
  const fallbackPersonalDetails = fallback.personalDetails;
  const parsedPersonalDetails = parsed.personalDetails;
  const resolvedPersonalDetails =
    fallbackPersonalDetails.length > 0 ? fallbackPersonalDetails : parsedPersonalDetails;

  return {
    reportNumber: parsed.reportNumber.trim() || fallback.reportNumber,
    generatedAt: parsed.generatedAt.trim() || fallback.generatedAt || nowIso,
    generatedByName: parsed.generatedByName.trim() || fallback.generatedByName,
    candidate: {
      name: parsed.candidate.name.trim() || fallback.candidate.name,
      email: parsed.candidate.email.trim() || fallback.candidate.email,
      phone: parsed.candidate.phone.trim() || fallback.candidate.phone,
    },
    company: {
      name: parsed.company.name.trim() || fallback.company.name,
      email: parsed.company.email.trim() || fallback.company.email,
    },
    status: parsed.status.trim() || fallback.status,
    createdAt: parsed.createdAt.trim() || fallback.createdAt || nowIso,
    personalDetails: resolvedPersonalDetails,
    // Always use latest verification snapshot when regenerating report.
    services: fallbackServices,
  };
}

function formatDateTime(value: string | Date) {
  const parsed = asDate(value);
  if (!parsed) {
    return "-";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDateOnly(value: string | Date) {
  const parsed = asDate(value);
  if (!parsed) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function toDisplayStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "-";
  }

  if (normalized === "in-progress") {
    return "In Progress";
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function toDisplayAttemptStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "verified") {
    return "Verified";
  }

  if (normalized === "unverified") {
    return "Unverified";
  }

  return "In Progress";
}

function toDisplayMode(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "Manual";
  }

  if (normalized === normalized.toLowerCase()) {
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  return normalized;
}

function sanitizePdfText(value: string) {
  return value
    .replace(/₹/g, "INR ")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "");
}

function normalizeServiceVerifications(
  selectedServices: SelectedServiceLike[] = [],
  existingVerifications: ServiceVerificationLike[] = [],
  candidateFormResponses: CandidateFormResponseLike[] = [],
) {
  type CandidateAnswer = {
    question: string;
    value: string;
    fieldType: string;
    fileName: string;
    fileData: string;
  };

  type ExistingNormalizedServiceVerification = Omit<
    NormalizedServiceVerification,
    "serviceName" | "serviceEntryCount" | "candidateAnswers"
  > & {
    baseServiceName: string;
  };

  const serviceNameById = new Map<string, string>();
  const selectedCountByServiceId = new Map<string, number>();
  const responseCountByServiceId = new Map<string, number>();
  const existingCountByServiceId = new Map<string, number>();
  const existingMaxIndexByServiceId = new Map<string, number>();
  const existingByInstanceKey = new Map<string, ExistingNormalizedServiceVerification>();
  const existingEncounterOrder: string[] = [];
  const seenExistingServiceIds = new Set<string>();
  const fallbackEntryCounterByServiceId = new Map<string, number>();
  const existingServiceIds = new Set(
    existingVerifications
      .map((verification) => normalizeServiceId(verification.serviceId))
      .filter((serviceId) => Boolean(serviceId)),
  );
  const candidateAnswersByInstanceKey = new Map<string, CandidateAnswer[]>();

  for (const service of selectedServices) {
    const serviceId = normalizeServiceId(service.serviceId);
    if (!serviceId) {
      continue;
    }

    const serviceName = (service.serviceName ?? "").trim() || "Service";
    if (!serviceNameById.has(serviceId)) {
      serviceNameById.set(serviceId, serviceName);
    }

    selectedCountByServiceId.set(
      serviceId,
      (selectedCountByServiceId.get(serviceId) ?? 0) + 1,
    );
  }

  const hasSelectedServices = selectedCountByServiceId.size > 0;

  for (const serviceResponse of candidateFormResponses) {
    const serviceId = normalizeServiceId(serviceResponse.serviceId);
    if (!serviceId) {
      continue;
    }

    if (hasSelectedServices && !selectedCountByServiceId.has(serviceId)) {
      continue;
    }

    if (!hasSelectedServices && existingServiceIds.size > 0 && !existingServiceIds.has(serviceId)) {
      continue;
    }

    const serviceName = (serviceResponse.serviceName ?? "").trim() || "Service";
    if (!serviceNameById.has(serviceId)) {
      serviceNameById.set(serviceId, serviceName);
    }

    const maxRepeatableCount = (serviceResponse.answers ?? []).reduce(
      (maxCount, answer) => {
        const repeatableValues = parseRepeatableAnswerValues(
          asString(answer.value),
          Boolean(answer.repeatable),
        );
        return Math.max(maxCount, repeatableValues.length || 1);
      },
      1,
    );
    const serviceEntryCount = Math.max(
      normalizePositiveInteger(serviceResponse.serviceEntryCount, 1),
      maxRepeatableCount,
      1,
    );

    responseCountByServiceId.set(
      serviceId,
      Math.max(responseCountByServiceId.get(serviceId) ?? 1, serviceEntryCount),
    );

    for (let serviceEntryIndex = 1; serviceEntryIndex <= serviceEntryCount; serviceEntryIndex += 1) {
      const serviceInstanceKey = buildServiceInstanceKey(serviceId, serviceEntryIndex);
      const candidateAnswers: CandidateAnswer[] = (serviceResponse.answers ?? []).map((answer) => {
        const fieldType = asString(answer.fieldType, "text");
        const fileName = asString(answer.fileName);
        const fileData = asString(answer.fileData);
        const answerValue =
          fieldType === "file" && fileData
            ? fileName || "Attachment"
            : resolveAnswerValueForEntry(answer, serviceEntryIndex - 1).trim() || "-";

        return {
          question: asString(answer.question, "Field"),
          value: answerValue,
          fieldType,
          fileName,
          fileData,
        };
      });

      candidateAnswersByInstanceKey.set(serviceInstanceKey, candidateAnswers);
    }
  }

  for (const verification of existingVerifications) {
    const serviceId = normalizeServiceId(verification.serviceId);
    if (!serviceId) {
      continue;
    }

    if (hasSelectedServices && !selectedCountByServiceId.has(serviceId)) {
      continue;
    }

    const fallbackServiceName = serviceNameById.get(serviceId) ?? "Service";
    const baseServiceName =
      (verification.serviceName ?? "").trim() || fallbackServiceName;
    if (!serviceNameById.has(serviceId)) {
      serviceNameById.set(serviceId, baseServiceName);
    }

    const explicitEntryIndex =
      typeof verification.serviceEntryIndex === "number" &&
      Number.isFinite(verification.serviceEntryIndex) &&
      verification.serviceEntryIndex > 0
        ? normalizePositiveInteger(verification.serviceEntryIndex, 1)
        : null;
    const parsedEntryIndexFromKey = parseServiceInstanceKey(
      verification.serviceInstanceKey,
      serviceId,
    );
    const fallbackEntryIndex =
      (fallbackEntryCounterByServiceId.get(serviceId) ?? 0) + 1;
    fallbackEntryCounterByServiceId.set(serviceId, fallbackEntryIndex);

    const serviceEntryIndex =
      parsedEntryIndexFromKey ?? explicitEntryIndex ?? fallbackEntryIndex;
    const serviceInstanceKey = buildServiceInstanceKey(serviceId, serviceEntryIndex);

    const normalized: ExistingNormalizedServiceVerification = {
      serviceId,
      baseServiceName,
      serviceEntryIndex,
      serviceInstanceKey,
      status: verification.status ?? "pending",
      verificationMode: verification.verificationMode ?? "",
      comment: verification.comment ?? "",
      attempts: (verification.attempts ?? []).map((attempt) => ({
        status: attempt.status ?? "in-progress",
        verificationMode: attempt.verificationMode ?? "",
        comment: attempt.comment ?? "",
        attemptedAt: attempt.attemptedAt ? new Date(attempt.attemptedAt) : new Date(),
        verifierName: attempt.verifierName ?? "",
        managerName: attempt.managerName ?? "",
      })),
    };

    const existingForInstance = existingByInstanceKey.get(serviceInstanceKey);
    if (existingForInstance) {
      existingForInstance.status = normalized.status;
      existingForInstance.verificationMode = normalized.verificationMode;
      existingForInstance.comment = normalized.comment;
      existingForInstance.attempts.push(...normalized.attempts);
    } else {
      existingByInstanceKey.set(serviceInstanceKey, normalized);
    }

    existingCountByServiceId.set(
      serviceId,
      (existingCountByServiceId.get(serviceId) ?? 0) + 1,
    );
    existingMaxIndexByServiceId.set(
      serviceId,
      Math.max(existingMaxIndexByServiceId.get(serviceId) ?? 0, serviceEntryIndex),
    );

    if (!seenExistingServiceIds.has(serviceId)) {
      seenExistingServiceIds.add(serviceId);
      existingEncounterOrder.push(serviceId);
    }
  }

  const orderedServiceIds: string[] = [];
  const seenServiceIds = new Set<string>();

  for (const service of selectedServices) {
    const serviceId = normalizeServiceId(service.serviceId);
    if (!serviceId || seenServiceIds.has(serviceId)) {
      continue;
    }

    seenServiceIds.add(serviceId);
    orderedServiceIds.push(serviceId);
  }

  for (const serviceResponse of candidateFormResponses) {
    const serviceId = normalizeServiceId(serviceResponse.serviceId);
    if (!serviceId || seenServiceIds.has(serviceId)) {
      continue;
    }

    if (hasSelectedServices && !selectedCountByServiceId.has(serviceId)) {
      continue;
    }

    if (!hasSelectedServices && existingServiceIds.size > 0 && !existingServiceIds.has(serviceId)) {
      continue;
    }

    seenServiceIds.add(serviceId);
    orderedServiceIds.push(serviceId);
  }

  for (const serviceId of existingEncounterOrder) {
    if (hasSelectedServices && !selectedCountByServiceId.has(serviceId)) {
      continue;
    }

    if (seenServiceIds.has(serviceId)) {
      continue;
    }

    seenServiceIds.add(serviceId);
    orderedServiceIds.push(serviceId);
  }

  for (const serviceId of serviceNameById.keys()) {
    if (hasSelectedServices && !selectedCountByServiceId.has(serviceId)) {
      continue;
    }

    if (seenServiceIds.has(serviceId)) {
      continue;
    }

    seenServiceIds.add(serviceId);
    orderedServiceIds.push(serviceId);
  }

  const normalizedServices: NormalizedServiceVerification[] = [];

  for (const serviceId of orderedServiceIds) {
    const baseServiceName = serviceNameById.get(serviceId) ?? "Service";
    const serviceEntryCount = Math.max(
      1,
      selectedCountByServiceId.get(serviceId) ?? 0,
      responseCountByServiceId.get(serviceId) ?? 0,
      existingCountByServiceId.get(serviceId) ?? 0,
      existingMaxIndexByServiceId.get(serviceId) ?? 0,
    );

    for (
      let serviceEntryIndex = 1;
      serviceEntryIndex <= serviceEntryCount;
      serviceEntryIndex += 1
    ) {
      const serviceInstanceKey = buildServiceInstanceKey(serviceId, serviceEntryIndex);
      const existingForInstance = existingByInstanceKey.get(serviceInstanceKey);
      const candidateAnswers = candidateAnswersByInstanceKey.get(serviceInstanceKey) ?? [];

      if (existingForInstance) {
        normalizedServices.push({
          serviceId,
          serviceName: toServiceDisplayName(
            existingForInstance.baseServiceName,
            serviceEntryIndex,
            serviceEntryCount,
          ),
          serviceEntryIndex,
          serviceEntryCount,
          serviceInstanceKey,
          status: existingForInstance.status,
          verificationMode: existingForInstance.verificationMode,
          comment: existingForInstance.comment,
          candidateAnswers,
          attempts: existingForInstance.attempts,
        });
        continue;
      }

      normalizedServices.push({
        serviceId,
        serviceName: toServiceDisplayName(
          baseServiceName,
          serviceEntryIndex,
          serviceEntryCount,
        ),
        serviceEntryIndex,
        serviceEntryCount,
        serviceInstanceKey,
        status: "pending",
        verificationMode: "",
        comment: "",
        candidateAnswers,
        attempts: [],
      });
    }
  }

  return splitReportServicesAndPersonalDetails(normalizedServices);
}

async function getScopedRequest(auth: {
  userId: string;
  role: "admin" | "superadmin" | "manager" | "verifier";
}, requestId: string) {
  if (auth.role === "verifier") {
    return {
      error: "Only admin or manager roles can generate reports.",
      status: 403,
      item: null,
    };
  }

  if (auth.role === "admin" || auth.role === "superadmin") {
    const item = await VerificationRequest.findById(requestId).lean();
    return { error: "", status: 200, item };
  }

  const manager = await User.findOne({ _id: auth.userId, role: "manager" }).lean();
  if (!manager) {
    return {
      error: "Unauthorized",
      status: 401,
      item: null,
    };
  }

  const managedVerifiers = await User.find({
    role: "verifier",
    manager: manager._id,
  })
    .select("assignedCompanies")
    .lean();

  const scopedCompanies = new Set<string>(
    (manager.assignedCompanies ?? []).map((companyId) => String(companyId)),
  );

  for (const verifier of managedVerifiers) {
    for (const companyId of verifier.assignedCompanies ?? []) {
      scopedCompanies.add(String(companyId));
    }
  }

  const item = await VerificationRequest.findOne({
    _id: requestId,
    customer: { $in: [...scopedCompanies] },
  }).lean();

  return {
    error: "",
    status: 200,
    item,
  };
}

async function buildPdfBuffer(report: ReportPayload) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { readFile } = await import("fs/promises");
  const path = await import("path");

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentLeft = 70;
  const contentRight = pageWidth - 70;
  const contentWidth = contentRight - contentLeft;
  const topStartY = pageHeight - 58;
  const bottomLimitY = 118;

  const palette = {
    titleBlue: rgb(0.14, 0.28, 0.6),
    headingBlue: rgb(0.12, 0.26, 0.55),
    success: rgb(0.08, 0.52, 0.18),
    danger: rgb(0.78, 0.13, 0.1),
    ink: rgb(0.08, 0.08, 0.08),
    muted: rgb(0.42, 0.42, 0.42),
    borderStrong: rgb(0.56, 0.08, 0.15),
    borderSoft: rgb(0.76, 0.72, 0.44),
    lineStrong: rgb(0.1, 0.1, 0.1),
    lineSoft: rgb(0.46, 0.46, 0.46),
  };

  let logoImage: import("pdf-lib").PDFImage | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "images", "cluso-infolink-logo.png");
    const logoBytes = await readFile(logoPath);
    logoImage = await pdfDoc.embedPng(logoBytes);
  } catch {
    logoImage = null;
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = topStartY;

  function drawPageFrame(targetPage: typeof page) {
    targetPage.drawRectangle({
      x: 14,
      y: 14,
      width: pageWidth - 28,
      height: pageHeight - 28,
      borderColor: palette.borderStrong,
      borderWidth: 2,
    });

    targetPage.drawRectangle({
      x: 18,
      y: 18,
      width: pageWidth - 36,
      height: pageHeight - 36,
      borderColor: palette.borderSoft,
      borderWidth: 1,
    });

    const footerText = "Generated Report By ClusoInfolink";
    const footerSize = 11;
    const footerWidth = regularFont.widthOfTextAtSize(footerText, footerSize);

    targetPage.drawText(footerText, {
      x: (pageWidth - footerWidth) / 2,
      y: 38,
      size: footerSize,
      font: regularFont,
      color: palette.muted,
    });
  }

  function addPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    drawPageFrame(page);
    y = topStartY;
  }

  drawPageFrame(page);

  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight >= bottomLimitY) {
      return false;
    }

    addPage();
    return true;
  }

  function wrapText(
    text: string,
    size: number,
    maxWidth: number,
    isBold = false,
    fallback = "",
  ) {
    const font = isBold ? boldFont : regularFont;
    const normalizedText = sanitizePdfText(text).replace(/\s+/g, " ").trim();

    if (!normalizedText) {
      return fallback ? [fallback] : [];
    }

    const words = normalizedText.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        currentLine = word;
        continue;
      }

      let segment = "";
      for (const char of word) {
        const nextSegment = `${segment}${char}`;
        if (font.widthOfTextAtSize(nextSegment, size) <= maxWidth) {
          segment = nextSegment;
          continue;
        }

        if (segment) {
          lines.push(segment);
        }
        segment = char;
      }
      currentLine = segment;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : fallback ? [fallback] : [];
  }

  function drawHorizontalLine(
    lineY: number,
    x = contentLeft,
    width = contentWidth,
    color = palette.lineSoft,
    thickness = 0.8,
  ) {
    page.drawLine({
      start: { x, y: lineY },
      end: { x: x + width, y: lineY },
      thickness,
      color,
    });
  }

  function drawCenteredText(
    text: string,
    lineY: number,
    size: number,
    isBold = false,
    color = palette.ink,
  ) {
    const safeText = sanitizePdfText(text);
    const font = isBold ? boldFont : regularFont;
    const textWidth = font.widthOfTextAtSize(safeText, size);
    page.drawText(safeText, {
      x: (pageWidth - textWidth) / 2,
      y: lineY,
      size,
      font,
      color,
    });
  }

  function drawWrappedLines(
    lines: string[],
    x: number,
    startY: number,
    size: number,
    color = palette.ink,
    isBold = false,
    lineHeight = size + 2,
  ) {
    const font = isBold ? boldFont : regularFont;
    for (let index = 0; index < lines.length; index += 1) {
      const safeLine = sanitizePdfText(lines[index]);
      page.drawText(safeLine, {
        x,
        y: startY - index * lineHeight,
        size,
        font,
        color,
      });
    }
  }

  function drawLabelValue(
    x: number,
    lineY: number,
    label: string,
    value: string,
    valueColor = palette.ink,
    size = 11,
  ) {
    const safeLabel = sanitizePdfText(label);
    const safeValue = sanitizePdfText(value || "-");

    page.drawText(safeLabel, {
      x,
      y: lineY,
      size,
      font: boldFont,
      color: palette.ink,
    });

    const labelWidth = boldFont.widthOfTextAtSize(safeLabel, size);
    page.drawText(safeValue, {
      x: x + labelWidth + 4,
      y: lineY,
      size,
      font: regularFont,
      color: valueColor,
    });
  }

  function colorForStatus(status: string) {
    const normalized = status.trim().toLowerCase();
    if (normalized === "verified") {
      return palette.success;
    }

    if (normalized === "unverified" || normalized === "rejected") {
      return palette.danger;
    }

    if (normalized === "in-progress" || normalized === "pending") {
      return rgb(0.63, 0.38, 0.03);
    }

    return palette.ink;
  }

  function colorForAttemptStatus(status: string) {
    const normalized = status.trim().toLowerCase();
    if (normalized === "verified") {
      return palette.success;
    }

    if (normalized === "unverified") {
      return palette.danger;
    }

    return rgb(0.63, 0.38, 0.03);
  }

  const logoBoxX = contentLeft;
  const logoBoxWidth = 200;
  const logoBoxHeight = 170;
  const logoBoxY = pageHeight - 245;

  page.drawRectangle({
    x: logoBoxX,
    y: logoBoxY,
    width: logoBoxWidth,
    height: logoBoxHeight,
    borderColor: palette.lineSoft,
    borderWidth: 0.8,
  });

  if (logoImage) {
    const logoFit = logoImage.scaleToFit(logoBoxWidth - 20, logoBoxHeight - 20);
    page.drawImage(logoImage, {
      x: logoBoxX + (logoBoxWidth - logoFit.width) / 2,
      y: logoBoxY + (logoBoxHeight - logoFit.height) / 2,
      width: logoFit.width,
      height: logoFit.height,
    });
  } else {
    const fallbackText = "Cluso-Infolink";
    const fallbackSize = 12;
    const fallbackWidth = regularFont.widthOfTextAtSize(fallbackText, fallbackSize);
    page.drawText(fallbackText, {
      x: logoBoxX + (logoBoxWidth - fallbackWidth) / 2,
      y: logoBoxY + logoBoxHeight / 2 - 6,
      size: fallbackSize,
      font: regularFont,
      color: palette.muted,
    });
  }

  const reportMetaX = contentRight - 170;
  const reportMetaY = pageHeight - 120;
  drawLabelValue(reportMetaX, reportMetaY, "Report #: ", report.reportNumber, palette.muted, 12);
  drawLabelValue(reportMetaX + 47, reportMetaY - 20, "Date: ", formatDateOnly(report.generatedAt), palette.muted, 12);

  drawCenteredText("Verification Report", logoBoxY - 60, 48, true, palette.titleBlue);

  const summaryTopY = logoBoxY - 78;
  const summaryHeight = 74;
  const summaryY = summaryTopY - summaryHeight;

  page.drawRectangle({
    x: contentLeft,
    y: summaryY,
    width: contentWidth,
    height: summaryHeight,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.8,
    color: rgb(0.98, 0.98, 0.98),
    opacity: 1,
  });

  const summaryLeftX = contentLeft + 10;
  const summaryRightX = contentLeft + contentWidth / 2 + 8;
  let summaryTextY = summaryTopY - 20;

  drawLabelValue(summaryLeftX, summaryTextY, "Report Number:", report.reportNumber, palette.ink, 10.8);
  drawLabelValue(summaryRightX, summaryTextY, "Generated At:", formatDateTime(report.generatedAt), palette.ink, 10.8);

  summaryTextY -= 17;
  drawLabelValue(summaryLeftX, summaryTextY, "Request Created:", formatDateTime(report.createdAt), palette.ink, 10.8);
  drawLabelValue(summaryRightX, summaryTextY, "Generated By:", report.generatedByName || "-", palette.ink, 10.8);

  summaryTextY -= 17;
  drawLabelValue(
    summaryLeftX,
    summaryTextY,
    "Overall Status:",
    toDisplayStatus(report.status),
    colorForStatus(report.status),
    10.8,
  );

  y = summaryY - 28;

  const columnGap = 20;
  const detailsColumnWidth = (contentWidth - columnGap) / 2;
  const leftColumnX = contentLeft;
  const rightColumnX = contentLeft + detailsColumnWidth + columnGap;
  const detailsHeadingY = y;

  page.drawText("Candidate Details", {
    x: leftColumnX,
    y: detailsHeadingY,
    size: 12,
    font: boldFont,
    color: palette.headingBlue,
  });
  page.drawText("Company Details", {
    x: rightColumnX,
    y: detailsHeadingY,
    size: 12,
    font: boldFont,
    color: palette.headingBlue,
  });

  const detailsLineHeight = 16;
  const leftDetails = [
    { label: "Name:", value: report.candidate.name || "-" },
    { label: "Email:", value: report.candidate.email || "-" },
    { label: "Phone:", value: report.candidate.phone || "-" },
  ];
  const rightDetails = [
    { label: "Company:", value: report.company.name || "-" },
    { label: "Email:", value: report.company.email || "-" },
  ];

  let leftDetailY = detailsHeadingY - 22;
  for (const entry of leftDetails) {
    drawLabelValue(leftColumnX, leftDetailY, entry.label, entry.value, palette.ink, 11);
    leftDetailY -= detailsLineHeight;
  }

  let rightDetailY = detailsHeadingY - 22;
  for (const entry of rightDetails) {
    drawLabelValue(rightColumnX, rightDetailY, entry.label, entry.value, palette.ink, 11);
    rightDetailY -= detailsLineHeight;
  }

  const detailsBottomY = Math.min(leftDetailY, rightDetailY) - 10;
  drawHorizontalLine(detailsBottomY, contentLeft + 16, contentWidth - 16, palette.lineSoft, 0.9);
  y = detailsBottomY - 22;

  const personalDetails = dedupePersonalDetailsAnswers(
    Array.isArray(report.personalDetails) ? report.personalDetails : [],
  );

  const qaTableColumns = {
    question: { x: contentLeft, width: Math.floor(contentWidth * 0.42) },
    response: {
      x: contentLeft + Math.floor(contentWidth * 0.42),
      width: contentWidth - Math.floor(contentWidth * 0.42),
    },
  };

  function drawQATableHeader(leftLabel: string, rightLabel: string) {
    const headerHeight = 20;
    ensureSpace(headerHeight + 4);

    page.drawRectangle({
      x: contentLeft,
      y: y - headerHeight,
      width: contentWidth,
      height: headerHeight,
      borderColor: palette.lineSoft,
      borderWidth: 0.7,
      color: rgb(0.97, 0.98, 1),
      opacity: 1,
    });
    page.drawLine({
      start: { x: qaTableColumns.response.x, y },
      end: { x: qaTableColumns.response.x, y: y - headerHeight },
      thickness: 0.7,
      color: palette.lineSoft,
    });
    page.drawText(leftLabel, {
      x: qaTableColumns.question.x + 4,
      y: y - 14,
      size: 10.5,
      font: boldFont,
      color: palette.ink,
    });
    page.drawText(rightLabel, {
      x: qaTableColumns.response.x + 4,
      y: y - 14,
      size: 10.5,
      font: boldFont,
      color: palette.ink,
    });
    y -= headerHeight;
  }

  function drawQATableRow(questionText: string, responseText: string, fontSize = 10.2) {
    const questionLines = wrapText(
      questionText || "Field",
      fontSize,
      qaTableColumns.question.width - 8,
      false,
      "-",
    );
    const responseLines = wrapText(
      responseText || "-",
      fontSize,
      qaTableColumns.response.width - 8,
      false,
      "-",
    );
    const lineHeight = 12;
    const rowLineCount = Math.max(questionLines.length, responseLines.length, 1);
    const rowHeight = rowLineCount * lineHeight + 8;

    ensureSpace(rowHeight + 2);
    page.drawRectangle({
      x: contentLeft,
      y: y - rowHeight,
      width: contentWidth,
      height: rowHeight,
      borderColor: palette.lineSoft,
      borderWidth: 0.65,
    });
    page.drawLine({
      start: { x: qaTableColumns.response.x, y },
      end: { x: qaTableColumns.response.x, y: y - rowHeight },
      thickness: 0.65,
      color: palette.lineSoft,
    });
    drawWrappedLines(
      questionLines,
      qaTableColumns.question.x + 4,
      y - 12,
      fontSize,
      palette.ink,
      false,
      lineHeight,
    );
    drawWrappedLines(
      responseLines,
      qaTableColumns.response.x + 4,
      y - 12,
      fontSize,
      palette.ink,
      false,
      lineHeight,
    );
    y -= rowHeight;
  }

  if (personalDetails.length > 0) {
    ensureSpace(58);
    page.drawText("Personal Details", {
      x: contentLeft,
      y,
      size: 14,
      font: boldFont,
      color: palette.headingBlue,
    });
    y -= 18;

    drawQATableHeader("Field", "Response");
    for (const detail of personalDetails) {
      const responseText =
        detail.fieldType === "file" && detail.fileData
          ? detail.fileName || "Attachment"
          : detail.value || "-";
      drawQATableRow(detail.question || "Field", responseText, 10.2);
    }

    y -= 10;
  }

  page.drawText("Service Verification Summary", {
    x: contentLeft,
    y,
    size: 15,
    font: boldFont,
    color: palette.headingBlue,
  });
  y -= 28;

  const tableColumns = {
    dateTime: { x: contentLeft, width: 130 },
    status: { x: contentLeft + 140, width: 66 },
    mode: { x: contentLeft + 214, width: 62 },
    details: { x: contentLeft + 286, width: contentRight - (contentLeft + 286) },
  };

  type AttemptRowLayout = {
    attempt: ReportPayload["services"][number]["attempts"][number];
    dateLines: string[];
    statusLines: string[];
    modeLines: string[];
    detailsLines: string[];
    rowLineHeight: number;
    rowHeight: number;
  };

  const maxServiceBlockHeight = topStartY - bottomLimitY;

  function dedupeAttempts(attempts: ReportPayload["services"][number]["attempts"]) {
    const seen = new Set<string>();

    return attempts.filter((attempt) => {
      const dedupeKey = [
        attempt.attemptedAt,
        attempt.status,
        attempt.verificationMode,
        attempt.comment,
        attempt.verifierName,
        attempt.managerName,
      ]
        .map((value) => sanitizePdfText(String(value ?? "")).trim())
        .join("|");

      if (seen.has(dedupeKey)) {
        return false;
      }

      seen.add(dedupeKey);
      return true;
    });
  }

  function estimateServiceIntroHeight(service: ReportPayload["services"][number]) {
    const candidateAnswers = Array.isArray(service.candidateAnswers)
      ? service.candidateAnswers
      : [];
    const modeLines = wrapText(
      `Mode: ${toDisplayMode(service.verificationMode)}`,
      11.5,
      contentRight - (contentLeft + 170),
      true,
      "-",
    );

    const modeHeight = Math.max(14, modeLines.length * 14);
    const commentHeight = service.comment?.trim()
      ? wrapText(`Comment: ${service.comment.trim()}`, 11, contentWidth, false, "-").length * 13
      : 0;
    const candidateAnswersHeight =
      candidateAnswers.length > 0
        ?
            20 +
            candidateAnswers.reduce((sum, answer) => {
              const responseText =
                answer.fieldType === "file" && answer.fileData
                  ? answer.fileName || "Attachment"
                  : answer.value || "-";
              const questionLines = wrapText(
                answer.question || "Field",
                10.2,
                qaTableColumns.question.width - 8,
                false,
                "-",
              ).length;
              const responseLines = wrapText(
                responseText,
                10.2,
                qaTableColumns.response.width - 8,
                false,
                "-",
              ).length;
              return sum + Math.max(questionLines, responseLines, 1) * 12 + 8;
            }, 0)
        : 0;

    // 22 (heading) + modeHeight + commentHeight + 5 (spacing) + 36 (table header block)
    return 63 + modeHeight + commentHeight + candidateAnswersHeight;
  }

  function buildAttemptRowLayout(
    service: ReportPayload["services"][number],
    attempt: ReportPayload["services"][number]["attempts"][number],
  ): AttemptRowLayout {
    const dateLines = wrapText(
      formatDateTime(attempt.attemptedAt),
      10.8,
      tableColumns.dateTime.width,
      false,
      "-",
    );
    const statusLines = wrapText(
      toDisplayAttemptStatus(attempt.status),
      10.8,
      tableColumns.status.width,
      false,
      "-",
    );
    const modeLines = wrapText(
      toDisplayMode(attempt.verificationMode || service.verificationMode),
      10.8,
      tableColumns.mode.width,
      false,
      "-",
    );

    const detailParts = [
      `Verifier: ${attempt.verifierName || "-"}`,
      `Manager: ${attempt.managerName || "-"}`,
    ];
    if (attempt.comment?.trim()) {
      detailParts.push(`Note: ${attempt.comment.trim()}`);
    }

    const detailsLines = detailParts.flatMap((part) =>
      wrapText(part, 10.8, tableColumns.details.width, false, "-"),
    );

    const rowLineHeight = 12.8;
    const rowLineCount = Math.max(
      dateLines.length,
      statusLines.length,
      modeLines.length,
      detailsLines.length,
    );

    return {
      attempt,
      dateLines,
      statusLines,
      modeLines,
      detailsLines,
      rowLineHeight,
      rowHeight: rowLineCount * rowLineHeight + 5,
    };
  }

  function estimateServiceBlockHeight(
    service: ReportPayload["services"][number],
    attemptRows: AttemptRowLayout[],
  ) {
    const introHeight = estimateServiceIntroHeight(service);
    if (attemptRows.length === 0) {
      return introHeight + 28;
    }

    const rowsHeight = attemptRows.reduce((sum, row) => sum + row.rowHeight + 6, 0);
    return introHeight + rowsHeight + 6;
  }

  function drawServiceTableHeader() {
    ensureSpace(30);
    drawHorizontalLine(y, contentLeft, contentWidth, palette.lineStrong, 0.9);
    const headerY = y - 16;

    page.drawText("Date & Time", {
      x: tableColumns.dateTime.x,
      y: headerY,
      size: 11,
      font: boldFont,
      color: palette.ink,
    });
    page.drawText("Status", {
      x: tableColumns.status.x,
      y: headerY,
      size: 11,
      font: boldFont,
      color: palette.ink,
    });
    page.drawText("Mode", {
      x: tableColumns.mode.x,
      y: headerY,
      size: 11,
      font: boldFont,
      color: palette.ink,
    });
    page.drawText("Attempt Details", {
      x: tableColumns.details.x,
      y: headerY,
      size: 11,
      font: boldFont,
      color: palette.ink,
    });

    y = headerY - 8;
    drawHorizontalLine(y, contentLeft, contentWidth, palette.lineSoft, 0.8);
    y -= 12;
  }

  function drawServiceIntro(
    service: ReportPayload["services"][number],
    serviceIndex: number,
    isContinuation = false,
  ) {
    const candidateAnswers = Array.isArray(service.candidateAnswers)
      ? service.candidateAnswers
      : [];
    ensureSpace(Math.min(estimateServiceIntroHeight(service) + 10, maxServiceBlockHeight));

    const heading = `${serviceIndex + 1}. ${service.serviceName}${isContinuation ? " (Continued)" : ""}`;
    page.drawText(sanitizePdfText(heading), {
      x: contentLeft,
      y,
      size: 13.5,
      font: boldFont,
      color: palette.ink,
    });
    y -= 22;

    const finalStatus = toDisplayStatus(service.status);
    const finalMode = toDisplayMode(service.verificationMode);
    const modeLines = wrapText(`Mode: ${finalMode}`, 11.5, contentRight - (contentLeft + 170), true, "-");

    drawLabelValue(
      contentLeft,
      y,
      "Final Status:",
      finalStatus,
      colorForStatus(service.status),
      11.5,
    );

    drawWrappedLines(modeLines, contentLeft + 170, y, 11.5, palette.ink, true, 14);
    y -= Math.max(14, modeLines.length * 14);

    if (service.comment?.trim()) {
      const commentLines = wrapText(
        `Comment: ${service.comment.trim()}`,
        11,
        contentWidth,
        false,
        "-",
      );
      drawWrappedLines(commentLines, contentLeft, y, 11, palette.ink, false, 13);
      y -= commentLines.length * 13;
    }

    if (candidateAnswers.length > 0) {
      y -= 2;
      drawQATableHeader("Candidate Answers", "Response");
      for (const answer of candidateAnswers) {
        const responseText =
          answer.fieldType === "file" && answer.fileData
            ? answer.fileName || "Attachment"
            : answer.value || "-";
        drawQATableRow(answer.question || "Field", responseText, 10.2);
      }
    }

    y -= 5;
    drawServiceTableHeader();
  }

  report.services.forEach((service, serviceIndex) => {
    const attempts = dedupeAttempts(service.attempts).slice().reverse();
    const attemptRows = attempts.map((attempt) => buildAttemptRowLayout(service, attempt));
    const serviceBlockHeight = estimateServiceBlockHeight(service, attemptRows);
    const keepServiceTogether = serviceBlockHeight <= maxServiceBlockHeight;

    if (keepServiceTogether && y - serviceBlockHeight < bottomLimitY) {
      addPage();
    }

    drawServiceIntro(service, serviceIndex, false);

    if (attemptRows.length === 0) {
      if (!keepServiceTogether && ensureSpace(26)) {
        drawServiceIntro(service, serviceIndex, true);
      }

      page.drawText("No verification attempts were logged for this service.", {
        x: contentLeft,
        y,
        size: 10.5,
        font: regularFont,
        color: palette.muted,
      });
      y -= 18;
      drawHorizontalLine(y + 4, contentLeft, contentWidth, palette.lineSoft, 0.8);
      y -= 10;
      return;
    }

    for (const attemptRow of attemptRows) {
      if (!keepServiceTogether && ensureSpace(attemptRow.rowHeight + 8)) {
        drawServiceIntro(service, serviceIndex, true);
      }

      const rowTop = y;
      drawWrappedLines(
        attemptRow.dateLines,
        tableColumns.dateTime.x,
        rowTop,
        10.8,
        palette.ink,
        false,
        attemptRow.rowLineHeight,
      );
      drawWrappedLines(
        attemptRow.statusLines,
        tableColumns.status.x,
        rowTop,
        10.8,
        colorForAttemptStatus(attemptRow.attempt.status),
        false,
        attemptRow.rowLineHeight,
      );
      drawWrappedLines(
        attemptRow.modeLines,
        tableColumns.mode.x,
        rowTop,
        10.8,
        palette.ink,
        false,
        attemptRow.rowLineHeight,
      );
      drawWrappedLines(
        attemptRow.detailsLines,
        tableColumns.details.x,
        rowTop,
        10.8,
        palette.ink,
        false,
        attemptRow.rowLineHeight,
      );

      y -= attemptRow.rowHeight;
      drawHorizontalLine(y + 2, contentLeft, contentWidth, rgb(0.35, 0.35, 0.35), 0.65);
      y -= 6;
    }

    y -= 6;
  });

  const latestAttempt = report.services
    .flatMap((service) => service.attempts)
    .sort((first, second) => {
      const firstTime = asDate(first.attemptedAt)?.getTime() ?? 0;
      const secondTime = asDate(second.attemptedAt)?.getTime() ?? 0;
      return secondTime - firstTime;
    })[0];

  const verifiedByName =
    latestAttempt?.managerName?.trim() ||
    latestAttempt?.verifierName?.trim() ||
    report.generatedByName ||
    "-";

  ensureSpace(58);
  const signatureTopY = y;
  page.drawText("Created By:", {
    x: contentLeft,
    y: signatureTopY,
    size: 12,
    font: boldFont,
    color: palette.ink,
  });
  page.drawText(sanitizePdfText(report.generatedByName || "-"), {
    x: contentLeft,
    y: signatureTopY - 18,
    size: 12,
    font: regularFont,
    color: palette.ink,
  });

  const verifiedLabel = "Verified By:";
  const verifiedLabelWidth = boldFont.widthOfTextAtSize(verifiedLabel, 12);
  const safeVerifiedName = sanitizePdfText(verifiedByName);
  const verifiedNameWidth = regularFont.widthOfTextAtSize(safeVerifiedName, 12);

  page.drawText(verifiedLabel, {
    x: contentRight - verifiedLabelWidth,
    y: signatureTopY,
    size: 12,
    font: boldFont,
    color: palette.ink,
  });
  page.drawText(safeVerifiedName, {
    x: contentRight - verifiedNameWidth,
    y: signatureTopY - 18,
    size: 12,
    font: regularFont,
    color: palette.ink,
  });

  y = signatureTopY - 52;

  const noticeHeading = "--END OF REPORT--";
  const noticeSubheading = "IMPORTANT NOTICE";
  const noticeParagraphs = [
    "The Cluso Report is provided by CLUSO INFOLINK, LLC. CLUSO INFOLINK, LLC does not warrant the completeness or correctness of this report or any of the information contained herein. CLUSO INFOLINK, LLC is not liable for any loss, damage or injury caused by negligence or other act or failure of CLUSO INFOLINK, LLC in procuring, collecting or communicating any such information. Reliance on any information contained herein shall be solely at the users risk and shall not constitute a waiver of any claim against, and a release of, CLUSO INFOLINK, LLC.",
    "This report is furnished in strict confidence for your exclusive use of legitimate business purposes and for no other purpose, and shall not be reproduced in whole or in part in any manner whatsoever. CLUSO INFOLINK is a private investigation company licensed by the Texas Private Security Bureau (TX License Number A16821). Contact the Texas PSB for regulatory information or complaints: TX Private Security, MSC 0241, PO Box 4087, Austin TX 78773-0001 Tel: 512-424-7298 Fax: 512-424-7728.",
  ];
  const questionHeading = "QUESTIONS?";
  const questionSupportText =
    "If you have any questions about this report, please feel free to contact us:";
  const questionContactText =
    "Toll Free: 866-685-5177     Tel: 817-945-2289     Fax: 817-945-2297     Email: support@cluso.in";
  const revisionText = "Rev 3.2 (15322)";

  const noticeBoxPadding = 14;
  const noticeInnerWidth = contentWidth - noticeBoxPadding * 2;
  const noticeBodySize = 8.7;
  const noticeBodyLineHeight = 10.2;

  const paragraphLines = noticeParagraphs.map((paragraph) =>
    wrapText(paragraph, noticeBodySize, noticeInnerWidth, false, "-"),
  );
  const questionSupportLines = wrapText(
    questionSupportText,
    noticeBodySize,
    noticeInnerWidth,
    false,
    "-",
  );
  const questionContactLines = wrapText(
    questionContactText,
    noticeBodySize,
    noticeInnerWidth,
    false,
    "-",
  );

  const noticeHeight =
    noticeBoxPadding +
    11 +
    14 +
    paragraphLines.reduce(
      (sum, lines) => sum + lines.length * noticeBodyLineHeight + 7,
      0,
    ) +
    6 +
    11 +
    questionSupportLines.length * noticeBodyLineHeight +
    5 +
    questionContactLines.length * noticeBodyLineHeight +
    14 +
    noticeBoxPadding;

  ensureSpace(noticeHeight + 12);

  const noticeTopY = y;
  const noticeBoxY = noticeTopY - noticeHeight;
  page.drawRectangle({
    x: contentLeft + 2,
    y: noticeBoxY,
    width: contentWidth - 4,
    height: noticeHeight,
    borderColor: palette.lineSoft,
    borderWidth: 0.9,
  });

  let noticeCursorY = noticeTopY - noticeBoxPadding - 2;
  page.drawText(noticeHeading, {
    x: contentLeft + noticeBoxPadding,
    y: noticeCursorY,
    size: 11,
    font: boldFont,
    color: palette.ink,
  });
  noticeCursorY -= 14;

  page.drawText(noticeSubheading, {
    x: contentLeft + noticeBoxPadding,
    y: noticeCursorY,
    size: 10.4,
    font: boldFont,
    color: palette.ink,
  });
  noticeCursorY -= 12;

  for (const lines of paragraphLines) {
    drawWrappedLines(
      lines,
      contentLeft + noticeBoxPadding,
      noticeCursorY,
      noticeBodySize,
      palette.ink,
      false,
      noticeBodyLineHeight,
    );
    noticeCursorY -= lines.length * noticeBodyLineHeight + 7;
  }

  drawHorizontalLine(
    noticeCursorY + 3,
    contentLeft + noticeBoxPadding,
    noticeInnerWidth,
    palette.lineSoft,
    0.7,
  );
  noticeCursorY -= 12;

  page.drawText(questionHeading, {
    x: contentLeft + noticeBoxPadding,
    y: noticeCursorY,
    size: 10.2,
    font: boldFont,
    color: palette.ink,
  });
  noticeCursorY -= 12;

  drawWrappedLines(
    questionSupportLines,
    contentLeft + noticeBoxPadding,
    noticeCursorY,
    noticeBodySize,
    palette.ink,
    false,
    noticeBodyLineHeight,
  );
  noticeCursorY -= questionSupportLines.length * noticeBodyLineHeight + 5;

  drawWrappedLines(
    questionContactLines,
    contentLeft + noticeBoxPadding,
    noticeCursorY,
    noticeBodySize,
    palette.ink,
    false,
    noticeBodyLineHeight,
  );

  const revisionSize = 7.6;
  const revisionWidth = regularFont.widthOfTextAtSize(revisionText, revisionSize);
  page.drawText(revisionText, {
    x: contentLeft + contentWidth - noticeBoxPadding - revisionWidth,
    y: noticeBoxY + 6,
    size: revisionSize,
    font: regularFont,
    color: palette.ink,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await getAdminAuthFromRequest(req);
  if (
    !auth ||
    (auth.role !== "admin" &&
      auth.role !== "superadmin" &&
      auth.role !== "manager" &&
      auth.role !== "verifier")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await context.params;
  if (!requestId?.trim()) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
  }

  await connectMongo();

  const scoped = await getScopedRequest(auth, requestId);
  if (!scoped.item) {
    return NextResponse.json({ error: scoped.error || "Request not found." }, { status: scoped.status || 404 });
  }

  if (scoped.item.status !== "verified") {
    return NextResponse.json(
      { error: "Report generation is available only after request verification is complete." },
      { status: 400 },
    );
  }

  const customer = await User.findById(scoped.item.customer).lean();
  const generator = await User.findById(auth.userId).select("name").lean();

  const selectedServices = (scoped.item.selectedServices ?? []) as SelectedServiceLike[];
  const candidateFormResponses =
    (scoped.item.candidateFormResponses ?? []) as CandidateFormResponseLike[];
  const normalizedReportSections = normalizeServiceVerifications(
    selectedServices,
    (scoped.item.serviceVerifications ?? []) as ServiceVerificationLike[],
    candidateFormResponses,
  );

  const fallbackGeneratedAt = new Date();
  const fallbackReportData: ReportPayload = {
    reportNumber: `RPT-${Date.now()}`,
    generatedAt: fallbackGeneratedAt.toISOString(),
    generatedByName: generator?.name ?? "Unknown",
    candidate: {
      name: scoped.item.candidateName,
      email: scoped.item.candidateEmail,
      phone: scoped.item.candidatePhone,
    },
    company: {
      name: customer?.name ?? "Unknown",
      email: customer?.email ?? "Unknown",
    },
    status: scoped.item.status,
    createdAt: asDate(scoped.item.createdAt)?.toISOString() ?? new Date().toISOString(),
    personalDetails: normalizedReportSections.personalDetails.map((detail) => ({
      question: detail.question,
      value: detail.value,
      fieldType: detail.fieldType,
      fileName: detail.fileName,
      fileData: detail.fileData,
    })),
    services: normalizedReportSections.services.map((service) => ({
      serviceId: service.serviceId,
      serviceEntryIndex: service.serviceEntryIndex,
      serviceEntryCount: service.serviceEntryCount,
      serviceInstanceKey: service.serviceInstanceKey,
      serviceName: service.serviceName,
      status: service.status,
      verificationMode: service.verificationMode,
      comment: service.comment,
      candidateAnswers: service.candidateAnswers.map((answer) => ({
        question: answer.question,
        value: answer.value,
        fieldType: answer.fieldType,
        fileName: answer.fileName,
        fileData: answer.fileData,
      })),
      attempts: service.attempts.map((attempt) => ({
        attemptedAt: attempt.attemptedAt.toISOString(),
        status: attempt.status,
        verificationMode: attempt.verificationMode,
        comment: attempt.comment,
        verifierName: attempt.verifierName,
        managerName: attempt.managerName,
      })),
    })),
  };

  const reportData = normalizeReportDataForGeneration(
    scoped.item.reportData,
    fallbackReportData,
  );

  const generatedAt = asDate(reportData.generatedAt) ?? fallbackGeneratedAt;
  const reportNumber = reportData.reportNumber || fallbackReportData.reportNumber;
  const generatedByName = reportData.generatedByName || generator?.name || "Unknown";

  reportData.reportNumber = reportNumber;
  reportData.generatedAt = generatedAt.toISOString();
  reportData.generatedByName = generatedByName;

  const invoiceSnapshot: InvoiceSnapshot = {
    currency: selectedServices[0]?.currency || "INR",
    subtotal: selectedServices.reduce((sum, service) => sum + (service.price || 0), 0),
    items: selectedServices.map((service) => ({
      serviceId: String(service.serviceId),
      serviceName: service.serviceName,
      price: service.price || 0,
    })),
    billingEmail:
      customer?.partnerProfile?.invoicingInformation?.invoiceEmail ||
      customer?.partnerProfile?.primaryContactInformation?.email ||
      customer?.email ||
      "",
    companyName: customer?.name || "",
  };

  await VerificationRequest.findByIdAndUpdate(
    requestId,
    {
      reportMetadata: {
        generatedAt,
        generatedBy: auth.userId,
        generatedByName,
        reportNumber,
        customerSharedAt:
          scoped.item.reportMetadata &&
          typeof scoped.item.reportMetadata === "object" &&
          "customerSharedAt" in scoped.item.reportMetadata
            ? scoped.item.reportMetadata.customerSharedAt ?? null
            : null,
      },
      reportData,
      invoiceSnapshot,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return NextResponse.json({
    message: "Report generated successfully.",
    reportNumber,
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const auth = await getAdminAuthFromRequest(req);
    if (
      !auth ||
      (auth.role !== "admin" &&
        auth.role !== "superadmin" &&
        auth.role !== "manager" &&
        auth.role !== "verifier")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await context.params;
    if (!requestId?.trim()) {
      return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
    }

    await connectMongo();

    const scoped = await getScopedRequest(auth, requestId);
    if (!scoped.item) {
      return NextResponse.json({ error: scoped.error || "Request not found." }, { status: scoped.status || 404 });
    }

    if (!scoped.item.reportData || !scoped.item.invoiceSnapshot) {
      return NextResponse.json(
        { error: "No generated report found for this request yet." },
        { status: 404 },
      );
    }

    const reportData = scoped.item.reportData as ReportPayload;

    const pdfBuffer = await buildPdfBuffer(reportData);
    const pdfBytes = Uint8Array.from(pdfBuffer);

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportData.reportNumber || "verification-report"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[report-download] failed", error);
    const message =
      error instanceof Error ? error.message : "Could not generate report download.";

    return NextResponse.json(
      {
        error: "Could not generate report download.",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
