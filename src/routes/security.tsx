import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

const title = "Security — BuildLoop";
const description =
  "Draft catatan keamanan BuildLoop: rencana penanganan token repository dan cara melaporkan masalah.";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Security,
});

function Security() {
  return (
    <LegalPage
      title="Security"
      draft
      intro="Halaman ini menjelaskan rencana penanganan keamanan BuildLoop. Isinya bersifat rencana, bukan pernyataan mengenai mekanisme yang sudah berjalan."
      updatedNote="Isi halaman ini akan diperbarui sebelum pilot dibuka."
    >
      <LegalSection heading="Kondisi versi ini">
        <p>
          Halaman publik ini tidak memiliki akun, tidak menyimpan data pengguna, dan tidak terhubung
          ke repository mana pun.
        </p>
      </LegalSection>

      <LegalSection heading="Rencana akses repository">
        <p>
          Integrasi repository direncanakan melalui GitHub App dengan permission granular per
          repository, sehingga izin dapat dibatasi pada satu repository yang dipilih peserta pilot.
        </p>
        <p>
          Token dan secret direncanakan hanya berada di penyimpanan sisi server dan tidak dikirim ke
          browser.
        </p>
      </LegalSection>

      <LegalSection heading="Batas pemeriksaan">
        <p>
          Pemeriksaan BuildLoop membaca perubahan repository pada satu commit dan melaporkan temuan
          apa adanya. Jika hasil tidak dapat dipastikan, statusnya NEEDS HUMAN REVIEW, bukan PASS.
        </p>
      </LegalSection>

      <LegalSection heading="Yang belum ada">
        <p>
          Belum ada sertifikasi, audit pihak ketiga, atau program bug bounty. Hal-hal tersebut tidak
          diklaim pada halaman ini.
        </p>
      </LegalSection>

      <LegalSection heading="Melaporkan masalah">
        <p>Kontak akan ditambahkan sebelum pilot dibuka.</p>
      </LegalSection>
    </LegalPage>
  );
}
