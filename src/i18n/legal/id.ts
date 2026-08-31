export const legalId = {
  privacy: {
    metaTitle: "Kebijakan Privasi — BuildLoop",
    metaDescription:
      "Bagaimana BuildLoop mengumpulkan dan menggunakan data akun, workspace, task, spesifikasi, dan operasional.",
    title: "Kebijakan Privasi",
    intro:
      "Kebijakan ini menjelaskan data yang mungkin diproses BuildLoop saat Anda menggunakan rilis hackathon/demo publik. Isinya menggambarkan perilaku produk aktual — bukan sertifikasi hukum.",
    updated: "Terakhir diperbarui: 31 Agustus 2026. Kebijakan ini dapat berubah seiring evolusi BuildLoop.",
    sections: {
      collected: {
        heading: "Informasi yang mungkin kami proses",
        p1:
          "Bergantung pada cara Anda menggunakan BuildLoop, kami dapat memproses: identitas akun dan informasi profil (seperti nama tampilan, email, dan metadata penyedia sign-in dari Supabase Auth); metadata workspace/proyek (seperti nama proyek serta URL repositori GitHub publik, owner, branch, dan referensi commit); goal task, acceptance criteria, jawaban klarifikasi, dan task contract yang dihasilkan; spesifikasi workspace yang diunggah (PRD, FRD, BRD, Architecture, API Spec, ADR, bundle Spec Kit, dan dokumen teknis lain yang didukung); metadata run/evidence orchestration (status, checks, file yang berubah, hasil checker, catatan approval); serta log operasional/keamanan terbatas yang diperlukan untuk mengoperasikan dan melindungi layanan.",
        p2:
          "Jika Anda bergabung dengan waitlist pilot publik di landing page, kami menyimpan alamat email, peran yang dipilih, catatan pain point opsional (maksimal 500 karakter), penanda persetujuan, dan waktu pengiriman di Supabase. Waitlist tidak dapat dibaca melalui situs publik.",
        p3:
          "BuildLoop tidak secara sengaja mengumpulkan password layanan pihak ketiga, kredensial repositori privat, atau data kartu pembayaran pada rilis saat ini. Jangan mengirim secret melalui task atau unggahan spesifikasi.",
      },
      purposes: {
        heading: "Tujuan pemrosesan",
        p1:
          "Kami menggunakan informasi di atas untuk mengautentikasi pengguna; menyediakan fungsi workspace dan proyek; menghasilkan dan mengeksekusi task contract terbatas; menganalisis konteks repositori dan spesifikasi untuk planning; menghasilkan atau memperhalus acceptance criteria jika diimplementasikan; menjalankan orchestration terkendali; menghasilkan hasil checker/evidence; memelihara audit trail; mencegah penyalahgunaan dan insiden keamanan; serta mengoperasikan dan meningkatkan reliabilitas layanan.",
        p2:
          "BuildLoop tidak menggunakan data Anda untuk profil iklan, menjual data pribadi, atau menjalankan jaringan iklan pada rilis saat ini.",
      },
      ai: {
        heading: "Pemrosesan AI (Google Gemini)",
        p1:
          "Fitur BuildLoop tertentu dapat mengirim konteks relevan task ke Google Gemini bila diperlukan — misalnya eksekusi coding worker terbatas, interpretasi task, atau semantic planning jika diimplementasikan. Ini dapat mencakup sebagian goal task, field contract, path repositori, dan cuplikan spesifikasi relevan — bukan seluruh repositori secara default.",
        p2:
          "BuildLoop dirancang untuk memakai konteks seminimal mungkin untuk task aktif. API key, prompt internal, dan retensi di sisi provider tidak ditampilkan di UI. Google Gemini adalah penyedia layanan untuk fitur berbantuan AI; Google ADK adalah framework runtime yang dipakai BuildLoop dan bukan penyimpanan data terpisah.",
      },
      providers: {
        heading: "Penyedia layanan dan infrastruktur",
        p1:
          "Penyedia layanan dan infrastruktur untuk mengoperasikan BuildLoop dapat mencakup: Supabase (autentikasi dan data aplikasi Postgres); Google Cloud Run (hosting aplikasi); Google Firestore (persistensi runtime/evidence orchestrator di produksi); Google Secret Manager (secret sisi server seperti service role key dan Gemini API key); Google Gemini API (fitur worker/planning berbantuan AI); dan GitHub (akses sumber repositori publik).",
        p2:
          "Klasifikasi processor hukum yang tepat dapat bervariasi menurut deployment. Halaman ini menjelaskan peran operasional, bukan mengklaim sertifikasi formal di bawah regime privasi tertentu.",
      },
      github: {
        heading: "Repositori GitHub publik",
        p1:
          "BuildLoop saat ini mendukung koneksi repositori GitHub publik untuk cakupan hackathon/demo. Saat Anda menghubungkan repositori, BuildLoop dapat memeriksa metadata repositori, meng-clone konten ke workspace eksekusi terkendali, menganalisis file untuk task planning, dan memakai state repositori selama validasi dan orchestration.",
        p2:
          "OAuth repositori privat tidak didukung pada rilis saat ini. BuildLoop tidak mengklaim kepemilikan konten repositori Anda. Anda bertanggung jawab menghubungkan repositori yang Anda berwenang gunakan.",
      },
      specifications: {
        heading: "Spesifikasi yang diunggah",
        p1:
          "Spesifikasi workspace — termasuk dokumen tunggal dan bundle Spec Kit — disimpan sebagai konteks workspace. File atau bagian relevan dapat memengaruhi task planning dan muncul di Sources Used. Spesifikasi dapat diproses AI bila diperlukan untuk planning atau bantuan eksekusi.",
        p2:
          "Spesifikasi sebaiknya tidak sengaja berisi kredensial, API key, password, private key, atau secret produksi. BuildLoop tidak mengeksekusi file unggahan sebagai kode.",
        p3:
          "Anda bertanggung jawab memiliki wewenang untuk mengunggah materi spesifikasi dan mengecualikan konten sensitif dari unggahan.",
      },
      secrets: {
        heading: "Secret dan kredensial",
        p1:
          "Jangan memasukkan atau mengunggah password, API key, kredensial service account, access token, private key, atau secret produksi ke task, klarifikasi, atau unggahan spesifikasi. BuildLoop memiliki guardrail untuk goal sensitif, tetapi Anda tetap bertanggung jawab menghindari pengungkapan secret.",
      },
      waitlist: {
        heading: "Waitlist pilot",
        p1:
          "Waitlist landing page menyimpan informasi kontak dan minat di Supabase untuk outreach pilot. Ini terpisah dari data workspace terautentikasi.",
        p2:
          "Pengiriman waitlist tidak otomatis membuat akun aplikasi.",
      },
      retention: {
        heading: "Retensi data",
        p1:
          "BuildLoop dapat menyimpan catatan akun, proyek, task, contract, approval, spesifikasi, dan operasional selama akun/workspace Anda aktif dan seperlunya untuk keamanan, audit, dan operasi layanan.",
        p2:
          "Jadwal penghapusan otomatis belum sepenuhnya self-service pada rilis saat ini. Otomasi retensi dan tooling ekspor dapat dikembangkan di versi mendatang.",
      },
      rights: {
        heading: "Pilihan dan permintaan Anda",
        p1:
          "Bergantung pada fitur yang tersedia, Anda dapat memutuskan repositori, menghapus spesifikasi yang diunggah, menghapus dokumen atau set spesifikasi jika didukung, berpindah workspace, dan memperbarui profil di Settings.",
        p2:
          "Untuk permintaan akses, koreksi, atau penghapusan di luar kontrol self-service, hubungi operator melalui issue tracker repositori GitHub publik di bawah. BuildLoop tidak menjanjikan penghapusan otomatis instan untuk semua catatan backend bila retensi diperlukan untuk keamanan atau audit.",
      },
      security: {
        heading: "Praktik keamanan",
        p1:
          "BuildLoop dirancang dengan persetujuan manusia untuk aksi sensitif, penegakan protected path, contract terbatas, isolasi workspace (termasuk Supabase row-level security jika aktif), penyimpanan secret sisi server, serta catatan evidence/audit. Lihat Security Overview untuk detail lebih lanjut.",
      },
      international: {
        heading: "Penggunaan internasional",
        p1:
          "Hak privasi bervariasi menurut yurisdiksi. BuildLoop berupaya mengikuti prinsip transparansi, pembatasan tujuan, minimisasi data, keamanan, dan kontrol pengguna. Halaman ini tidak mengklaim sertifikasi kepatuhan GDPR, UU PDP, CCPA, atau formal lainnya.",
        p2:
          "Jika Anda yakin memiliki hak privasi berdasarkan hukum yang berlaku, Anda dapat menghubungi operator melalui saluran di bawah.",
      },
      contact: {
        heading: "Kontak",
        p1:
          "Pertanyaan privasi dan keamanan untuk rilis hackathon/demo ini dapat dikirim melalui issue tracker repositori GitHub publik: https://github.com/akbartantu/buildloop-hackathon-2026. Alamat kontak keamanan khusus dapat dipublikasikan sebelum penggunaan produksi yang lebih luas.",
      },
    },
  },
  cookies: {
    metaTitle: "Kebijakan Cookie & Local Storage — BuildLoop",
    metaDescription:
      "Bagaimana BuildLoop menggunakan cookie, local storage, dan browser caching pada rilis saat ini.",
    title: "Kebijakan Cookie & Local Storage",
    intro:
      "Halaman ini mendokumentasikan mekanisme penyimpanan browser yang benar-benar dipakai BuildLoop hari ini. BuildLoop tidak menjalankan cookie pelacakan iklan atau marketing pada rilis saat ini.",
    updated: "Terakhir diperbarui: 31 Agustus 2026.",
    sections: {
      overview: {
        heading: "Ringkasan",
        p1:
          "BuildLoop memakai seperangkat kecil mekanisme browser fungsional agar Anda tetap masuk, preferensi tersimpan, dan UI workspace berjalan. Kami membedakan cookie, localStorage, dan browser caching normal di bawah.",
        p2:
          "Karena cookie analytics/pelacakan opsional tidak ada, BuildLoop tidak menampilkan banner persetujuan cookie yang memblokir pada rilis saat ini.",
      },
      essential: {
        heading: "Cookie dan storage esensial",
        p1:
          "Supabase Auth menyimpan state sesi di localStorage browser dengan key yang dikelola Supabase (biasanya `sb-<project-ref>-auth-token`). Ini diperlukan untuk sign-in dan kontinuitas sesi.",
        p2:
          "Sidebar aplikasi dapat menyimpan state buka/tutup UI dalam cookie fungsional bernama `sidebar_state` (path=/, max-age terbatas). Ini hanya mendukung perilaku UI dasar.",
      },
      preferences: {
        heading: "Penyimpanan preferensi",
        p1:
          "BuildLoop menyimpan preferensi non-secret di localStorage, termasuk: `buildloop.locale` (pilihan bahasa), `buildloop.activeProjectId` (workspace aktif), `buildloop-connected-repository` (metadata tampilan repositori pada alur lokal/demo), dan `buildloop.productTour.completed.v2` (penyelesaian product tour).",
        p2:
          "Nilai-nilai ini adalah preferensi fungsional atau state UI — bukan profil iklan.",
      },
      auth: {
        heading: "Sesi autentikasi",
        p1:
          "Token sesi ditangani oleh library klien Supabase. BuildLoop tidak menyalin token sesi secara manual ke field UI kustom atau mengekspos service-role key ke browser.",
        p2:
          "Sign-out membersihkan sesi Supabase sesuai perilaku provider.",
      },
      noTracking: {
        heading: "Tanpa cookie iklan atau analytics",
        p1:
          "Rilis BuildLoop saat ini tidak memuat pixel iklan pihak ketiga, SDK analytics marketing, atau cookie pelacakan opsional.",
        p2:
          "Jika analytics opsional ditambahkan di masa depan, BuildLoop seharusnya memuatnya hanya dengan kontrol persetujuan yang sesuai.",
      },
      cache: {
        heading: "Browser dan CDN caching",
        p1:
          "Aset aplikasi statis (JavaScript, CSS, ikon) dapat di-cache browser atau CDN/proxy sesuai header HTTP cache normal. Caching sementara ini berbeda dari menyimpan konten task atau spesifikasi di browser.",
        p2:
          "Persistensi sisi server untuk task, spesifikasi, dan evidence orchestration berada di Supabase, Firestore, atau store pengembangan lokal — bukan di browser cache.",
      },
      manage: {
        heading: "Mengelola storage",
        p1:
          "Anda dapat menghapus data situs melalui pengaturan browser, sign out untuk mereset storage auth, atau menghapus key preferensi lokal via developer tools browser. Menghapus storage auth akan mengeluarkan Anda dari sesi.",
        p2:
          "Menghapus key preferensi akan mereset bahasa, workspace aktif, atau state penyelesaian tour.",
      },
    },
  },
  security: {
    metaTitle: "Security Overview — BuildLoop",
    metaDescription:
      "Batas keamanan, kontrol tata kelola, dan panduan pelaporan untuk BuildLoop.",
    title: "Data & Security Overview",
    intro:
      "BuildLoop dirancang untuk software delivery otonom terkendali. Overview ini menjelaskan perilaku relevan keamanan pada rilis hackathon/demo saat ini — bukan sertifikasi.",
    updated: "Terakhir diperbarui: 31 Agustus 2026.",
    sections: {
      overview: {
        heading: "Cakupan",
        p1:
          "BuildLoop mengoordinasikan eksekusi task terbatas dengan persetujuan manusia untuk aksi sensitif atau ireversibel. Kontrol keamanan menggabungkan kebijakan produk, konfigurasi infrastruktur, dan praktik operasional.",
        p2:
          "Halaman ini tidak mengklaim sertifikasi SOC 2, ISO 27001, PCI, GDPR, UU PDP, atau penetration test kecuali didokumentasikan terpisah dengan bukti.",
      },
      approval: {
        heading: "Gerbang persetujuan manusia",
        p1:
          "Aksi seperti commit, push, merge, dan deploy memerlukan persetujuan eksplisit manusia sebelum BuildLoop melanjutkan. Goal sensitif dapat diblokir di preflight alih-alih dieksekusi otomatis.",
        p2:
          "Catatan approval adalah bagian dari audit trail produk.",
      },
      bounded: {
        heading: "Eksekusi terbatas dan verifikasi",
        p1:
          "Task berjalan terhadap contract terkunci dengan scope, acceptance criteria, protected path, dan batas koreksi maksimum. Checker independen mengevaluasi hasil; worker tidak menentukan PASS sendiri.",
        p2:
          "Bila evidence tidak cukup, BuildLoop seharusnya menampilkan FAILED, BLOCKED, atau status human-review alih-alih sukses diam-diam.",
      },
      isolation: {
        heading: "Isolasi workspace dan data",
        p1:
          "Workspace terikat pada identitas repositori terhubung. Data aplikasi dibatasi menurut user terautentikasi dan identifier proyek. Kebijakan Supabase row-level security membatasi akses spesifikasi, proyek, dan task ke pemilik jika aktif.",
        p2:
          "Runtime dan evidence orchestrator dapat disimpan terpisah (misalnya Firestore di produksi) dari data produk relasional di Supabase.",
      },
      infrastructure: {
        heading: "Infrastruktur dan secret",
        p1:
          "Deployment produksi dapat memakai Google Cloud Run, Cloud IAM, Secret Manager, Firestore, dan Supabase. Secret sisi server seperti Supabase service role key dan Gemini API key dimaksudkan tetap di server — bukan di bundle klien atau UI.",
        p2:
          "Akses GitHub pada rilis saat ini berfokus pada URL repositori publik dan operasi clone dalam batas eksekusi task.",
      },
      logging: {
        heading: "Logging dan penanganan error",
        p1:
          "Log operasional sebaiknya memakai metadata aman (kode error, fase, identifier) alih-alih isi task penuh, konten spesifikasi, header otorisasi, atau secret.",
        p2:
          "Jika Anda yakin log mengekspos data sensitif, laporkan melalui saluran kontak di bawah.",
      },
      governance: {
        heading: "Prinsip tata kelola siber",
        p1:
          "BuildLoop dirancang dengan least privilege, kontrol human-in-the-loop untuk aksi ireversibel, pemisahan eksekusi dan verifikasi, traceability melalui contract dan evidence, autonomi terbatas, perilaku UI secure-by-default, protected path eksplisit, provenance via Sources Used, dan konteks seminimal mungkin untuk planning.",
        p2:
          "Ini adalah tujuan engineering — bukan jaminan terhadap semua penyalahgunaan atau miskonfigurasi.",
      },
      headers: {
        heading: "Header keamanan web",
        p1:
          "BuildLoop menerapkan header keamanan HTTP default yang wajar jika didukung server aplikasi (seperti `X-Content-Type-Options`, `Referrer-Policy`, perlindungan frame, dan `Permissions-Policy` konservatif).",
        p2:
          "Content-Security-Policy ketat tidak diterapkan dengan cara yang merusak auth Supabase, aset Vite, atau perilaku runtime yang diperlukan tanpa pengujian.",
      },
      limitations: {
        heading: "Keterbatasan yang diketahui",
        p1:
          "Rilis hackathon/demo ini mendukung repositori GitHub publik, bukan akses repositori privat OAuth. Penghapusan akun penuh self-service mungkin memerlukan bantuan operator.",
        p2:
          "Kematangan keamanan, otomasi retensi, dan review pihak ketiga formal masih pekerjaan berkelanjutan.",
      },
      reporting: {
        heading: "Laporkan masalah keamanan",
        p1:
          "Kerentanan atau isu keamanan yang dicurigai untuk rilis ini dapat dilaporkan melalui issue tracker repositori GitHub publik: https://github.com/akbartantu/buildloop-hackathon-2026. Harap hindari memposting secret atau kredensial live di issue publik.",
        p2:
          "Alamat kontak keamanan khusus dapat dipublikasikan sebelum penggunaan produksi yang lebih luas.",
      },
    },
  },
} as const;
