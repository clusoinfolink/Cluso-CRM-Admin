import { City, Country, State } from "country-state-city";

export const SERVICE_COUNTRY_FIELD_KEY = "system_service_country";
export const SERVICE_STATE_FIELD_KEY = "system_service_state";
export const SERVICE_CITY_FIELD_KEY = "system_service_city";

export const SERVICE_COUNTRY_FIELD_QUESTION = "Country";
export const SERVICE_STATE_FIELD_QUESTION = "State";
export const SERVICE_CITY_FIELD_QUESTION = "City";

export const SERVICE_STATE_PLACEHOLDER_OPTION = "Select country first";
export const SERVICE_CITY_PLACEHOLDER_OPTION = "Select state first";

type CountryRecord = {
  isoCode: string;
  name: string;
};

type StateRecord = {
  isoCode: string;
  name: string;
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

const COUNTRY_RECORDS: CountryRecord[] = Country.getAllCountries().map((country) => ({
  isoCode: country.isoCode,
  name: country.name,
}));

const COUNTRY_OPTIONS = dedupeAndSortOptions(COUNTRY_RECORDS.map((country) => country.name));

const COUNTRY_BY_NAME = new Map(
  COUNTRY_RECORDS.map((country) => [normalizeLocationName(country.name), country]),
);

const STATES_BY_COUNTRY_CACHE = new Map<string, StateRecord[]>();
const CITIES_BY_COUNTRY_STATE_CACHE = new Map<string, string[]>();

function resolveCountry(countryName: unknown): CountryRecord | null {
  const normalizedCountryName = normalizeLocationName(countryName);
  if (!normalizedCountryName) {
    return null;
  }

  return COUNTRY_BY_NAME.get(normalizedCountryName) ?? null;
}

function resolveStatesForCountry(countryName: unknown) {
  const country = resolveCountry(countryName);
  if (!country) {
    return [] as StateRecord[];
  }

  const normalizedCountryName = normalizeLocationName(country.name);
  const cachedStates = STATES_BY_COUNTRY_CACHE.get(normalizedCountryName);
  if (cachedStates) {
    return cachedStates;
  }

  const stateRecords = State.getStatesOfCountry(country.isoCode).map((state) => ({
    isoCode: state.isoCode,
    name: state.name,
  }));

  STATES_BY_COUNTRY_CACHE.set(normalizedCountryName, stateRecords);
  return stateRecords;
}

function resolveState(countryName: unknown, stateName: unknown): StateRecord | null {
  const normalizedStateName = normalizeLocationName(stateName);
  if (!normalizedStateName) {
    return null;
  }

  const states = resolveStatesForCountry(countryName);
  if (states.length === 0) {
    return null;
  }

  return (
    states.find((state) => normalizeLocationName(state.name) === normalizedStateName) ??
    null
  );
}

export function getAllCountryOptions() {
  return [...COUNTRY_OPTIONS];
}

export function getStateOptionsByCountry(countryName: unknown) {
  const states = resolveStatesForCountry(countryName);
  if (states.length === 0) {
    return [] as string[];
  }

  return dedupeAndSortOptions(states.map((state) => state.name));
}

export function getCityOptionsByCountryAndState(
  countryName: unknown,
  stateName: unknown,
) {
  const country = resolveCountry(countryName);
  const state = resolveState(countryName, stateName);

  if (!country || !state) {
    return [] as string[];
  }

  const cacheKey = `${normalizeLocationName(country.name)}::${normalizeLocationName(state.name)}`;
  const cachedOptions = CITIES_BY_COUNTRY_STATE_CACHE.get(cacheKey);
  if (cachedOptions) {
    return [...cachedOptions];
  }

  const cityOptions = dedupeAndSortOptions(
    City.getCitiesOfState(country.isoCode, state.isoCode).map((city) => city.name),
  );

  CITIES_BY_COUNTRY_STATE_CACHE.set(cacheKey, cityOptions);
  return [...cityOptions];
}

export function isValidStateForCountry(countryName: unknown, stateName: unknown) {
  return Boolean(resolveState(countryName, stateName));
}

export function isValidCityForCountryAndState(
  countryName: unknown,
  stateName: unknown,
  cityName: unknown,
) {
  const normalizedCityName = normalizeLocationName(cityName);
  if (!normalizedCityName) {
    return false;
  }

  return getCityOptionsByCountryAndState(countryName, stateName).some(
    (city) => normalizeLocationName(city) === normalizedCityName,
  );
}

export type SystemLocationFieldType = "country" | "state" | "city";

export function resolveSystemLocationFieldType(
  rawFieldKey: unknown,
): SystemLocationFieldType | null {
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

export function getSystemLocationFieldConfig(locationType: SystemLocationFieldType) {
  if (locationType === "country") {
    return {
      fieldKey: SERVICE_COUNTRY_FIELD_KEY,
      question: SERVICE_COUNTRY_FIELD_QUESTION,
      iconKey: "global",
      dropdownOptions: getAllCountryOptions(),
      previewWidth: "third" as const,
    };
  }

  if (locationType === "state") {
    return {
      fieldKey: SERVICE_STATE_FIELD_KEY,
      question: SERVICE_STATE_FIELD_QUESTION,
      iconKey: "location",
      dropdownOptions: [SERVICE_STATE_PLACEHOLDER_OPTION],
      previewWidth: "third" as const,
    };
  }

  return {
    fieldKey: SERVICE_CITY_FIELD_KEY,
    question: SERVICE_CITY_FIELD_QUESTION,
    iconKey: "location",
    dropdownOptions: [SERVICE_CITY_PLACEHOLDER_OPTION],
    previewWidth: "third" as const,
  };
}
