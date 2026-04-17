"use client";

import { FormEvent, useMemo, useState } from "react";
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
const SYSTEM_SERVICE_COUNTRY_FIELD_KEY = "system_service_country";
const SYSTEM_SERVICE_COUNTRY_FIELD_QUESTION =
  "Select verification country for this service";
const SYSTEM_SERVICE_COUNTRY_DEFAULT_OPTIONS = [
  "Afghanistan",
  "Armenia",
  "Australia",
  "Azerbaijan",
  "Bangladesh",
  "Bhutan",
  "Brunei",
  "Cambodia",
  "China",
  "Fiji",
  "Georgia",
  "Hong Kong",
  "India",
  "Indonesia",
  "Japan",
  "Kazakhstan",
  "Kiribati",
  "Kyrgyzstan",
  "Laos",
  "Macau",
  "Malaysia",
  "Maldives",
  "Marshall Islands",
  "Micronesia",
  "Mongolia",
  "Myanmar",
  "Nauru",
  "Nepal",
  "New Zealand",
  "Pakistan",
  "Palau",
  "Papua New Guinea",
  "Philippines",
  "Samoa",
  "Singapore",
  "Solomon Islands",
  "South Korea",
  "Sri Lanka",
  "Taiwan",
  "Tajikistan",
  "Thailand",
  "Timor-Leste",
  "Tonga",
  "Turkmenistan",
  "Tuvalu",
  "Uzbekistan",
  "Vanuatu",
  "Vietnam",
  "United Arab Emirates",
  "United States",
  "United Kingdom",
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
  return fieldType === "text" || fieldType === "long_text" || fieldType === "number";
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

  return rawOptions.map((option) => String(option ?? "").trim());
}

