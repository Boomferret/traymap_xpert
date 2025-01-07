"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { optimizeNetworkPaths } from '@/utils/cableUtils';
import { EditorModes } from '@/constants/editorModes';
import { CableTraySimulation } from './CableTraySimulation';
import { Switch } from '@/components/ui/switch';
import PropTypes from 'prop-types';

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

// Update the helper function to only show first machine name
const getMergedMachineName = (name, machine) => {
  if (!machine || !machine.mergedHistory) return name;
  // Just return the first machine name
  return Object.keys(machine.mergedHistory)[0];
};

export const LayoutGrid = ({ 
    gridSize,
    cellSize,
    walls = [],
    perforations = [],
    machines = {},
    cables = [],
    networks = [],
    networkVisibility = {},
    activeMode,
    selectedMachine = null,
    selectedCable = null,
    onWallAdd,
    onPerforationAdd,
    onMachinePlace,
    onMachineMove,
    onMachineRemove,
    onNetworkVisibilityChange,
    onMachineInherit,
    backgroundImage
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState(null);
    const [draggedMachine, setDraggedMachine] = useState(null);
    const [selectedSectionCables, setSelectedSectionCables] = useState([]);
    const [hoveredNetwork, setHoveredNetwork] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [hoveredElement, setHoveredElement] = useState(null);
    const [selectedElement, setSelectedElement] = useState(null);
    const [hoveredCable, setHoveredCable] = useState(null);
    const [currentSourceCables, setCurrentSourceCables] = useState([]);
    const [currentTargetCables, setCurrentTargetCables] = useState([]);
    const svgRef = useRef(null);
    const [showTraySimulation, setShowTraySimulation] = useState(false);
    const [selectedSectionForSimulation, setSelectedSectionForSimulation] = useState(null);
    const [lastClickTime, setLastClickTime] = useState(0);
    const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, machine: null });
    const [moveMode, setMoveMode] = useState({ active: false, machine: null });
    const [showInheritMenu, setShowInheritMenu] = useState(false);
    const [inheritFromMachine, setInheritFromMachine] = useState(null);
    const [inheritMode, setInheritMode] = useState({ active: false, targetMachine: null });
    const [activeTab, setActiveTab] = useState('sources');
    const [sourceCurrentPage, setSourceCurrentPage] = useState(1);
    const [targetCurrentPage, setTargetCurrentPage] = useState(1);
    const prevSelectedElement = useRef(null);

    // Handle background image
    useEffect(() => {
      if (backgroundImage && !imageUrl) {
        const url = URL.createObjectURL(backgroundImage);
        setImageUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }, [backgroundImage]);

    // Calculate dimensions
    const width = gridSize * cellSize;
    const height = gridSize * cellSize;

    // Event handlers
    const getGridCoordinates = useCallback((e) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / cellSize);
      const y = Math.floor((e.clientY - rect.top) / cellSize);
      return { x, y };
    }, [cellSize]);

    const getCursorStyle = useCallback(() => {
      if (moveMode.active) return 'cursor-crosshair';
      if (inheritMode.active) return 'cursor-copy';
      if (selectedMachine) return 'cursor-crosshair';
      switch (activeMode) {
        case EditorModes.WALL: return 'cursor-crosshair';
        case EditorModes.PERFORATION: return 'cursor-cell';
        default: return 'cursor-default';
      }
    }, [activeMode, selectedMachine, moveMode.active, inheritMode.active]);

    const handleMouseDown = useCallback((e) => {
      if (activeMode === EditorModes.WALL) {
        e.preventDefault();
        const coords = getGridCoordinates(e);
        setIsDragging(true);
        setDragPosition(coords);
      }
    }, [activeMode, getGridCoordinates]);

    const handleMouseMove = useCallback((e) => {
      const coords = getGridCoordinates(e);
      setDragPosition(coords);
    }, [getGridCoordinates]);

    const handleMouseUp = useCallback(() => {
      setIsDragging(false);
      setDragPosition(null);
      if (draggedMachine) {
        setDraggedMachine(null);
      }
    }, [draggedMachine]);

    const handleClick = useCallback((e) => {
      const coords = getGridCoordinates(e);
      
      if (moveMode.active) {
        onMachineMove(moveMode.machine, coords.x, coords.y);
        setMoveMode({ active: false, machine: null });
        return;
      }
      
      switch (activeMode) {
        case EditorModes.WALL:
          onWallAdd(coords.x, coords.y);
          break;
        case EditorModes.PERFORATION:
          onPerforationAdd(coords.x, coords.y);
          break;
        case EditorModes.MACHINE:
          if (selectedMachine) {
            onMachinePlace(coords.x, coords.y);
          }
          break;
      }
    }, [activeMode, selectedMachine, getGridCoordinates, onWallAdd, onPerforationAdd, onMachinePlace, moveMode, onMachineMove]);

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

    const handleSectionHover = useCallback((sectionKey, section, e) => {
      if (!section || !e) {
        if (!selectedElement) {
          setHoveredElement(null);
        }
        return;
      }

      if (!selectedElement) {
        setHoveredElement({
          type: 'section',
          data: section
        });
      }
    }, [selectedElement]);

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
        const now = Date.now();
        const isDoubleClick = now - lastClickTime < 300; // 300ms threshold for double-click
        setLastClickTime(now);

        if (isDoubleClick) {
            setSelectedSectionForSimulation(section);
            setShowTraySimulation(true);
        } else {
            setSelectedElement(prev => prev?.data === section ? null : { type: 'section', data: section });
        }
    }, [lastClickTime]);

    // Calculate section opacity based on selected cable
    const getSectionOpacity = useCallback((section, isHovered, isNetworkHovered) => {
      if (hoveredCable) {
        return section.cables.has(hoveredCable) ? 1 : 0.2;
      }
      if (selectedCable) {
        return section.cables.has(selectedCable) ? 1 : 0.2;
      }
      if (hoveredNetwork && section.function !== hoveredNetwork) {
        return 0.2;
      }
      if (isHovered) {
        return 1;
      }
      if (isNetworkHovered) {
        return 0.8;
      }
      if (hoveredNetwork) {
        return 0.4;
      }
      return 1;
    }, [hoveredCable, selectedCable, hoveredNetwork]);

    // Info Panel Content component
    const InfoPanelContent = ({ 
      info, 
      activeTab, 
      setActiveTab, 
      sourceCurrentPage, 
      setSourceCurrentPage,
      targetCurrentPage, 
      setTargetCurrentPage 
    }) => {
      const CABLES_PER_PAGE = 8;

      if (!info) {
        return (
          <div className="text-gray-500 text-sm flex items-center justify-center h-full">
            Hover over a cable section or machine to see details
          </div>
        );
      }

      if (info.type === 'section') {
        const section = info.data;
        const sortedCables = Array.from(section.cables).sort();
        const totalPages = Math.ceil(sortedCables.length / CABLES_PER_PAGE);
        const startIndex = (sourceCurrentPage - 1) * CABLES_PER_PAGE;
        const endIndex = startIndex + CABLES_PER_PAGE;
        const currentCables = sortedCables.slice(startIndex, endIndex);

        return (
          <div className="flex flex-col h-full">
            <div className="mb-4">
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
            <div className="flex-1">
              <ul className="space-y-1">
                {currentCables.map((cableName, index) => {
                  const cable = section.details.get(cableName);
                  if (!cable) return null;
                  return (
                    <li 
                      key={`${cableName}-${index}`} 
                      className={`text-sm text-gray-600 p-1.5 rounded transition-colors ${
                        hoveredCable === cableName ? 'bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                      onMouseEnter={() => setHoveredCable(cableName)}
                      onMouseLeave={() => setHoveredCable(null)}
                    >
                      <div className="flex items-center">
                        <span 
                          className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                          style={{ backgroundColor: section.color }}
                        />
                        <span className="font-medium">{cable.cableLabel}</span>
                      </div>
                      <div className="text-gray-500 text-xs ml-4 mt-0.5">
                        {cable.originalSource || cable.source}
                        <br />
                        {cable.originalTarget || cable.target}
                        {cable.diameter && (
                          <div>Ø {cable.diameter}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <button
                  onClick={() => setSourceCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={sourceCurrentPage === 1}
                  className={`px-2 py-1 text-sm rounded ${
                    sourceCurrentPage === 1 
                      ? 'text-gray-400 cursor-not-allowed' 
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {sourceCurrentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setSourceCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={sourceCurrentPage === totalPages}
                  className={`px-2 py-1 text-sm rounded ${
                    sourceCurrentPage === totalPages 
                      ? 'text-gray-400 cursor-not-allowed' 
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        );
      }

      if (info.type === 'machine') {
        const machine = info.data;
        const totalSourcePages = Math.ceil(currentSourceCables.length / CABLES_PER_PAGE);
        const totalTargetPages = Math.ceil(currentTargetCables.length / CABLES_PER_PAGE);

        const displaySourceCables = currentSourceCables.slice(
          (sourceCurrentPage - 1) * CABLES_PER_PAGE,
          sourceCurrentPage * CABLES_PER_PAGE
        );
        
        const displayTargetCables = currentTargetCables.slice(
          (targetCurrentPage - 1) * CABLES_PER_PAGE,
          targetCurrentPage * CABLES_PER_PAGE
        );

        return (
          <div className="flex flex-col h-full">
            <div className="mb-4">
              <h3 className="font-medium text-gray-900">{machine.mergedName}</h3>
              {machine.description && (
                <p className="text-sm text-gray-500 mt-1">{machine.description}</p>
              )}
              {machine.mergedHistory && Object.keys(machine.mergedHistory).length > 1 && (
                <div className="mt-2 p-2 bg-gray-50 rounded-md">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <p className="text-xs text-gray-500 font-medium">Inherited Machines</p>
                  </div>
                  <div className="mt-1 space-y-1">
                    {Object.keys(machine.mergedHistory).map((machineName, index) => (
                      <div key={machineName} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">{index + 1}.</span>
                        <span className="text-gray-600">{machineName}</span>
                        {index === 0 && (
                          <span className="text-xs text-gray-400 ml-1">(primary)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex border-b mb-4">
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  activeTab === 'sources'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  setActiveTab('sources');
                }}
              >
                Sources ({currentSourceCables.length})
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  activeTab === 'targets'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  setActiveTab('targets');
                }}
              >
                Targets ({currentTargetCables.length})
              </button>
            </div>

            <div className="flex-1">
              {activeTab === 'sources' ? (
                <>
                  <ul className="space-y-1">
                    {displaySourceCables.map((cable, index) => (
                      <li 
                        key={`source-${cable.cableLabel}-${index}`} 
                        className={`text-sm text-gray-600 flex flex-col p-1.5 rounded transition-colors ${
                          hoveredCable === cable.cableLabel ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                        onMouseEnter={() => {
                          setHoveredCable(cable.cableLabel);
                        }}
                        onMouseLeave={() => {
                          setHoveredCable(null);
                        }}
                      >
                        <div className="flex items-center">
                          <span 
                            className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: cable.color }}
                          />
                          <span className="font-medium">{cable.cableLabel}</span>
                        </div>
                        <div className="text-gray-500 text-xs ml-4">
                          From: {cable.originalSource || cable.source}
                          <br />
                          To: {cable.originalTarget || cable.target}
                          {cable.diameter && (
                            <div>Ø {cable.diameter}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {totalSourcePages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t pt-4">
                      <button
                        onClick={() => setSourceCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={sourceCurrentPage === 1}
                        className={`px-2 py-1 text-sm rounded ${
                          sourceCurrentPage === 1 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {sourceCurrentPage} of {totalSourcePages}
                      </span>
                      <button
                        onClick={() => setSourceCurrentPage(prev => Math.min(totalSourcePages, prev + 1))}
                        disabled={sourceCurrentPage === totalSourcePages}
                        className={`px-2 py-1 text-sm rounded ${
                          sourceCurrentPage === totalSourcePages 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <ul className="space-y-1">
                    {displayTargetCables.map((cable, index) => (
                      <li 
                        key={`target-${cable.cableLabel}-${index}`} 
                        className={`text-sm text-gray-600 flex flex-col p-1.5 rounded transition-colors ${
                          hoveredCable === cable.cableLabel ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                        onMouseEnter={() => setHoveredCable(cable.cableLabel)}
                        onMouseLeave={() => setHoveredCable(null)}
                      >
                        <div className="flex items-center">
                          <span 
                            className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: cable.color }}
                          />
                          <span className="font-medium">{cable.cableLabel}</span>
                        </div>
                        <div className="text-gray-500 text-xs ml-4">
                          From: {cable.originalSource || cable.source}
                          <br />
                          To: {cable.originalTarget || cable.target}
                          {cable.diameter && (
                            <div>Ø {cable.diameter}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {totalTargetPages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t pt-4">
                      <button
                        onClick={() => setTargetCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={targetCurrentPage === 1}
                        className={`px-2 py-1 text-sm rounded ${
                          targetCurrentPage === 1 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {targetCurrentPage} of {totalTargetPages}
                      </span>
                      <button
                        onClick={() => setTargetCurrentPage(prev => Math.min(totalTargetPages, prev + 1))}
                        disabled={targetCurrentPage === totalTargetPages}
                        className={`px-2 py-1 text-sm rounded ${
                          targetCurrentPage === totalTargetPages 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
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

    const handleMachineClick = useCallback((name, powerCables, controlCables, mergedHistory) => {
      if (inheritMode.active) {
        if (name !== inheritMode.targetMachine) {
          onMachineInherit(inheritMode.targetMachine, name);
          setInheritMode({ active: false, targetMachine: null });
        }
        return;
      }

      const machineInfo = {
        type: 'machine',
        data: {
          name,
          mergedName: getMergedMachineName(name, machines[name]),
          description: machines[name]?.description,
          mergedHistory,
          cables: {
            sources: [...powerCables, ...controlCables].filter(cable => 
              Object.keys(mergedHistory).includes(cable.source) || 
              Object.keys(mergedHistory).includes(cable.originalSource)
            ),
            targets: [...powerCables, ...controlCables].filter(cable => 
              Object.keys(mergedHistory).includes(cable.target) || 
              Object.keys(mergedHistory).includes(cable.originalTarget)
            )
          }
        }
      };
      setSelectedElement(prev => 
        prev?.data?.name === name ? null : machineInfo
      );
    }, [inheritMode, onMachineInherit, machines]);

    // Add this near the top of the component with other event handlers
    const handleContextMenu = useCallback((e, machineName) => {
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setContextMenu({ show: true, x, y, machine: machineName });
    }, []);

    // Add this near the top of the component with other event handlers
    const handleStartMachineMove = useCallback((machineName) => {
      setMoveMode({ active: true, machine: machineName });
      setContextMenu({ show: false, x: 0, y: 0, machine: null });
    }, []);

    // Add this near the top of the component with other event handlers
    const handleRemoveMachine = useCallback((machineName) => {
      // We'll implement this in LayoutEditor
      if (onMachineRemove) {
        onMachineRemove(machineName);
      }
      setContextMenu({ show: false, x: 0, y: 0, machine: null });
    }, [onMachineRemove]);

    // Add this useEffect in the main LayoutGrid component, before the InfoPanelContent definition
    useEffect(() => {
      if (!selectedElement || selectedElement.type !== 'machine' || !cables) return;

      const machine = selectedElement.data;
      const mergedMachineNames = Object.keys(machine.mergedHistory || {});

      // Get all cables that connect to this machine or any of its inherited machines
      const sourceCables = cables.filter(cable => {
        return mergedMachineNames.includes(cable.source) || 
               mergedMachineNames.includes(cable.originalSource);
      });

      const targetCables = cables.filter(cable => {
        return mergedMachineNames.includes(cable.target) || 
               mergedMachineNames.includes(cable.originalTarget);
      });

      setCurrentSourceCables(sourceCables);
      setCurrentTargetCables(targetCables);
      
      // Only reset pagination when selecting a new machine, not when hovering cables
      if (selectedElement !== prevSelectedElement.current) {
        setSourceCurrentPage(1);
        setTargetCurrentPage(1);
        setActiveTab('sources');
      }
      
      prevSelectedElement.current = selectedElement;
    }, [selectedElement, cables]);

    // Main render
    return (
      <div className="flex gap-4">
        <div 
          className="relative"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          {/* Network Legend */}
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-sm p-2 z-10">
            <div className="space-y-2">
              {networkInfo.map((network) => (
                <div 
                  key={network.type} 
                  className={`flex items-center gap-2 p-1.5 rounded transition-colors ${
                    hoveredNetwork === network.type ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                  onMouseEnter={() => setHoveredNetwork(network.type)}
                  onMouseLeave={() => setHoveredNetwork(null)}
                >
                  <Switch
                    checked={networkVisibility[network.type] !== false}
                    onCheckedChange={(checked) => {
                      onNetworkVisibilityChange({
                        ...networkVisibility,
                        [network.type]: checked
                      });
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full transition-transform ${
                        hoveredNetwork === network.type ? 'scale-125' : ''
                      }`}
                      style={{ backgroundColor: network.color }}
                    />
                    <span className={`text-sm ${
                      hoveredNetwork === network.type ? 'font-medium' : ''
                    }`}>{network.type}</span>
                    <span className="text-xs text-gray-500">
                      ({network.cables.size} cables)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={`cable-tray-grid ${getCursorStyle()}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              handleMouseUp();
              setDragPosition(null);
              if (!selectedElement) {
                setHoveredElement(null);
              }
            }}
            onClick={handleClick}
          >
            {/* Background image if exists */}
            {imageUrl && (
              <image
                href={imageUrl}
                width={width}
                height={height}
                preserveAspectRatio="xMidYMid meet"
                opacity="0.5"
              />
            )}

            {/* Grid Lines */}
            {Array.from({ length: gridSize + 1 }).map((_, i) => (
              <React.Fragment key={`grid-${i}`}>
                <line
                  x1={0}
                  y1={i * cellSize}
                  x2={width}
                  y2={i * cellSize}
                  stroke="#f0f0f0"
                  strokeWidth="0.5"
                />
                <line
                  x1={i * cellSize}
                  y1={0}
                  x2={i * cellSize}
                  y2={height}
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
            <g transform={`translate(${width - 120}, ${height - 40})`}>
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
            {walls.map(wall => (
              <rect
                key={`wall-${wall.x}-${wall.y}`}
                x={wall.x * cellSize}
                y={wall.y * cellSize}
                width={cellSize}
                height={cellSize}
                fill="#4b5563"
              />
            ))}

            {/* Perforations */}
            {perforations.map(perf => (
              <circle
                key={`perf-${perf.x}-${perf.y}`}
                cx={perf.x * cellSize + cellSize / 2}
                cy={perf.y * cellSize + cellSize / 2}
                r={cellSize / 4}
                fill="#ef4444"
              />
            ))}

            {/* Cable Sections */}
            {processedSections.map((section) => {
              const points = section.points;
              if (points.length < 2) return null;

              let pathD = '';
              points.forEach((point, i) => {
                pathD += `${i === 0 ? 'M' : 'L'} ${point.x * cellSize + cellSize/2} ${point.y * cellSize + cellSize/2} `;
              });

              const cableCount = section.cables.size;
              const strokeWidth = Math.min(4 + cableCount * 2, 16);
              const isHighlighted = selectedCable && section.cables.has(selectedCable);
              const isVisible = networkVisibility[section.function] !== false;
              const isHovered = hoveredElement?.data === section || selectedElement?.data === section;
              const isNetworkHovered = hoveredNetwork === section.function;

              // Skip rendering if network is not visible
              if (!isVisible) return null;

              return (
                <g 
                  key={section.key} 
                  opacity={getSectionOpacity(section, isHovered, isNetworkHovered)}
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
                    strokeWidth={isHovered ? strokeWidth + 4 : isNetworkHovered ? strokeWidth + 2 : strokeWidth}
                    strokeOpacity={isHovered ? 1 : isNetworkHovered ? 0.9 : 0.8}
                    fill="none"
                    className="cable-path"
                    strokeLinecap="round"
                    onClick={() => handleSectionClick(section)}
                    onMouseEnter={(e) => {
                      if (!selectedElement) {
                        setHoveredElement({
                          type: 'section',
                          data: section
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      if (!selectedElement) {
                        setHoveredElement(null);
                      }
                    }}
                    style={{ 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      strokeWidth: isHovered ? strokeWidth + 4 : isNetworkHovered ? strokeWidth + 2 : strokeWidth
                    }}
                  />
                </g>
              );
            })}

            {/* Machines */}
            {machines && Object.entries(machines).map(([name, machine]) => {
              if (!machine) return null;
              
              // Get all machine names (current and merged) to find all related cables
              const allMergedMachines = machine.mergedHistory ? Object.keys(machine.mergedHistory) : [name];
              
              // Find all cables that connect to any of the merged machines
              const connectedCables = cables.filter(cable => {
                const sourceMatches = allMergedMachines.includes(cable.source) || allMergedMachines.includes(cable.originalSource);
                const targetMatches = allMergedMachines.includes(cable.target) || allMergedMachines.includes(cable.originalTarget);
                return sourceMatches || targetMatches;
              }).sort((a, b) => a.cableLabel.localeCompare(b.cableLabel));

              // Split cables into sources and targets based on original and current connections
              const powerCables = connectedCables
                .filter(cable => cable.type === 'power')
                .map(cable => ({
                  ...cable,
                  displaySource: cable.originalSource || cable.source,
                  displayTarget: cable.originalTarget || cable.target
                }));

              const controlCables = connectedCables
                .filter(cable => cable.type === 'control')
                .map(cable => ({
                  ...cable,
                  displaySource: cable.originalSource || cable.source,
                  displayTarget: cable.originalTarget || cable.target
                }));

              // Split into sources and targets for the info panel
              const sourceCables = powerCables.filter(cable => 
                allMergedMachines.includes(cable.source) || allMergedMachines.includes(cable.originalSource)
              );

              const targetCables = powerCables.filter(cable => 
                allMergedMachines.includes(cable.target) || allMergedMachines.includes(cable.originalTarget)
              );

              const controlSourceCables = controlCables.filter(cable => 
                allMergedMachines.includes(cable.source) || allMergedMachines.includes(cable.originalSource)
              );

              const controlTargetCables = controlCables.filter(cable => 
                allMergedMachines.includes(cable.target) || allMergedMachines.includes(cable.originalTarget)
              );

              const centerX = ((machine.x || 0) * cellSize) + (cellSize / 2);
              const centerY = ((machine.y || 0) * cellSize) + (cellSize / 2);
              const mergedName = getMergedMachineName(name, machine);
              const isInheritTarget = inheritMode.active && name !== inheritMode.targetMachine;

              return (
                <g 
                  key={name}
                  onClick={() => handleMachineClick(name, [...sourceCables, ...controlSourceCables], [...targetCables, ...controlTargetCables], machine.mergedHistory)}
                  onContextMenu={(e) => handleContextMenu(e, name)}
                  className={`transition-opacity duration-200 ${
                    inheritMode.active && name === inheritMode.targetMachine ? 'opacity-50' : ''
                  }`}
                  style={{ 
                    cursor: isInheritTarget ? 'copy' : 'pointer',
                    opacity: inheritMode.active && !isInheritTarget ? 0.5 : 1
                  }}
                >
                  {/* Machine point shadow */}
                  <circle
                    cx={centerX + 1}
                    cy={centerY + 1}
                    r={6}
                    fill="rgba(0,0,0,0.1)"
                  />
                  {/* Machine point */}
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={6}
                    fill={isInheritTarget ? '#3b82f6' : hoveredElement?.data?.name === name || selectedElement?.data?.name === name ? '#0ea5e9' : '#10b981'}
                    stroke="white"
                    strokeWidth={2}
                  />
                  {/* Machine label */}
                  <text
                    x={centerX}
                    y={centerY - 12}
                    textAnchor="middle"
                    className="cable-machine"
                  >
                    {mergedName}
                  </text>
                </g>
              );
            })}

            {/* Context Menu */}
            {contextMenu.show && (
              <foreignObject
                x={contextMenu.x}
                y={contextMenu.y}
                width={160}
                height={120}
                style={{ overflow: 'visible' }}
              >
                <div 
                  className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
                  style={{ width: '160px' }}
                >
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => handleStartMachineMove(contextMenu.machine)}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 15v4c0 1.1.9 2 2 2h4M21 9V5c0-1.1-.9-2-2-2h-4m0 0L19 7M5 5l4 4M5 19l4-4m6 4l4-4"/>
                    </svg>
                    Move
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      setInheritMode({ active: true, targetMachine: contextMenu.machine });
                      setContextMenu({ show: false, x: 0, y: 0, machine: null });
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    Inherit From...
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                    onClick={() => handleRemoveMachine(contextMenu.machine)}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    Remove
                  </button>
                </div>
              </foreignObject>
            )}
          </svg>
        </div>

        {/* Info Panel */}
        <div className="w-80 bg-white rounded-lg shadow-sm p-4 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-gray-900">
              {selectedElement ? 'Selected Details' : 'Details'}
            </h3>
            {selectedElement && (
              <button
                onClick={() => setSelectedElement(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            )}
          </div>
          <InfoPanelContent 
            info={selectedElement || hoveredElement} 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            sourceCurrentPage={sourceCurrentPage}
            setSourceCurrentPage={setSourceCurrentPage}
            targetCurrentPage={targetCurrentPage}
            setTargetCurrentPage={setTargetCurrentPage}
          />
        </div>

        {showTraySimulation && selectedSectionForSimulation && (
          <CableTraySimulation
            cables={Array.from(selectedSectionForSimulation.cables).map(cableId => {
              const details = selectedSectionForSimulation.details.get(cableId);
              return {
                ...details,
                cableLabel: cableId,
                type: selectedSectionForSimulation.function,
                color: selectedSectionForSimulation.color
              };
            })}
            networks={networks}
            isOpen={showTraySimulation}
            onClose={() => {
              setShowTraySimulation(false);
              setSelectedSectionForSimulation(null);
            }}
          />
        )}

        {/* Inheritance Menu Modal */}
        {showInheritMenu && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-4 w-96">
              <h3 className="text-lg font-medium mb-4">Inherit From Machine</h3>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {Object.entries(machines)
                  .filter(([name]) => name !== inheritFromMachine)
                  .map(([name, machine]) => (
                    <button
                      key={name}
                      className="w-full p-3 text-left hover:bg-gray-50 rounded-md flex items-center gap-3 border"
                      onClick={() => {
                        onMachineInherit(inheritFromMachine, name);
                        setShowInheritMenu(false);
                        setInheritFromMachine(null);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-medium">
                        {name}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{name}</span>
                        {machine.description && (
                          <span className="text-sm text-gray-500">{machine.description}</span>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  onClick={() => {
                    setShowInheritMenu(false);
                    setInheritFromMachine(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {inheritMode.active && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <span>Click on a machine to inherit from it</span>
            <button
              className="ml-2 hover:text-blue-200"
              onClick={() => setInheritMode({ active: false, targetMachine: null })}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
};

LayoutGrid.propTypes = {
  gridSize: PropTypes.number.isRequired,
  cellSize: PropTypes.number.isRequired,
  walls: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  })),
  perforations: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  })),
  machines: PropTypes.object,
  cables: PropTypes.array,
  networks: PropTypes.array,
  networkVisibility: PropTypes.object,
  activeMode: PropTypes.string,
  selectedMachine: PropTypes.object,
  selectedCable: PropTypes.string,
  onWallAdd: PropTypes.func.isRequired,
  onPerforationAdd: PropTypes.func.isRequired,
  onMachinePlace: PropTypes.func.isRequired,
  onMachineMove: PropTypes.func.isRequired,
  onMachineRemove: PropTypes.func.isRequired,
  onNetworkVisibilityChange: PropTypes.func.isRequired,
  onMachineInherit: PropTypes.func.isRequired,
  backgroundImage: PropTypes.object
};

export default LayoutGrid;