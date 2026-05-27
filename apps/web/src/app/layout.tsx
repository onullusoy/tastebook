import React from "react";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Tastebook",
  description: "Your personal taste journal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-warm-50 text-stone-800 antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
