export const AUDIENCE_COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "BR", name: "Brazil" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "ZA", name: "South Africa" },
  { code: "NP", name: "Nepal" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
] as const;

export function countryName(code: string | null | undefined): string {
  if (!code) return "Not specified";
  return AUDIENCE_COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code.toUpperCase();
}
