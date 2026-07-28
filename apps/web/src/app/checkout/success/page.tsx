import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-24">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
        <h1 className="text-3xl font-bold text-slate-900">Payment received</h1>
        <p className="mt-3 text-slate-600">
          Thanks! Your subscription is being activated. It may take a few seconds for the account to update.
        </p>
        <Link href="/meetings" className="mt-8 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500">
          Go to your meetings
        </Link>
      </section>
    </main>
  );
}
