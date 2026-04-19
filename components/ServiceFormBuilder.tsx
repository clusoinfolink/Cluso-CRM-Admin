"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  getAllCountryOptions,
  getSystemLocationFieldConfig,
  resolveSystemLocationFieldType,
  SERVICE_COUNTRY_FIELD_QUESTION,
} from "@/lib/locationHierarchy";
import {
  ClipboardList,
  Plus,
  Save,
  Trash2,
  HelpCircle,
  Type,
  FileText,
  Calendar,
  ChevronDown,
  Hash,
  Upload,
  Settings,
  AlertCircle,
  Layers,
  Copy,
  Info,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  GripVertical,
  House,
  NotebookPen,
  PenLine,
  Phone,
  MapPin,
  IdCard,
  Ban,
  Briefcase,
  User,
  Mail,
  Building2,
  Globe,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { SupportedCurrency } from "@/lib/currencies";
import { SearchableSelect } from "@/components/SearchableSelect";

type ServiceFormFieldType =
  | "text"
  | "long_text"
  | "number"
  | "file"
  | "date"
  | "dropdown"
  | "email"
  | "mobile"
  | "composite";
type ServiceQuestionIconKey =
  | "none"
  | "diary"
  | "house"
  | "pen"
  | "calendar"
  | "phone"
  | "location"
  | "id-card"
  | "document"
  | "work"
  | "person"
  | "email"
  | "company"
  | "global"
  | "security";

const DEFAULT_QUESTION_ICON: ServiceQuestionIconKey = "diary";
const SYSTEM_LOCATION_FIELD_TYPES = ["country", "state", "city"] as const;
type SystemLocationFieldType = (typeof SYSTEM_LOCATION_FIELD_TYPES)[number];
const SYSTEM_SERVICE_COUNTRY_DEFAULT_OPTIONS = getAllCountryOptions();

const PREVIEW_MOBILE_CODE_OPTIONS = [
  "+1",
  "+44",
  "+60",
  "+61",
  "+65",
  "+86",
  "+91",
  "+92",
  "+94",
  "+971",
];

const QUESTION_ICON_OPTIONS: Array<{
  key: ServiceQuestionIconKey;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: "none", label: "None", Icon: Ban },
  { key: "diary", label: "Diary", Icon: NotebookPen },
  { key: "house", label: "House", Icon: House },
  { key: "pen", label: "Pen", Icon: PenLine },
  { key: "calendar", label: "Calendar", Icon: Calendar },
  { key: "phone", label: "Phone", Icon: Phone },
  { key: "location", label: "Location", Icon: MapPin },
  { key: "id-card", label: "ID Card", Icon: IdCard },
  { key: "document", label: "Document", Icon: FileText },
  { key: "work", label: "Work", Icon: Briefcase },
  { key: "person", label: "Person", Icon: User },
  { key: "email", label: "Email", Icon: Mail },
  { key: "company", label: "Company", Icon: Building2 },
  { key: "global", label: "Global", Icon: Globe },
  { key: "security", label: "Security", Icon: ShieldCheck },
];

function normalizeQuestionIconKey(rawIconKey: unknown): ServiceQuestionIconKey {
  if (typeof rawIconKey !== "string") {
    return DEFAULT_QUESTION_ICON;
  }

  const normalized = rawIconKey.trim().toLowerCase() as ServiceQuestionIconKey;
  return QUESTION_ICON_OPTIONS.some((option) => option.key === normalized)
    ? normalized
    : DEFAULT_QUESTION_ICON;
}

async function parseJsonResponseSafely<T>(res: Response): Promise<T | null> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return null;
  }
}

export type ServiceFormSubField = {
  fieldKey?: string;
  question: string;
  fieldType: "text" | "number" | "date" | "dropdown";
  dropdownOptions?: string[];
  required: boolean;
};

export type ServiceFormField = {
  fieldKey?: string;
  question: string;
  iconKey?: string;
  fieldType: ServiceFormFieldType;
  subFields?: ServiceFormSubField[];
  dropdownOptions?: string[];
  required: boolean;
  repeatable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
  allowNotApplicable?: boolean;
  notApplicableText?: string;
  copyFromPersonalDetailsFieldKey?: string;
  previewWidth?: "full" | "half" | "third";
};

export type ServiceItemForForm = {
  id: string;
  name: string;
  description: string;
  defaultPrice: number | null;
  defaultCurrency: SupportedCurrency;
  isPackage: boolean;
  hiddenFromCustomerPortal?: boolean;
  isDefaultPersonalDetails?: boolean;
  allowMultipleEntries?: boolean;
  multipleEntriesLabel?: string;
  formFields: ServiceFormField[];
};

type Props = {
  services: ServiceItemForForm[];
  canManage: boolean;
  onSaved: () => Promise<void>;
  preferredServiceId?: string;
};

function supportsLengthConstraints(fieldType: ServiceFormFieldType) {
  return (
    fieldType === "text" ||
    fieldType === "long_text" ||
    fieldType === "email" ||
    fieldType === "number"
  );
}

function supportsUppercaseConstraint(fieldType: ServiceFormFieldType) {
  return fieldType === "text" || fieldType === "long_text";
}

function supportsRepeatable(fieldType: ServiceFormFieldType) {
  return fieldType !== "file";
}

function mapFieldTypeToSubFieldType(
  fieldType: ServiceFormFieldType,
): ServiceFormSubField["fieldType"] {
  if (
    fieldType === "text" ||
    fieldType === "number" ||
    fieldType === "date" ||
    fieldType === "dropdown"
  ) {
    return fieldType;
  }

  return "text";
}

function normalizeDraftDropdownOptions(rawOptions: unknown) {
  if (!Array.isArray(rawOptions)) {
    return [] as string[];
  }

  return rawOptions.map((option) => String(option ?? ""));
}

