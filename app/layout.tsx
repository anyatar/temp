import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "עסקאות נדל״ן: שאלות ותשובות",
  description: "שאלות על עסקאות נדל״ן למגורים, עם תשובות שמבוססות על הנתונים בלבד",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={heebo.className}>
      <body>{children}</body>
    </html>
  );
}
