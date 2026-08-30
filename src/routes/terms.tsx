import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

const title = "Terms — BuildLoop";
const description =
  "Draft ketentuan penggunaan BuildLoop: status layanan masih pilot invite-only dan keputusan akhir tetap berada pada manusia.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage
      title="Terms"
      draft
      intro="Ketentuan ini masih draft minimum dan menjelaskan batas layanan BuildLoop pada tahap sekarang."
      updatedNote="Isi halaman ini akan diperbarui sebelum pilot dibuka."
    >
      <LegalSection heading="Status layanan">
        <p>
          BuildLoop sedang dalam pengembangan. Halaman publik ini bersifat informasi saja dan belum
          menyediakan layanan berjalan. Pilot direncanakan invite-only.
        </p>
      </LegalSection>

      <LegalSection heading="Tanggung jawab pengguna">
        <p>
          BuildLoop tidak menggantikan penilaian manusia. Keputusan Revise, Escalate, atau Close
          tetap diambil oleh pengguna, termasuk keputusan untuk menggabungkan perubahan pada
          repository.
        </p>
      </LegalSection>

      <LegalSection heading="Batas hasil pemeriksaan">
        <p>
          Hasil pemeriksaan hanya menampilkan apa yang dapat dibaca dari perubahan repository pada
          satu commit tertentu. Tidak ada jaminan bahwa seluruh masalah pada kode akan terdeteksi.
        </p>
      </LegalSection>

      <LegalSection heading="Perubahan ketentuan">
        <p>
          Ketentuan ini dapat berubah seiring produk berkembang. Versi yang berlaku akan
          dipublikasikan di halaman ini.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
