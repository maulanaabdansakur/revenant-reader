import "./globals.css";

export const metadata = {
  title: "Revenant Reader — RSS, reborn",
  description:
    "RSS, reborn as an AI newsroom. Subscribe to feeds; agent hooks summarize, dedupe, and rank every story.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
