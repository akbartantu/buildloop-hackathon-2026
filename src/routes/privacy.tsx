import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/legal-page";

const title = "Privacy — BuildLoop";
const description =
  "Draft catatan privasi BuildLoop: data yang dikumpulkan formulir waitlist pilot dan bagaimana data itu disimpan.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      draft
      intro="Catatan privasi ini masih draft minimum dan menjelaskan kondisi halaman publik BuildLoop saat ini."
      updatedNote="Isi halaman ini akan diperbarui sebelum pilot dibuka."
    >
      <LegalSection heading="Data yang dikumpulkan halaman ini">
        <p>
          Satu-satunya formulir di halaman publik adalah formulir waitlist pilot. Ketika formulir
          itu dikirim, data berikut disimpan: alamat email, peran yang dipilih, catatan masalah
          utama (opsional, maksimal 500 karakter), penanda persetujuan, dan waktu pendaftaran. Tidak
          ada nama, perusahaan, nomor telepon, password, atau akses repository yang diminta.
        </p>
        <p>
          Data disimpan di infrastruktur penyimpanan dan autentikasi yang digunakan BuildLoop dan
          digunakan untuk menghubungi pendaftar terkait pilot. Isi daftar waitlist tidak dapat
          dibaca melalui halaman publik. Alamat IP tidak disimpan, tidak ada analytics, dan belum
          ada pengiriman email otomatis.
        </p>
      </LegalSection>

      <LegalSection heading="Identitas dan sesi Google">
        <p>
          Fitur masuk menggunakan Google OAuth untuk memverifikasi identitas dasar: nama tampilan,
          alamat email, dan foto profil publik. BuildLoop tidak menyimpan password dan tidak
          mengakses data Google lainnya. Session diurus oleh penyedia autentikasi terkelola; token
          ditangani otomatis oleh library resmi dan tidak disalin secara manual oleh aplikasi.
        </p>
      </LegalSection>

      <LegalSection heading="Rencana saat pilot dibuka">
        <p>
          Ketika pilot dibuka, BuildLoop diperkirakan membutuhkan identitas akun peserta dan izin
          akses terhadap satu repository yang dipilih peserta, agar perubahan dapat diperiksa.
          Rincian data, izin, dan cara penyimpanannya akan dijelaskan di halaman ini sebelum pilot
          dimulai.
        </p>
      </LegalSection>

      <LegalSection heading="Yang belum ditentukan">
        <p>
          Kebijakan retensi, daftar pihak ketiga, dan detail teknis penanganan data belum ditetapkan
          dan tidak diklaim pada halaman ini.
        </p>
      </LegalSection>

      <LegalSection heading="Kontak">
        <p>Kontak akan ditambahkan sebelum pilot dibuka.</p>
      </LegalSection>
    </LegalPage>
  );
}
