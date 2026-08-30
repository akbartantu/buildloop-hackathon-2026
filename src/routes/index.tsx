import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckPreview } from "@/components/site/check-preview";
import { SectionHeading } from "@/components/site/section-heading";
import { ScopeBoundary } from "@/components/site/scope-boundary";
import { LifecycleRailCompact, LifecycleRailDetailed } from "@/components/site/lifecycle-rail";
import { WaitlistForm } from "@/components/site/waitlist-form";

const title = "BuildLoop — Guardrail untuk AI coding";
const description =
  "BuildLoop mengunci batas task sebelum coding, memeriksa perubahan aktual di repository, lalu membantu manusia memilih Revise, Escalate, atau Close berdasarkan evidence.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Landing,
});

const problems = [
  {
    title: "File di luar scope ikut berubah.",
    text: "Diff menyentuh direktori yang tidak pernah dibicarakan, dan baru terlihat setelah merge.",
  },
  {
    title: "Dependency baru masuk tanpa approval.",
    text: "Paket tambahan ikut terpasang di dalam commit fitur, tenggelam di antara perubahan lain.",
  },
  {
    title: "Task disebut selesai tanpa evidence.",
    text: "Status selesai bersandar pada narasi, bukan pada hasil check yang terikat satu commit.",
  },
];

const features = [
  {
    title: "protected paths",
    text: "Direktori dan file sensitif dideklarasikan sebelum coding. Jika diff menyentuhnya, hasil check ditandai BLOCKED dan Close dinonaktifkan.",
  },
  {
    title: "dependency check",
    text: "Penambahan atau perubahan dependency dilaporkan sebagai temuan tersendiri, bukan detail yang tenggelam di dalam diff.",
  },
  {
    title: "focused revision",
    text: "Revision Prompt disusun hanya dari failure evidence, sehingga perbaikan berikutnya tidak melebar keluar contract.",
  },
];

const faq = [
  {
    q: "Apakah BuildLoop menulis kode untuk saya?",
    a: "Tidak. BuildLoop adalah lapisan kontrol: mengunci batas task, membaca perubahan yang benar-benar terjadi, dan menyiapkan keputusan untuk manusia.",
  },
  {
    q: "Apa arti status PASS, BLOCKED, NEEDS HUMAN REVIEW, dan STALE?",
    a: "PASS berarti aturan tersebut punya evidence yang lulus. BLOCKED berarti aturan keras gagal. NEEDS HUMAN REVIEW berarti hasilnya tidak dapat dipastikan otomatis. STALE berarti commit berubah sejak check dibuat sehingga hasilnya tidak lagi mewakili kode terbaru.",
  },
  {
    q: "Apakah contract bisa diubah setelah disetujui?",
    a: "Contract yang disetujui bersifat read-only. Perubahan scope membuat versi baru yang harus disetujui ulang.",
  },
  {
    q: "Seluas apa cakupan pilot?",
    a: "Pilot dibatasi satu repository dan satu active task per project, agar loop-nya mudah dievaluasi.",
  },
  {
    q: "Bagaimana integrasi repository direncanakan?",
    a: "Rencananya melalui GitHub App dengan permission granular per repository. Bagian ini belum tersedia pada halaman ini.",
  },
];

function Landing() {
  return (
    <div>
      {/* Hero: copy editorial di kiri, visual scope boundary di kanan. */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-14">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Guardrail untuk AI coding
              </p>
              <h1 className="mt-5 text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-[2.6rem]">
                AI boleh membangun.
                <br />
                BuildLoop menjaga batasnya.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Batas task dikunci sebelum coding dimulai, lalu perubahan aktual di repository
                diperiksa dan diikat pada satu commit SHA.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth/sign-up"
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Daftar
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Masuk
                </Link>
                <Link
                  to="/docs"
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Baca Dokumentasi
                </Link>
              </div>
            </div>

            <ScopeBoundary />
          </div>

          <LifecycleRailCompact className="mt-10 border-t border-border pt-5" />
        </div>
      </section>

      {/* Audit ledger ilustratif. */}
      <section aria-labelledby="ledger-heading" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 sm:pt-14">
          <SectionHeading
            eyebrow="Evidence"
            title={<span id="ledger-heading">Setiap keputusan harus punya bukti.</span>}
            description="BuildLoop mengikat kontrak, perubahan file, hasil check, dan keputusan manusia pada satu commit."
          />
        </div>
        <div className="mt-8 sm:mt-10">
          <CheckPreview />
        </div>
      </section>

      <section id="cara-kerja" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading
            eyebrow="Core loop"
            title="Lima tahap yang harus dilalui berurutan"
            description="Tidak ada tahap yang boleh dilewati, dan tidak ada kesimpulan tanpa evidence."
          />
          <LifecycleRailDetailed className="mt-8" />
        </div>
      </section>

      <section id="masalah" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading eyebrow="Masalah" title="Tiga kebocoran yang paling sering terjadi" />
          <div className="mt-8">
            {problems.map((p, i) => (
              <article
                key={p.title}
                className="grid grid-cols-[auto_1fr] gap-x-5 border-t border-border py-5 last:border-b sm:gap-x-8"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {p.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="fitur" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading
            eyebrow="Fitur"
            title="Tiga pemeriksaan yang menjaga batas"
            description="Setiap temuan disajikan terpisah agar mudah ditelusuri, dan tidak ada temuan yang disimpulkan tanpa dasar."
          />
          <div className="mt-8">
            {features.map((f, i) => (
              <article
                key={f.title}
                className="grid grid-cols-[auto_1fr] gap-x-5 border-t border-border py-5 last:border-b sm:gap-x-8"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-mono text-sm text-foreground">{f.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {f.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pilot" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Gabung pilot BuildLoop
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Pilot bersifat invite-only dan dibuka bertahap. Isi formulir singkat ini, lalu pendaftar
            dihubungi berurutan saat kuota tersedia.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-muted-foreground">
            <li>1 repository / project</li>
            <li>1 active task / project</li>
            <li>contract read-only setelah approve</li>
          </ul>
          <WaitlistForm />
        </div>
      </section>

      <section id="faq">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <SectionHeading eyebrow="FAQ" title="Pertanyaan yang sering muncul" />
          <Accordion type="single" collapsible className="mt-6 max-w-3xl border-t border-border">
            {faq.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  );
}
