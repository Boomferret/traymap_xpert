"use client";

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { EditorModes } from '@/constants/editorModes';
import { optimizeNetworkPaths } from '@/utils/cableUtils';

export const LayoutGrid = ({ 
  gridSize,
  cellSize,
  walls = [],
  perforations = [],
  machines = {},
  cables = [],
  activeMode,
  selectedMachine = null,
  onWallAdd,
  onPerforationAdd,
  onMachinePlace,
  onMachineMove,
  availableMachines = []
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [previewWalls, setPreviewWalls] = useState([]);
  const [draggedMachine, setDraggedMachine] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [tooltipInfo, setTooltipInfo] = useState(null);

  const svgRef = useRef(null);
  const tooltipRef = useRef(null);

  const CANVAS_SIZE = gridSize * cellSize;
  const getGridCoordinates = useCallback((e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cellSize);
    const y = Math.floor((e.clientY - rect.top) / cellSize);
    return { x, y };
  }, [cellSize]);

  const getPerimeterCells = useCallback((start, end) => {
    const cells = [];
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    for (let x = minX; x <= maxX; x++) {
      cells.push({ x, y: minY });
      cells.push({ x, y: maxY });
    }
    for (let y = minY + 1; y < maxY; y++) {
      cells.push({ x: minX, y });
      cells.push({ x: maxX, y });
    }
    return cells;
  }, []);

  const getCursorStyle = useCallback(() => {
    if (selectedMachine) return 'cursor-crosshair';
    switch (activeMode) {
      case EditorModes.WALL: return 'cursor-crosshair';
      case EditorModes.PERFORATION: return 'cursor-cell';
      default: return 'cursor-default';
    }
  }, [activeMode, selectedMachine]);

  const getMachineConnections = useCallback((machineName) => {
    if (!cables || !Array.isArray(cables)) return { sources: [], targets: [] };

    return {
      sources: cables.filter(cable => cable.source === machineName),
      targets: cables.filter(cable => cable.target === machineName)
    };
  }, [cables]);
  const handleMouseDown = useCallback((e) => {
    if (activeMode === EditorModes.WALL) {
      e.preventDefault();
      const coords = getGridCoordinates(e);
      setIsDragging(true);
      setDragStart(coords);
      setDragEnd(coords);
      setPreviewWalls([{ x: coords.x, y: coords.y }]);
    }
  }, [activeMode, getGridCoordinates]);

  const handleMouseMove = useCallback((e) => {
    const coords = getGridCoordinates(e);

    if (isDragging && activeMode === EditorModes.WALL) {
      setDragEnd(coords);
      if (dragStart) {
        const perimeterWalls = getPerimeterCells(dragStart, coords);
        setPreviewWalls(perimeterWalls);
      }
    }

    setDragPosition(coords);
  }, [isDragging, activeMode, dragStart, getGridCoordinates, getPerimeterCells]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && activeMode === EditorModes.WALL && dragStart && dragEnd) {
      const wallCells = getPerimeterCells(dragStart, dragEnd);
      wallCells.forEach(cell => {
        onWallAdd(cell.x, cell.y);
      });
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setPreviewWalls([]);
  }, [isDragging, activeMode, dragStart, dragEnd, getPerimeterCells, onWallAdd]);

  const handleClick = useCallback((e) => {
    const coords = getGridCoordinates(e);
    
    switch (activeMode) {
      case EditorModes.PERFORATION:
        onPerforationAdd(coords.x, coords.y);
        break;
      case EditorModes.MACHINE:
        if (selectedMachine) {
          onMachinePlace(coords.x, coords.y);
        }
        break;
    }
  }, [activeMode, selectedMachine, getGridCoordinates, onPerforationAdd, onMachinePlace]);

  const handleMachineDragStart = useCallback((e, machineName) => {
    e.stopPropagation();
    setDraggedMachine(machineName);
  }, []);

  const handleMachineDragEnd = useCallback(() => {
    if (draggedMachine && dragPosition) {
      onMachineMove(draggedMachine, dragPosition.x, dragPosition.y);
    }
    setDraggedMachine(null);
    setDragPosition(null);
  }, [draggedMachine, dragPosition, onMachineMove]);
  const handleSectionHover = useCallback((sectionKey, section, event) => {
    if (!section || !event) {
      setTooltipInfo(null);
      return;
    }

    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    setTooltipInfo({
      type: 'section',
      data: section,
      position: {
        x: event.clientX - svgRect.left,
        y: event.clientY - svgRect.top
      }
    });
  }, []);

  const handleMachineHover = useCallback((machineName, event) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    const { sources, targets } = getMachineConnections(machineName);
    const machine = availableMachines.find(m => m.name === machineName);

    setTooltipInfo({
      type: 'machine',
      data: {
        name: machineName,
        description: machine?.description,
        sources,
        targets
      },
      position: {
        x: event.clientX - svgRect.left,
        y: event.clientY - svgRect.top
      }
    });
  }, [getMachineConnections, availableMachines]);

  const TooltipContent = ({ info }) => {
    if (info.type === 'section') {
      const section = info.data;
      return (
        <>
          <div className="mb-2">
            <p className="font-medium text-gray-900 flex items-center gap-2">
              <span 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: section.color }}
              />
              {section.function}
              <span className="text-sm text-gray-500">
                ({section.cables.size} cables)
              </span>
            </p>
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {Array.from(section.cables).sort().map((cableName, index) => {
              const cable = cables.find(c => c.cableLabel === cableName || c.name === cableName);
              if (!cable) return null;
              return (
                <li key={`${cableName}-${index}`} className="text-sm text-gray-600">
                  <div className="flex items-center">
                    <span 
                      className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: section.color }}
                    />
                    <span className="font-medium">{cable.cableLabel || cable.name}</span>
                  </div>
                  <div className="text-gray-500 text-xs ml-4 mt-0.5">
                    {cable.source} → {cable.target}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      );
    }

    if (info.type === 'machine') {
      const machine = info.data;
      return (
        <>
          <div className="mb-2">
            <h3 className="font-medium text-gray-900">{machine.name}</h3>
            {machine.description && (
              <p className="text-sm text-gray-500 mt-1">{machine.description}</p>
            )}
          </div>
          {machine.sources.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Source Cables:</h4>
              <ul className="space-y-1">
                {machine.sources.map((cable, index) => (
                  <li key={`source-${cable.name}-${index}`} className="text-sm text-gray-600 flex items-center">
                    <span 
                      className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: cable.color }}
                    />
                    <span className="font-medium">{cable.name}</span>
                    <span className="mx-1">→</span>
                    <span className="text-gray-500">{cable.target}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {machine.targets.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Target Cables:</h4>
              <ul className="space-y-1">
                {machine.targets.map((cable, index) => (
                  <li key={`target-${cable.name}-${index}`} className="text-sm text-gray-600 flex items-center">
                    <span 
                      className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: cable.color }}
                    />
                    <span className="font-medium">{cable.name}</span>
                    <span className="mx-1">→</span>
                    <span className="text-gray-500">from {cable.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      );
    }

    return null;
  };
  const { sections } = useMemo(() => {
    if (!machines || Object.keys(machines).length < 2 || !cables || !Array.isArray(cables)) {
      return { sections: new Map() };
    }

    try {
      const { sections } = optimizeNetworkPaths(cables, machines, walls, perforations, gridSize);
      return { sections };
    } catch (error) {
      console.error('Error calculating paths:', error);
      return { sections: new Map() };
    }
  }, [cables, machines, walls, perforations, gridSize]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className={`cable-tray-grid ${getCursorStyle()}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setDragPosition(null);
          setTooltipInfo(null);
        }}
        onClick={handleClick}
      >
        {/* Grid lines */}
        {Array.from({ length: gridSize + 1 }).map((_, i) => (
          <React.Fragment key={`grid-${i}`}>
            <line
              x1={0}
              y1={i * cellSize}
              x2={CANVAS_SIZE}
              y2={i * cellSize}
              stroke="#f0f0f0"
              strokeWidth="0.5"
            />
            <line
              x1={i * cellSize}
              y1={0}
              x2={i * cellSize}
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
            x={wall.x * cellSize}
            y={wall.y * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#374151"
            className="opacity-80"
          />
        ))}

        {/* Preview Walls */}
        {activeMode === EditorModes.WALL && previewWalls.map((wall, index) => (
          <rect
            key={`preview-${index}`}
            x={wall.x * cellSize}
            y={wall.y * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#374151"
            className="opacity-40"
          />
        ))}

        {/* Perforations */}
        {perforations.map((perf, index) => (
          <circle
            key={`perf-${index}`}
            cx={(perf.x + 0.5) * cellSize}
            cy={(perf.y + 0.5) * cellSize}
            r={cellSize * 0.3}
            fill="#fbbf24"
            className="opacity-80"
          />
        ))}

        {/* Cable Sections */}
        {Array.from(sections.entries()).map(([sectionKey, section]) => {
          const points = section.points;
          const pathD = `M ${points[0].x * cellSize} ${points[0].y * cellSize} ` +
                       `L ${points[1].x * cellSize} ${points[1].y * cellSize}`;
          
          const cableCount = section.cables.size;
          const strokeWidth = Math.min(4 + cableCount * 2, 16);
          
          return (
            <g 
              key={sectionKey}
              onMouseEnter={(e) => handleSectionHover(sectionKey, section, e)}
              onMouseLeave={() => handleSectionHover(null, null)}
            >
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
                stroke={section.color}
                strokeWidth={strokeWidth}
                strokeOpacity={0.8}
                fill="none"
                className="cable-path"
                strokeLinecap="round"
              />
              {section.type === 'trunk' && (
                <circle
                  cx={points[1].x * cellSize}
                  cy={points[1].y * cellSize}
                  r={4}
                  fill={section.color}
                  className="cable-trunk-node"
                  strokeWidth={1}
                  stroke="white"
                />
              )}
            </g>
          );
        })}

        {/* Machine Preview */}
        {activeMode === EditorModes.MACHINE && selectedMachine && dragPosition && !draggedMachine && (
          <g className="opacity-50">
            <circle
              cx={(dragPosition.x + 0.5) * cellSize}
              cy={(dragPosition.y + 0.5) * cellSize}
              r={cellSize * 0.4}
              fill="#10b981"
              stroke="white"
              strokeWidth={2}
            />
            <text
              x={(dragPosition.x + 0.5) * cellSize}
              y={dragPosition.y * cellSize - 5}
              textAnchor="middle"
              className="text-sm font-medium"
            >
              {selectedMachine.name}
            </text>
          </g>
        )}
        {/* Machines */}
        {Object.entries(machines).map(([name, pos]) => (
          <g 
            key={name}
            className={`machine-node transition-transform ${draggedMachine === name ? 'opacity-50' : ''}`}
            draggable="true"
            onDragStart={(e) => handleMachineDragStart(e, name)}
            onDragEnd={handleMachineDragEnd}
            onMouseEnter={(e) => handleMachineHover(name, e)}
            onMouseLeave={() => setTooltipInfo(null)}
          >
            <circle
              cx={(pos.x + 0.5) * cellSize}
              cy={(pos.y + 0.5) * cellSize}
              r={cellSize * 0.4}
              fill={draggedMachine === name ? "#9333ea" : "#10b981"}
              stroke="white"
              strokeWidth={2}
            />
            <text
              x={(pos.x + 0.5) * cellSize}
              y={pos.y * cellSize - 5}
              textAnchor="middle"
              className="text-sm font-medium select-none"
            >
              {name}
            </text>
          </g>
        ))}
      </svg>

      {/* Enhanced tooltip */}
      {tooltipInfo && (
        <div
          className="absolute bg-white p-3 rounded-lg shadow-lg border border-gray-200 z-10"
          style={{
            left: tooltipInfo.position.x + 10,
            top: tooltipInfo.position.y - 10,
            transform: 'translate(0, -100%)',
            minWidth: '250px',
            maxWidth: '400px'
          }}
        >
          <TooltipContent info={tooltipInfo} />
        </div>
      )}
    </div>
  );
};

export default LayoutGrid;