// domain/errors.ts
export class CapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapExceededError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

export class BotProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotProviderError';
  }
}

export class DocumentGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentGenerationError';
  }
}

export class MeetingNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeetingNotReadyError';
  }
}
