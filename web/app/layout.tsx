import type { Metadata } from "next";
import "./globals.css";
import SampleChat from "@/components/SampleChat";

export const metadata: Metadata = {
  title: "Composed",
  description: "Collaborative Jam Sessions",
};

const CHATBOT_API_URL = process.env.NEXT_PUBLIC_CHATBOT_URL || "http://localhost:8000";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Satoshi:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
        <SampleChat apiUrl={CHATBOT_API_URL} />
      </body>
    </html>
  );
}
