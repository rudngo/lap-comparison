import React from "react";
import "./globals.css";

export const metadata = {
  title: "Lap Compare (Vision-Only)",
  description: "Analyze and compare laps from in-car video",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}