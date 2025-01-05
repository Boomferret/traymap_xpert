"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { optimizeNetworkPaths } from '@/utils/cableUtils';
import { EditorModes } from '@/constants/editorModes';
import { CableTraySimulation } from './CableTraySimulation';

// Add this function before the LayoutGrid component definition
const preprocessBlockedGrid = (walls, perforations, gridSize) => {
  // Create a 2D array to represent the grid
  const blockedGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(false));

  // Mark walls as blocked
  walls.forEach(wall => {
    if (wall.x >= 0 && wall.x < gridSize && wall.y >= 0 && wall.y < gridSize) {
      blockedGrid[wall.y][wall.x] = true;
    }
  });

  // Mark perforations as passable (false)
  perforations.forEach(perf => {
    if (perf.x >= 0 && perf.x < gridSize && perf.y >= 0 && perf.y < gridSize) {
      blockedGrid[perf.y][perf.x] = false;
    }
  });

  // Helper function to check if a cell is blocked
  return (x, y) => {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return true;
    return blockedGrid[y][x];
  };
};

// Memoized machine label component for better performance
const MachineLabelComponent = React.memo(({ name, pos, cellSize, svgRef }) => {
  const [labelPos, setLabelPos] = useState({ x: 0, y: 0, anchor: 'middle' });
  const lines = name.split('\n');

  useEffect(() => {
    if (!svgRef.current) return;

    const findBestPosition = () => {
      const positions = [
        { x: pos.x * cellSize + cellSize/2, y: pos.y * cellSize - 15, anchor: 'middle' },  // Above
        { x: pos.x * cellSize + cellSize + 15, y: pos.y * cellSize + cellSize/2, anchor: 'start' },   // Right
        { x: pos.x * cellSize + cellSize/2, y: pos.y * cellSize + cellSize + 15, anchor: 'middle' },  // Below
        { x: pos.x * cellSize - 15, y: pos.y * cellSize + cellSize/2, anchor: 'end' }      // Left
      ];

      // Score each position based on collisions with existing elements
      const scores = positions.map(pos => {
        let score = 0;
        const bounds = svgRef.current.getBoundingClientRect();
        const svgPoint = new DOMPoint(pos.x, pos.y);
        
        // Check if position is within SVG bounds
        if (pos.x >= 0 && pos.x <= bounds.width && pos.y >= 0 && pos.y <= bounds.height) {
          score += 10;
        }

        // Check for collisions with walls, trays, and other labels
        const elements = svgRef.current.querySelectorAll('path, rect');
        let hasCollision = false;
        elements.forEach(element => {
          const elementBounds = element.getBoundingClientRect();
          if (elementBounds.left <= pos.x && elementBounds.right >= pos.x &&
              elementBounds.top <= pos.y && elementBounds.bottom >= pos.y) {
            hasCollision = true;
          }
        });

        if (!hasCollision) score += 20;

        return { ...pos, score };
      });

      // Return the position with the highest score
      return scores.reduce((best, current) => 
        current.score > best.score ? current : best
      , scores[0]);
    };

    setLabelPos(findBestPosition());
  }, [pos, cellSize, name, svgRef]);

  // Calculate width based on the longest line
  const maxWidth = Math.max(...lines.map(line => line.length)) * 8;
  // Calculate height based on the number of lines
  const totalHeight = lines.length * 12;

  return (
    <g>
      <rect
        x={labelPos.x - maxWidth / 2}
        y={labelPos.y - totalHeight / 2}
        width={maxWidth}
        height={totalHeight}
        fill="white"
        opacity="0.9"
        rx="2"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={labelPos.x}
          y={labelPos.y + (i - (lines.length - 1) / 2) * 12}
          textAnchor={labelPos.anchor}
          className="text-sm font-medium select-none"
          style={{
            filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.1))',
            paintOrder: 'stroke',
            stroke: 'white',
            strokeWidth: '3px',
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          }}
        >
          {line}
        </text>
      ))}
    </g>
  );
});
export const LayoutGrid = ({ 
    gridSize,
    cellSize,
    walls = [],
    perforations = [],
    machines = {},
    cables = [],
    networkVisibility = {},
    activeMode,
    selectedMachine = null,
    selectedCable = null,
    onWallAdd,
    onPerforationAdd,
    onMachinePlace,
    onMachineMove
  }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);
    const [previewWalls, setPreviewWalls] = useState([]);
    const [draggedMachine, setDraggedMachine] = useState(null);
    const [dragPosition, setDragPosition] = useState(null);
    const [tooltipInfo, setTooltipInfo] = useState(null);
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [hoveredSegmentKey, setHoveredSegmentKey] = useState(null);
    const [simulationOpen, setSimulationOpen] = useState(false);
    const [selectedSectionCables, setSelectedSectionCables] = useState([]);
    const [hoveredNetwork, setHoveredNetwork] = useState(null);
  
    const svgRef = useRef(null);
    const tooltipRef = useRef(null);
  
    const CANVAS_SIZE = gridSize * cellSize;
  
    // Enable tooltip scrolling
    useEffect(() => {
      const handleWheel = (e) => {
        if (activeTooltip && tooltipRef.current) {
          const tooltip = tooltipRef.current;
          const scrollableContent = tooltip.querySelector('.tooltip-scroll');
          if (scrollableContent) {
            scrollableContent.scrollTop += e.deltaY;
            e.preventDefault();
          }
        }
      };
  
      window.addEventListener('wheel', handleWheel, { passive: false });
      return () => window.removeEventListener('wheel', handleWheel);
    }, [activeTooltip]);
    // Event handlers
  const getGridCoordinates = useCallback((e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / cellSize);
    const y = Math.round((e.clientY - rect.top) / cellSize);
    return { x, y };
  }, [cellSize]);

  const getCursorStyle = useCallback(() => {
    if (selectedMachine) return 'cursor-crosshair';
    switch (activeMode) {
      case EditorModes.WALL: return 'cursor-crosshair';
      case EditorModes.PERFORATION: return 'cursor-cell';
      default: return 'cursor-default';
    }
  }, [activeMode, selectedMachine]);

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
        const x1 = Math.min(dragStart.x, coords.x);
        const x2 = Math.max(dragStart.x, coords.x);
        const y1 = Math.min(dragStart.y, coords.y);
        const y2 = Math.max(dragStart.y, coords.y);
        const previewCells = [];

        // Generate only perimeter walls
        for (let x = x1; x <= x2; x++) {
          // Top and bottom walls
          previewCells.push({ x, y: y1 });
          if (y1 !== y2) {
            previewCells.push({ x, y: y2 });
          }
        }
        for (let y = y1 + 1; y < y2; y++) {
          // Left and right walls
          previewCells.push({ x: x1, y });
          previewCells.push({ x: x2, y });
        }
        setPreviewWalls(previewCells);
      }
    }

    setDragPosition(coords);
  }, [isDragging, activeMode, dragStart, getGridCoordinates]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && activeMode === EditorModes.WALL && dragStart) {
      const x1 = Math.min(dragStart.x, dragEnd.x);
      const x2 = Math.max(dragStart.x, dragEnd.x);
      const y1 = Math.min(dragStart.y, dragEnd.y);
      const y2 = Math.max(dragStart.y, dragEnd.y);

      // Add only perimeter walls
      for (let x = x1; x <= x2; x++) {
        // Top and bottom walls
        onWallAdd(x, y1);
        if (y1 !== y2) {
          onWallAdd(x, y2);
        }
      }
      for (let y = y1 + 1; y < y2; y++) {
        // Left and right walls
        onWallAdd(x1, y);
        onWallAdd(x2, y);
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setPreviewWalls([]);
  }, [isDragging, activeMode, dragStart, dragEnd, onWallAdd]);

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
  // Section and machine interaction handlers
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

  const handleSectionHover = useCallback((sectionKey, section, e, lengthInMeters) => {
    if (!section || !e) {
      if (!activeTooltip) {
        setTooltipInfo(null);
      }
      return;
    }

    const svgRect = svgRef.current?.getBoundingClientRect();
    setTooltipInfo({
      type: 'section',
      data: {
        ...section,
        length: lengthInMeters
      },
      position: {
        x: e.clientX - svgRect.left,
        y: e.clientY - svgRect.top
      }
    });
  }, [activeTooltip]);

    // Calculate sections from cable paths
    const { sections, processedSections } = useMemo(() => {
      if (!machines || Object.keys(machines).length < 2 || !cables || !Array.isArray(cables)) {
        return { sections: new Map(), processedSections: [] };
      }

      try {
        // Preprocess blocked grid
        const isBlockedGrid = preprocessBlockedGrid(walls, perforations, gridSize);

        // Optimize paths using the preprocessed grid
        const { sections } = optimizeNetworkPaths(cables, machines, walls, perforations, gridSize, isBlockedGrid);

        // Process sections once for rendering
        const processedSections = [];
        
        // First, group sections by their cable sets and network type
        const sectionGroups = new Map();
        
        sections.forEach((section, sectionKey) => {
          const networkType = section.function;
          const cableKey = Array.from(section.cables).sort().join(',');
          const groupKey = `${networkType}-${cableKey}`;
          
          if (!sectionGroups.has(groupKey)) {
            sectionGroups.set(groupKey, {
              points: [],
              cables: section.cables,
              color: section.color,
              function: networkType,
              details: section.details
            });
          }
          
          sectionGroups.get(groupKey).points.push(...section.points);
        });

        // Convert groups to processed sections
        sectionGroups.forEach((group, groupKey) => {
          // Remove duplicate points while maintaining order
          const uniquePoints = [];
          const seenPoints = new Set();
          
          group.points.forEach(point => {
            const pointKey = `${point.x},${point.y}`;
            if (!seenPoints.has(pointKey)) {
              seenPoints.add(pointKey);
              uniquePoints.push(point);
            }
          });

          processedSections.push({
            key: groupKey,
            points: uniquePoints,
            cables: group.cables,
            color: group.color,
            function: group.function,
            details: group.details
          });
        });

        return { sections, processedSections };
      } catch (error) {
        console.error('Error calculating paths:', error);
        return { sections: new Map(), processedSections: [] };
      }
    }, [cables, machines, walls, perforations, gridSize]);
    

  const handleSectionClick = useCallback((section) => {
    setActiveTooltip(prev => {
      if (prev?.data === section) {
        return null;
      }
      return {
        type: 'section',
        data: section,
        position: tooltipInfo?.position
      };
    });
  }, [tooltipInfo]);

  // Calculate section opacity based on selected cable
  const getSectionOpacity = useCallback((section) => {
    if (!selectedCable) return 1;
    return section.cables.has(selectedCable) ? 1 : 0.2;
  }, [selectedCable]);
  // Tooltip content component
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
            {section.length && (
              <p className="text-sm text-gray-600 mt-1">
                Length: {section.length.toFixed(1)}m
              </p>
            )}
          </div>
          <div className="tooltip-scroll overflow-y-auto max-h-48">
            <ul className="space-y-1">
              {Array.from(section.cables).sort().map((cableName, index) => {
                const cable = section.details.get(cableName);
                if (!cable) return null;
                return (
                  <li key={`${cableName}-${index}`} className="text-sm text-gray-600">
                    <div className="flex items-center">
                      <span 
                        className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      />
                      <span className="font-medium">{cable.cableLabel}</span>
                    </div>
                    <div className="text-gray-500 text-xs ml-4 mt-0.5">
                      {cable.source} → {cable.target}
                    </div>
                    {cable.diameter && (
                      <div className="text-gray-500 text-xs ml-4">
                        Ø {cable.diameter}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
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
            {machine.mergedMachines && machine.mergedMachines.length > 1 && (
              <p className="text-xs text-gray-500 mt-1">
                Merged: {machine.mergedMachines.join(', ')}
              </p>
            )}
          </div>
          <div className="tooltip-scroll overflow-y-auto max-h-48">
            {machine.cables.sources.length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Source Cables:</h4>
                <ul className="space-y-1">
                  {machine.cables.sources.map((cable, index) => (
                    <li key={`source-${cable.cableLabel}-${index}`} 
                        className="text-sm text-gray-600 flex flex-col">
                      <div className="flex items-center">
                        <span 
                          className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                          style={{ backgroundColor: cable.color }}
                        />
                        <span className="font-medium">{cable.cableLabel}</span>
                      </div>
                      <div className="text-gray-500 text-xs ml-4">
                        → {cable.target}
                        {cable.diameter && ` (Ø ${cable.diameter})`}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {machine.cables.targets.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Target Cables:</h4>
                <ul className="space-y-1">
                  {machine.cables.targets.map((cable, index) => (
                    <li key={`target-${cable.cableLabel}-${index}`} 
                        className="text-sm text-gray-600 flex flex-col">
                      <div className="flex items-center">
                        <span 
                          className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                          style={{ backgroundColor: cable.color }}
                        />
                        <span className="font-medium">{cable.cableLabel}</span>
                      </div>
                      <div className="text-gray-500 text-xs ml-4">
                        {cable.source} →
                        {cable.diameter && ` (Ø ${cable.diameter})`}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      );
    }

    return null;
  };
  // Get machine cables for tooltips
  const getMachineCables = useCallback((machineName) => {
    if (!cables || !Array.isArray(cables)) return { sources: [], targets: [] };
    return {
      sources: cables.filter(cable => cable.source === machineName),
      targets: cables.filter(cable => cable.target === machineName)
    };
  }, [cables]);

  // Get unique networks and their info
  const networkInfo = useMemo(() => {
    const networks = new Map();
    sections.forEach(section => {
      if (!networks.has(section.function)) {
        networks.set(section.function, {
          type: section.function,
          color: section.color,
          cables: new Set()
        });
      }
      section.cables.forEach(cable => {
        networks.get(section.function).cables.add(cable);
      });
    });
    return Array.from(networks.values());
  }, [sections]);

  // Main render
  return (
    <div className="relative">
      {/* Network Control Panel */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-10">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Networks</h3>
        <div className="space-y-2">
          {networkInfo.map(network => (
            <div
              key={network.type}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
              onMouseEnter={() => setHoveredNetwork(network.type)}
              onMouseLeave={() => setHoveredNetwork(null)}
            >
              <span 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: network.color }}
              />
              <span className="text-sm text-gray-600">
                {network.type}
                <span className="text-gray-400 ml-1">
                  ({network.cables.size})
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

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
          if (!activeTooltip) {
            setTooltipInfo(null);
          }
        }}
        onClick={handleClick}
      >
        {/* Grid Lines */}
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
            {/* Add measurements every 10 cells (1 meter) */}
            {i > 0 && i % 10 === 0 && (
              <>
                {/* Vertical measurement */}
                <text
                  x={2}
                  y={i * cellSize - 2}
                  className="text-xs fill-gray-400"
                >
                  {(i / 10).toFixed(1)}m
                </text>
                {/* Horizontal measurement */}
                <text
                  x={i * cellSize + 2}
                  y={10}
                  className="text-xs fill-gray-400"
                >
                  {(i / 10).toFixed(1)}m
                </text>
              </>
            )}
          </React.Fragment>
        ))}

        {/* Scale indicator */}
        <g transform={`translate(${CANVAS_SIZE - 120}, ${CANVAS_SIZE - 40})`}>
          <rect
            x={0}
            y={0}
            width={100}
            height={30}
            fill="white"
            stroke="#e5e7eb"
            rx={4}
          />
          <line
            x1={10}
            y1={20}
            x2={90}
            y2={20}
            stroke="#9ca3af"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <line
            x1={10}
            y1={15}
            x2={10}
            y2={25}
            stroke="#9ca3af"
            strokeWidth={2}
          />
          <line
            x1={90}
            y1={15}
            x2={90}
            y2={25}
            stroke="#9ca3af"
            strokeWidth={2}
          />
          <text
            x={50}
            y={15}
            textAnchor="middle"
            className="text-xs fill-gray-500"
          >
            1 meter
          </text>
        </g>

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
        {activeMode === EditorModes.WALL && previewWalls.length > 0 && (
          <>
            {/* Top line */}
            <line
              x1={Math.min(dragStart.x, dragEnd.x) * cellSize}
              y1={Math.min(dragStart.y, dragEnd.y) * cellSize}
              x2={(Math.max(dragStart.x, dragEnd.x) + 1) * cellSize}
              y2={Math.min(dragStart.y, dragEnd.y) * cellSize}
              stroke="#374151"
              strokeWidth={2}
              className="opacity-40"
            />
            {/* Bottom line */}
            <line
              x1={Math.min(dragStart.x, dragEnd.x) * cellSize}
              y1={(Math.max(dragStart.y, dragEnd.y) + 1) * cellSize}
              x2={(Math.max(dragStart.x, dragEnd.x) + 1) * cellSize}
              y2={(Math.max(dragStart.y, dragEnd.y) + 1) * cellSize}
              stroke="#374151"
              strokeWidth={2}
              className="opacity-40"
            />
            {/* Left line */}
            <line
              x1={Math.min(dragStart.x, dragEnd.x) * cellSize}
              y1={Math.min(dragStart.y, dragEnd.y) * cellSize}
              x2={Math.min(dragStart.x, dragEnd.x) * cellSize}
              y2={(Math.max(dragStart.y, dragEnd.y) + 1) * cellSize}
              stroke="#374151"
              strokeWidth={2}
              className="opacity-40"
            />
            {/* Right line */}
            <line
              x1={(Math.max(dragStart.x, dragEnd.x) + 1) * cellSize}
              y1={Math.min(dragStart.y, dragEnd.y) * cellSize}
              x2={(Math.max(dragStart.x, dragEnd.x) + 1) * cellSize}
              y2={(Math.max(dragStart.y, dragEnd.y) + 1) * cellSize}
              stroke="#374151"
              strokeWidth={2}
              className="opacity-40"
            />
          </>
        )}

        {isDragging && activeMode === EditorModes.WALL && dragStart && dragEnd && (
          <text
            x={(dragStart.x + dragEnd.x) / 2 * cellSize}
            y={(dragStart.y + dragEnd.y) / 2 * cellSize - 10}
            className="text-xs fill-gray-500"
            textAnchor="middle"
          >
            {(Math.abs(dragEnd.x - dragStart.x) * 0.1).toFixed(2)}m x {(Math.abs(dragEnd.y - dragStart.y) * 0.1).toFixed(2)}m
          </text>
        )}

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

        {/* Cable Sections with measurements */}
        {processedSections.map((section, index) => {
          const { points, cables, color, function: networkType } = section;
          
          // Calculate opacity based on network highlighting and visibility
          let opacity = networkVisibility[networkType] ? 1 : 0;
          if (hoveredNetwork) {
            opacity = networkType === hoveredNetwork ? 1 : 0.2;
          }
          if (selectedCable && !cables.has(selectedCable)) {
            opacity *= 0.25;
          }

          // Skip rendering completely hidden sections
          if (opacity === 0) return null;

          // Create path from all points
          const pathD = `M ${points[0].x * cellSize} ${points[0].y * cellSize} ` +
                        points.slice(1).map(p => `L ${p.x * cellSize} ${p.y * cellSize}`).join(' ');
          
          // Calculate total length along the path
          const lengthInMeters = points.reduce((total, point, i) => {
            if (i === 0) return 0;
            const prev = points[i - 1];
            const dx = point.x - prev.x;
            const dy = point.y - prev.y;
            return total + Math.sqrt(dx * dx + dy * dy) * 0.1;
          }, 0);
          
          // Calculate stroke width based on number of cables
          const strokeWidth = Math.min(2 + cables.size * 2, 16);
          
          // Handle highlighting
          const isHighlighted = selectedCable && cables.has(selectedCable);
          const isHovered = hoveredSegmentKey === index;
          
          return (
            <g 
              key={section.key}
              style={{ opacity }}
              onMouseEnter={(e) => {
                setHoveredSegmentKey(index);
                handleSectionHover(index, section, e, lengthInMeters);
              }}
              onMouseLeave={() => {
                setHoveredSegmentKey(null);
                handleSectionHover(null, null);
              }}
              onClick={() => handleSectionClick(section)}
              onDoubleClick={() => {
                setSelectedSectionCables(Array.from(section.details.values()));
                setSimulationOpen(true);
              }}
            >
              {/* Shadow effect */}
              <path
                d={pathD}
                stroke="rgba(0,0,0,0.1)"
                strokeWidth={(isHovered ? strokeWidth + 4 : strokeWidth + 2)}
                strokeLinecap="round"
                fill="none"
                transform="translate(1, 1)"
              />
              {/* Main path */}
              <path
                d={pathD}
                stroke={color}
                strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
                strokeOpacity={isHovered ? 1 : 0.8}
                fill="none"
                className="cable-path"
                strokeLinecap="round"
                style={{
                  transition: 'stroke-width 0.15s ease-in-out, stroke-opacity 0.15s ease-in-out',
                  zIndex: networkType === 'power' ? 1 : 2  // Control network renders on top of power
                }}
              />
            </g>
          );
        })}

        {/* Machine Preview */}
        {activeMode === EditorModes.MACHINE && selectedMachine && dragPosition && !draggedMachine && (
          <g className="opacity-50">
            <circle
              cx={dragPosition.x * cellSize}
              cy={dragPosition.y * cellSize}
              r={cellSize * 0.4}
              fill="#10b981"
              stroke="white"
              strokeWidth={2}
            />
            <MachineLabelComponent
              name={selectedMachine.name}
              pos={dragPosition}
              cellSize={cellSize}
              svgRef={svgRef}
            />
          </g>
        )}

        {/* Machines */}
        {Object.entries(machines).map(([name, pos]) => {
          const machineCables = getMachineCables(name);
          return (
            <g 
              key={name}
              className={`machine-node transition-transform ${draggedMachine === name ? 'opacity-50' : ''}`}
              draggable="true"
              onDragStart={(e) => handleMachineDragStart(e, name)}
              onDragEnd={handleMachineDragEnd}
              onMouseEnter={(e) => {
                const svgRect = svgRef.current?.getBoundingClientRect();
                setTooltipInfo({
                  type: 'machine',
                  data: {
                    name,
                    description: pos.description,
                    mergedMachines: pos.mergedMachines,
                    cables: machineCables
                  },
                  position: {
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top
                  }
                });
              }}
              onMouseLeave={() => {
                if (!activeTooltip) {
                  setTooltipInfo(null);
                }
              }}
              onClick={() => {
                setActiveTooltip(prev => prev?.data?.name === name ? null : {
                  type: 'machine',
                  data: {
                    name,
                    description: pos.description,
                    mergedMachines: pos.mergedMachines,
                    cables: machineCables
                  },
                  position: tooltipInfo?.position
                });
              }}
            >
              <circle
                cx={pos.x * cellSize}
                cy={pos.y * cellSize}
                r={cellSize * 0.4}
                fill={draggedMachine === name ? "#9333ea" : "#10b981"}
                stroke="white"
                strokeWidth={2}
              />
              <MachineLabelComponent
                name={name}
                pos={{ x: pos.x, y: pos.y }}
                cellSize={cellSize}
                svgRef={svgRef}
              />
            </g>
          );
        })}
      </svg>

      {/* Enhanced tooltip */}
      {(tooltipInfo || activeTooltip) && (
        <div
          ref={tooltipRef}
          className="absolute bg-white p-3 rounded-lg shadow-lg border border-gray-200 z-10"
          style={{
            left: (activeTooltip || tooltipInfo).position.x + 10,
            top: (activeTooltip || tooltipInfo).position.y - 10,
            transform: 'translate(0, -100%)',
            minWidth: '250px',
            maxWidth: '400px'
          }}
        >
          {activeTooltip && (
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              onClick={() => setActiveTooltip(null)}
            >
              ×
            </button>
          )}
          <TooltipContent info={activeTooltip || tooltipInfo} />
        </div>
      )}

      <CableTraySimulation
        cables={selectedSectionCables}
        isOpen={simulationOpen}
        onClose={() => setSimulationOpen(false)}
      />
    </div>
  );
};

export default LayoutGrid;