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

// Day 5: auth
export class InvalidCredentialsError extends Error {   // → HTTP 401
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class EmailTakenError extends Error {            // → HTTP 409
  constructor(message: string) {
    super(message);
    this.name = 'EmailTakenError';
  }
}

export class WeakPasswordError extends Error {          // → HTTP 400
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}


