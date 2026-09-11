import { RECORDING_NOTICE_VERSION } from '@/lib/recording-notice';

interface RecordingConsentProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function RecordingConsent({ id, checked, disabled = false, onChange }: RecordingConsentProps) {
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      data-recording-notice-version={RECORDING_NOTICE_VERSION}
    >
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
        />
        <span>
          I confirm that I have the right to record, that all participants have been informed, and
          that I am responsible for following applicable law and workplace rules.
        </span>
      </label>
    </div>
  );
}
