"use client";

import { LayoutEditor } from '@/components/LayoutEditor';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-[#457fca] to-[#5691c8] drop-shadow-lg">
          TrayMap Xpert
        </h1>
        <LayoutEditor />
      </div>
    </main>
  );
}