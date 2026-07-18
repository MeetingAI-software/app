export interface AudioStoragePort {
  upload(meetingId: string, data: Buffer, mimeType: string): Promise<{ path: string }>;
  getSignedUrl(path: string): Promise<string>;      // short-lived; for the transcription vendor
  delete(path: string): Promise<void>;              // idempotent; "already gone" = success
}
