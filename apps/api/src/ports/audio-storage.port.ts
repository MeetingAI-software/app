export interface AudioStoragePort {
  /** Stable object key persisted before upload, so a lost response cannot erase its reference. */
  pathForUpload(meetingId: string, mimeType: string): string;
  /** Adapters supporting cancellation pass signal downstream; callers still await settlement. */
  upload(meetingId: string, data: Buffer, mimeType: string, options?: { signal?: AbortSignal }): Promise<{ path: string }>;
  getSignedUrl(path: string): Promise<string>;      // short-lived; for the transcription vendor
  delete(path: string): Promise<void>;              // idempotent; "already gone" = success
}
