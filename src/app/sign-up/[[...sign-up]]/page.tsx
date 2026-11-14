import { SignUp } from "@clerk/nextjs";

// Reached from an invitation email. Sign-up is invitation-only, so without
// an invitation link this page just says so.
export default function Page() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
