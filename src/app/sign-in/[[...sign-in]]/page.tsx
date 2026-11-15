import { SignIn } from "@clerk/nextjs";
import { LegacyExportNotice } from "@/components/legacy-export";

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <SignIn />
      <LegacyExportNotice />
    </main>
  );
}
