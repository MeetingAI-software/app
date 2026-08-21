export type LegalLocale = 'en' | 'sv';

export interface LegalSeller {
  name: string;
  address: string;
  country: string;
  email: string;
  phone: string;
  registrationNumber?: string;
  vatNumber?: string;
}

export interface LegalPublication {
  version: string;
  seller: LegalSeller;
}

type LegalEnvironment = Record<string, string | undefined>;

function value(environment: LegalEnvironment, key: string): string | undefined {
  const candidate = environment[key]?.trim();
  return candidate ? candidate : undefined;
}

export function legalPublicationFromEnvironment(
  environment: LegalEnvironment,
): LegalPublication | null {
  if (value(environment, 'LEGAL_POLICIES_PUBLISHED') !== 'true') return null;
  if (value(environment, 'LEGAL_WITHDRAWAL_FLOW_APPROVED') !== 'true') return null;

  const version = value(environment, 'LEGAL_POLICIES_VERSION');
  const name = value(environment, 'LEGAL_SELLER_NAME');
  const address = value(environment, 'LEGAL_SELLER_ADDRESS');
  const country = value(environment, 'LEGAL_SELLER_COUNTRY');
  const email = value(environment, 'LEGAL_SELLER_EMAIL');
  const phone = value(environment, 'LEGAL_SELLER_PHONE');

  if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(version)) return null;
  if (!name || !address || !country || !email || !phone) return null;
  if (!email.includes('@')) return null;

  return {
    version,
    seller: {
      name,
      address,
      country,
      email,
      phone,
      registrationNumber: value(environment, 'LEGAL_SELLER_REGISTRATION_NUMBER'),
      vatNumber: value(environment, 'LEGAL_SELLER_VAT_NUMBER'),
    },
  };
}

export function getLegalPublication(): LegalPublication | null {
  return legalPublicationFromEnvironment(process.env);
}
