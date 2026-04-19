import { Country } from "country-state-city";

export const SERVICE_COUNTRY_FIELD_KEY = "system_service_country";
export const SERVICE_STATE_FIELD_KEY = "system_service_state";
export const SERVICE_CITY_FIELD_KEY = "system_service_city";

export const SERVICE_COUNTRY_FIELD_QUESTION = "Country";
export const SERVICE_STATE_FIELD_QUESTION = "State";
export const SERVICE_CITY_FIELD_QUESTION = "City";

export const SERVICE_STATE_PLACEHOLDER_OPTION = "Select country first";
export const SERVICE_CITY_PLACEHOLDER_OPTION = "Select state first";

type SystemLocationFieldType = "country" | "state" | "city";

export type SystemLocationFieldConfig = {
  fieldKey: string;
  question: string;
  iconKey: "global" | "location";
  dropdownOptions: string[];
  previewWidth: "third";
};

function normalizeLocationName(rawValue: unknown) {
  return String(rawValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupeAndSortOptions(rawOptions: string[]) {
  return [...new Set(rawOptions.map((option) => option.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

const COUNTRY_OPTIONS = dedupeAndSortOptions(
  Country.getAllCountries().map((country) => country.name),
);

export function getAllCountryOptions() {
  return [...COUNTRY_OPTIONS];
}

export function resolveSystemLocationFieldType(rawFieldKey: unknown): SystemLocationFieldType | null {
  const normalizedFieldKey = normalizeLocationName(rawFieldKey);
  if (normalizedFieldKey === SERVICE_COUNTRY_FIELD_KEY) {
    return "country";
  }

  if (normalizedFieldKey === SERVICE_STATE_FIELD_KEY) {
    return "state";
  }

  if (normalizedFieldKey === SERVICE_CITY_FIELD_KEY) {
    return "city";
  }

  return null;
}

export function getSystemLocationFieldConfig(
  locationType: SystemLocationFieldType,
): SystemLocationFieldConfig {
  if (locationType === "country") {
    return {
      fieldKey: SERVICE_COUNTRY_FIELD_KEY,
      question: SERVICE_COUNTRY_FIELD_QUESTION,
      iconKey: "global",
      dropdownOptions: getAllCountryOptions(),
      previewWidth: "third",
    };
  }

  if (locationType === "state") {
    return {
      fieldKey: SERVICE_STATE_FIELD_KEY,
      question: SERVICE_STATE_FIELD_QUESTION,
      iconKey: "location",
      dropdownOptions: [SERVICE_STATE_PLACEHOLDER_OPTION],
      previewWidth: "third",
    };
  }

  return {
    fieldKey: SERVICE_CITY_FIELD_KEY,
    question: SERVICE_CITY_FIELD_QUESTION,
    iconKey: "location",
    dropdownOptions: [SERVICE_CITY_PLACEHOLDER_OPTION],
    previewWidth: "third",
  };
}
