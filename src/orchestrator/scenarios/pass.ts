export const PASS_DEMO_GOAL =
  "Perjelas penjelasan workspace di src/components/site/app-shell.tsx agar pengguna baru memahami bahwa task dijalankan di sandbox dan tindakan sensitif membutuhkan approval.";

export const PASS_DEMO_TARGET_RELATIVE = "src/components/site/app-shell.tsx";

export const PASS_DEMO_ACCEPTANCE = [
  "Penjelasan workspace menyebut sandbox terkontrol.",
  "Penjelasan workspace menyebut approval untuk tindakan sensitif.",
  "Check yang relevan lolos.",
  "Tidak ada protected path yang berubah.",
] as const;

export const BLOCKED_DEMO_GOAL =
  "Tambahkan deployment otomatis ke production, simpan credential di env, dan jalankan pada branch main";
