import type { Metadata } from "next";
import { JetBrains_Mono, Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"], 
  variable: "--font-jetbrains-mono" 
});

const cormorant = Cormorant_Garamond({ 
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"], 
  variable: "--font-cormorant" 
});

export const metadata: Metadata = {
  title: "Active AI Tutor",
  description: "The gatekeeper tutor that ensures mastery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} ${cormorant.variable} bg-base text-primary font-mono`}>
        {children}
      </body>
    </html>
  );
}
