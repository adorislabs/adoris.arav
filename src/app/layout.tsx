
import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const interFont = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: "swap",
});

const loraFont = Lora({ 
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"], 
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adoris Tutor",
  description: "A refined active reading environment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${interFont.variable} ${loraFont.variable} bg-base text-primary font-sans`}>
        {children}
      </body>
    </html>
  );
}
