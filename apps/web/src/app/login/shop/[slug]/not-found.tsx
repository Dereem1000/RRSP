import Link from 'next/link';

export default function ShopLoginNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Shop sign-in unavailable</h1>
      <p className="max-w-md text-sm text-slate-600">
        This staff login link is invalid or staff sign-in has not been enabled for this shop. Ask
        your shop owner for the correct link.
      </p>
      <Link href="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
        Go to main sign in
      </Link>
    </div>
  );
}
