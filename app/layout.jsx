import "./globals.css";

export const metadata = {
  title: "AI 求职投递管家",
  description: "AI job application assistant for verified roles, tailored resumes, and application tracking."
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
