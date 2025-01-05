"use client";

import { useCallback } from 'react';
import { Button } from '../ui/button';
import { parseCSV, extractMachines, extractCableFunctions } from '../utils/csvParser';

export const CableImport = ({ onCablesImported }) => {
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (file) {
      const text = await file.text();
      const cables = parseCSV(text);
      const machines = extractMachines(cables);
      const functions = extractCableFunctions(cables);
      
      onCablesImported({
        cables: cables.filter(c => c['Internal / External'] !== 'INTERNAL'),
        machines,
        functions
      });
    }
  }, [onCablesImported]);

  return (
    <div className="mb-4">
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
        id="csv-upload"
      />
      <Button onClick={() => document.getElementById('csv-upload').click()}>
        Import Cable List
      </Button>
    </div>
  );
};