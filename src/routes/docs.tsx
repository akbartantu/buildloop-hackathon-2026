import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

const title = "Dokumentasi BuildLoop — konsep dan aturan loop";
const description =
  "Ringkasan konsep BuildLoop: Build Contract, evidence yang terikat commit SHA, arti status PASS, BLOCKED, NEEDS HUMAN REVIEW, dan STALE.";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Docs,
});

function Docs() {
  return (
    <LegalPage
      title="Dokumentasi"
      intro="Halaman ini menjelaskan konsep dasar BuildLoop. Cakupannya masih ringkas dan akan berkembang seiring produk dibangun."
    >
      <LegalSection heading="Build Contract">
        <p>
          Build Contract ditulis sebelum coding dimulai dan berisi Goal, In Scope, Out of Scope,
          Protected Areas, Acceptance Criteria, serta Required Checks.
        </p>
        <p>
          Contract yang telah disetujui bersifat read-only. Perubahan scope membuat versi baru yang
          harus melewati approval lagi.
        </p>
      </LegalSection>

      <LegalSection heading="Evidence terikat commit">
        <p>
          Setiap temuan pada Check Report diikat pada satu commit SHA. Jika commit berubah, hasil
          check sebelumnya ditandai STALE dan harus dijalankan ulang.
        </p>
      </LegalSection>

      <LegalSection heading="Status">
        <ul className="list-disc space-y-2 pl-5">
          <li>PASS — aturan tersebut memiliki evidence yang lulus.</li>
          <li>BLOCKED — aturan keras gagal, keputusan Close dinonaktifkan.</li>
          <li>NEEDS HUMAN REVIEW — hasil tidak dapat dipastikan secara otomatis.</li>
          <li>STALE — commit berubah sejak check dibuat.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Keputusan manusia">
        <p>
          Setelah Check Report tersedia, manusia memilih Revise (perbaikan terfokus pada failure
          evidence), Escalate (butuh penilaian manusia lebih lanjut), atau Close.
        </p>
      </LegalSection>

      <LegalSection heading="Batas versi saat ini">
        <p>
          Halaman publik ini belum terhubung ke repository mana pun, belum memiliki akun, dan belum
          menjalankan pemeriksaan apa pun. Semua contoh tampilan diberi label sebagai contoh
          ilustratif.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
