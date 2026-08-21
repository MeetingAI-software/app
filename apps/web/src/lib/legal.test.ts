import { describe, expect, it } from 'vitest';
import { legalPublicationFromEnvironment } from './legal';

const completeEnvironment = {
  LEGAL_POLICIES_PUBLISHED: 'true',
  LEGAL_WITHDRAWAL_FLOW_APPROVED: 'true',
  LEGAL_POLICIES_VERSION: '2026-08-21',
  LEGAL_SELLER_NAME: 'Example Seller',
  LEGAL_SELLER_ADDRESS: 'Public address',
  LEGAL_SELLER_COUNTRY: 'Sweden',
  LEGAL_SELLER_EMAIL: 'legal@example.test',
  LEGAL_SELLER_PHONE: '+46 00 000 00 00',
};

describe('legal policy publication gate', () => {
  it('stays closed unless publication is explicitly approved', () => {
    expect(legalPublicationFromEnvironment({
      ...completeEnvironment,
      LEGAL_POLICIES_PUBLISHED: 'false',
    })).toBeNull();
  });

  it('stays closed until the consumer withdrawal flow is approved', () => {
    expect(legalPublicationFromEnvironment({
      ...completeEnvironment,
      LEGAL_WITHDRAWAL_FLOW_APPROVED: 'false',
    })).toBeNull();
  });

  it.each([
    'LEGAL_POLICIES_VERSION',
    'LEGAL_SELLER_NAME',
    'LEGAL_SELLER_ADDRESS',
    'LEGAL_SELLER_COUNTRY',
    'LEGAL_SELLER_EMAIL',
    'LEGAL_SELLER_PHONE',
  ])('stays closed when %s is missing', (key) => {
    const environment = { ...completeEnvironment, [key]: undefined };
    expect(legalPublicationFromEnvironment(environment)).toBeNull();
  });

  it('returns only verified public seller fields when complete', () => {
    expect(legalPublicationFromEnvironment({
      ...completeEnvironment,
      LEGAL_SELLER_REGISTRATION_NUMBER: 'REG-123',
      LEGAL_SELLER_VAT_NUMBER: 'VAT-123',
    })).toEqual({
      version: '2026-08-21',
      seller: {
        name: 'Example Seller',
        address: 'Public address',
        country: 'Sweden',
        email: 'legal@example.test',
        phone: '+46 00 000 00 00',
        registrationNumber: 'REG-123',
        vatNumber: 'VAT-123',
      },
    });
  });
});
