import { BUSINESS_CONTACT_HREF } from './brand';

export const ANNUAL_DISCOUNT = 0.2; // 20% discount on annual billing

export type PlanId = 'free' | 'solo' | 'team' | 'business';

export interface PlanComparisonFeatures {
  // Recording
  monthlyHours: string;
  maxMeetingLength: string;
  zoomBot: boolean;
  phoneInRoomRecording: boolean;

  // The Document
  structuredDocument: boolean;
  autoSummary: boolean;
  timestamps: boolean;
  shareLinks: boolean;
  pdfPrintExport: boolean;

  // AI Chat
  chatQuestionsPerMeeting: string;
  timestampGroundedAnswers: boolean;

  // Privacy & Security
  autoAudioDeletion: boolean;
  accountErasure: boolean;
  adminControlsAndAuditLog: boolean;

  // Support
  supportTier: string;
}

export interface PricingPlan {
  id: PlanId;
  name: string;
  headline: string;
  monthlyEur: number;
  perSeat: boolean;
  ctaLabel: string;
  ctaHref: string;
  badge?: string;
  shortFeatures: string[];
  features: PlanComparisonFeatures;
}

/**
 * Calculates the total annual price for a plan (12 months with 20% discount).
 */
export function getAnnualTotalEur(monthlyPriceEur: number): number {
  return Math.round(monthlyPriceEur * 12 * (1 - ANNUAL_DISCOUNT) * 100) / 100;
}

/**
 * Calculates the effective monthly rate when billed annually.
 */
export function getEffectiveMonthlyRateEur(monthlyPriceEur: number): number {
  return Math.round(monthlyPriceEur * (1 - ANNUAL_DISCOUNT) * 100) / 100;
}

export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    headline: 'For individuals testing the waters',
    monthlyEur: 0,
    perSeat: false,
    ctaLabel: 'Get started',
    ctaHref: '/signup',
    shortFeatures: [
      '2 hours of meeting recording / mo',
      '10 AI chat questions per meeting',
      'Structured document & timestamps',
      'Automatic audio deletion after processing',
      'Standard support',
    ],
    features: {
      monthlyHours: '2 h/mo',
      maxMeetingLength: '30 min',
      zoomBot: true,
      phoneInRoomRecording: false,
      structuredDocument: true,
      autoSummary: true,
      timestamps: true,
      shareLinks: true,
      pdfPrintExport: true,
      chatQuestionsPerMeeting: '10 / meeting',
      timestampGroundedAnswers: true,
      autoAudioDeletion: true,
      accountErasure: true,
      adminControlsAndAuditLog: false,
      supportTier: 'Standard',
    },
  },
  {
    id: 'solo',
    name: 'Solo',
    headline: 'For professionals & freelancers',
    monthlyEur: 19,
    perSeat: false,
    ctaLabel: 'Start free',
    ctaHref: '/signup',
    shortFeatures: [
      '10 hours of meeting recording / mo',
      '100 AI chat questions per meeting',
      'Structured document & timestamps',
      'Share links & PDF/print export',
      'Automatic audio deletion after processing',
    ],
    features: {
      monthlyHours: '10 h/mo',
      maxMeetingLength: '60 min',
      zoomBot: true,
      phoneInRoomRecording: false,
      structuredDocument: true,
      autoSummary: true,
      timestamps: true,
      shareLinks: true,
      pdfPrintExport: true,
      chatQuestionsPerMeeting: '100 / meeting',
      timestampGroundedAnswers: true,
      autoAudioDeletion: true,
      accountErasure: true,
      adminControlsAndAuditLog: false,
      supportTier: 'Standard',
    },
  },
  {
    id: 'team',
    name: 'Team',
    headline: 'For growing teams collaborating on meetings',
    monthlyEur: 39,
    perSeat: true,
    badge: 'Best value',
    ctaLabel: 'Start free',
    ctaHref: '/signup',
    shortFeatures: [
      '20 hours / mo per seat',
      '200 AI chat questions per meeting',
      'In-room phone recording support',
      'Structured document & timestamps',
      'Automatic audio deletion after processing',
    ],
    features: {
      monthlyHours: '20 h/mo / seat',
      maxMeetingLength: '120 min',
      zoomBot: true,
      phoneInRoomRecording: true,
      structuredDocument: true,
      autoSummary: true,
      timestamps: true,
      shareLinks: true,
      pdfPrintExport: true,
      chatQuestionsPerMeeting: '200 / meeting',
      timestampGroundedAnswers: true,
      autoAudioDeletion: true,
      accountErasure: true,
      adminControlsAndAuditLog: false,
      supportTier: 'Standard',
    },
  },
  {
    id: 'business',
    name: 'Business',
    headline: 'For organizations with compliance & admin needs',
    monthlyEur: 79,
    perSeat: true,
    ctaLabel: 'Contact us',
    ctaHref: BUSINESS_CONTACT_HREF,
    shortFeatures: [
      '40 hours / mo per seat',
      '500 AI chat questions per meeting',
      'Admin controls & audit log',
      'Priority support & SLA',
      'Account erasure controls',
    ],
    features: {
      monthlyHours: '40 h/mo / seat',
      maxMeetingLength: 'Unlimited',
      zoomBot: true,
      phoneInRoomRecording: true,
      structuredDocument: true,
      autoSummary: true,
      timestamps: true,
      shareLinks: true,
      pdfPrintExport: true,
      chatQuestionsPerMeeting: '500 / meeting',
      timestampGroundedAnswers: true,
      autoAudioDeletion: true,
      accountErasure: true,
      adminControlsAndAuditLog: true,
      supportTier: 'Priority',
    },
  },
];
