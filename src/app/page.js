"use client";

import { LayoutEditor } from '@/components/LayoutEditor';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="h-screen flex flex-col">
        <div className="p-8 bg-white border-b border-gray-200">
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#457fca] to-[#5691c8] drop-shadow-lg">
            TrayMap Xpert
          </h1>
        </div>
        <div className="flex-1 min-h-0">
          <LayoutEditor />
        </div>
      </div>
    </main>
  );
}