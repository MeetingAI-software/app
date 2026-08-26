import { notFound } from 'next/navigation';
import RailPreviewClient from './RailPreviewClient';

/**
 * DEV-ONLY harness for eyeballing the console rail against the design prototype.
 *
 * The rail normally lives behind the session gate in AppShell, which needs the API running. This
 * page renders it with fixture data so it can be compared side by side with
 * `designs/01 Syncmemos Console (PRIMARY).dc.html` (served at http://localhost:8080).
 *
 * `?collapsed=1` opens straight into the collapsed icon-strip state. Reading it here rather than
 * with `useSearchParams` keeps the rail server-rendered, so the collapsed markup can be inspected
 * in the served HTML instead of only after a click.
 *
 * It 404s outside development, so it cannot be reached on the deployed site. Delete the
 * `src/app/dev/` directory once the rail is signed off.
 */
export default async function RailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const collapsed = (await searchParams).collapsed === '1';
  return <RailPreviewClient initialCollapsed={collapsed} />;
}