function sanitizeDropdownOptions(rawOptions: unknown) {
  return [
    ...new Set(
      normalizeDraftDropdownOptions(rawOptions)
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  ];
}

function sanitizeSubFields(rawSubFields: unknown): ServiceFormSubField[] {
  if (!Array.isArray(rawSubFields)) {
    return [];
  }

  const nextSubFields: ServiceFormSubField[] = [];

  for (const rawSubField of rawSubFields) {
    if (!rawSubField || typeof rawSubField !== "object") {
      continue;
    }

    const subField = rawSubField as Partial<ServiceFormSubField>;
    const normalizedFieldType: ServiceFormSubField["fieldType"] =
      subField.fieldType === "text" ||
      subField.fieldType === "number" ||
      subField.fieldType === "date" ||
      subField.fieldType === "dropdown"
        ? subField.fieldType
        : "text";

    nextSubFields.push({
      fieldKey: typeof subField.fieldKey === "string" ? subField.fieldKey.trim() : "",
      question: typeof subField.question === "string" ? subField.question : "",
      fieldType: normalizedFieldType,
      dropdownOptions:
        normalizedFieldType === "dropdown"
          ? normalizeDraftDropdownOptions(subField.dropdownOptions)
          : [],
      required: Boolean(subField.required),
    });
  }

  return nextSubFields;
}

function normalizeLengthValue(raw: string) {
  if (!raw.trim()) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function createFieldKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `fld_${crypto.randomUUID()}`;
  }

  return `fld_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyField(
  question = "",
  iconKey: ServiceQuestionIconKey = DEFAULT_QUESTION_ICON,
): ServiceFormField {
  return {
    fieldKey: createFieldKey(),
    question,
    iconKey,
    fieldType: "text",
    dropdownOptions: [],
    required: false,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "Not Applicable",
    copyFromPersonalDetailsFieldKey: "",
  };
}

function resolveSystemServiceLocationType(field: ServiceFormField): SystemLocationFieldType | null {
  const byFieldKey = resolveSystemLocationFieldType(field.fieldKey);
  if (byFieldKey) {
    return byFieldKey;
  }

  const normalizedQuestion = field.question.trim().toLowerCase();
  if (normalizedQuestion === SERVICE_COUNTRY_FIELD_QUESTION.toLowerCase()) {
    return "country";
  }

  return null;
}

function isSystemServiceLocationField(field: ServiceFormField) {
  return resolveSystemServiceLocationType(field) !== null;
}

function buildSystemServiceLocationField(
  locationType: SystemLocationFieldType,
  sourceField?: ServiceFormField,
): ServiceFormField {
  const config = getSystemLocationFieldConfig(locationType);
  const sourceDropdownOptions = sanitizeDropdownOptions(sourceField?.dropdownOptions);

  return {
    fieldKey: config.fieldKey,
    question: config.question,
    iconKey: normalizeQuestionIconKey(sourceField?.iconKey ?? config.iconKey),
    fieldType: "dropdown",
    subFields: [],
    dropdownOptions:
      locationType === "country"
        ? sourceDropdownOptions.length > 0
          ? sourceDropdownOptions
          : [...SYSTEM_SERVICE_COUNTRY_DEFAULT_OPTIONS]
        : [...config.dropdownOptions],
    required: true,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
    copyFromPersonalDetailsFieldKey: "",
    previewWidth: config.previewWidth,
  };
}

function ensureSystemLocationFields(rawFields: ServiceFormField[]) {
  const nonSystemFields: ServiceFormField[] = [];
  const firstSystemFieldByType = new Map<SystemLocationFieldType, ServiceFormField>();

  for (const field of rawFields) {
    const locationType = resolveSystemServiceLocationType(field);
    if (!locationType) {
      nonSystemFields.push(field);
      continue;
    }

    if (!firstSystemFieldByType.has(locationType)) {
      firstSystemFieldByType.set(
        locationType,
        buildSystemServiceLocationField(locationType, field),
      );
    }
  }

  const systemFields = SYSTEM_LOCATION_FIELD_TYPES.map(
    (locationType) =>
      firstSystemFieldByType.get(locationType) ??
      buildSystemServiceLocationField(locationType),
  );

  return [...systemFields, ...nonSystemFields];
}

type CandidatePreviewField = {
  fieldKey: string;
  question: string;
  iconKey: ServiceQuestionIconKey;
  fieldType: Exclude<ServiceFormFieldType, "composite">;
  sourceFieldIndex: number;
  sourceFieldIdentity: string;
  sourceFieldType: ServiceFormFieldType;
  sourcePreviewWidth: PreviewFieldWidth;
  isPrimaryForSource: boolean;
  dropdownOptions: string[];
  required: boolean;
  repeatable: boolean;
  minLength: number | null;
  maxLength: number | null;
  forceUppercase: boolean;
  allowNotApplicable: boolean;
  notApplicableText: string;
  copyFromPersonalDetailsFieldKey: string;
};

type PreviewFieldWidth = "full" | "half" | "third";

function normalizePreviewWidth(
  rawPreviewWidth: unknown,
  fieldType: ServiceFormFieldType | CandidatePreviewField["fieldType"],
): PreviewFieldWidth {
  if (
    rawPreviewWidth === "full" ||
    rawPreviewWidth === "half" ||
    rawPreviewWidth === "third"
  ) {
    return rawPreviewWidth;
  }

  if (fieldType === "file" || fieldType === "long_text") {
    return "full";
  }

  return "half";
}

function resolvePreviewSourceIdentity(field: ServiceFormField, index: number) {
  const key = field.fieldKey?.trim();
  if (key) {
    return key;
  }

  const question = field.question?.trim();
  if (question) {
    return `q_${question.toLowerCase().replace(/\s+/g, "_")}_${index + 1}`;
  }

  return `idx_${index + 1}`;
}

function getDefaultPreviewFieldWidth(field: CandidatePreviewField): PreviewFieldWidth {
  return normalizePreviewWidth(undefined, field.fieldType);
}

function getPreviewGridColumnSpan(width: PreviewFieldWidth) {
  if (width === "third") {
    return 4;
  }

  if (width === "half") {
    return 6;
  }

  return 12;
}

function getPreviewFieldType(rawType: unknown): CandidatePreviewField["fieldType"] {
  if (
    rawType === "text" ||
    rawType === "long_text" ||
    rawType === "number" ||
    rawType === "file" ||
    rawType === "date" ||
    rawType === "dropdown" ||
    rawType === "email" ||
    rawType === "mobile"
  ) {
    return rawType;
  }

  return "text";
}

function expandFieldsForCandidatePreview(rawFields: ServiceFormField[]) {
  const expandedFields: CandidatePreviewField[] = [];

  rawFields.forEach((field, index) => {
    const baseQuestion = field.question?.trim() || "";
    const baseFieldKey = field.fieldKey?.trim() || `field_${index + 1}`;
    const sourceFieldIdentity = resolvePreviewSourceIdentity(field, index);
    const iconKey = normalizeQuestionIconKey(field.iconKey);
    const required = Boolean(field.required);
    const minLength =
      typeof field.minLength === "number" && Number.isFinite(field.minLength)
        ? field.minLength
        : null;
    const maxLength =
      typeof field.maxLength === "number" && Number.isFinite(field.maxLength)
        ? field.maxLength
        : null;
    const forceUppercase = Boolean(field.forceUppercase);
    const allowNotApplicable = Boolean(field.allowNotApplicable);
    const notApplicableText = field.notApplicableText?.trim() || "Not Applicable";
    const sourcePreviewWidth = normalizePreviewWidth(field.previewWidth, field.fieldType);
    let hasPrimaryRowForSource = false;

    if (field.fieldType === "composite" && Array.isArray(field.subFields) && field.subFields.length > 0) {
      field.subFields.forEach((rawSubField, subIndex) => {
        if (!rawSubField || typeof rawSubField !== "object") {
          return;
        }

        const subQuestion = rawSubField.question?.trim() || "";
        if (!subQuestion) {
          return;
        }

        const subFieldType = getPreviewFieldType(rawSubField.fieldType);
        const subFieldKey = rawSubField.fieldKey?.trim() || `${baseFieldKey}__sub_${subIndex + 1}`;

        expandedFields.push({
          fieldKey: subFieldKey,
          question: baseQuestion ? `${baseQuestion} - ${subQuestion}` : subQuestion,
          iconKey,
          fieldType: subFieldType,
          sourceFieldIndex: index,
          sourceFieldIdentity,
          sourceFieldType: field.fieldType,
          sourcePreviewWidth,
          isPrimaryForSource: !hasPrimaryRowForSource,
          dropdownOptions:
            subFieldType === "dropdown"
              ? sanitizeDropdownOptions(rawSubField.dropdownOptions)
              : [],
          required: required || Boolean(rawSubField.required),
          repeatable: false,
          minLength: supportsLengthConstraints(subFieldType) ? minLength : null,
          maxLength: supportsLengthConstraints(subFieldType) ? maxLength : null,
          forceUppercase:
            supportsUppercaseConstraint(subFieldType) && forceUppercase,
          allowNotApplicable,
          notApplicableText,
          copyFromPersonalDetailsFieldKey: "",
        });

        hasPrimaryRowForSource = true;
      });

      return;
    }

    const fieldType = getPreviewFieldType(field.fieldType);

    expandedFields.push({
      fieldKey: baseFieldKey,
      question: baseQuestion,
      iconKey,
      fieldType,
      sourceFieldIndex: index,
      sourceFieldIdentity,
      sourceFieldType: field.fieldType,
      sourcePreviewWidth,
      isPrimaryForSource: true,
      dropdownOptions:
        fieldType === "dropdown" ? sanitizeDropdownOptions(field.dropdownOptions) : [],
      required,
      repeatable: fieldType === "file" ? false : Boolean(field.repeatable),
      minLength: supportsLengthConstraints(fieldType) ? minLength : null,
      maxLength: supportsLengthConstraints(fieldType) ? maxLength : null,
      forceUppercase:
        supportsUppercaseConstraint(fieldType) && forceUppercase,
      allowNotApplicable,
      notApplicableText,
      copyFromPersonalDetailsFieldKey:
        fieldType === "file"
          ? ""
          : String(field.copyFromPersonalDetailsFieldKey ?? "").trim(),
    });
  });

  return expandedFields;
}

function getPreviewConstraintHint(field: CandidatePreviewField) {
  if (!supportsLengthConstraints(field.fieldType)) {
    return "";
  }

  const hints: string[] = [];
  const lengthUnit = field.fieldType === "number" ? "digits" : "chars";

  if (typeof field.minLength === "number") {
    hints.push(`Min ${field.minLength} ${lengthUnit}`);
  }

  if (typeof field.maxLength === "number") {
    hints.push(`Max ${field.maxLength} ${lengthUnit}`);
  }

  if (supportsUppercaseConstraint(field.fieldType) && field.forceUppercase) {
    hints.push("ALL CAPS");
  }

  return hints.join(" | ");
}

function renderPreviewQuestionIcon(iconKey: ServiceQuestionIconKey) {
  if (iconKey === "none") {
    return null;
  }

  const matched = QUESTION_ICON_OPTIONS.find((option) => option.key === iconKey);
  const Icon = matched?.Icon ?? NotebookPen;

  return <Icon size={13} />;
}

function renderPreviewQuestionPrompt(field: CandidatePreviewField) {
  const iconElement = renderPreviewQuestionIcon(field.iconKey);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
      {iconElement ? (
        <span
          style={{
            width: "1.3rem",
            height: "1.3rem",
            borderRadius: "999px",
            border: "1px solid #D5DEEE",
            background: "#EEF2FF",
            color: "#334155",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {iconElement}
        </span>
      ) : null}
      <span>{field.question || "Untitled question"}</span>
      {field.required ? <span style={{ color: "#DC2626" }}>*</span> : null}
    </span>
  );
}

export default function ServiceFormBuilder({
  services,
  canManage,
  onSaved,
  preferredServiceId,
}: Props) {
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ServiceFormField[]>>({});
  const [serviceEntryModeDrafts, setServiceEntryModeDrafts] = useState<Record<string, boolean>>({});
  const [serviceEntryLabelDrafts, setServiceEntryLabelDrafts] = useState<Record<string, string | undefined>>({});
  const [expandedDropdownEditors, setExpandedDropdownEditors] = useState<Record<string, boolean>>({});
  const [showCandidatePreview, setShowCandidatePreview] = useState(false);
  const [previewFieldWidths, setPreviewFieldWidths] = useState<Record<string, PreviewFieldWidth>>({});
  const [draggedPreviewSourceIndex, setDraggedPreviewSourceIndex] = useState<number | null>(null);
  const [dropPreviewSourceIndex, setDropPreviewSourceIndex] = useState<number | null>(null);
  const [saveCandidateLayoutSnapshot, setSaveCandidateLayoutSnapshot] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const regularServices = useMemo(
    () => services.filter((service) => !service.isPackage),
    [services],
  );

  const personalDetailsFieldOptions = useMemo(() => {
    const personalDetailsService = services.find(
      (service) =>
        Boolean(service.isDefaultPersonalDetails) ||
        service.name.trim().toLowerCase() === "personal details",
    );

    if (!personalDetailsService) {
      return [] as Array<{ value: string; label: string }>;
    }

    const options = new Map<string, string>();
    for (const field of personalDetailsService.formFields ?? []) {
      const fieldKey = field.fieldKey?.trim() || "";
      const question = field.question?.trim() || "";
      if (!fieldKey || !question) {
        continue;
      }

      if (field.fieldType === "composite" || field.fieldType === "file") {
        continue;
      }

      options.set(fieldKey, question);
    }

    return [...options.entries()].map(([value, label]) => ({ value, label }));
  }, [services]);

  const selectedRegularService = regularServices.some((service) => service.id === selectedServiceId);
  const preferredRegularService =
    preferredServiceId && regularServices.some((service) => service.id === preferredServiceId)
      ? preferredServiceId
      : "";
  const activeServiceId = selectedRegularService
    ? selectedServiceId
    : preferredRegularService || regularServices[0]?.id || "";

  const selectedService = useMemo(
    () => regularServices.find((service) => service.id === activeServiceId) ?? null,
    [activeServiceId, regularServices],
  );

  const fields: ServiceFormField[] = ensureSystemLocationFields(
    (drafts[activeServiceId] ?? selectedService?.formFields ?? []).map((field) => ({
      ...field,
      fieldKey: field.fieldKey?.trim() || "",
      iconKey: normalizeQuestionIconKey(field.iconKey),
      subFields:
        field.fieldType === "composite"
          ? sanitizeSubFields(field.subFields).map((subField) => ({
              ...subField,
              dropdownOptions:
                subField.fieldType === "dropdown"
                  ? normalizeDraftDropdownOptions(subField.dropdownOptions)
                  : [],
            }))
          : [],
      dropdownOptions: normalizeDraftDropdownOptions(field.dropdownOptions),
      repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
      minLength: typeof field.minLength === "number" ? field.minLength : null,
      maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
      forceUppercase: Boolean(field.forceUppercase),
      allowNotApplicable: Boolean(field.allowNotApplicable),
      notApplicableText:
        typeof field.notApplicableText === "string"
          ? field.notApplicableText
          : "Not Applicable",
      copyFromPersonalDetailsFieldKey:
        field.fieldType === "file" || field.fieldType === "composite"
          ? ""
          : String(field.copyFromPersonalDetailsFieldKey ?? "").trim(),
      previewWidth: normalizePreviewWidth(field.previewWidth, field.fieldType),
    })),
  );

  const multipleEntriesLabel = activeServiceId
    ? serviceEntryLabelDrafts[activeServiceId] ?? selectedService?.multipleEntriesLabel
    : "";

  const allowMultipleEntries = activeServiceId
    ? serviceEntryModeDrafts[activeServiceId] ?? Boolean(selectedService?.allowMultipleEntries)
    : false;

  const candidatePreviewFields = useMemo(
    () =>
      expandFieldsForCandidatePreview(fields).filter(
        (field) => field.question.trim().length > 0,
      ),
    [fields],
  );

  const candidatePreviewEntryLabel =
    multipleEntriesLabel?.trim() || "Whole-service entries";
  const candidatePreviewEntryCount = allowMultipleEntries ? 2 : 1;

  function buildPreviewLayoutKey(field: CandidatePreviewField) {
    return `${activeServiceId || "service"}::${field.sourceFieldIdentity}`;
  }

  function getPreviewFieldWidth(field: CandidatePreviewField) {
    return (
      previewFieldWidths[buildPreviewLayoutKey(field)] ??
      field.sourcePreviewWidth ??
      getDefaultPreviewFieldWidth(field)
    );
  }

  function resolveDraftPreviewWidth(field: ServiceFormField, index: number) {
    const sourceFieldIdentity = resolvePreviewSourceIdentity(field, index);
    const previewOverride = previewFieldWidths[`${activeServiceId || "service"}::${sourceFieldIdentity}`];
    return normalizePreviewWidth(previewOverride ?? field.previewWidth, field.fieldType);
  }

  function setPreviewFieldWidth(field: CandidatePreviewField, width: PreviewFieldWidth) {
    setPreviewFieldWidths((prev) => ({
      ...prev,
      [buildPreviewLayoutKey(field)]: width,
    }));

    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, index) =>
        index === field.sourceFieldIndex
          ? {
              ...item,
              previewWidth: width,
            }
          : item,
      ),
    }));
  }

  function moveField(fromIndex: number, toIndex: number) {
    if (!activeServiceId) {
      return;
    }

    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= fields.length ||
      toIndex >= fields.length
    ) {
      return;
    }

    const nextFields = [...fields];
    const [movedField] = nextFields.splice(fromIndex, 1);
    if (!movedField) {
      return;
    }

    nextFields.splice(toIndex, 0, movedField);

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: nextFields,
    }));
  }

  function clearPreviewDragState() {
    setDraggedPreviewSourceIndex(null);
    setDropPreviewSourceIndex(null);
  }

  function toggleDropdownEditor(editorKey: string) {
    setExpandedDropdownEditors((prev) => ({
      ...prev,
      [editorKey]: !prev[editorKey],
    }));
  }

  function addField() {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: [...fields, createEmptyField()],
    }));
  }

  function addFieldForSameQuestion(index: number) {
    if (!activeServiceId) {
      return;
    }

    if (isSystemServiceLocationField(fields[index])) {
      return;
    }

    const sourceQuestion = fields[index]?.question?.trim() ?? "";
    const sourceIcon = normalizeQuestionIconKey(fields[index]?.iconKey);
    const nextFields = [...fields];
    nextFields.splice(index + 1, 0, createEmptyField(sourceQuestion, sourceIcon));

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: nextFields,
    }));
  }

  function addSecondInputInQuestion(index: number) {
    if (!activeServiceId) {
      return;
    }

    if (isSystemServiceLocationField(fields[index])) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) {
          return item;
        }

        if (item.fieldType === "composite") {
          return {
            ...item,
            subFields: [
              ...(item.subFields || []),
              {
                fieldKey: createFieldKey(),
                question: "",
                fieldType: "text",
                dropdownOptions: [],
                required: false,
              },
            ],
          };
        }

        const primarySubFieldType = mapFieldTypeToSubFieldType(item.fieldType);

        return {
          ...item,
          fieldType: "composite",
          subFields: [
            {
              fieldKey: createFieldKey(),
              question: item.question,
              fieldType: primarySubFieldType,
              dropdownOptions:
                primarySubFieldType === "dropdown"
                  ? sanitizeDropdownOptions(item.dropdownOptions)
                  : [],
              required: Boolean(item.required),
            },
            {
              fieldKey: createFieldKey(),
              question: "",
              fieldType: "text",
              dropdownOptions: [],
              required: false,
            },
          ],
          dropdownOptions: [],
          repeatable: false,
          minLength: null,
          maxLength: null,
          forceUppercase: false,
        };
      }),
    }));
  }

  function updateFieldQuestion(index: number, question: string) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? isSystemServiceLocationField(item)
            ? item
            : { ...item, question }
          : item,
      ),
    }));
  }

  function updateFieldIcon(index: number, iconKey: ServiceQuestionIconKey) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? isSystemServiceLocationField(item)
            ? item
            : { ...item, iconKey }
          : item,
      ),
    }));
  }

  function updateFieldType(index: number, fieldType: ServiceFormFieldType) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...(isSystemServiceLocationField(item) ? item : {
              ...item,
              fieldType,
              subFields: fieldType === "composite" ? item.subFields || [] : [],
              dropdownOptions:
                fieldType === "dropdown"
                  ? normalizeDraftDropdownOptions(item.dropdownOptions)
                  : [],
              repeatable: supportsRepeatable(fieldType)
                ? Boolean(item.repeatable)
                : false,
              minLength: supportsLengthConstraints(fieldType) ? item.minLength ?? null : null,
              maxLength: supportsLengthConstraints(fieldType) ? item.maxLength ?? null : null,
              forceUppercase: supportsUppercaseConstraint(fieldType)
                ? Boolean(item.forceUppercase)
                : false,
              copyFromPersonalDetailsFieldKey:
                fieldType === "file" || fieldType === "composite"
                  ? ""
                  : String(item.copyFromPersonalDetailsFieldKey ?? "").trim(),
              }),
            }
          : item,
      ),
    }));
  }

  function updateFieldDropdownOption(index: number, optionIndex: number, optionValue: string) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) {
          return item;
        }

        if (isSystemServiceLocationField(item)) {
          return item;
        }

        const nextOptions = [...normalizeDraftDropdownOptions(item.dropdownOptions)];
        if (optionIndex < 0 || optionIndex >= nextOptions.length) {
          return item;
        }

        nextOptions[optionIndex] = optionValue;
        return {
          ...item,
          dropdownOptions: nextOptions,
        };
      }),
    }));
  }

  function addFieldDropdownOption(index: number) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) {
          return item;
        }

        if (isSystemServiceLocationField(item)) {
          return item;
        }

        return {
          ...item,
          dropdownOptions: [...normalizeDraftDropdownOptions(item.dropdownOptions), ""],
        };
      }),
    }));
  }

  function removeFieldDropdownOption(index: number, optionIndex: number) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) {
          return item;
        }

        if (isSystemServiceLocationField(item)) {
          return item;
        }

        const nextOptions = [...normalizeDraftDropdownOptions(item.dropdownOptions)];
        if (optionIndex < 0 || optionIndex >= nextOptions.length) {
          return item;
        }

        nextOptions.splice(optionIndex, 1);
        return {
          ...item,
          dropdownOptions: nextOptions,
        };
      }),
    }));
  }

  function addSubField(index: number) {
    if (!activeServiceId) return;
    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          subFields: [
            ...(item.subFields || []),
            {
              fieldKey: createFieldKey(),
              question: "",
              fieldType: "text",
              dropdownOptions: [],
              required: false,
            },
          ],
        };
      }),
    }));
  }

  function updateSubField(index: number, subIndex: number, updater: (sf: ServiceFormSubField) => ServiceFormSubField) {
    if (!activeServiceId) return;
    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) return item;
        const nextSub = [...(item.subFields || [])];
        if (subIndex < 0 || subIndex >= nextSub.length) return item;
        nextSub[subIndex] = updater(nextSub[subIndex]);
        return {
          ...item,
          subFields: nextSub,
        };
      }),
    }));
  }

  function removeSubField(index: number, subIndex: number) {
    if (!activeServiceId) return;
    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) return item;
        const nextSub = [...(item.subFields || [])];
        if (subIndex < 0 || subIndex >= nextSub.length) return item;
        nextSub.splice(subIndex, 1);
        return {
          ...item,
          subFields: nextSub,
        };
      }),
    }));
  }

  function updateFieldRequired(index: number, required: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? isSystemServiceLocationField(item)
            ? item
            : { ...item, required }
          : item,
      ),
    }));
  }

  function updateFieldMinLength(index: number, minLength: string) {
    if (!activeServiceId) {
      return;
    }

    const nextMinLength = normalizeLengthValue(minLength);

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, minLength: nextMinLength } : item,
      ),
    }));
  }

  function updateFieldMaxLength(index: number, maxLength: string) {
    if (!activeServiceId) {
      return;
    }

    const nextMaxLength = normalizeLengthValue(maxLength);

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, maxLength: nextMaxLength } : item,
      ),
    }));
  }

  function updateFieldForceUppercase(index: number, forceUppercase: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index ? { ...item, forceUppercase } : item,
      ),
    }));
  }

  function updateFieldAllowNotApplicable(index: number, allowNotApplicable: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              allowNotApplicable,
              notApplicableText: item.notApplicableText?.trim() || "Not Applicable",
            }
          : item,
      ),
    }));
  }

  function updateFieldCopyFromPersonalDetails(index: number, sourceFieldKey: string) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) => {
        if (idx !== index) {
          return item;
        }

        if (
          isSystemServiceLocationField(item) ||
          item.fieldType === "file" ||
          item.fieldType === "composite"
        ) {
          return {
            ...item,
            copyFromPersonalDetailsFieldKey: "",
          };
        }

        return {
          ...item,
          copyFromPersonalDetailsFieldKey: sourceFieldKey.trim(),
        };
      }),
    }));
  }

  function updateFieldNotApplicableText(index: number, notApplicableText: string) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              notApplicableText,
            }
          : item,
      ),
    }));
  }

  function removeField(index: number) {
    if (!activeServiceId) {
      return;
    }

    if (isSystemServiceLocationField(fields[index])) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.filter((_, idx) => idx !== index),
    }));
  }

  function updateServiceAllowMultipleEntries(enabled: boolean) {
    if (!activeServiceId) {
      return;
    }

    setServiceEntryModeDrafts((prev) => ({
      ...prev,
      [activeServiceId]: enabled,
    }));
  }

  async function updateServiceMultipleEntriesLabel(label: string) {
    if (!activeServiceId) return;
    setServiceEntryLabelDrafts((prev) => ({ ...prev, [activeServiceId]: label }));
  }

  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!activeServiceId) {
      setMessage("Please select a service first.");
      return;
    }

    const cleaned = fields.map((item, index) => {
      const previewWidth = resolveDraftPreviewWidth(item, index);

      const systemLocationFieldType = resolveSystemServiceLocationType(item);
      if (systemLocationFieldType) {
        const config = getSystemLocationFieldConfig(systemLocationFieldType);
        const dropdownOptions = sanitizeDropdownOptions(item.dropdownOptions);

        return {
          fieldKey: config.fieldKey,
          question: config.question,
          iconKey: normalizeQuestionIconKey(config.iconKey),
          fieldType: "dropdown" as const,
          subFields: [],
          dropdownOptions:
            systemLocationFieldType === "country"
              ? dropdownOptions.length > 0
                ? dropdownOptions
                : [...SYSTEM_SERVICE_COUNTRY_DEFAULT_OPTIONS]
              : [...config.dropdownOptions],
          required: true,
          repeatable: false,
          minLength: null,
          maxLength: null,
          forceUppercase: false,
          allowNotApplicable: false,
          notApplicableText: "",
          copyFromPersonalDetailsFieldKey: "",
          previewWidth,
        };
      }

      const minLength =
        supportsLengthConstraints(item.fieldType) && typeof item.minLength === "number"
          ? item.minLength
          : null;
      const maxLength =
        supportsLengthConstraints(item.fieldType) && typeof item.maxLength === "number"
          ? item.maxLength
          : null;
      const dropdownOptions =
        item.fieldType === "dropdown" ? sanitizeDropdownOptions(item.dropdownOptions) : [];
      const subFields =
        item.fieldType === "composite"
          ? sanitizeSubFields(item.subFields).map((subField) => ({
              fieldKey: subField.fieldKey?.trim() || createFieldKey(),
              question: subField.question.trim(),
              fieldType: subField.fieldType,
              dropdownOptions:
                subField.fieldType === "dropdown"
                  ? sanitizeDropdownOptions(subField.dropdownOptions)
                  : [],
              required: Boolean(subField.required),
            }))
          : [];

      return {
        fieldKey: item.fieldKey?.trim() || createFieldKey(),
        question: item.question.trim(),
        iconKey: normalizeQuestionIconKey(item.iconKey),
        fieldType: item.fieldType,
        subFields,
        dropdownOptions,
        required: Boolean(item.required),
        repeatable: supportsRepeatable(item.fieldType) ? Boolean(item.repeatable) : false,
        minLength,
        maxLength,
        forceUppercase: supportsUppercaseConstraint(item.fieldType)
          ? Boolean(item.forceUppercase)
          : false,
        allowNotApplicable: Boolean(item.allowNotApplicable),
        notApplicableText: Boolean(item.allowNotApplicable)
          ? item.notApplicableText?.trim() ?? ""
          : "",
        copyFromPersonalDetailsFieldKey:
          item.fieldType === "file" || item.fieldType === "composite"
            ? ""
            : String(item.copyFromPersonalDetailsFieldKey ?? "").trim(),
        previewWidth,
      };
    });

    const hasEmptyQuestion = cleaned.some(
      (item) =>
        !item.question ||
        (item.fieldType === "composite" && item.subFields.some((subField) => !subField.question)),
    );
    if (hasEmptyQuestion) {
      setMessage("Each form field and composite sub-field must include a question.");
      return;
    }

    const invalidDropdownField = cleaned.find(
      (item) => item.fieldType === "dropdown" && item.dropdownOptions.length === 0,
    );
    if (invalidDropdownField) {
      setMessage(`"${invalidDropdownField.question}" must include at least one dropdown option.`);
      return;
    }

    const invalidCompositeField = cleaned.find(
      (item) => item.fieldType === "composite" && item.subFields.length === 0,
    );
    if (invalidCompositeField) {
      setMessage(`"${invalidCompositeField.question}" must include at least one sub-field.`);
      return;
    }

    const invalidCompositeDropdownField = cleaned.find(
      (item) =>
        item.fieldType === "composite" &&
        item.subFields.some(
          (subField) =>
            subField.fieldType === "dropdown" && subField.dropdownOptions.length === 0,
        ),
    );
    if (invalidCompositeDropdownField) {
      setMessage(
        `"${invalidCompositeDropdownField.question}" has a dropdown sub-field without options.`,
      );
      return;
    }

    const invalidLengthField = cleaned.find(
      (item) =>
        item.minLength !== null &&
        item.maxLength !== null &&
        item.minLength > item.maxLength,
    );

    if (invalidLengthField) {
      setMessage(`"${invalidLengthField.question}" has min length greater than max length.`);
      return;
    }

    const invalidNotApplicableField = cleaned.find(
      (item) => item.allowNotApplicable && !item.notApplicableText.trim(),
    );

    if (invalidNotApplicableField) {
      setMessage(`"${invalidNotApplicableField.question}" must include default text for Not Applicable.`);
      return;
    }

    const personalDetailsFieldOptionKeys = new Set(
      personalDetailsFieldOptions.map((option) => option.value),
    );
    const invalidPersonalDetailsCopyField = cleaned.find(
      (item) =>
        Boolean(item.copyFromPersonalDetailsFieldKey) &&
        !personalDetailsFieldOptionKeys.has(item.copyFromPersonalDetailsFieldKey),
    );

    if (invalidPersonalDetailsCopyField) {
      setMessage(
        `"${invalidPersonalDetailsCopyField.question}" has an invalid Personal Details source mapping.`,
      );
      return;
    }

    setSaving(true);
    const normalizedMultipleEntriesLabel =
      multipleEntriesLabel?.trim() && allowMultipleEntries
        ? multipleEntriesLabel.trim()
        : undefined;

    try {
      const res = await fetch("/api/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: activeServiceId,
          allowMultipleEntries,
          multipleEntriesLabel: normalizedMultipleEntriesLabel,
          saveCandidateLayoutSnapshot,
          formFields: cleaned,
        }),
      });

      const data =
        (await parseJsonResponseSafely<{ message?: string; error?: string }>(res)) ?? {};

      if (!res.ok) {
        const fallbackError =
          res.status === 401
            ? "Session expired. Please sign in again."
            : `Could not save service form (HTTP ${res.status}).`;
        setMessage(data.error ?? fallbackError);
        return;
      }

      setDrafts((prev) => ({ ...prev, [activeServiceId]: cleaned }));
      setServiceEntryModeDrafts((prev) => ({
        ...prev,
        [activeServiceId]: allowMultipleEntries,
      }));
      setMessage(data.message ?? "Service form updated.");
      await onSaved();
    } catch {
      setMessage("Could not save service form due to a network/server issue.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return null;
  }

  return (
    <section style={{ marginBottom: "1.5rem", animation: "fadeIn 0.3s ease" }}>
      <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "10px", boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ background: "#EEF2FF", padding: "0.75rem", borderRadius: "8px", color: "#3B82F6" }}>
            <ClipboardList size={28} />
          </div>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: "0.25rem", color: "#1E293B", fontSize: "1.25rem", fontWeight: 600 }}>
              Service Form Builder
            </h2>
            <p style={{ color: "#64748B", margin: 0, fontSize: "0.95rem", lineHeight: "1.5" }}>
              Configure exact dataset questions verifiers must fill during processing. Add robust constraints, repeatability, and customize field behaviors to ensure data validity.
            </p>
          </div>
        </div>

        {regularServices.length === 0 ? (
          <div style={{ padding: "1rem", background: "#FEF2F2", color: "#DC2626", borderRadius: "8px", border: "1px solid #FECACA", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} />
            Add regular services in Service Catalog before creating forms. Package deals use included service forms.
          </div>
        ) : (
          <form onSubmit={saveForm} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid #E2E8F0" }}>
              <label style={{ fontSize: "0.95rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Settings size={18} color="#64748B" />
                Select Service to Configure
              </label>
              <div style={{ maxWidth: "400px" }}>
                <SearchableSelect
                  value={activeServiceId}
                  onChange={(val) => setSelectedServiceId(val)}
                  options={regularServices.map((s) => ({
                    value: s.id,
                    label:
                      s.hiddenFromCustomerPortal || s.isDefaultPersonalDetails
                        ? `${s.name} (System Form)`
                        : s.name,
                  }))}
                  placeholder="Select a service..."
                />
              </div>
            </div>

            <div
              style={{
                border: "1px solid #BFDBFE",
                borderRadius: "8px",
                background: "#EFF6FF",
                padding: "1rem",
                display: "grid",
                  gap: "0.8rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      fontWeight: 600,
                      color: "#1E3A8A",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(allowMultipleEntries)}
                      onChange={(e) => updateServiceAllowMultipleEntries(e.target.checked)}
                      style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer", accentColor: "#2563EB" }}
                    />
                    <Layers size={18} color="#3B82F6" />
                    Allow whole-service repetition (+ Add another entry)
                  </label>
                  <div style={{ color: "#3B82F6", fontSize: "0.85rem", paddingLeft: "1.7rem", marginTop: "0.2rem" }}>
                    Candidates can duplicate the entire form as a block. (File upload fields remain single-entry).
                  </div>
                </div>

                {allowMultipleEntries && (
                  <div style={{ paddingLeft: "1.7rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1E3A8A" }}>Custom Plural Label (Whole-service entries fallback)</label>
                    <input
                      className="input"
                      style={{ padding: "0.5rem 0.8rem", border: "1px solid #93C5FD", borderRadius: "6px", fontSize: "0.9rem", width: "100%", maxWidth: "400px" }}
                      value={multipleEntriesLabel ?? ""}
                      onChange={(e) => updateServiceMultipleEntriesLabel(e.target.value)}
                      placeholder="e.g. Address History, Employment Records"
                    />
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  border: "1px solid #E2E8F0",
                  borderRadius: "10px",
                  background: "#FFFFFF",
                  padding: "0.8rem 1rem",
                }}
              >
                <div style={{ display: "grid", gap: "0.2rem" }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#1E293B" }}>
                    Candidate-facing preview
                  </span>
                  <span style={{ fontSize: "0.82rem", color: "#64748B" }}>
                    Toggle a live read-only preview that mirrors candidate form layout.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCandidatePreview((prev) => !prev)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    border: "1px solid #CBD5E1",
                    borderRadius: "999px",
                    padding: "0.52rem 0.9rem",
                    background: showCandidatePreview ? "#EFF6FF" : "#F8FAFC",
                    color: showCandidatePreview ? "#1D4ED8" : "#334155",
                    fontWeight: 700,
                    fontSize: "0.84rem",
                    cursor: "pointer",
                  }}
                  aria-pressed={showCandidatePreview}
                >
                  {showCandidatePreview ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showCandidatePreview ? "Hide Preview" : "View Preview"}
                </button>
              </div>

              <div style={{ display: "grid", gap: "1rem" }}>
                {fields.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem", background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: "8px", color: "#94A3B8" }}>
                    <ClipboardList size={32} style={{ marginBottom: "0.5rem" }} />
                    <span>No fields yet. Click Add Field to start this service form.</span>
                  </div>
                )}

                {fields.map((field, index) => {
                const systemLocationType = resolveSystemServiceLocationType(field);
                const isSystemLocationField = Boolean(systemLocationType);
                const systemLocationConfig = systemLocationType
                  ? getSystemLocationFieldConfig(systemLocationType)
                  : null;
                const fieldEditorKey = `${activeServiceId}::${field.fieldKey?.trim() || `field-${index}`}`;
                const dropdownEditorKey = `${fieldEditorKey}::dropdown`;
                const isDropdownEditorOpen = Boolean(expandedDropdownEditors[dropdownEditorKey]);

                return (
                <div
                  key={field.fieldKey || `${activeServiceId}-${index}`}
                  style={{
                    border: isSystemLocationField ? "1px solid #BFDBFE" : "1px solid #E2E8F0",
                    borderRadius: "8px",
                    background: "#ffffff",
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      padding: "0.4rem 1rem",
                      background: isSystemLocationField ? "#EFF6FF" : "#F8FAFC",
                      borderBottom: "1px solid #E2E8F0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Field #{index + 1}
                      </span>
                      {isSystemLocationField ? (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#1D4ED8",
                            background: "#DBEAFE",
                            border: "1px solid #BFDBFE",
                            borderRadius: "999px",
                            padding: "0.15rem 0.55rem",
                          }}
                        >
                          System Field
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      disabled={isSystemLocationField}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: isSystemLocationField ? "#94A3B8" : "#EF4444",
                        cursor: isSystemLocationField ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: "0.2rem",
                        borderRadius: "4px",
                        transition: "background 0.2s",
                      }}
                      title={isSystemLocationField ? "System field cannot be removed" : "Remove Field"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ padding: "1.25rem", display: "grid", gap: "1.25rem", gridTemplateColumns: "1fr 1fr", alignItems: "flex-start" }}>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <HelpCircle size={16} color="#64748B" /> Question Prompt
                      </label>
                      <input
                        style={{ padding: "0.6rem 0.8rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.95rem", width: "100%" }}
                        value={isSystemLocationField ? systemLocationConfig?.question ?? field.question : field.question}
                        onChange={(e) => updateFieldQuestion(index, e.target.value)}
                        placeholder="Example: Corporate Name"
                        disabled={isSystemLocationField}
                        required
                      />
                      {isSystemLocationField ? (
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#1D4ED8" }}>
                          This question is mandatory and managed by the system for Country-State-City dependency.
                        </p>
                      ) : null}
                    </div>

                    <div
                      style={{
                        gridColumn: "1 / -1",
                        border: "1px solid #E2E8F0",
                        borderRadius: "8px",
                        background: "#F8FAFC",
                        padding: "0.9rem 1rem",
                        display: "grid",
                        gap: "0.6rem",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "0.86rem",
                          fontWeight: 600,
                          color: "#334155",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                        }}
                      >
                        <NotebookPen size={15} color="#64748B" />
                        Question Icon
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gap: "0.5rem",
                          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                        }}
                      >
                        {QUESTION_ICON_OPTIONS.map((option) => {
                          const isActive = field.iconKey === option.key;

                          return (
                            <button
                              key={`${field.fieldKey || `${activeServiceId}-${index}`}-${option.key}`}
                              type="button"
                              onClick={() => updateFieldIcon(index, option.key)}
                              disabled={isSystemLocationField}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.38rem",
                                padding: "0.45rem 0.55rem",
                                borderRadius: "8px",
                                border: isActive ? "1px solid #3B82F6" : "1px solid #CBD5E1",
                                background: isActive ? "#EFF6FF" : "#FFFFFF",
                                color: isActive ? "#1D4ED8" : "#475569",
                                fontSize: "0.8rem",
                                fontWeight: isActive ? 700 : 600,
                                cursor: isSystemLocationField ? "not-allowed" : "pointer",
                                opacity: isSystemLocationField ? 0.7 : 1,
                              }}
                              aria-label={`Select ${option.label} icon`}
                            >
                              <option.Icon size={14} />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748B" }}>
                        Selected icon appears beside this question in candidate forms. Choose None to hide icon.
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        {field.fieldType === "text" && <Type size={16} color="#64748B" />}
                        {field.fieldType === "long_text" && <FileText size={16} color="#64748B" />}
                        {field.fieldType === "number" && <Hash size={16} color="#64748B" />}
                        {field.fieldType === "date" && <Calendar size={16} color="#64748B" />}
                        {field.fieldType === "email" && <Mail size={16} color="#64748B" />}
                        {field.fieldType === "file" && <Upload size={16} color="#64748B" />}
                        {field.fieldType === "mobile" && <Phone size={16} color="#64748B" />}
                        Field Type
                      </label>
                      <select
                        style={{ padding: "0.6rem 0.8rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.95rem", width: "100%", backgroundColor: "#fff" }}
                        value={isSystemLocationField ? "dropdown" : field.fieldType}
                        onChange={(e) => updateFieldType(index, e.target.value as ServiceFormFieldType)}
                        disabled={isSystemLocationField}
                      >
                        <option value="text">Short Text</option>
                        <option value="long_text">Long Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="email">Email ID</option>
                        <option value="mobile">Mobile Number</option>
                        <option value="file">File Upload</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="composite">Group/Composite</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
                         <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#334155" }}>Behavior</label>
                         <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.5rem 0.8rem",
                              background: field.required ? "#FEF2F2" : "#F8FAFC",
                              border: field.required ? "1px solid #FECACA" : "1px solid #E2E8F0",
                              borderRadius: "6px",
                              color: field.required ? "#DC2626" : "#64748B",
                              cursor: "pointer",
                              fontWeight: 500,
                              userSelect: "none"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSystemLocationField ? true : Boolean(field.required)}
                              onChange={(e) => updateFieldRequired(index, e.target.checked)}
                              disabled={isSystemLocationField}
                              style={{ accentColor: "#DC2626", width: "1rem", height: "1rem" }}
                            />
                            Must answer
                          </label>
                      </div>

                      <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => addSecondInputInQuestion(index)}
                          disabled={isSystemLocationField}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 0.8rem", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "6px", color: "#047857", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          <Plus size={16} />
                          Add One More Input
                        </button>
                        <button
                          type="button"
                          onClick={() => addFieldForSameQuestion(index)}
                          disabled={isSystemLocationField}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 0.8rem", background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: "6px", color: "#475569", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          <Copy size={16} />
                          Duplicate
                        </button>
                      </div>
                    </div>

                    {!isSystemLocationField &&
                    field.fieldType !== "file" &&
                    field.fieldType !== "composite" ? (
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          border: "1px solid #E2E8F0",
                          borderRadius: "8px",
                          background: "#F8FAFC",
                          padding: "0.85rem 1rem",
                          display: "grid",
                          gap: "0.65rem",
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            color: "#334155",
                            fontSize: "0.86rem",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(field.copyFromPersonalDetailsFieldKey)}
                            disabled={personalDetailsFieldOptions.length === 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const fallbackSourceFieldKey =
                                personalDetailsFieldOptions[0]?.value ?? "";
                              updateFieldCopyFromPersonalDetails(
                                index,
                                checked ? fallbackSourceFieldKey : "",
                              );
                            }}
                            style={{ width: "1rem", height: "1rem" }}
                          />
                          Allow candidate to copy this field from Personal Details
                        </label>

                        {Boolean(field.copyFromPersonalDetailsFieldKey) ? (
                          personalDetailsFieldOptions.length > 0 ? (
                            <div style={{ display: "grid", gap: "0.35rem" }}>
                              <span
                                style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: 600 }}
                              >
                                Personal Details source field
                              </span>
                              <select
                                value={field.copyFromPersonalDetailsFieldKey ?? ""}
                                onChange={(e) =>
                                  updateFieldCopyFromPersonalDetails(index, e.target.value)
                                }
                                style={{
                                  maxWidth: "460px",
                                  padding: "0.5rem 0.7rem",
                                  border: "1px solid #CBD5E1",
                                  borderRadius: "6px",
                                  background: "#FFFFFF",
                                  fontSize: "0.9rem",
                                }}
                              >
                                {personalDetailsFieldOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <p style={{ margin: 0, color: "#B45309", fontSize: "0.82rem" }}>
                              Personal Details fields are not available right now.
                            </p>
                          )
                        ) : null}
                      </div>
                    ) : null}

                    {field.fieldType === "dropdown" && (
                      <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.5rem", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "1rem" }}>
                        <button
                          type="button"
                          onClick={() => toggleDropdownEditor(dropdownEditorKey)}
                          style={{
                            margin: 0,
                            padding: 0,
                            border: "none",
                            background: "none",
                            color: "#334155",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            width: "100%",
                          }}
                          aria-expanded={isDropdownEditorOpen}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <ChevronDown
                              size={14}
                              style={{
                                transform: isDropdownEditorOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                transition: "transform 0.2s ease",
                              }}
                            />
                            Dropdown Options
                          </span>
                          <span style={{ fontSize: "0.78rem", color: "#64748B", fontWeight: 600 }}>
                            {(field.dropdownOptions || []).filter((option) => String(option).trim().length > 0).length} options
                          </span>
                        </button>
                        {isDropdownEditorOpen && (
                          <>
                            {(field.dropdownOptions || []).map((opt, oIdx) => (
                              <div key={oIdx} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                <input
                                  style={{ flex: 1, padding: "0.5rem 0.8rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.9rem" }}
                                  value={opt}
                                  onChange={(e) => updateFieldDropdownOption(index, oIdx, e.target.value)}
                                  placeholder={`Option ${oIdx + 1}`}
                                  disabled={isSystemLocationField}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFieldDropdownOption(index, oIdx)}
                                  disabled={isSystemLocationField}
                                  style={{ padding: "0.4rem", color: isSystemLocationField ? "#94A3B8" : "#DC2626", background: "none", border: "none", cursor: isSystemLocationField ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                  aria-label="Remove option"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addFieldDropdownOption(index)}
                              disabled={isSystemLocationField}
                              style={{ alignSelf: "flex-start", marginTop: "0.5rem", fontSize: "0.85rem", color: isSystemLocationField ? "#94A3B8" : "#2563EB", background: "none", border: "none", cursor: isSystemLocationField ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.2rem", fontWeight: 500 }}
                            >
                              <Plus size={14} /> Add Option
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {field.fieldType === "composite" && (
                      <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "1rem", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "6px", padding: "1rem" }}>
                        <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#166534", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Layers size={16} /> Composite Sub-Fields
                        </h4>
                        <p style={{ margin: 0, fontSize: "0.85rem", color: "#15803D" }}>Group multiple inputs under this single question.</p>
                        
                        {(field.subFields || []).map((subField, sIdx) => (
                          <div key={subField.fieldKey || sIdx} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.8rem", background: "#FFFFFF", border: "1px solid #DCFCE7", borderRadius: "6px" }}>
                            {(() => {
                              const subFieldDropdownEditorKey = `${fieldEditorKey}::sub-${subField.fieldKey?.trim() || sIdx}::dropdown`;
                              const isSubFieldDropdownEditorOpen = Boolean(
                                expandedDropdownEditors[subFieldDropdownEditorKey],
                              );

                              return (
                                <>
                            <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-start" }}>
                              <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>Sub-Field Question (Label)</label>
                                <input
                                  style={{ width: "100%", padding: "0.4rem 0.6rem", border: "1px solid #D1D5DB", borderRadius: "4px", fontSize: "0.85rem" }}
                                  value={subField.question}
                                  onChange={(e) => updateSubField(index, sIdx, sf => ({ ...sf, question: e.target.value }))}
                                  placeholder="e.g. First Name"
                                />
                              </div>
                              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>Type</label>
                                <select
                                  style={{ padding: "0.4rem 0.6rem", border: "1px solid #D1D5DB", borderRadius: "4px", fontSize: "0.85rem", background: "#fff" }}
                                  value={subField.fieldType}
                                  onChange={(e) => {
                                    const nextFieldType = e.target.value as ServiceFormSubField["fieldType"];
                                    updateSubField(index, sIdx, (sf) => ({
                                      ...sf,
                                      fieldType: nextFieldType,
                                      dropdownOptions:
                                        nextFieldType === "dropdown"
                                          ? normalizeDraftDropdownOptions(sf.dropdownOptions)
                                          : [],
                                    }));
                                  }}
                                >
                                  <option value="text">Short Text</option>
                                  <option value="number">Number</option>
                                  <option value="date">Date</option>
                                  <option value="dropdown">Dropdown</option>
                                </select>
                              </div>
                              
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>Required</label>
                                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "32px", cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={subField.required}
                                    onChange={(e) => updateSubField(index, sIdx, sf => ({ ...sf, required: e.target.checked }))}
                                    style={{ accentColor: "#16A34A", width: "1rem", height: "1rem" }}
                                  />
                                </label>
                              </div>
                              
                              <button
                                type="button"
                                onClick={() => removeSubField(index, sIdx)}
                                style={{ marginTop: "1.4rem", padding: "0.4rem", color: "#EF4444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* Subfield dropdown options */}
                            {subField.fieldType === "dropdown" && (
                              <div style={{ marginTop: "0.5rem", paddingLeft: "1rem", borderLeft: "2px solid #E5E7EB", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                <button
                                  type="button"
                                  onClick={() => toggleDropdownEditor(subFieldDropdownEditorKey)}
                                  style={{
                                    margin: 0,
                                    padding: 0,
                                    border: "none",
                                    background: "none",
                                    color: "#4B5563",
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    cursor: "pointer",
                                    width: "100%",
                                  }}
                                  aria-expanded={isSubFieldDropdownEditorOpen}
                                >
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                    <ChevronDown
                                      size={13}
                                      style={{
                                        transform: isSubFieldDropdownEditorOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                        transition: "transform 0.2s ease",
                                      }}
                                    />
                                    Dropdown Options
                                  </span>
                                  <span style={{ fontSize: "0.75rem", color: "#64748B", fontWeight: 600 }}>
                                    {(subField.dropdownOptions || []).filter((option) => String(option).trim().length > 0).length} options
                                  </span>
                                </button>
                                {isSubFieldDropdownEditorOpen && (
                                  <>
                                    {(subField.dropdownOptions || []).map((opt, oIdx) => (
                                      <div key={oIdx} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                                        <input
                                          style={{ flex: 1, padding: "0.3rem 0.5rem", border: "1px solid #D1D5DB", borderRadius: "4px", fontSize: "0.8rem" }}
                                          value={opt}
                                          onChange={(e) => updateSubField(index, sIdx, sf => {
                                            const newOpts = [...(sf.dropdownOptions || [])];
                                            newOpts[oIdx] = e.target.value;
                                            return { ...sf, dropdownOptions: newOpts };
                                          })}
                                          placeholder={`Option ${oIdx + 1}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => updateSubField(index, sIdx, sf => {
                                            const newOpts = [...(sf.dropdownOptions || [])];
                                            newOpts.splice(oIdx, 1);
                                            return { ...sf, dropdownOptions: newOpts };
                                          })}
                                          style={{ color: "#EF4444", background: "none", border: "none", cursor: "pointer" }}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => updateSubField(index, sIdx, sf => ({ ...sf, dropdownOptions: [...(sf.dropdownOptions || []), ""] }))}
                                      style={{ alignSelf: "flex-start", fontSize: "0.8rem", color: "#16A34A", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.2rem", fontWeight: 500 }}
                                    >
                                      <Plus size={12} /> Add Option
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                                </>
                              );
                            })()}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => addSubField(index)}
                          style={{ alignSelf: "flex-start", padding: "0.5rem 0.8rem", background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: "6px", color: "#166534", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}
                        >
                          <Plus size={14} /> Add Sub-Field
                        </button>

                      </div>
                    )}

                    {/* Constraint Toggles Box */}
                    {!isSystemLocationField ? (
                    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "-0.5rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.5rem" }}>
                        
                        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 500, color: "#334155", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(field.allowNotApplicable)}
                              onChange={(e) => updateFieldAllowNotApplicable(index, e.target.checked)}
                              style={{ width: "1rem", height: "1rem" }}
                            />
                            Allow Not Applicable mapping
                          </label>
                          <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748B" }}>
                            Candidate form shows a checkbox with this exact text for this question.
                          </p>
                          {field.allowNotApplicable && (
                            <div style={{ paddingLeft: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ fontSize: "0.85rem", color: "#64748B" }}>Prefill value:</span>
                              <input
                                style={{ padding: "0.3rem 0.6rem", border: "1px solid #CBD5E1", borderRadius: "4px", fontSize: "0.85rem" }}
                                value={field.notApplicableText ?? ""}
                                onChange={(e) => updateFieldNotApplicableText(index, e.target.value)}
                                placeholder="Not Applicable"
                              />
                            </div>
                          )}
                        </div>

                        {supportsLengthConstraints(field.fieldType) && (
                          <div style={{ background: "#FDF4FF", border: "1px solid #FBCFE8", borderRadius: "6px", padding: "0.8rem 1rem", display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#86198F", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <Settings size={14} /> Length constraints
                            </span>
                            
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <label style={{ fontSize: "0.85rem", color: "#701A75" }}>
                                {field.fieldType === "number" ? "Min digits:" : "Min chars:"}
                              </label>
                              <input
                                style={{ width: "60px", padding: "0.3rem 0.5rem", border: "1px solid #F9A8D4", borderRadius: "4px", fontSize: "0.85rem" }}
                                type="number" min={1} step={1}
                                value={field.minLength ?? ""}
                                onChange={(e) => updateFieldMinLength(index, e.target.value)}
                                placeholder="Any"
                              />
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <label style={{ fontSize: "0.85rem", color: "#701A75" }}>
                                {field.fieldType === "number" ? "Max digits:" : "Max chars:"}
                              </label>
                              <input
                                style={{ width: "60px", padding: "0.3rem 0.5rem", border: "1px solid #F9A8D4", borderRadius: "4px", fontSize: "0.85rem" }}
                                type="number" min={1} step={1}
                                value={field.maxLength ?? ""}
                                onChange={(e) => updateFieldMaxLength(index, e.target.value)}
                                placeholder="Any"
                              />
                            </div>

                            {supportsUppercaseConstraint(field.fieldType) ? (
                              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "#701A75", cursor: "pointer", fontWeight: 500 }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(field.forceUppercase)}
                                  onChange={(e) => updateFieldForceUppercase(index, e.target.checked)}
                                  style={{ accentColor: "#D946EF" }}
                                />
                                Force ALL CAPS
                              </label>
                            ) : (
                              <span style={{ fontSize: "0.82rem", color: "#7E22CE" }}>
                                Number fields validate digit count on candidate submit.
                              </span>
                            )}
                          </div>
                        )}

                        {field.fieldType === "date" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#FEF9C3", color: "#854D0E", padding: "0.6rem 1rem", borderRadius: "6px", fontSize: "0.85rem", border: "1px solid #FEF08A" }}>
                            <Info size={16} /> Displays an interactive calendar picker.
                          </div>
                        )}

                        {field.fieldType === "file" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#E0E7FF", color: "#1D4ED8", padding: "0.6rem 1rem", borderRadius: "6px", fontSize: "0.85rem", border: "1px solid #BFDBFE" }}>
                            <Info size={16} /> File Upload: Supports PDF, JPG, PNG up to 5MB.
                          </div>
                        )}

                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>
              );
              })}
            </div>

            {showCandidatePreview ? (
              <div
                style={{
                  border: "1px solid #C7D2FE",
                  borderRadius: "14px",
                  background: "#F8FAFC",
                  padding: "1.1rem",
                  display: "grid",
                  gap: "0.95rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.7rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "0.2rem" }}>
                    <h3 style={{ margin: 0, color: "#1E293B", fontSize: "1rem", fontWeight: 700 }}>
                      Candidate Preview Mode
                    </h3>
                    <p style={{ margin: 0, color: "#64748B", fontSize: "0.83rem" }}>
                      Drag questions to reorder and change width to line fields up in concise rows.
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "0.32rem 0.6rem",
                      borderRadius: "999px",
                      background: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      color: "#047857",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                    }}
                  >
                    Interactive Layout
                  </span>
                </div>

                {candidatePreviewFields.length === 0 ? (
                  <div
                    style={{
                      border: "1px dashed #BFDBFE",
                      borderRadius: "12px",
                      background: "#FFFFFF",
                      padding: "1rem",
                      color: "#475569",
                      fontSize: "0.9rem",
                    }}
                  >
                    Add at least one question to see the candidate preview.
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid #E2E8F0",
                      borderRadius: "14px",
                      background: "#FFFFFF",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                      padding: "1.1rem",
                      display: "grid",
                      gap: "0.95rem",
                    }}
                  >
                    <strong style={{ color: "#0F172A", fontSize: "0.96rem" }}>
                      {selectedService?.name || "Selected Service"}
                    </strong>

                    {allowMultipleEntries ? (
                      <div
                        style={{
                          border: "1px solid #E2E8F0",
                          borderRadius: "12px",
                          background: "#F8FAFC",
                          padding: "0.85rem",
                          display: "grid",
                          gap: "0.65rem",
                        }}
                      >
                        <span style={{ color: "#334155", fontSize: "0.9rem", fontWeight: 700 }}>
                          {candidatePreviewEntryLabel}: {candidatePreviewEntryCount}
                        </span>
                        <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                          <span
                            style={{
                              padding: "0.38rem 0.68rem",
                              borderRadius: "999px",
                              background: "#E0F2FE",
                              border: "1px solid #BAE6FD",
                              color: "#0C4A6E",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                            }}
                          >
                            {candidatePreviewEntryLabel}
                          </span>
                          <button
                            type="button"
                            disabled
                            style={{
                              padding: "0.45rem 0.78rem",
                              borderRadius: "8px",
                              background: "#EFF6FF",
                              color: "#2563EB",
                              border: "1px solid #BFDBFE",
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              opacity: 0.7,
                              cursor: "not-allowed",
                            }}
                          >
                            + Add another {candidatePreviewEntryLabel.toLowerCase()}
                          </button>
                          <button
                            type="button"
                            disabled
                            style={{
                              padding: "0.45rem 0.78rem",
                              borderRadius: "8px",
                              background: "#FEF2F2",
                              color: "#DC2626",
                              border: "1px solid #FECACA",
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              opacity: 0.7,
                              cursor: "not-allowed",
                            }}
                          >
                            Remove last entry
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {Array.from({ length: candidatePreviewEntryCount }).map((_, serviceEntryIndex) => (
                      <div
                        key={`preview-entry-${serviceEntryIndex}`}
                        style={{
                          border: "1px solid #E2E8F0",
                          borderRadius: "12px",
                          background: "#F8FAFC",
                          padding: "0.95rem",
                          display: "grid",
                          gap: "0.9rem",
                        }}
                      >
                        {allowMultipleEntries ? (
                          <strong
                            style={{
                              fontSize: "0.94rem",
                              color: "#1E293B",
                              fontWeight: 700,
                              borderBottom: "2px solid #E2E8F0",
                              paddingBottom: "0.45rem",
                            }}
                          >
                            Entry {serviceEntryIndex + 1}
                          </strong>
                        ) : null}

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: "0.75rem" }}>
                          {candidatePreviewFields.map((field, previewIndex) => {
                            if (allowMultipleEntries && field.fieldType === "file" && serviceEntryIndex > 0) {
                              return null;
                            }

                            const fieldRowKey = `${field.fieldKey}-${previewIndex}-${serviceEntryIndex}`;
                            const width = getPreviewFieldWidth(field);
                            const gridSpan = getPreviewGridColumnSpan(width);
                            const notApplicableLabel = field.notApplicableText.trim() || "Not Applicable";
                            const questionRepeatable =
                              field.repeatable && !allowMultipleEntries && field.fieldType !== "file";
                            const personalDetailsSourceLabel =
                              personalDetailsFieldOptions.find(
                                (option) => option.value === field.copyFromPersonalDetailsFieldKey,
                              )?.label || field.copyFromPersonalDetailsFieldKey;
                            const constraintHint = getPreviewConstraintHint(field);
                            const inputType =
                              field.fieldType === "number"
                                ? "number"
                                : field.fieldType === "date"
                                  ? "date"
                                  : field.fieldType === "email"
                                    ? "email"
                                  : "text";
                            const isDropdownField = field.fieldType === "dropdown";
                            const isMobileField = field.fieldType === "mobile";
                            const isPrimaryCard = field.isPrimaryForSource;
                            const canMoveUp = isPrimaryCard && field.sourceFieldIndex > 0;
                            const canMoveDown =
                              isPrimaryCard && field.sourceFieldIndex < fields.length - 1;
                            const isDropTarget =
                              isPrimaryCard &&
                              dropPreviewSourceIndex === field.sourceFieldIndex &&
                              draggedPreviewSourceIndex !== null &&
                              draggedPreviewSourceIndex !== field.sourceFieldIndex;

                            return (
                              <div
                                key={fieldRowKey}
                                draggable={isPrimaryCard}
                                onDragStart={() => {
                                  if (!isPrimaryCard) {
                                    return;
                                  }

                                  setDraggedPreviewSourceIndex(field.sourceFieldIndex);
                                  setDropPreviewSourceIndex(field.sourceFieldIndex);
                                }}
                                onDragOver={(event) => {
                                  if (!isPrimaryCard || draggedPreviewSourceIndex === null) {
                                    return;
                                  }

                                  event.preventDefault();
                                  if (draggedPreviewSourceIndex !== field.sourceFieldIndex) {
                                    setDropPreviewSourceIndex(field.sourceFieldIndex);
                                  }
                                }}
                                onDrop={(event) => {
                                  if (!isPrimaryCard) {
                                    return;
                                  }

                                  event.preventDefault();
                                  if (
                                    draggedPreviewSourceIndex !== null &&
                                    draggedPreviewSourceIndex !== field.sourceFieldIndex
                                  ) {
                                    moveField(draggedPreviewSourceIndex, field.sourceFieldIndex);
                                  }
                                  clearPreviewDragState();
                                }}
                                onDragEnd={clearPreviewDragState}
                                style={{
                                  gridColumn: `span ${gridSpan}`,
                                  border: `1px solid ${isDropTarget ? "#60A5FA" : "#DDE5F2"}`,
                                  borderRadius: "11px",
                                  background: isDropTarget ? "#EFF6FF" : "#FFFFFF",
                                  padding: "0.75rem",
                                  display: "grid",
                                  gap: "0.42rem",
                                  boxShadow: isDropTarget
                                    ? "0 0 0 2px rgba(59, 130, 246, 0.14)"
                                    : "0 1px 3px rgba(15, 23, 42, 0.04)",
                                  cursor: isPrimaryCard ? "grab" : "default",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "0.5rem",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                    {isPrimaryCard ? <GripVertical size={14} color="#64748B" /> : null}
                                    <span style={{ fontSize: "0.74rem", color: "#475569", fontWeight: 700 }}>
                                      Question {field.sourceFieldIndex + 1}
                                    </span>
                                    {field.sourceFieldType === "composite" ? (
                                      <span
                                        style={{
                                          fontSize: "0.7rem",
                                          color: "#166534",
                                          background: "#DCFCE7",
                                          border: "1px solid #BBF7D0",
                                          borderRadius: "999px",
                                          padding: "0.08rem 0.4rem",
                                          fontWeight: 700,
                                        }}
                                      >
                                        Composite
                                      </span>
                                    ) : null}
                                  </div>
                                  {isPrimaryCard ? (
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.28rem", flexWrap: "wrap" }}>
                                      <button
                                        type="button"
                                        onClick={() => moveField(field.sourceFieldIndex, field.sourceFieldIndex - 1)}
                                        disabled={!canMoveUp}
                                        style={{
                                          border: "1px solid #CBD5E1",
                                          borderRadius: "6px",
                                          background: "#F8FAFC",
                                          color: canMoveUp ? "#334155" : "#94A3B8",
                                          width: "28px",
                                          height: "28px",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          cursor: canMoveUp ? "pointer" : "not-allowed",
                                        }}
                                        aria-label="Move question up"
                                      >
                                        <ArrowUp size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveField(field.sourceFieldIndex, field.sourceFieldIndex + 1)}
                                        disabled={!canMoveDown}
                                        style={{
                                          border: "1px solid #CBD5E1",
                                          borderRadius: "6px",
                                          background: "#F8FAFC",
                                          color: canMoveDown ? "#334155" : "#94A3B8",
                                          width: "28px",
                                          height: "28px",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          cursor: canMoveDown ? "pointer" : "not-allowed",
                                        }}
                                        aria-label="Move question down"
                                      >
                                        <ArrowDown size={14} />
                                      </button>
                                      {([
                                        ["full", "1/1"],
                                        ["half", "1/2"],
                                        ["third", "1/3"],
                                      ] as Array<[PreviewFieldWidth, string]>).map(([sizeOption, label]) => {
                                        const isActive = width === sizeOption;

                                        return (
                                          <button
                                            key={`${fieldRowKey}-${sizeOption}`}
                                            type="button"
                                            onClick={() => setPreviewFieldWidth(field, sizeOption)}
                                            style={{
                                              border: isActive ? "1px solid #3B82F6" : "1px solid #CBD5E1",
                                              borderRadius: "6px",
                                              background: isActive ? "#EFF6FF" : "#FFFFFF",
                                              color: isActive ? "#1D4ED8" : "#475569",
                                              minWidth: "38px",
                                              height: "28px",
                                              padding: "0 0.35rem",
                                              fontSize: "0.72rem",
                                              fontWeight: 700,
                                              cursor: "pointer",
                                            }}
                                            title={`Set width ${label}`}
                                          >
                                            {label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: "0.72rem", color: "#64748B", fontWeight: 600 }}>
                                      Uses parent layout
                                    </span>
                                  )}
                                </div>

                                <label className="label">{renderPreviewQuestionPrompt(field)}</label>

                                {field.allowNotApplicable ? (
                                  <label
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "0.4rem",
                                      color: "#4A5E79",
                                      fontSize: "0.82rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    <input type="checkbox" disabled />
                                    {notApplicableLabel}
                                  </label>
                                ) : null}

                                {field.copyFromPersonalDetailsFieldKey ? (
                                  <p style={{ margin: 0, color: "#64748B", fontSize: "0.79rem" }}>
                                    Copy option from Personal Details: {personalDetailsSourceLabel}
                                  </p>
                                ) : null}

                                {field.repeatable && allowMultipleEntries ? (
                                  <p style={{ margin: 0, color: "#15803D", fontSize: "0.8rem", fontWeight: 600 }}>
                                    Specific-question multiple entries is enabled in Service Builder.
                                  </p>
                                ) : null}

                                {field.fieldType === "file" ? (
                                  <>
                                    <input
                                      className="input"
                                      type="file"
                                      disabled
                                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                    />
                                    <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                      PDF, JPG, PNG only. Maximum size 5MB.
                                    </p>
                                    {allowMultipleEntries ? (
                                      <p style={{ margin: 0, color: "#6C757D", fontSize: "0.8rem" }}>
                                        This uploaded file is shared across all whole-service entries.
                                      </p>
                                    ) : null}
                                  </>
                                ) : questionRepeatable ? (
                                  <>
                                    {[0, 1].map((repeatIndex) => (
                                      <div
                                        key={`${fieldRowKey}-repeat-${repeatIndex}`}
                                        style={{
                                          border: "1px solid #DEE2E6",
                                          borderRadius: "10px",
                                          background: "#FFFFFF",
                                          padding: "0.52rem",
                                          display: "grid",
                                          gap: "0.35rem",
                                        }}
                                      >
                                        {field.fieldType === "long_text" ? (
                                          <textarea
                                            className="input"
                                            rows={4}
                                            disabled
                                            placeholder={`Entry ${repeatIndex + 1}`}
                                            style={{ minHeight: "108px", resize: "vertical" }}
                                          />
                                        ) : isDropdownField ? (
                                          <select className="input" disabled defaultValue="">
                                            <option value="">Select</option>
                                            {field.dropdownOptions.map((option, optionIndex) => (
                                              <option
                                                key={`${fieldRowKey}-repeat-option-${repeatIndex}-${optionIndex}`}
                                                value={option}
                                              >
                                                {option}
                                              </option>
                                            ))}
                                          </select>
                                        ) : isMobileField ? (
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "minmax(120px, 0.9fr) minmax(0, 1fr)",
                                              gap: "0.45rem",
                                            }}
                                          >
                                            <select className="input" disabled defaultValue="+91">
                                              {PREVIEW_MOBILE_CODE_OPTIONS.map((codeOption) => (
                                                <option
                                                  key={`${fieldRowKey}-repeat-mobile-code-${repeatIndex}-${codeOption}`}
                                                  value={codeOption}
                                                >
                                                  {codeOption}
                                                </option>
                                              ))}
                                            </select>
                                            <input className="input" type="tel" disabled placeholder="Mobile number" />
                                          </div>
                                        ) : (
                                          <input className="input" type={inputType} disabled />
                                        )}
                                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                          <button
                                            type="button"
                                            disabled
                                            style={{
                                              padding: "0.35rem 0.65rem",
                                              fontSize: "0.8rem",
                                              border: "1px solid #CBD5E1",
                                              borderRadius: "6px",
                                              background: "#F8FAFC",
                                              color: "#64748B",
                                              opacity: 0.7,
                                              cursor: "not-allowed",
                                            }}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      disabled
                                      style={{
                                        justifySelf: "start",
                                        padding: "0.35rem 0.7rem",
                                        fontSize: "0.82rem",
                                        border: "1px solid #CBD5E1",
                                        borderRadius: "6px",
                                        background: "#F8FAFC",
                                        color: "#475569",
                                        opacity: 0.7,
                                        cursor: "not-allowed",
                                      }}
                                    >
                                      + Add another entry
                                    </button>
                                  </>
                                ) : field.fieldType === "long_text" ? (
                                  <textarea
                                    className="input"
                                    rows={5}
                                    disabled
                                    style={{ minHeight: "120px", resize: "vertical" }}
                                  />
                                ) : isDropdownField ? (
                                  <select className="input" disabled defaultValue="">
                                    <option value="">Select</option>
                                    {field.dropdownOptions.map((option, optionIndex) => (
                                      <option key={`${fieldRowKey}-option-${optionIndex}`} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                ) : isMobileField ? (
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "minmax(120px, 0.9fr) minmax(0, 1fr)",
                                      gap: "0.45rem",
                                    }}
                                  >
                                    <select className="input" disabled defaultValue="+91">
                                      {PREVIEW_MOBILE_CODE_OPTIONS.map((codeOption) => (
                                        <option key={`${fieldRowKey}-mobile-code-${codeOption}`} value={codeOption}>
                                          {codeOption}
                                        </option>
                                      ))}
                                    </select>
                                    <input className="input" type="tel" disabled placeholder="Mobile number" />
                                  </div>
                                ) : (
                                  <input className="input" type={inputType} disabled />
                                )}

                                {field.fieldType === "date" ? (
                                  <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                    Pick a date from the calendar.
                                  </p>
                                ) : null}

                                {questionRepeatable ? (
                                  <p style={{ margin: 0, color: "#15803D", fontSize: "0.8rem", fontWeight: 600 }}>
                                    Candidate can add multiple entries for this question.
                                  </p>
                                ) : null}

                                {constraintHint ? (
                                  <p style={{ margin: 0, color: "#6C757D", fontSize: "0.82rem" }}>
                                    {constraintHint}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", borderTop: "1px solid #E2E8F0", paddingTop: "1.5rem", marginTop: "0.5rem" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  color: "#334155",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={saveCandidateLayoutSnapshot}
                  onChange={(e) => setSaveCandidateLayoutSnapshot(e.target.checked)}
                />
                Save and mirror this layout to candidate portal forms
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <button
                  type="button"
                  onClick={addField}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1", padding: "0.75rem 1.25rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                >
                  <Plus size={18} /> Add Field
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#2563EB", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", opacity: saving ? 0.7 : 1 }}
                >
                  <Save size={18} />
                  {saving
                    ? "Saving Changes..."
                    : saveCandidateLayoutSnapshot
                      ? "Save Configuration + Mirror"
                      : "Save Configuration"}
                </button>
              </div>

              {message && (
                <div style={{ padding: "0.8rem 1rem", borderRadius: "6px", border: "1px solid", display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.95rem", fontWeight: 500,
                  ...(message.toLowerCase().includes("updated") ? { background: "#F0FDF4", color: "#166534", borderColor: "#BBF7D0" } : { background: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" })
                }}>
                  <Info size={18} />
                  {message}
                </div>
              )}
            </div>

          </form>
        )}
      </div>
    </section>
  );
}
