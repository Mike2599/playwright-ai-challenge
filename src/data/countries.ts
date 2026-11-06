/** Reglas de formato por país para validar lo que genera la IA (no son datos de prueba). */
export interface CountryRules {
  code: string;
  name: string;
  dialCode: string;
  postalCodeFormat: string;
  postalCode: RegExp;
}

export const COUNTRIES = {
  CO: { code: 'CO', name: 'Colombia', dialCode: '+57', postalCodeFormat: '6 dígitos (p. ej. código DANE postal de la ciudad)', postalCode: /^\d{6}$/ },
  MX: { code: 'MX', name: 'México', dialCode: '+52', postalCodeFormat: '5 dígitos', postalCode: /^\d{5}$/ },
  ES: { code: 'ES', name: 'España', dialCode: '+34', postalCodeFormat: '5 dígitos; los dos primeros son la provincia (01-52)', postalCode: /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/ },
  US: { code: 'US', name: 'Estados Unidos', dialCode: '+1', postalCodeFormat: 'ZIP de 5 dígitos o ZIP+4 (12345-6789)', postalCode: /^\d{5}(-\d{4})?$/ },
  BR: { code: 'BR', name: 'Brasil', dialCode: '+55', postalCodeFormat: 'CEP de 8 dígitos con guion (12345-678)', postalCode: /^\d{5}-\d{3}$/ },
  CA: { code: 'CA', name: 'Canadá', dialCode: '+1', postalCodeFormat: 'A1A 1A1 (letra, dígito, letra, espacio, dígito, letra, dígito)', postalCode: /^[A-Z]\d[A-Z] \d[A-Z]\d$/ },
} as const satisfies Record<string, CountryRules>;

export type CountryCode = keyof typeof COUNTRIES;
export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];