function sanitizeDropdownOptions(rawOptions: unknown) {
  return [...new Set(normalizeDraftDropdownOptions(rawOptions).filter(Boolean))];
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
      question: typeof subField.question === "string" ? subField.question.trim() : "",
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

function isSystemServiceCountryField(field: ServiceFormField) {
  return field.fieldKey?.trim() === SYSTEM_SERVICE_COUNTRY_FIELD_KEY;
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

  const fields: ServiceFormField[] = (drafts[activeServiceId] ?? selectedService?.formFields ?? []).map((field) => ({
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
  }));

  const multipleEntriesLabel = activeServiceId
    ? serviceEntryLabelDrafts[activeServiceId] ?? selectedService?.multipleEntriesLabel
    : "";

  const allowMultipleEntries = activeServiceId
    ? serviceEntryModeDrafts[activeServiceId] ?? Boolean(selectedService?.allowMultipleEntries)
    : false;

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

    if (isSystemServiceCountryField(fields[index])) {
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

    if (isSystemServiceCountryField(fields[index])) {
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
          ? isSystemServiceCountryField(item)
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
          ? isSystemServiceCountryField(item)
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
              ...(isSystemServiceCountryField(item) ? item : {
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

        if (isSystemServiceCountryField(item)) {
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

        if (isSystemServiceCountryField(item)) {
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

        if (isSystemServiceCountryField(item)) {
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
          ? isSystemServiceCountryField(item)
            ? item
            : { ...item, required }
          : item,
      ),
    }));
  }

  function updateFieldRepeatable(index: number, repeatable: boolean) {
    if (!activeServiceId) {
      return;
    }

    setDrafts((prev) => ({
      ...prev,
      [activeServiceId]: fields.map((item, idx) =>
        idx === index
          ? {
              ...item,
              repeatable: supportsRepeatable(item.fieldType) ? repeatable : false,
            }
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
          isSystemServiceCountryField(item) ||
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

    if (isSystemServiceCountryField(fields[index])) {
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

    const cleaned = fields.map((item) => {
      if (isSystemServiceCountryField(item)) {
        const dropdownOptions = sanitizeDropdownOptions(item.dropdownOptions);

        return {
          fieldKey: SYSTEM_SERVICE_COUNTRY_FIELD_KEY,
          question: SYSTEM_SERVICE_COUNTRY_FIELD_QUESTION,
          iconKey: "global",
          fieldType: "dropdown" as const,
          subFields: [],
          dropdownOptions:
            dropdownOptions.length > 0
              ? dropdownOptions
              : [...SYSTEM_SERVICE_COUNTRY_DEFAULT_OPTIONS],
          required: true,
          repeatable: false,
          minLength: null,
          maxLength: null,
          forceUppercase: false,
          allowNotApplicable: false,
          notApplicableText: "",
          copyFromPersonalDetailsFieldKey: "",
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

    const res = await fetch("/api/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: activeServiceId,
        allowMultipleEntries,
        multipleEntriesLabel: normalizedMultipleEntriesLabel,
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
    setServiceEntryModeDrafts((prev) => ({
      ...prev,
      [activeServiceId]: allowMultipleEntries,
    }));
    setMessage(data.message ?? "Service form updated.");
    await onSaved();
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

              <div style={{ display: "grid", gap: "1rem" }}>
                {fields.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem", background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: "8px", color: "#94A3B8" }}>
                    <ClipboardList size={32} style={{ marginBottom: "0.5rem" }} />
                    <span>No fields yet. Click Add Field to start this service form.</span>
                  </div>
                )}

                {fields.map((field, index) => {
                const isSystemCountryField = isSystemServiceCountryField(field);
                const fieldEditorKey = `${activeServiceId}::${field.fieldKey?.trim() || `field-${index}`}`;
                const dropdownEditorKey = `${fieldEditorKey}::dropdown`;
                const isDropdownEditorOpen = Boolean(expandedDropdownEditors[dropdownEditorKey]);

                return (
                <div
                  key={field.fieldKey || `${activeServiceId}-${index}`}
                  style={{
                    border: isSystemCountryField ? "1px solid #BFDBFE" : "1px solid #E2E8F0",
                    borderRadius: "8px",
                    background: "#ffffff",
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      padding: "0.4rem 1rem",
                      background: isSystemCountryField ? "#EFF6FF" : "#F8FAFC",
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
                      {isSystemCountryField ? (
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
                      disabled={isSystemCountryField}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: isSystemCountryField ? "#94A3B8" : "#EF4444",
                        cursor: isSystemCountryField ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: "0.2rem",
                        borderRadius: "4px",
                        transition: "background 0.2s",
                      }}
                      title={isSystemCountryField ? "System field cannot be removed" : "Remove Field"}
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
                        value={isSystemCountryField ? SYSTEM_SERVICE_COUNTRY_FIELD_QUESTION : field.question}
                        onChange={(e) => updateFieldQuestion(index, e.target.value)}
                        placeholder="Example: Corporate Name"
                        disabled={isSystemCountryField}
                        required
                      />
                      {isSystemCountryField ? (
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#1D4ED8" }}>
                          This question is mandatory and managed by the system to map country-based pricing.
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
                              disabled={isSystemCountryField}
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
                                cursor: isSystemCountryField ? "not-allowed" : "pointer",
                                opacity: isSystemCountryField ? 0.7 : 1,
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
                        {field.fieldType === "file" && <Upload size={16} color="#64748B" />}
                        Field Type
                      </label>
                      <select
                        style={{ padding: "0.6rem 0.8rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.95rem", width: "100%", backgroundColor: "#fff" }}
                        value={isSystemCountryField ? "dropdown" : field.fieldType}
                        onChange={(e) => updateFieldType(index, e.target.value as ServiceFormFieldType)}
                        disabled={isSystemCountryField}
                      >
                        <option value="text">Short Text</option>
                        <option value="long_text">Long Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
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
                              checked={isSystemCountryField ? true : Boolean(field.required)}
                              onChange={(e) => updateFieldRequired(index, e.target.checked)}
                              disabled={isSystemCountryField}
                              style={{ accentColor: "#DC2626", width: "1rem", height: "1rem" }}
                            />
                            Must answer
                          </label>
                      </div>

                      <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => addSecondInputInQuestion(index)}
                          disabled={isSystemCountryField}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 0.8rem", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "6px", color: "#047857", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          <Plus size={16} />
                          Add One More Input
                        </button>
                        <button
                          type="button"
                          onClick={() => addFieldForSameQuestion(index)}
                          disabled={isSystemCountryField}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 0.8rem", background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: "6px", color: "#475569", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          <Copy size={16} />
                          Duplicate
                        </button>
                      </div>
                    </div>

                    {!isSystemCountryField &&
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
                                  disabled={isSystemCountryField}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFieldDropdownOption(index, oIdx)}
                                  disabled={isSystemCountryField}
                                  style={{ padding: "0.4rem", color: isSystemCountryField ? "#94A3B8" : "#DC2626", background: "none", border: "none", cursor: isSystemCountryField ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                  aria-label="Remove option"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addFieldDropdownOption(index)}
                              disabled={isSystemCountryField}
                              style={{ alignSelf: "flex-start", marginTop: "0.5rem", fontSize: "0.85rem", color: isSystemCountryField ? "#94A3B8" : "#2563EB", background: "none", border: "none", cursor: isSystemCountryField ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.2rem", fontWeight: 500 }}
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
                    {!isSystemCountryField ? (
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

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", borderTop: "1px solid #E2E8F0", paddingTop: "1.5rem", marginTop: "0.5rem" }}>
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
                  <Save size={18} /> {saving ? "Saving Changes..." : "Save Configuration"}
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
