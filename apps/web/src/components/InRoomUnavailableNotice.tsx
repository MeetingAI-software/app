export default function InRoomUnavailableNotice() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5" role="status">
      <h3 className="font-bold text-slate-900">In-room recording is currently unavailable</h3>
      <p className="mt-1 text-sm text-slate-600">
        Online meeting bots are still available. In-room recording will return after its regional
        processing configuration has been verified.
      </p>
    </div>
  );
}
