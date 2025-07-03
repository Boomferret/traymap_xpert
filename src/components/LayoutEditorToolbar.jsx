// src/components/LayoutEditorToolbar.jsx
"use client";

import { Button } from '@/components/ui/button';
import { EditorModes } from '@/constants/editorModes';

export const LayoutEditorToolbar = ({ activeMode, onModeChange, machines }) => {
  return (
    <div className="flex gap-2 mb-4">
      <Button 
        variant={activeMode === EditorModes.WALL ? "secondary" : "outline"}
        onClick={() => onModeChange(EditorModes.WALL)}
      >
        Add Walls
      </Button>
      <Button 
        variant={activeMode === EditorModes.TRAY ? "secondary" : "outline"}
        onClick={() => onModeChange(EditorModes.TRAY)}
      >
        Add Tray
      </Button>
      <Button 
        variant={activeMode === EditorModes.PERFORATION ? "secondary" : "outline"}
        onClick={() => onModeChange(EditorModes.PERFORATION)}
        disabled={activeMode === EditorModes.VIEW}
      >
        Add Perforations
      </Button>
      <Button 
        variant={activeMode === EditorModes.MACHINE ? "secondary" : "outline"}
        onClick={() => onModeChange(EditorModes.MACHINE)}
        disabled={activeMode === EditorModes.VIEW}
      >
        Place Machines
      </Button>
      <Button 
        variant={activeMode === EditorModes.VIEW ? "secondary" : "outline"}
        onClick={() => onModeChange(EditorModes.VIEW)}
        disabled={!machines || Object.keys(machines).length < 2}
      >
        View Layout
      </Button>
    </div>
  );
};