"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { optimizeNetworkPaths, calculateHananGrid } from '@/utils/cableUtils';
import { EditorModes } from '@/constants/editorModes';
import { CableTraySimulation } from './CableTraySimulation';
import { Switch } from '@/components/ui/switch';
import { InfoPanel } from './InfoPanel';
import PropTypes from 'prop-types';




// Add this function before the LayoutGrid component definition
const preprocessBlockedGrid = (walls, perforations, gridSize) => {
  // Create a 2D array to represent the grid
  const blockedGrid = Array(gridSize.height).fill().map(() => 
    Array(gridSize.width).fill(false)
  );

  // Mark walls as blocked
  walls.forEach(wall => {
    if (wall.x >= 0 && wall.x < gridSize.width && 
        wall.y >= 0 && wall.y < gridSize.height) {
      blockedGrid[wall.y][wall.x] = true;
    }
  });

  // Mark perforations as passable (false)
  perforations.forEach(perf => {
    if (perf.x >= 0 && perf.x < gridSize.width && 
        perf.y >= 0 && perf.y < gridSize.height) {
      blockedGrid[perf.y][perf.x] = false;
    }
  });

  // Helper function to check if a cell is blocked
  return (x, y) => {
    // Don't treat canvas boundaries as walls - allow pathfinding beyond canvas
    if (x < 0 || x >= gridSize.width || y < 0 || y >= gridSize.height) return false;
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
      <text
        x={labelPos.x}
        y={labelPos.y}
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
        {name}
      </text>
    </g>
  );
});

// Add display name to the MachineLabelComponent
MachineLabelComponent.displayName = 'MachineLabelComponent';

// Update the helper function to only show first machine name
const getMergedMachineName = (name, machine) => {
  // Always return the original machine name for display
  return name;
};

// Add this helper function at the top level
const getMachineCables = (machineName, allCables, machine) => {
  // Get all machine names that are part of this merged machine
  const mergedNames = machine?.mergedHistory ? Object.keys(machine.mergedHistory) : [machineName];
  const mergedSet = new Set(mergedNames);

  return allCables.filter(cable => {
    const sourceIsMerged = mergedSet.has(cable.originalSource || cable.source);
    const targetIsMerged = mergedSet.has(cable.originalTarget || cable.target);

    // Filter out cables that connect between merged machines
    if (sourceIsMerged && targetIsMerged) {
      return false;
    }

    return sourceIsMerged || targetIsMerged;
  }).map(cable => ({
    ...cable,
    // Preserve original machine names in display
    displaySource: cable.originalSource || cable.source,
    displayTarget: cable.originalTarget || cable.target
  }));
};

