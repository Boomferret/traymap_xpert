"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateRandomCables, findPath, optimizeNetworkPaths } from '@/utils/cableUtils';
import '@/styles/CableTrayLayout.css';
import { InfoPanel } from '@/components/InfoPanel';

const CableTrayLayout = ({ machines = {}, walls = [], perforations = [] }) => {
  const [cables, setCables] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [showPower, setShowPower] = useState(true);
  const [showControl, setShowControl] = useState(true);
  const [showCableList, setShowCableList] = useState(false);
  const [selectedCable, setSelectedCable] = useState(null);
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  
  const GRID_SIZE = 50;
  const CELL_SIZE = 10;
  const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;

  useEffect(() => {
    if (machines && Object.keys(machines).length >= 2) {
      setCables(generateRandomCables(machines));
    } else {
      setCables([]);
    }
  }, [machines]);

  const { sections, cableRoutes } = useMemo(() => {
    if (!machines || Object.keys(machines).length < 2) {
      return { sections: new Map(), cableRoutes: new Map() };
    }

    const allSections = new Map();
    const allCableRoutes = new Map();
    
    if (showPower) {
      const powerCables = cables.filter(c => c.type === 'power');
      const { sections: powerSections, cableRoutes: powerRoutes } = 
        optimizeNetworkPaths('power', powerCables, machines, walls, perforations, GRID_SIZE);
      powerSections.forEach((section, key) => allSections.set(key, section));
      powerRoutes.forEach((route, cable) => allCableRoutes.set(cable, route));
    }

    if (showControl) {
      const controlCables = cables.filter(c => c.type === 'control');
      const { sections: controlSections, cableRoutes: controlRoutes } = 
        optimizeNetworkPaths('control', controlCables, machines, walls, perforations, GRID_SIZE);
      controlSections.forEach((section, key) => allSections.set(key, section));
      controlRoutes.forEach((route, cable) => allCableRoutes.set(cable, route));
    }

    return { sections: allSections, cableRoutes: allCableRoutes };
  }, [cables, showPower, showControl, GRID_SIZE, machines, walls, perforations]);

  const getMatchingSections = (targetCables) => {
    const targetSet = new Set(targetCables);
    return Array.from(sections.keys()).filter(key => {
      const sectionCables = sections.get(key).cables;
      if (sectionCables.size !== targetSet.size) return false;
      return Array.from(sectionCables).every(cable => targetSet.has(cable));
    });
  };

  const handleCableChange = (value) => {
    const newValue = value === "none" ? null : value;
    setSelectedCable(newValue);
    setSelectedSection(null);
    setTooltipInfo(null);
    setSelectedElement(null);
  };

  const handleMouseMove = (e, sectionKey, section) => {
    if (!selectedCable && !selectedElement) {
      setTooltipInfo({
        type: 'section',
        section,
        sectionKey
      });
    }
  };

  const handleMouseLeave = () => {
    if (!selectedCable && !selectedElement) {
      setTooltipInfo(null);
    }
  };

  const handleSectionClick = (sectionKey, section) => {
    setSelectedElement({
      type: 'section',
      section,
      sectionKey
    });
  };

  const handleMachineClick = (name, powerCables, controlCables) => {
    setSelectedElement({
      type: 'machine',
      name,
      powerCables,
      controlCables
    });
  };

  const isSectionHighlighted = (sectionKey, section) => {
    if (selectedCable) {
      return section.cables.has(selectedCable);
    }
    if (selectedSection) {
      const matchingSections = getMatchingSections(sections.get(selectedSection).cables);
      return matchingSections.includes(sectionKey) || sectionKey === selectedSection;
    }
    return false;
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between mb-4">
        <div className="flex space-x-8">
          <div className="flex items-center space-x-2">
            <Switch
              id="power-toggle"
              checked={showPower}
              onCheckedChange={setShowPower}
            />
            <Label htmlFor="power-toggle" className="text-red-500 font-medium">
              Power Network
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="control-toggle"
              checked={showControl}
              onCheckedChange={setShowControl}
            />
            <Label htmlFor="control-toggle" className="text-blue-600 font-medium">
              Control Network
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Select
              value={selectedCable || "none"}
              onValueChange={handleCableChange}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select Cable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {cables
                  .sort((a, b) => a.cableLabel.localeCompare(b.cableLabel))
                  .map(cable => (
                    <SelectItem key={cable.cableLabel} value={cable.cableLabel}>
                      {cable.cableLabel}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => setShowCableList(!showCableList)}>
          {showCableList ? 'Hide' : 'Show'} Cable List
        </Button>
      </div>

      <div className="flex gap-6">
        <div className="cable-tray">
          <svg
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="cable-tray-grid"
          >
            {/* Grid lines */}
            {Array.from({ length: GRID_SIZE + 1 }).map((_, i) => (
              <React.Fragment key={`grid-${i}`}>
                <line
                  x1={0}
                  y1={i * CELL_SIZE}
                  x2={CANVAS_SIZE}
                  y2={i * CELL_SIZE}
                  stroke="#f0f0f0"
                  strokeWidth="0.5"
                />
                <line
                  x1={i * CELL_SIZE}
                  y1={0}
                  x2={i * CELL_SIZE}
                  y2={CANVAS_SIZE}
                  stroke="#f0f0f0"
                  strokeWidth="0.5"
                />
              </React.Fragment>
            ))}

            {/* Walls */}
            {walls.map((wall, index) => (
              <rect
                key={`wall-${index}`}
                x={wall.x * CELL_SIZE}
                y={wall.y * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill="#374151"
                className="opacity-80"
              />
            ))}

            {/* Perforations */}
            {perforations.map((perf, index) => (
              <circle
                key={`perf-${index}`}
                cx={(perf.x + 0.5) * CELL_SIZE}
                cy={(perf.y + 0.5) * CELL_SIZE}
                r={CELL_SIZE * 0.3}
                fill="#fbbf24"
                className="opacity-80"
              />
            ))}
            
            {/* Cable sections */}
            {Array.from(sections.entries()).map(([sectionKey, section]) => {
              const points = section.points;
              const pathD = `M ${points[0].x * CELL_SIZE} ${points[0].y * CELL_SIZE} ` +
                `L ${points[1].x * CELL_SIZE} ${points[1].y * CELL_SIZE}`;
              
              const cableCount = section.cables.size;
              const strokeWidth = Math.min(4 + cableCount * 2, 16);
              
              const isHighlighted = isSectionHighlighted(sectionKey, section);
              const baseColor = section.function === 'power' ? '#ef4444' : '#2563eb';
              const highlightColor = section.function === 'power' ? '#dc2626' : '#1d4ed8';
              
              return (
                <g key={sectionKey} opacity={selectedCable && !isHighlighted ? 0.25 : 1}>
                  {/* Shadow effect */}
                  <path
                    d={pathD}
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth={strokeWidth + 2}
                    strokeLinecap="round"
                    fill="none"
                    transform="translate(1, 1)"
                  />
                  {/* Main path */}
                  <path
                    d={pathD}
                    stroke={isHighlighted ? highlightColor : baseColor}
                    strokeWidth={isHighlighted ? strokeWidth + 2 : strokeWidth}
                    strokeOpacity={isHighlighted ? 1 : 0.8}
                    fill="none"
                    className="cable-path"
                    strokeLinecap="round"
                    onClick={() => handleSectionClick(sectionKey, section)}
                    onMouseMove={(e) => handleMouseMove(e, sectionKey, section)}
                    onMouseLeave={handleMouseLeave}
                  />
                  {section.type === 'trunk' && (
                    <>
                      {/* Junction point shadow */}
                      <circle
                        cx={points[1].x * CELL_SIZE + 1}
                        cy={points[1].y * CELL_SIZE + 1}
                        r={4}
                        fill="rgba(0,0,0,0.1)"
                      />
                      {/* Junction point */}
                      <circle
                        cx={points[1].x * CELL_SIZE}
                        cy={points[1].y * CELL_SIZE}
                        r={4}
                        fill={isHighlighted ? highlightColor : baseColor}
                        className="cable-trunk-node"
                        strokeWidth={1}
                        stroke="white"
                      />
                    </>
                  )}
                </g>
              );
            })}
            
            {/* Machines */}
            {machines && Object.entries(machines).map(([name, pos]) => {
              const connectedCables = cables.filter(cable => 
                cable.source === name || cable.target === name
              ).sort((a, b) => a.cableLabel.localeCompare(b.cableLabel));

              const powerCables = connectedCables.filter(cable => cable.type === 'power');
              const controlCables = connectedCables.filter(cable => cable.type === 'control');

              return (
                <g 
                  key={name} 
                  className="machine-node"
                  onClick={() => handleMachineClick(name, powerCables, controlCables)}
                  onMouseMove={() => {
                    if (!selectedElement) {
                      setTooltipInfo({
                        type: 'machine',
                        name,
                        powerCables,
                        controlCables
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    if (!selectedElement) {
                      setTooltipInfo(null);
                    }
                  }}
                >
                  {/* Machine point shadow */}
                  <circle
                    cx={pos.x * CELL_SIZE + 1}
                    cy={pos.y * CELL_SIZE + 1}
                    r={6}
                    fill="rgba(0,0,0,0.1)"
                  />
                  {/* Machine point */}
                  <circle
                    cx={pos.x * CELL_SIZE}
                    cy={pos.y * CELL_SIZE}
                    r={6}
                    fill="#10b981"
                    stroke="white"
                    strokeWidth={2}
                  />
                  {/* Machine label */}
                  <text
                    x={pos.x * CELL_SIZE}
                    y={(pos.y * CELL_SIZE) - 12}
                    textAnchor="middle"
                    className="cable-machine"
                  >
                    {name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Info Panel */}
        {(tooltipInfo || selectedElement) && (
          <InfoPanel 
            hoveredElement={tooltipInfo}
            selectedElement={selectedElement}
            onClose={() => setSelectedElement(null)}
            onCableHover={()=>{}}
          />
        )}
      </div>
    </Card>
  );
};

export default CableTrayLayout;