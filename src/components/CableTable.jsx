"use client";

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter } from 'lucide-react';

export const CableTable = ({ cables }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    function: new Set(),
    source: new Set(),
    target: new Set(),
  });

  const filteredCables = cables.filter(cable => {
    const matchesSearch = Object.values(cable).some(value => 
      value.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const matchesFilters = (
      (!filters.function.size || filters.function.has(cable['Cable Function'])) &&
      (!filters.source.size || filters.source.has(cable['Source (+)'])) &&
      (!filters.target.size || filters.target.has(cable['Target (+)']))
    );

    return matchesSearch && matchesFilters;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search cables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => {/* Open filter dialog */}}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cable Label</TableHead>
              <TableHead>Function</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Source Location</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Target Location</TableHead>
              <TableHead>Length</TableHead>
              <TableHead>Cable Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCables.map((cable) => (
              <TableRow key={cable['ID']}>
                <TableCell className="font-medium">{cable['Cable Label']}</TableCell>
                <TableCell>{cable['Cable Function']}</TableCell>
                <TableCell>{cable['Source (+)']}</TableCell>
                <TableCell>{cable['Source Mounting Location']}</TableCell>
                <TableCell>{cable['Target (+)']}</TableCell>
                <TableCell>{cable['Target Mounting Location']}</TableCell>
                <TableCell>{cable['Length']}</TableCell>
                <TableCell>{cable['Cable Type']}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};