export const LayoutGrid = ({ 
    gridSize,
    cellSize,
    walls = [],
    trays = [],
    perforations = [],
    machines = {},
    cables = [],
    networks = [],
    networkVisibility = {},
    activeMode,
    selectedMachine = null,
    selectedCable = null,
    onWallAdd,
    onTrayAdd,
    onDelete,
    onPerforationAdd,
    onMachinePlace,
    onMachineMove,
    onMachineRemove,
    onNetworkVisibilityChange,
    onMachineInherit,
    backgroundImage,
    backendSections = [],
    cableRoutes = {},
    hananGrid = { xCoords: [], yCoords: [] },
    hoveredNetwork,
    onNetworkHover,
    steinerPoints = []
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState(null);
    const [draggedMachine, setDraggedMachine] = useState(null);
    const [selectedSectionCables, setSelectedSectionCables] = useState([]);
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
    const [dragStart, setDragStart] = useState(null);
    const [currentHover, setCurrentHover] = useState(null);
    const [previewWalls, setPreviewWalls] = useState([]);
    const [lastClickPos, setLastClickPos] = useState(null);
    const [hoveredSection, setHoveredSection] = useState(null);
    const [sectionContextMenu, setSectionContextMenu] = useState({ 
      show: false, 
      x: 0, 
      y: 0, 
      section: null 
    });
    const [hasDragged, setHasDragged] = useState(false);

    const canvasContainerRef = useRef(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState(null);

    // Handle background image
    useEffect(() => {
      // Handle both object format {url: '...', originalWidth: ..., originalHeight: ...} 
      // and direct base64 string format from imported JSON
      if (backgroundImage) {
        if (typeof backgroundImage === 'string') {
          // Direct base64 string from imported JSON
          setImageUrl(backgroundImage);
        } else if (backgroundImage?.url) {
          // Object format from image upload modal
          setImageUrl(backgroundImage.url);
        }
        
        return () => {
          if (imageUrl && typeof backgroundImage === 'object' && backgroundImage?.url) {
            // Only revoke object URLs, not base64 strings
            URL.revokeObjectURL(imageUrl);
          }
        };
      } else {
        setImageUrl(null);
      }
    }, [backgroundImage]);

    // Calculate dimensions
    const width = gridSize.width * cellSize;
    const height = gridSize.height * cellSize;

    // Calculate image scale and position
    const imageScale = useMemo(() => {
      // If backgroundImage is an object with originalWidth/originalHeight, use those
      if (backgroundImage?.originalWidth && backgroundImage?.originalHeight) {
        const scaleX = width / backgroundImage.originalWidth;
        const scaleY = height / backgroundImage.originalHeight;
        return Math.min(scaleX, scaleY);
      }
      // For imported base64 images without dimensions, use 1:1 scale
      return 1;
    }, [width, height, backgroundImage]);

    // Event handlers
    const getGridCoordinates = useCallback((e) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.min(
        Math.floor((e.clientX - rect.left) / cellSize), 
        gridSize.width - 1
      );
      const y = Math.min(
        Math.floor((e.clientY - rect.top) / cellSize), 
        gridSize.height - 1
      );
      return { x, y };
    }, [cellSize, gridSize.width, gridSize.height]);

    const getCursorStyle = useCallback(() => {
      if (moveMode.active) return 'cursor-crosshair';
      if (inheritMode.active) return 'cursor-copy';
      if (selectedMachine) return 'cursor-crosshair';
      switch (activeMode) {
        case EditorModes.PAN: return isPanning ? 'cursor-grabbing' : 'cursor-grab';
        case EditorModes.WALL: return 'cursor-crosshair';
        case EditorModes.TRAY: return 'cursor-crosshair';
        case EditorModes.PERFORATION: return 'cursor-cell';
        default: return 'cursor-default';
      }
    }, [activeMode, selectedMachine, moveMode.active, inheritMode.active, isPanning]);

    const handleMouseDown = useCallback((e) => {
      // Handle panning with middle mouse button at any time
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
      }
      
      if (e.buttons !== 1) return; // Only handle left mouse button for other modes
      
      if (activeMode === EditorModes.PAN) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
      }
      
      if (activeMode === EditorModes.WALL) {
        e.preventDefault();
        const coords = getGridCoordinates(e);
        setIsDragging(true);
        setDragStart(coords);
        setHasDragged(false);
      }
      if (activeMode === EditorModes.TRAY) {
        e.preventDefault();
        const coords = getGridCoordinates(e);
        setIsDragging(true);
        setDragStart(coords);
        setHasDragged(false);
      }
      if (activeMode === EditorModes.DELETE) {
        e.preventDefault();
        const coords = getGridCoordinates(e);
        setIsDragging(true);
        setDragStart(coords);
        setHasDragged(false);
      }
    }, [activeMode, getGridCoordinates]);

    const handleMouseMove = useCallback((e) => {
      // Handle panning at any time when isPanning is true
      if (isPanning && panStart && canvasContainerRef.current) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;

        canvasContainerRef.current.scrollLeft -= dx;
        canvasContainerRef.current.scrollTop -= dy;

        setPanStart({ x: e.clientX, y: e.clientY });
        return;
      }
      
      if (e.buttons !== 1) return;
      
      const coords = getGridCoordinates(e);
      if (isDragging && dragStart) {
        // Check if we've actually moved from the start position
        if (coords.x !== dragStart.x || coords.y !== dragStart.y) {
          setHasDragged(true);
        }
        
        if (activeMode === EditorModes.WALL) {
          const points = onWallAdd(dragStart.x, dragStart.y, coords.x, coords.y, true);
          setPreviewWalls(points || []);
        } else if (activeMode === EditorModes.TRAY) {
          const points = onTrayAdd(dragStart.x, dragStart.y, coords.x, coords.y, true);
          setPreviewWalls(points || []); 
        }
        else if (activeMode === EditorModes.DELETE) {
          const points = onDelete(dragStart.x, dragStart.y, coords.x, coords.y, true);
          setPreviewWalls(points || []); 
        }
      }
      
      setDragPosition(coords);
    }, [isPanning, panStart, activeMode, isDragging, dragStart, getGridCoordinates, onWallAdd, onTrayAdd, onDelete]);

    const handleMouseUp = useCallback((e) => {
      // Stop panning if we were panning
      if (isPanning) {
        setIsPanning(false);
        setPanStart(null);
        return;
      }
      
      if (isDragging && dragStart && hasDragged) {
        const coords = getGridCoordinates(e);
        if (coords && activeMode === EditorModes.WALL) {
          onWallAdd(dragStart.x, dragStart.y, coords.x, coords.y, false);
        }
        if (coords && activeMode === EditorModes.TRAY) {
          onTrayAdd(dragStart.x, dragStart.y, coords.x, coords.y, false);
        }
        if (coords && activeMode === EditorModes.DELETE) {
          onDelete(dragStart.x, dragStart.y, coords.x, coords.y, false);
        }
      }
      setIsDragging(false);
      setDragStart(null);
      setDragPosition(null);
      setPreviewWalls([]);
      setHasDragged(false);
      if (draggedMachine) {
        setDraggedMachine(null);
      }
    }, [isPanning, isDragging, dragStart, activeMode, onWallAdd, onTrayAdd, onDelete, draggedMachine, hasDragged, getGridCoordinates]);

    const handleClick = useCallback((e) => {
      const coords = getGridCoordinates(e);
      
      // Check if coordinates are within bounds
      if (coords.x < 0 || coords.x >= gridSize.width || 
          coords.y < 0 || coords.y >= gridSize.height) {
        return;
      }
      
      if (moveMode.active) {
        onMachineMove(moveMode.machine, coords.x, coords.y);
        setMoveMode({ active: false, machine: null });
        return;
      }
      
      // Only handle click placement if we haven't dragged
      if (!hasDragged) {
        switch (activeMode) {
          case EditorModes.WALL:
            onWallAdd(coords.x, coords.y);
            break;
          case EditorModes.TRAY:
              onTrayAdd(coords.x, coords.y);
              break;
          case EditorModes.PERFORATION:
            onPerforationAdd(coords.x, coords.y);
            break;
          case EditorModes.MACHINE:
            if (selectedMachine) {
              e.stopPropagation(); // Prevent clearing selection
              onMachinePlace(coords.x, coords.y);
            }
            break;
          case EditorModes.DELETE:
            onDelete(coords.x, coords.y);
            break;
        }
      }
    }, [activeMode, selectedMachine, moveMode, onWallAdd,onTrayAdd, onPerforationAdd, onMachinePlace, onMachineMove, gridSize, hasDragged]);

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

    const handleSectionClick = useCallback((section) => {
        const now = Date.now();
        const isDoubleClick = now - lastClickTime < 300; // 300ms threshold for double-click
        setLastClickTime(now);

        if (isDoubleClick) {
            setSelectedSectionForSimulation(section);
            setShowTraySimulation(true);
        } else {
            setSelectedElement(prev => prev?.data === section ? null : {
              type: 'section',
              data: section
            });
        }
    }, [lastClickTime]);

    // Process backend sections and their cables
    const processedSections = useMemo(() => {
      if (!backendSections?.length) return [];

      return backendSections.map(section => {
        // Get all cables that go through this section
        const sectionCables = new Set(Array.from(section.cables || []));  // Convert to Set

        // Find the network for this section based on the network name
        const network = networks.find(n => n.name === section.network);
        if (!network) {
          console.warn(`Network not found for section with network name: ${section.network}`);
        }

        return {
          ...section,
          // Use network color from frontend networks configuration
          color: network?.color || '#9ca3af',
          // Include the processed cable details
          cables: sectionCables,  // Store as Set
          details: section.details || {}
        };
      });
    }, [backendSections, networks]);

    // Get network color and info for a section
    const getNetworkInfo = (networkFunction) => {
      const network = networks.find(n => n.functions.includes(networkFunction));
      return {
        color: network?.color || '#ef4444',
        name: network?.name || networkFunction,
        visible: networkVisibility[network?.name] !== false
      };
    };

    // Get unique networks and their info
    const networkInfo = useMemo(() => {
      const networkMap = new Map();
      
      networks.forEach(network => {
        networkMap.set(network.name, {
          ...network,
          cables: new Set(),
          visible: networkVisibility[network.name] !== false
        });
      });
      
      // Add cables to their respective networks based on section information
      processedSections.forEach(section => {
        if (!section.network) return;
        
        const networkEntry = networkMap.get(section.network);
        if (!networkEntry) return;
        
        // Add cables to the network
        section.cables.forEach(cableId => {
          networkEntry.cables.add(cableId);
        });
      });
      
      return Array.from(networkMap.values());
    }, [processedSections, networks, networkVisibility]);

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

    // Render machines on the grid
    const renderMachines = () => {
      return Object.entries(machines).map(([name, machine]) => {
        const { x, y, description, mergedHistory } = machine;
        const isSelected = selectedElement?.data?.name === name;
        const isInheritTarget = inheritMode.active && inheritMode.targetMachine === name;

        return (
          <g
            key={`machine-${name}`}
            transform={`translate(${x * cellSize}, ${y * cellSize})`}
            className="cursor-pointer"
            onMouseEnter={() => handleMachineHover({ ...machine, name }, true)}
            onMouseLeave={() => handleMachineHover({ ...machine, name }, false)}
            onClick={(e) => {
              e.stopPropagation();
              handleMachineClick({ ...machine, name });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = svgRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              setContextMenu({ show: true, x, y, machine: name });
            }}
          >
            {/* Machine node */}
            <circle
              cx={cellSize / 2}
              cy={cellSize / 2}
              r={cellSize / 3}
              className={`${
                isSelected 
                  ? 'fill-blue-100 stroke-blue-500' 
                  : isInheritTarget
                    ? 'fill-blue-50 stroke-blue-400'
                    : 'fill-green-100 stroke-green-500'
              } stroke-2`}
            />

            {/* Label background */}
            <rect
              x={cellSize / 2 - 20}
              y={-24}
              width={40}
              height={18}
              rx={4}
              fill="white"
              className="stroke-gray-200"
            />

            {/* Machine label */}
            <text
              x={cellSize / 2}
              y={-12}
              textAnchor="middle"
              className={`text-xs font-medium ${
                isSelected || isInheritTarget ? 'fill-blue-700' : 'fill-green-700'
              }`}
            >
              {name}
            </text>

            {/* Merged indicator */}
            {mergedHistory && Object.keys(mergedHistory).length > 1 && (
              <circle
                cx={cellSize - 4}
                cy={4}
                r={3}
                className="fill-blue-500"
              />
            )}
          </g>
        );
      });
    };

    // Render cable sections
    const renderCableSections = () => {
      return processedSections.map((section, index) => {
        if (!section?.points || section.points.length < 2) return null;

        // Calculate path
        const path = section.points
          .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x * cellSize + cellSize/2} ${point.y * cellSize + cellSize/2}`)
          .join(' ');

        // Find the network for visibility check
        const network = networks.find(n => n.name === section.network);
        const isVisible = network ? networkVisibility[network.name] !== false : true;

        if (!isVisible) return null;

        // Check if this section belongs to the hovered network
        const isNetworkHovered = hoveredNetwork === section.network;

        // Calculate opacity based on hover states
        const opacity = hoveredCable ? (
          section.cables.has(hoveredCable) ? 1 : 0.2
        ) : hoveredNetwork ? (
          isNetworkHovered ? 1 : 0.2
        ) : 1;

        const strokeWidth = (isNetworkHovered || section.cables.has(hoveredCable)) ? 
          (section.strokeWidth || 4) * 1.5 : // Increase width for highlighted sections
          section.strokeWidth || 4;

        return (
          <g 
            key={`section-${index}`}
            onClick={() => handleSectionClick(section)}
            onMouseEnter={(e) => handleSectionHover(`section-${index}`, section, e)}
            onMouseLeave={() => handleSectionHover(null, null)}
            style={{ 
              opacity,
              transition: 'all 0.2s ease-in-out'
            }}
          >
            <path
              d={path}
              stroke={section.color}
              strokeWidth={strokeWidth}
              fill="none"
              style={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out'
              }}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      });
    };

    const handleMachineClick = useCallback((machine) => {
      if (activeMode === EditorModes.MACHINE && selectedMachine) {
        return;
      }

      if (inheritMode.active) {
        onMachineInherit(inheritMode.targetMachine, machine.name);
        setInheritMode({ active: false, targetMachine: null });
        return;
      }

      const machineCables = getMachineCables(machine.name, cables, machines[machine.name]);
      const cablesWithRoutes = machineCables.map(cable => {
        const section = backendSections.find(section => {
          return Array.isArray(section.cables) 
            ? section.cables.includes(cable.cableLabel)
            : section.cables.has(cable.cableLabel);
        });
        return {
          ...cable,
          routeLength: section?.details[cable.cableLabel]?.routeLength,
          // Ensure we pass through the display names
          displaySource: cable.displaySource,
          displayTarget: cable.displayTarget
        };
      });

      if (selectedElement?.data?.name === machine.name) {
        setSelectedElement(null);
        setHoveredElement(null);
      } else {
        setSelectedElement({
          type: 'machine',
          data: {
            ...machine,
            name: machine.name,
            cables: cablesWithRoutes,
            mergedHistory: machines[machine.name]?.mergedHistory || { [machine.name]: true }
          }
        });
        setHoveredElement(null);
      }
    }, [cables, backendSections, selectedElement, activeMode, selectedMachine, inheritMode, onMachineInherit, machines]);

    // Add this near the top of the component with other event handlers
    const handleContextMenu = useCallback((e, machineName) => {
      e.preventDefault();
      e.stopPropagation();
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

    // Add this maxCableCount calculation
    const maxCableCount = useMemo(() => {
        return Math.max(...processedSections.map(section => section.cables.size), 1);
    }, [processedSections]);

    // Add or modify the cell click/drag handlers
    const handleCellMouseDown = (x, y) => {
      if (activeMode === EditorModes.WALL) {
        setIsDragging(true);
        setDragStart({ x, y });
        onWallAdd(x, y);
      } else if (activeMode === EditorModes.PERFORATION) {
        onPerforationAdd(x, y);
      } else if (activeMode === EditorModes.MACHINE && selectedMachine) {
        onMachinePlace(x, y);
      }
    };

    const handleCellMouseMove = (x, y) => {
      setCurrentHover({ x, y });
      if (isDragging && dragStart && activeMode === EditorModes.WALL) {
        onWallAdd(dragStart.x, dragStart.y, x, y);
        setDragStart({ x, y }); // Update drag start to current position
      }
    };

    const handleCellMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
    };

    // Add mouse leave handler to the grid container
    const handleMouseLeave = () => {
      setIsDragging(false);
      setDragStart(null);
      setDragPosition(null);
      if (!selectedElement) {
        setHoveredElement(null);
      }
    };

    // Add useEffect for click outside handling
    useEffect(() => {
      const handleClickOutside = (e) => {
        // Check if click is outside the context menu
        if (contextMenu.show) {
          const contextMenuElement = document.querySelector('.context-menu');
          if (contextMenuElement && !contextMenuElement.contains(e.target)) {
            setContextMenu({ show: false, x: 0, y: 0, machine: null });
          }
        }
      };

      // Add event listeners
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);

      // Cleanup
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('contextmenu', handleClickOutside);
      };
    }, [contextMenu.show]);

    // Add this event handler to the LayoutGrid component
    const handleCanvasClick = (event) => {
      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) / cellSize);
      const y = Math.floor((event.clientY - rect.top) / cellSize);
      
      console.log(`Clicked at grid coordinates: (${x}, ${y})`);
      setLastClickPos({ x, y });
      
      // Clear the indicator after 1 second
      setTimeout(() => setLastClickPos(null), 1000);
    };

    // Add this helper function near the top of the component
    const getNetworkColor = useCallback((networkName) => {
      const network = networks.find(n => n.name === networkName);
      return network?.color || '#000000';
    }, [networks]);

    // First, add this helper function
    const renderCablePaths = () => {
      return (
        <>
          {/* Base layer - all sections */}
          {backendSections.map((section, index) => {
            // If network is toggled off, don't render the section at all
            if (networkVisibility[section.network] === false) {
              return null;
            }

            // Check if this section contains the hovered cable
            const containsHoveredCable = hoveredCable && section.cables.includes(hoveredCable);
            const isNetworkHovered = hoveredNetwork === section.network;

            return (
              <g 
                key={`path-${index}`}
                style={{
                  opacity: (
                    (hoveredSection !== null && hoveredSection !== index && !selectedElement) ||
                    (hoveredCable && !containsHoveredCable) ||
                    (hoveredNetwork && !isNetworkHovered)
                  ) ? 0.2 : 1,
                  transition: 'all 0.2s ease'
                }}
                onContextMenu={(e) => handleSectionContextMenu(e, section)}
              >
                <path
                  d={`M ${section.points.map(p => `${p.x * cellSize + cellSize/2} ${p.y * cellSize + cellSize/2}`).join(' L ')}`}
                  stroke={getNetworkColor(section.network)}
                  strokeWidth={isNetworkHovered ? (section.strokeWidth || 4) * 1.2 : (section.strokeWidth || 4)}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transition: 'all 0.2s ease',
                    filter: (containsHoveredCable || isNetworkHovered) ? 'drop-shadow(0 0 3px rgba(0,0,0,0.3))' : 'none',
                    strokeDasharray: containsHoveredCable ? '4 2' : 'none'
                  }}
                />
              </g>
            );
          })}

          {/* Invisible hit areas for hover detection - only for visible networks */}
          {backendSections.map((section, index) => {
            if (networkVisibility[section.network] === false) {
              return null;
            }

            return (
              <path
                key={`hit-${index}`}
                d={`M ${section.points.map(p => `${p.x * cellSize + cellSize/2} ${p.y * cellSize + cellSize/2}`).join(' L ')}`}
                stroke="transparent"
                strokeWidth={(section.strokeWidth || 4) + 10}
                fill="none"
                style={{ cursor: 'pointer' }}
                onContextMenu={(e) => handleSectionContextMenu(e, section)}
                onMouseEnter={() => {
                  setHoveredSection(index);
                  setHoveredElement({
                    type: 'section',
                    data: section
                  });
                }}
                onMouseLeave={() => {
                  setHoveredSection(null);
                  if (!selectedElement) {
                    setHoveredElement(null);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement({
                    type: 'section',
                    data: section
                  });
                }}
              />
            );
          })}
        </>
      );
    };

    // Add a new render function for Steiner points
    const renderSteinerPoints = () => {
        return steinerPoints.map((point, index) => (
            <g key={`steiner-${index}`}>
                {/* Outer circle for junction */}
                <circle
                    cx={point.x * cellSize + cellSize/2}
                    cy={point.y * cellSize + cellSize/2}
                    r={6}
                    fill="#fbbf24"
                    stroke="#d97706"
                    strokeWidth="1.5"
                    opacity="0.9"
                />
                {/* Inner cross for junction appearance */}
                <path
                    d={`M ${point.x * cellSize + cellSize/2} ${point.y * cellSize + cellSize/2 - 4}
                       v 8
                       M ${point.x * cellSize + cellSize/2 - 4} ${point.y * cellSize + cellSize/2}
                       h 8`}
                    stroke="#d97706"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
            </g>
        ));
    };

    // Add this handler near other handlers
    const handleSectionContextMenu = useCallback((e, section) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSectionContextMenu({ show: true, x, y, section });
    }, []);

    // Add click outside handler for section context menu
    useEffect(() => {
      const handleClickOutside = (e) => {
        if (sectionContextMenu.show) {
          const contextMenuElement = document.querySelector('.context-menu');
          if (contextMenuElement && !contextMenuElement.contains(e.target)) {
            setSectionContextMenu({ show: false, x: 0, y: 0, section: null });
          }
        }
      };

      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);

      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('contextmenu', handleClickOutside);
      };
    }, [sectionContextMenu.show]);

    const handleMachineHover = useCallback((machine, isHovering) => {
      if (isHovering && !selectedElement) {
        const machineCables = getMachineCables(machine.name, cables, machines[machine.name]);
        const cablesWithRoutes = machineCables.map(cable => {
          const section = backendSections.find(section => {
            return Array.isArray(section.cables) 
              ? section.cables.includes(cable.cableLabel)
              : section.cables.has(cable.cableLabel);
          });
          return {
            ...cable,
            routeLength: section?.details[cable.cableLabel]?.routeLength
          };
        });

        setHoveredElement({
          type: 'machine',
          data: {
            ...machine,
            name: machine.name,
            cables: cablesWithRoutes
          }
        });
      } else if (!selectedElement) {
        setHoveredElement(null);
      }
    }, [cables, backendSections, selectedElement, machines]);

    // Main render
    return (
      <div className="w-[1400px] mx-auto">
        <div className="flex gap-4 bg-white rounded-xl p-6">
          <div className="flex-1 flex flex-col gap-4">
            {/* Network Legend */}
            <div className="bg-white rounded-lg shadow-sm p-2">
              <div className="space-y-2">
                {networkInfo.map((network) => (
                  <div 
                    key={network.id || network.name} 
                    className={`flex items-center gap-2 p-1.5 rounded transition-colors ${
                      hoveredNetwork === network.name ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => onNetworkHover(network.name)}
                    onMouseLeave={() => onNetworkHover(null)}
                  >
                    <Switch
                      checked={networkVisibility[network.name] !== false}
                      onCheckedChange={(checked) => {
                        onNetworkVisibilityChange({
                          ...networkVisibility,
                          [network.name]: checked
                        });
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full transition-transform ${
                          hoveredNetwork === network.name ? 'scale-125' : ''
                        }`}
                        style={{ backgroundColor: network.color }}
                      />
                      <span className={`text-sm ${
                        hoveredNetwork === network.name ? 'font-medium' : ''
                      }`}>{network.name}</span>
                      <span className="text-xs text-gray-500">
                        ({network.cables.size} cables)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Canvas Container */}
                          <div
                ref={canvasContainerRef}
                className="relative bg-white rounded-lg shadow-sm mx-auto overflow-auto"
                style={{
                  maxWidth: '1200px',
                  maxHeight: '1200px',
                  border: '1px solid #ccc'
                }}
                onMouseLeave={handleMouseLeave}
              >

              <svg
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className={`cable-tray-grid ${getCursorStyle()}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onClick={(event) => {
                  // If we're in machine placement mode, just handle the placement
                  if (activeMode === EditorModes.MACHINE && selectedMachine) {
                    handleClick(event);
                    return;
                  }

                  // If the click wasn't on a machine or section (it bubbled up to here),
                  // then clear the selection
                  if (event.target === event.currentTarget) {
                    setSelectedElement(null);
                    setHoveredElement(null);
                  }

                  handleClick(event);
                  handleCanvasClick(event);
                }}
              >
                {/* Background image if exists */}
                {imageUrl && (
                  <image
                    key="background-image"
                    href={imageUrl}
                    width={backgroundImage?.originalWidth ? (backgroundImage.originalWidth * imageScale) : width}
                    height={backgroundImage?.originalHeight ? (backgroundImage.originalHeight * imageScale) : height}
                    x={backgroundImage?.originalWidth ? ((width - backgroundImage.originalWidth * imageScale) / 2) : 0}
                    y={backgroundImage?.originalHeight ? ((height - backgroundImage.originalHeight * imageScale) / 2) : 0}
                    preserveAspectRatio="none"
                    opacity="0.5"
                  />
                )}

                {/* Grid Lines */}
                {Array.from({ length: Math.max(gridSize.width, gridSize.height) + 1 }).map((_, i) => (
                  <React.Fragment key={`grid-${i}`}>
                    {/* Horizontal lines - only draw up to height */}
                    {i <= gridSize.height && (
                      <line
                        x1={0}
                        y1={i * cellSize}
                        x2={width}
                        y2={i * cellSize}
                        stroke="#f0f0f0"
                        strokeWidth="0.5"
                      />
                    )}
                    {/* Vertical lines - only draw up to width */}
                    {i <= gridSize.width && (
                      <line
                        x1={i * cellSize}
                        y1={0}
                        x2={i * cellSize}
                        y2={height}
                        stroke="#f0f0f0"
                        strokeWidth="0.5"
                      />
                    )}
                    {/* Add measurements every 10 cells (1 meter) */}
                    {i > 0 && i % 10 === 0 && (
                      <>
                        {/* Vertical measurement - only show up to height */}
                        {i <= gridSize.height && (
                          <text
                            x={2}
                            y={i * cellSize - 2}
                            className="text-xs fill-gray-400"
                          >
                            {(i / 10).toFixed(1)}m
                          </text>
                        )}
                        {/* Horizontal measurement - only show up to width */}
                        {i <= gridSize.width && (
                          <text
                            x={i * cellSize + 2}
                            y={10}
                            className="text-xs fill-gray-400"
                          >
                            {(i / 10).toFixed(1)}m
                          </text>
                        )}
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

                {/* Preview Walls */}
                {previewWalls.map(wall => (
                  <rect
                    key={`preview-wall-${wall.x}-${wall.y}`}
                    x={wall.x * cellSize}
                    y={wall.y * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill="#4b5563"
                    opacity="0.5"
                  />
                ))}

                {/* Cable Paths */}
                <g className="cable-paths" style={{ pointerEvents: 'all' }}>
                  {renderCablePaths()}
                </g>

                {/* Walls */}
                {walls.map((wall, index) => (
                  <rect
                    key={`wall-${wall.x}-${wall.y}`}
                    x={wall.x * cellSize}
                    y={wall.y * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill="#4b5563"
                  />
                ))}
                {trays.map((tray, index) => (
                  <rect
                    key={`tray-${tray.x}-${tray.y}-${index}`}
                    x={tray.x * cellSize}
                    y={tray.y * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill="#3b82f6" // Azul (o el color que prefieras)
                    opacity="0.5"
                  />
                ))}

                {/* Perforations */}
                {perforations.map((perf, index) => (
                  <circle
                    key={`perf-${perf.x}-${perf.y}`}
                    cx={perf.x * cellSize + cellSize / 2}
                    cy={perf.y * cellSize + cellSize / 2}
                    r={cellSize / 4}
                    fill="#ef4444"
                  />
                ))}

                {/* Machines */}
                <g className="machines">
                  {renderMachines()}
                </g>

                {/* Other elements */}
                {lastClickPos && (
                  <circle
                    cx={lastClickPos.x * cellSize + cellSize/2}
                    cy={lastClickPos.y * cellSize + cellSize/2}
                    r={4}
                    fill="red"
                    opacity={0.7}
                  />
                )}

                {/* Hanan Grid */}
                {hananGrid.xCoords.length > 0 && (
                  <g className="hanan-grid">
                    {/* Vertical lines */}
                    {hananGrid.xCoords.map(x => (
                      <line
                        key={`hanan-v-${x}`}
                        x1={x * cellSize + cellSize/2}
                        y1={0}
                        x2={x * cellSize + cellSize/2}
                        y2={height}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                    ))}
                    {/* Horizontal lines */}
                    {hananGrid.yCoords.map(y => (
                      <line
                        key={`hanan-h-${y}`}
                        x1={0}
                        y1={y * cellSize + cellSize/2}
                        x2={width}
                        y2={y * cellSize + cellSize/2}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                    ))}
                    {/* Intersection points */}
                    {hananGrid.xCoords.map(x => 
                      hananGrid.yCoords.map(y => (
                        <circle
                          key={`hanan-point-${x}-${y}`}
                          cx={x * cellSize + cellSize/2}
                          cy={y * cellSize + cellSize/2}
                          r={2}
                          fill="#e5e7eb"
                        />
                      ))
                    )}
                  </g>
                )}

                {/* Context Menu */}
                {contextMenu.show && (
                  <foreignObject
                    key="context-menu"
                    x={contextMenu.x}
                    y={contextMenu.y}
                    width={160}
                    height={120}
                    style={{ overflow: 'visible' }}
                  >
                    <div 
                      className="context-menu bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
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

                {/* Add Steiner points layer between cable paths and machines */}
                <g className="steiner-points">
                    {renderSteinerPoints()}
                </g>

                {/* Section Context Menu */}
                {sectionContextMenu.show && (
                  <foreignObject
                    x={sectionContextMenu.x}
                    y={sectionContextMenu.y}
                    width={160}
                    height={80}
                    style={{ overflow: 'visible' }}
                  >
                    <div 
                      className="context-menu bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
                      style={{ width: '160px' }}
                    >
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => {
                          setShowTraySimulation(true);
                          setSelectedSectionForSimulation(sectionContextMenu.section);
                          setSectionContextMenu({ show: false, x: 0, y: 0, section: null });
                        }}
                      >
                        <svg 
                          className="w-4 h-4" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2"
                        >
                          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                        </svg>
                        Simulate Cable Tray...
                      </button>
                    </div>
                  </foreignObject>
                )}
              </svg>
            </div>
          </div>

          {/* Info Panel */}
          <div className="w-80 bg-white rounded-lg shadow-sm p-4 flex flex-col shrink-0" style={{ height: `${height}px` }}>
            <InfoPanel 
              hoveredInfo={hoveredElement}
              selectedElement={selectedElement}
              onClose={() => setSelectedElement(null)}
              onCableHover={setHoveredCable}
            />
          </div>
        </div>

        {showTraySimulation && selectedSectionForSimulation && (
          <CableTraySimulation
            cables={Array.from(selectedSectionForSimulation.cables).map(cableId => {
              const details = selectedSectionForSimulation.details[cableId];
              return {
                ...details,
                cableLabel: cableId,
                function: details.cableFunction,
                network: details.network || details.type,
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
      </div>
    );
};

LayoutGrid.propTypes = {
  gridSize: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired
  }).isRequired,
  cellSize: PropTypes.number.isRequired,
  walls: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  })
  ),

  trays: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  })),
  
  perforations: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  })
  ),
  machines: PropTypes.object,
  cables: PropTypes.array,
  networks: PropTypes.array,
  networkVisibility: PropTypes.object,
  activeMode: PropTypes.string,
  selectedMachine: PropTypes.object,
  selectedCable: PropTypes.string,
  onWallAdd: PropTypes.func.isRequired,
  onTrayAdd: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onPerforationAdd: PropTypes.func.isRequired,
  onMachinePlace: PropTypes.func.isRequired,
  onMachineMove: PropTypes.func.isRequired,
  onMachineRemove: PropTypes.func.isRequired,
  onNetworkVisibilityChange: PropTypes.func.isRequired,
  onMachineInherit: PropTypes.func.isRequired,
  backgroundImage: PropTypes.object,
  backendSections: PropTypes.arrayOf(PropTypes.shape({
    points: PropTypes.arrayOf(PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number
    })
    ),
    cables: PropTypes.instanceOf(Set),
    color: PropTypes.string,
    function: PropTypes.string,
    details: PropTypes.instanceOf(Map)
  })
  ),
  cableRoutes: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  }))),
  hananGrid: PropTypes.shape({
    xCoords: PropTypes.arrayOf(PropTypes.number),
    yCoords: PropTypes.arrayOf(PropTypes.number)
  }),
  hoveredNetwork: PropTypes.string,
  onNetworkHover: PropTypes.func,
  steinerPoints: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  }))
};

// Add display name to the main component
LayoutGrid.displayName = 'LayoutGrid';

export default LayoutGrid;