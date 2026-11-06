import { randomInt, randomUUID } from 'node:crypto';
import { test } from '@playwright/test';
import { z } from 'zod';
import type { AIClient } from '../ai/AIClient';
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from './countries';

const personName = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[\p{L}][\p{L}' .-]*$/u, 'solo letras, espacios, apóstrofo o guion');

function customerSchema(countryCode: CountryCode) {
  const country = COUNTRIES[countryCode];
  return z.object({
    firstName: personName,
    lastName: personName,
    email: z.string().trim().email(),
    phone: z
      .string()
      .trim()
      .refine((phone) => phone.startsWith(country.dialCode), `debe empezar por el indicativo ${country.dialCode}`)
      .refine((phone) => phone.replace(/\D/g, '').length >= 10, 'debe tener al menos 10 dígitos'),
    country: z.literal(country.code),
    city: z.string().trim().min(2),
    address: z.string().trim().min(5),
    postalCode: z.string().trim().regex(country.postalCode, `código postal inválido para ${country.name}: ${country.postalCodeFormat}`),
    deliveryInstructions: z.string().trim().min(10).max(200),
  });
}

export type CustomerProfile = z.infer<ReturnType<typeof customerSchema>>;

export interface CustomerRequest {
  /** País objetivo. Si se omite se elige uno al azar. */
  country?: CountryCode;
  /** Perfil o escenario de negocio: "cliente corporativo", "regalo de cumpleaños"... */
  scenario?: string;
  /** Nombres que ya se usaron y no deben repetirse. */
  exclude?: string[];
}

const AGE_RANGES = ['18-25', '26-35', '36-50', '51-65', '66-80'];
const SYSTEM_PROMPT = `Eres un generador de datos de prueba sintéticos para un e-commerce.
Generas perfiles de cliente FICTICIOS pero realistas y coherentes con el país pedido: nombres y apellidos típicos de ese país,
una ciudad real, una dirección con el formato local, un código postal que exista para esa ciudad y un teléfono con el indicativo internacional.
Nunca uses datos de personas reales ni valores de ejemplo como "John Doe", "Test" o "12345".
Responde solo con JSON.`;

/**
 * Generación sintética de datos de prueba con IA (Opción C del reto).
 * Cada llamada produce un perfil distinto: la IA trabaja con temperatura alta y una "semilla" aleatoria
 * (rango de edad, escenario, nonce). El resultado se valida con reglas de formato por país; si algo no
 * cumple, se le devuelve el error a la IA para que lo corrija. No hay ningún valor fijo en el código.
 */
export class SyntheticDataGenerator {
  constructor(
    private readonly ai: AIClient,
    private readonly onGenerated?: (profile: CustomerProfile, request: CustomerRequest & { country: CountryCode }) => Promise<void> | void,
  ) {}

  async customer(request: CustomerRequest = {}): Promise<CustomerProfile> {
    const countryCode = request.country ?? COUNTRY_CODES[randomInt(COUNTRY_CODES.length)];
    const country = COUNTRIES[countryCode];
    const ageRange = AGE_RANGES[randomInt(AGE_RANGES.length)];

    return test.step(`Datos sintéticos: cliente de ${country.name}`, async () => {
      const user = [
        `País: ${country.name} (código ISO "${country.code}", indicativo ${country.dialCode}).`,
        `Formato del código postal: ${country.postalCodeFormat}.`,
        `Rango de edad del cliente: ${ageRange}.`,
        request.scenario ? `Escenario de compra: ${request.scenario}.` : '',
        request.exclude?.length ? `NO repitas ninguno de estos nombres: ${request.exclude.join(', ')}.` : '',
        `Variación aleatoria: ${randomUUID()}.`,
        '',
        'Devuelve este JSON:',
        `{"firstName":"...","lastName":"...","email":"...","phone":"${country.dialCode} ...","country":"${country.code}",` +
          '"city":"...","address":"...","postalCode":"...","deliveryInstructions":"instrucción de entrega concreta y coherente con el escenario"}',
      ]
        .filter(Boolean)
        .join('\n');

      const profile = await this.ai.completeJSON(
        { purpose: `synthetic-data: cliente ${country.code}`, system: SYSTEM_PROMPT, user, temperature: 1, maxTokens: 500 },
        customerSchema(countryCode),
        4,
      );
      await this.onGenerated?.(profile, { ...request, country: countryCode });
      return profile;
    });
  }

  /** Varios perfiles distintos entre sí (cada uno conoce los nombres anteriores para no repetirlos). */
  async customers(count: number, request: CustomerRequest = {}): Promise<CustomerProfile[]> {
    const profiles: CustomerProfile[] = [];
    for (let i = 0; i < count; i++) {
      const exclude = [...(request.exclude ?? []), ...profiles.map((p) => `${p.firstName} ${p.lastName}`)];
      profiles.push(await this.customer({ ...request, exclude }));
    }
    return profiles;
  }
}
