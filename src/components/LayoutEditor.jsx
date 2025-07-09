"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { LayoutGrid } from './LayoutGrid';
import { NetworkPanel } from './NetworkPanel';
import { InfoSidebar } from './InfoSidebar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EditorModes } from '@/constants/editorModes';
import { optimizeNetworkPaths, calculateHananGrid } from '@/utils/cableUtils';
import { ChevronLeft, ChevronRight, Download, Upload, Plus, X, Blocks, Squirrel, CircleDot, Wrench, Tractor, GripVertical } from 'lucide-react';
import { InitialSetupModal } from './InitialSetupModal';
import { metersToGridUnits, gridUnitsToMeters } from '@/utils/gridUtils';

// Default network configurations
const DEFAULT_NETWORKS = [
  {
    id: 'power',
    name: 'Power Network',
    color: '#ef4444',
    isDefault: true,
    visible: true,
    functions: ['POWER SUPPLY CAT. C2', 'POWER SUPPLY CAT. C3']
  },
  {
    id: 'control',
    name: 'Control Network',
    color: '#2563eb',
    isDefault: true,
    visible: true,
    functions: ['CONTROL', 'MEASUREMENT', 'SIGNAL', 'OPTICAL']
  },
  {
    id: 'hv',
    name: 'HV Network',
    color: '#7c3aed',
    isDefault: true,
    visible: true,
    functions: ['DC HIGH VOLTAGE']
  },
  {
    id: 'ground',
    name: 'Ground Network',
    color: '#059669',
    isDefault: true,
    visible: true,
    functions: ['GROUNDING AND EQUIPOTENTIAL VOLTAGE']
  }
];

const MAX_NETWORKS = 8;

const mergeMachines = (machines, cables, machineA, machineB) => {
  // Create new machines object without machineB
  const newMachines = { ...machines };

  // Get existing machine data or create default structures
  const machineAData = newMachines[machineA] || { x: 0, y: 0, mergedHistory: { [machineA]: true } };
  const machineBData = newMachines[machineB] || { x: 0, y: 0, mergedHistory: { [machineB]: true } };

  // Create or update merged history
  const mergedHistory = {
    ...(machineAData.mergedHistory || { [machineA]: true }),
    ...(machineBData.mergedHistory || { [machineB]: true })
  };

  // Update machine A with merged history and description
  newMachines[machineA] = {
    ...machineAData,
    mergedHistory,
    description: [
      machineAData.description,
      machineBData.description
    ].filter(Boolean).join(' + ')
  };

  delete newMachines[machineB];

  // Keep original source/target in cables but mark them as merged
  const updatedCables = cables.map(cable => {
    const newCable = { ...cable };
    if (cable.source === machineB) {
      newCable.source = machineA;
      newCable.originalSource = machineB;
    }
    if (cable.target === machineB) {
      newCable.target = machineA;
      newCable.originalTarget = machineB;
    }
    return newCable;
  });

  return { newMachines, updatedCables };
};

export const LayoutEditor = () => {
  const [showInitialSetup, setShowInitialSetup] = useState(true);
  const [canvasConfig, setCanvasConfig] = useState({
    width: 10,
    height: 10,
    gridResolution: 0.1,
    backgroundImage: null
  });
  const fileInputRef = useRef(null);

  const [editorMode, setEditorMode] = useState(EditorModes.WALL);
  const [walls, setWalls] = useState([]);
  const [trays, setTray] = useState([]);
  const [perforations, setPerforations] = useState([]);
  const [machines, setMachines] = useState({});
  const [availableMachines, setAvailableMachines] = useState([]);
  const [cables, setCables] = useState([]);
  const [importedCables, setImportedCables] = useState([]);
  const [networks, setNetworks] = useState(DEFAULT_NETWORKS);
  const [showCableList, setShowCableList] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [networkVisibility, setNetworkVisibility] = useState(() => {
    // Initialize all networks as visible
    return DEFAULT_NETWORKS.reduce((acc, network) => {
      acc[network.name] = true;
      return acc;
    }, {});
  });
  const [inheritMode, setInheritMode] = useState({ active: false, targetMachine: null });
  const [backendSections, setBackendSections] = useState([]);
  const [cableRoutes, setCableRoutes] = useState({});
  const [hananGrid, setHananGrid] = useState({ xCoords: [], yCoords: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredCable, setHoveredCable] = useState(null);
  const [hoveredNetwork, setHoveredNetwork] = useState(null);
  const [steinerPoints, setSteinerPoints] = useState([]);
  const [machineUpdateCounter, setMachineUpdateCounter] = useState(0);
  //uses on the use efect to optimize the number of execution not refresishing when you are dragging
  const [needsOptimization, setNeedsOptimization] = useState(false);
  
  // Add machine search state
  const [machineSearchTerm, setMachineSearchTerm] = useState('');
  
  // Add AbortController ref to track current request
  const abortControllerRef = useRef(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [cableSearchTerm, setCableSearchTerm] = useState('');

  // Dynamic canvas sizing state
  const [canvasContainerSize, setCanvasContainerSize] = useState({ width: 800, height: 600 });

  // Calculate optimal canvas container size
  const calculateCanvasSize = useCallback(() => {
    // Calculate available space more dynamically
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Reserve space for sidebars and padding
    const leftSidebarWidth = sidebarCollapsed ? 16 + 32 : 320 + 32; // width + padding
    const networkPanelWidth = 384 + 32; // max-width (md = 384px) + padding for expanded state
    const rightSidebarWidth = 256 + 32; // min-width + padding
    const horizontalPadding = 32; // reduced from 64 since canvas no longer has internal padding
    
    // Calculate dynamic vertical padding based on actual content
    let verticalPadding = 120; // base toolbar + header
    if (showCableList) {
      verticalPadding += 320; // cable list takes up space (300px + padding)
    }
    
    // No more bottom networks panel since it's integrated into NetworkPanel
    
    const availableWidth = viewportWidth - leftSidebarWidth - networkPanelWidth - rightSidebarWidth - horizontalPadding;
    const availableHeight = viewportHeight - verticalPadding;
    
    const minWidth = 400;
    const maxWidth = Math.max(minWidth, availableWidth);
    const minHeight = 300;
    const maxHeight = Math.max(minHeight, availableHeight);
     
    let optimalWidth = 800; // default
    let optimalHeight = 600; // default
     
    // If there's a background image, try to size based on it
    if (canvasConfig.backgroundImage) {
      if (typeof canvasConfig.backgroundImage === 'object' && 
          canvasConfig.backgroundImage.originalWidth && 
          canvasConfig.backgroundImage.originalHeight) {
        // Calculate size to fit the entire image while maintaining aspect ratio
        const imageAspectRatio = canvasConfig.backgroundImage.originalWidth / canvasConfig.backgroundImage.originalHeight;
        const availableAspectRatio = availableWidth / availableHeight;
        
        // Fit image to available space while maintaining aspect ratio
        if (imageAspectRatio > availableAspectRatio) {
          // Image is wider relative to available space - fit to width
          optimalWidth = Math.min(maxWidth, availableWidth * 0.98);
          optimalHeight = Math.min(maxHeight, optimalWidth / imageAspectRatio);
        } else {
          // Image is taller relative to available space - fit to height
          optimalHeight = Math.min(maxHeight, availableHeight * 0.98);
          optimalWidth = Math.min(maxWidth, optimalHeight * imageAspectRatio);
        }
      } else {
        // For base64 images without dimensions, use available space with grid proportions
        const gridAspectRatio = canvasConfig.width / canvasConfig.height;
        if (gridAspectRatio > availableWidth / availableHeight) {
          optimalWidth = Math.min(maxWidth, availableWidth * 0.95);
          optimalHeight = Math.min(maxHeight, optimalWidth / gridAspectRatio);
        } else {
          optimalHeight = Math.min(maxHeight, availableHeight * 0.95);
          optimalWidth = Math.min(maxWidth, optimalHeight * gridAspectRatio);
        }
      }
    } else {
      // No background image, size based on grid content and available space
      const gridAspectRatio = canvasConfig.width / canvasConfig.height;
      if (gridAspectRatio > availableWidth / availableHeight) {
        optimalWidth = Math.min(maxWidth, availableWidth * 0.9);
        optimalHeight = Math.min(maxHeight, optimalWidth / gridAspectRatio);
      } else {
        optimalHeight = Math.min(maxHeight, availableHeight * 0.9);
        optimalWidth = Math.min(maxWidth, optimalHeight * gridAspectRatio);
      }
    }
     
    // Ensure minimum sizes
    optimalWidth = Math.max(minWidth, optimalWidth);
    optimalHeight = Math.max(minHeight, optimalHeight);
    
    return {
      width: Math.round(optimalWidth),
      height: Math.round(optimalHeight)
    };
  }, [canvasConfig, sidebarCollapsed, showCableList]);

  // Update canvas size when config changes
  useEffect(() => {
    const newSize = calculateCanvasSize();
    setCanvasContainerSize(newSize);
  }, [calculateCanvasSize]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => {
      const newSize = calculateCanvasSize();
      setCanvasContainerSize(newSize);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateCanvasSize]);

  const markForOptimization = useCallback(() => {
    setNeedsOptimization(true);
  }, []);

  // Filter available machines based on search term
  const filteredAvailableMachines = useMemo(() => {
    if (!machineSearchTerm.trim()) {
      return availableMachines;
    }
    
    const searchLower = machineSearchTerm.toLowerCase();
    return availableMachines.filter(machine => 
      machine.name.toLowerCase().includes(searchLower) ||
      (machine.description && machine.description.toLowerCase().includes(searchLower))
    );
  }, [availableMachines, machineSearchTerm]);

  // Filter cables based on search term
  const filteredCables = useMemo(() => {
    const cablesToFilter = importedCables.length > 0 ? importedCables : cables;
    
    if (!cableSearchTerm.trim()) {
      return cablesToFilter;
    }
    
    const searchLower = cableSearchTerm.toLowerCase();
    return cablesToFilter.filter(cable => 
      cable.cableLabel?.toLowerCase().includes(searchLower) ||
      cable.source?.toLowerCase().includes(searchLower) ||
      cable.target?.toLowerCase().includes(searchLower) ||
      cable.cableFunction?.toLowerCase().includes(searchLower)
    );
  }, [cables, importedCables, cableSearchTerm]);

  const fetchOptimalPaths = useCallback(async () => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    try {
      // Cancel any ongoing request
      if (abortControllerRef.current) {
        console.log(`🚫 [${new Date().toLocaleTimeString()}] BACKEND INTERRUPTED: Cancelling previous request to start new one (Request ID: ${requestId})`);
        abortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      console.log(`🚀 [${new Date().toLocaleTimeString()}] BACKEND REQUEST STARTED: Optimization request initiated (Request ID: ${requestId})`);
      
      setIsLoading(true);
      setError(''); // Clear any previous errors
      
      // Get all available cables
      const allCables = importedCables.length > 0 ? importedCables : cables;

      // Log detailed cable information
      console.group(`📋 [${new Date().toLocaleTimeString()}] CABLE ANALYSIS (Request ID: ${requestId})`);
      console.log(`Total cables available: ${allCables.length}`);
      
      // Analyze cables by source/target machine existence
      const cableAnalysis = {
        total: allCables.length,
        routable: 0,
        missingSource: 0,
        missingTarget: 0,
        missingBoth: 0,
        byNetwork: {},
        byFunction: {}
      };

      allCables.forEach(cable => {
        const sourceExists = machines.hasOwnProperty(cable.source);
        const targetExists = machines.hasOwnProperty(cable.target);
        
        if (sourceExists && targetExists) {
          cableAnalysis.routable++;
        } else if (!sourceExists && !targetExists) {
          cableAnalysis.missingBoth++;
        } else if (!sourceExists) {
          cableAnalysis.missingSource++;
        } else {
          cableAnalysis.missingTarget++;
        }

        // Group by network
        const network = cable.network || 'Unknown';
        cableAnalysis.byNetwork[network] = (cableAnalysis.byNetwork[network] || 0) + 1;

        // Group by function
        const func = cable.cableFunction || 'Unknown';
        cableAnalysis.byFunction[func] = (cableAnalysis.byFunction[func] || 0) + 1;
      });

      console.log(`📊 Cable Routing Analysis:`, cableAnalysis);
      
      // Log specific unroutable cables if any
      if (cableAnalysis.missingSource > 0 || cableAnalysis.missingTarget > 0 || cableAnalysis.missingBoth > 0) {
        console.group(`⚠️ Unroutable Cables:`);
        
        allCables.forEach(cable => {
          const sourceExists = machines.hasOwnProperty(cable.source);
          const targetExists = machines.hasOwnProperty(cable.target);
          
          if (!sourceExists || !targetExists) {
            const issues = [];
            if (!sourceExists) issues.push(`Missing source: ${cable.source}`);
            if (!targetExists) issues.push(`Missing target: ${cable.target}`);
            
            console.log(`❌ ${cable.cableLabel || 'Unnamed'}: ${issues.join(', ')}`, {
              source: cable.source,
              target: cable.target,
              network: cable.network,
              function: cable.cableFunction
            });
          }
        });
        
        console.groupEnd();
      }
      
      console.groupEnd();

      // Filter cables to only include those where both machines are placed
      const availableCables = allCables.filter(cable => {
        const sourceExists = machines.hasOwnProperty(cable.source);
        const targetExists = machines.hasOwnProperty(cable.target);
        return sourceExists && targetExists;
      });

      // Log machine analysis
      console.group(`🏭 [${new Date().toLocaleTimeString()}] MACHINE ANALYSIS (Request ID: ${requestId})`);
      console.log(`Total machines placed: ${Object.keys(machines).length}`);
      
      Object.entries(machines).forEach(([name, machine]) => {
        const incomingCables = availableCables.filter(c => c.target === name).length;
        const outgoingCables = availableCables.filter(c => c.source === name).length;
        const totalCables = incomingCables + outgoingCables;
        
        console.log(`🏭 ${name}:`, {
          position: `(${machine.x}, ${machine.y})`,
          incomingCables,
          outgoingCables,
          totalCables,
          description: machine.description || 'No description',
          merged: machine.mergedHistory ? Object.keys(machine.mergedHistory).length > 1 : false
        });
      });
      console.groupEnd();

      // Log layout constraints
      console.group(`🏗️ [${new Date().toLocaleTimeString()}] LAYOUT CONSTRAINTS (Request ID: ${requestId})`);
      console.log(`Canvas size: ${canvasConfig.width * 10} x ${canvasConfig.height * 10} cells`);
      console.log(`Walls: ${walls.length} blocks`);
      console.log(`Trays: ${trays.length} blocks`);
      console.log(`Perforations: ${perforations.length} holes`);
      
      // Calculate layout density
      const totalCells = (canvasConfig.width * 10) * (canvasConfig.height * 10);
      const blockedCells = walls.length;
      const blockagePercentage = ((blockedCells / totalCells) * 100).toFixed(1);
      
      console.log(`Layout density: ${blockagePercentage}% blocked`);
      console.groupEnd();

      // Only proceed if we have cables to route
      if (availableCables.length === 0) {
        console.log(`⚠️ [${new Date().toLocaleTimeString()}] BACKEND REQUEST SKIPPED: No cables to route (Request ID: ${requestId})`);
        console.log(`💡 Tip: Ensure machines are placed for cable endpoints`);
        return;
      }

      // Log network analysis
      console.group(`🌐 [${new Date().toLocaleTimeString()}] NETWORK ANALYSIS (Request ID: ${requestId})`);
      networks.forEach(network => {
        const networkCables = availableCables.filter(c => c.network === network.name);
        console.log(`🌐 ${network.name}:`, {
          cables: networkCables.length,
          functions: network.functions,
          color: network.color,
          visible: networkVisibility[network.name] !== false
        });
      });
      console.groupEnd();

      // Validate and clean machine data before sending to backend
      const cleanedMachines = {};
      Object.entries(machines).forEach(([key, machine]) => {
        cleanedMachines[key] = {
          ...machine,
          x: isNaN(machine.x) ? 0 : Number(machine.x),
          y: isNaN(machine.y) ? 0 : Number(machine.y),
          width: machine.width !== undefined ? (isNaN(machine.width) ? 1 : Number(machine.width)) : undefined,
          height: machine.height !== undefined ? (isNaN(machine.height) ? 1 : Number(machine.height)) : undefined
        };
      });

      // Validate and clean walls, trays, and perforations
      const cleanedWalls = walls.filter(w => !isNaN(w.x) && !isNaN(w.y)).map(w => ({
        x: Number(w.x),
        y: Number(w.y)
      }));
      
      const cleanedTrays = trays.filter(t => !isNaN(t.x) && !isNaN(t.y)).map(t => ({
        x: Number(t.x),
        y: Number(t.y)
      }));
      
      const cleanedPerforations = perforations.filter(p => !isNaN(p.x) && !isNaN(p.y)).map(p => ({
        x: Number(p.x),
        y: Number(p.y)
      }));

      const requestData = {
        width: canvasConfig.width * 10,
        height: canvasConfig.height * 10,
        walls: cleanedWalls,
        trays: cleanedTrays,
        perforations: cleanedPerforations,
        machines: cleanedMachines,
        cables: availableCables.map(cable => ({
          ...cable,
          // Ensure cableType is explicitly included
          cableType: cable.cableType,
          cableFunction: cable.cableFunction,
          source: cable.source,
          target: cable.target,
          diameter: cable.diameter
        })),
        networks: networks.map(network => ({
          id: network.id,
          name: network.name,
          functions: network.functions
        }))
      };
      
      console.log(`📤 [${new Date().toLocaleTimeString()}] BACKEND REQUEST DATA: Sending ${availableCables.length} cables, ${Object.keys(cleanedMachines).length} machines (Request ID: ${requestId})`, {
        cables: availableCables.length,
        machines: Object.keys(cleanedMachines).length,
        walls: cleanedWalls.length,
        trays: cleanedTrays.length,
        perforations: cleanedPerforations.length
      });

      const response = await fetch('/api/optimize-paths', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        signal: controller.signal // Add abort signal to the request
      });

      // Check if the request was aborted
      if (controller.signal.aborted) {
        const duration = Date.now() - startTime;
        console.log(`🚫 [${new Date().toLocaleTimeString()}] BACKEND INTERRUPTED: Request was cancelled before response (Duration: ${duration}ms, Request ID: ${requestId})`);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Double-check if request was aborted after receiving response
      if (controller.signal.aborted) {
        const duration = Date.now() - startTime;
        console.log(`🚫 [${new Date().toLocaleTimeString()}] BACKEND INTERRUPTED: Request was cancelled after receiving response (Duration: ${duration}ms, Request ID: ${requestId})`);
        return;
      }
      
      const duration = Date.now() - startTime;

      // Log detailed response analysis
      console.group(`✅ [${new Date().toLocaleTimeString()}] BACKEND COMPLETED: Optimization successful (Duration: ${duration}ms, Request ID: ${requestId})`);
      
      console.log(`📊 Optimization Results:`, {
        sections: data.sections?.length || 0,
        steinerPoints: data.steinerPoints?.length || 0,
        duration: `${duration}ms`,
        hananGridPoints: {
          xCoords: data.hananGrid?.xCoords?.length || 0,
          yCoords: data.hananGrid?.yCoords?.length || 0
        }
      });

      // Analyze sections by network
      if (data.sections && data.sections.length > 0) {
        console.group(`🛤️ Route Sections Analysis:`);
        
        const sectionsByNetwork = {};
        let totalRouteLength = 0;
        
        data.sections.forEach((section, index) => {
          const network = section.network || 'Unknown';
          if (!sectionsByNetwork[network]) {
            sectionsByNetwork[network] = [];
          }
          sectionsByNetwork[network].push(section);
          
          // Calculate section length
          let sectionLength = 0;
          for (let i = 1; i < section.points.length; i++) {
            const prev = section.points[i-1];
            const curr = section.points[i];
            sectionLength += Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
          }
          totalRouteLength += sectionLength;
          
          console.log(`🛤️ Section ${index + 1}:`, {
            network: section.network,
            cables: Array.isArray(section.cables) ? section.cables.length : section.cables.size,
            points: section.points.length,
            length: `${sectionLength.toFixed(1)} cells`,
            strokeWidth: section.strokeWidth
          });
        });
        
        console.log(`📏 Total route length: ${totalRouteLength.toFixed(1)} cells`);
        console.log(`🌐 Sections by network:`, Object.keys(sectionsByNetwork).map(network => ({
          network,
          sections: sectionsByNetwork[network].length
        })));
        
        console.groupEnd();
      }

      // Log Steiner points if any
      if (data.steinerPoints && data.steinerPoints.length > 0) {
        console.group(`⭐ Steiner Points (Junctions):`);
        data.steinerPoints.forEach((point, index) => {
          console.log(`⭐ Junction ${index + 1}: (${point.x}, ${point.y})`);
        });
        console.groupEnd();
      }

      // Log debug info if available
      if (data.debug_info) {
        console.group(`🔍 Backend Debug Information:`);
        console.log(`📊 Algorithm Performance:`, {
          initialMSTLength: data.debug_info.initial_mst_length?.toFixed(1),
          finalLength: data.debug_info.final_length?.toFixed(1),
          improvement: `${data.debug_info.improvement_percentage?.toFixed(1)}%`,
          steinerPoints: data.debug_info.num_steiner_points,
          sections: data.debug_info.num_sections,
          componentsAnalyzed: data.debug_info.num_components_tried,
          componentsUsed: data.debug_info.num_components_used,
          optimizationPasses: data.debug_info.passes_used
        });
        console.groupEnd();
      }

      console.groupEnd();

      if (data.sections) {
        setBackendSections(data.sections);
        setHananGrid(data.hananGrid || { xCoords: [], yCoords: [] });
        setSteinerPoints(data.steinerPoints || []);
      }
      
      // Clear the controller reference on successful completion
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      // Only log errors if the request wasn't aborted
      if (error.name !== 'AbortError') {
        console.error(`❌ [${new Date().toLocaleTimeString()}] BACKEND ERROR: Request failed (Duration: ${duration}ms, Request ID: ${requestId})`, error);
        setError(`Error fetching optimal paths: ${error.message}`);
      } else {
        console.log(`🚫 [${new Date().toLocaleTimeString()}] BACKEND INTERRUPTED: Request was manually cancelled or aborted (Duration: ${duration}ms, Request ID: ${requestId})`, error.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [machines, walls, perforations, cables, importedCables, canvasConfig.width, canvasConfig.height, networks, trays]);



  const handleExport = async () => {
    // Función para convertir URL de imagen a base64 usando canvas
    async function getBase64Image(imgUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // evita problemas CORS si la imagen es externa
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        };
        img.onerror = (e) => {
          console.error('Error loading image for export:', e);
          reject(new Error('No se pudo cargar la imagen para exportar'));
        };
        img.src = imgUrl;
      });
    }
  
    // Función para convertir un File a base64 usando FileReader
    async function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Error leyendo archivo'));
        reader.readAsDataURL(file);
      });
    }
  
    try {
      let backgroundImageBase64 = null;
  
      if (canvasConfig.backgroundImage) {
        // Si es un string (ya sea url o base64)
        if (typeof canvasConfig.backgroundImage === 'string') {
          if (canvasConfig.backgroundImage.startsWith('data:image')) {
            backgroundImageBase64 = canvasConfig.backgroundImage;
          } else {
            backgroundImageBase64 = await getBase64Image(canvasConfig.backgroundImage);
          }
        } else if (typeof canvasConfig.backgroundImage === 'object') {
          // Asumimos que es el objeto con .file y .url del modal
          if (canvasConfig.backgroundImage.file) {
            backgroundImageBase64 = await fileToBase64(canvasConfig.backgroundImage.file);
          } else if (canvasConfig.backgroundImage.url) {
            backgroundImageBase64 = await getBase64Image(canvasConfig.backgroundImage.url);
          }
        }
      }
  
      // Construimos el objeto exportado
      const exportData = {
        walls,
        trays,
        perforations,
        machines,
        availableMachines,
        cables: importedCables.length > 0 ? importedCables : cables,
        networks,
        canvasConfig: {
          width: canvasConfig.width,
          height: canvasConfig.height,
          gridResolution: canvasConfig.gridResolution,
          backgroundImage: backgroundImageBase64
        },
        hananGrid,
        steinerPoints
      };
  
      // Convertir a JSON string con formato
      const jsonStr = JSON.stringify(exportData, null, 2);
  
      // Descargar archivo JSON
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'layout-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
  
      console.log('Exportación completada');
    } catch (error) {
      console.error('Error en exportación:', error);
    }
  };
  
  
  

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        console.log("📥 Import data received:", importedData);

        // ✅ 1. Cargar datos en el estado del frontend
        if (importedData.walls && Array.isArray(importedData.walls)) {
          setWalls(importedData.walls);
        }
        if (importedData.trays && Array.isArray(importedData.trays)) {
          setTray(importedData.trays);
        }
        if (importedData.perforations && Array.isArray(importedData.perforations)) {
          setPerforations(importedData.perforations);
        }
        if (importedData.machines && typeof importedData.machines === 'object') {
          setMachines(importedData.machines);
        }
        if (importedData.cables && Array.isArray(importedData.cables)) {
          setImportedCables(importedData.cables);
        }
        if (importedData.networks && Array.isArray(importedData.networks)) {
          setNetworks(importedData.networks);
          const newVisibility = {};
          importedData.networks.forEach(network => {
            newVisibility[network.name] = true;
          });
          setNetworkVisibility(newVisibility);
        }
        if (importedData.backgroundImage) {
          setCanvasConfig(prev => ({
            ...prev,
            backgroundImage: importedData.backgroundImage
          }));
        }
        if (importedData.width && importedData.height) {
          const currentResolution = getCurrentResolution();
          setCanvasConfig(prev => ({
            ...prev,
            width: gridUnitsToMeters(importedData.width, 0.1) / currentResolution, // Convert from old 0.1m system
            height: gridUnitsToMeters(importedData.height, 0.1) / currentResolution
          }));
        }

        // Use dynamic grid conversion for backend data
        const currentResolution = getCurrentResolution();
        const gridWidth = canvasConfig?.width ? metersToGridUnits(canvasConfig.width, currentResolution) : 
                         (importedData.width || metersToGridUnits(100, currentResolution));
        const gridHeight = canvasConfig?.height ? metersToGridUnits(canvasConfig.height, currentResolution) : 
                          (importedData.height || metersToGridUnits(100, currentResolution));

        // ... rest of import handling with proper coordinate conversion ...

      } catch (err) {
        console.error("Import error:", err);
        setError(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };


  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const text = await file.text();
      const cables = text.split('\n').map(line => {
        const [
          id, cableLabel, , , , source, , , sourceDevice, , ,
          sourceLocation, target, , , targetDevice, , ,
          targetLocation, length, prefabricated, diameter, cableType,
          orderNumber, manufacturer, erpNumber, internalExternal,
          suppliedBy, cableFunction, , , remarks
        ] = line.split(';').map(field => field.replace(/"/g, '').trim());

        // Normalize machine names by removing '+' prefix
        const normalizeDeviceName = (name) => {
          if (!name) return '';
          return name.replace(/^\+/, '');
        };
        const normalizedSourceDevice = normalizeDeviceName(sourceDevice);
        const normalizedTargetDevice = normalizeDeviceName(targetDevice);

        // Parse diameter: convert from "X,Ymm" format to number
        let parsedDiameter = null;
        if (diameter) {
          // Remove 'mm' and replace comma with dot
          const cleanDiameter = diameter.replace('mm', '').replace(',', '.');
          parsedDiameter = parseFloat(cleanDiameter);
        }

        return {
          id,
          cableLabel,
          source: normalizedSourceDevice,
          sourceLocation,
          target: normalizedTargetDevice,
          targetLocation,
          length,
          diameter: parsedDiameter,
          cableType,
          cableFunction,
          internalExternal
        };
      }).filter(cable => cable.id !== 'ID' && cable.internalExternal !== 'INTERNAL');

      setImportedCables(cables);

      // Extract unique machines with normalized names
      const uniqueMachines = new Set();
      cables.forEach(cable => {
        if (cable.source) uniqueMachines.add(cable.source);
        if (cable.target) uniqueMachines.add(cable.target);
      });

      setAvailableMachines(Array.from(uniqueMachines).map(name => ({
        name,
        description: cables.find(c => c.source === name)?.sourceLocation ||
          cables.find(c => c.target === name)?.targetLocation
      })));

      // Reset existing machines and cables
      setMachines({});
      setCables([]);
    }
  };

  const handleMachineSelect = (machine) => {
    setSelectedMachine(machine);
    setEditorMode(EditorModes.MACHINE);
  };
  const handleTrayAdd = useCallback((startX, startY, endX, endY, isDragging = false) => {
    if (endX === undefined || endY === undefined) {
      setTray(prevTray => {
        const exists = prevTray.some(p => p.x === startX && p.y === startY);
        if (exists) {
          return prevTray.filter(p => !(p.x === startX && p.y === startY));
        }
        return [...prevTray, { x: startX, y: startY }];
      });
      markForOptimization();
      return;
    }

    const points = [];
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    let err = dx - dy;

    let x = startX;
    let y = startY;

    while (true) {
      points.push({ x, y });
      if (x === endX && y === endY) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    if (!isDragging) {
      setTray(prevTray => {
        const newTray = [...prevTray];
        points.forEach(point => {
          const idx = newTray.findIndex(p => p.x === point.x && p.y === point.y);
          if (idx === -1) {
            newTray.push({ x: point.x, y: point.y });
          } else {
            newTray.splice(idx, 1);
          }
        });
        return newTray;
      });
      markForOptimization();
    }

    return points;
  }, [markForOptimization]);


  const handleRemoveWallsAndTrays = useCallback((startX, startY, endX, endY) => {
    if (endX === undefined || endY === undefined) {
      setWalls(prevWalls => prevWalls.filter(w => !(w.x === startX && w.y === startY)));
      setTray(prevTrays => prevTrays.filter(t => !(t.x === startX && t.y === startY)));
      markForOptimization();
      return;
    }

    const points = [];
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    let err = dx - dy;

    let x = startX;
    let y = startY;

    while (true) {
      points.push({ x, y });
      if (x === endX && y === endY) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    setWalls(prevWalls => prevWalls.filter(w => !points.some(p => p.x === w.x && p.y === w.y)));
    setTray(prevTrays => prevTrays.filter(t => !points.some(p => p.x === t.x && p.y === t.y)));

    markForOptimization();

    return points;
  }, [markForOptimization]);


  const handleWallAdd = useCallback((startX, startY, endX, endY, isDragging = false) => {
    if (endX === undefined || endY === undefined) {
      setWalls(prevWalls => {
        const wallExists = prevWalls.some(wall => wall.x === startX && wall.y === startY);
        if (wallExists) {
          return prevWalls.filter(wall => !(wall.x === startX && wall.y === startY));
        }
        return [...prevWalls, { x: startX, y: startY }];
      });

      if (!isDragging) markForOptimization();
      return;
    }
    // Calculate all points along the line using Bresenham's line algorithm

    const points = [];
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    let err = dx - dy;

    let x = startX;
    let y = startY;

    while (true) {
      points.push({ x, y });
      if (x === endX && y === endY) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    if (!isDragging) {
      setWalls(prevWalls => {
        const newWalls = [...prevWalls];
        points.forEach(point => {
          const index = newWalls.findIndex(w => w.x === point.x && w.y === point.y);
          if (index === -1) {
            newWalls.push({ x: point.x, y: point.y });
          } else {
            newWalls.splice(index, 1);
          }
        });
        return newWalls;
      });
      markForOptimization();
    }

    return points;
  }, [markForOptimization]);


  const handlePerforationAdd = useCallback((x, y) => {
    const hasWall = walls.some(wall => wall.x === x && wall.y === y);

    if (hasWall) {
      setPerforations(prevPerforations => {
        const hasPerforation = prevPerforations.some(perf => perf.x === x && perf.y === y);
        if (hasPerforation) {
          return prevPerforations.filter(perf => !(perf.x === x && perf.y === y));
        }
        return [...prevPerforations, { x, y }];
      });
      markForOptimization();
    }
  }, [walls, markForOptimization]);


  const handleMachinePlace = useCallback((x, y) => {
    if (!selectedMachine) return;

    const hasWall = walls.some(wall => wall.x === x && wall.y === y);

    // Check if there's already a machine at this position
    const existingMachine = Object.entries(machines).find(([_, pos]) => pos.x === x && pos.y === y);

    if (!hasWall && !existingMachine) {
      // Place the machine normally with initial structure
      setMachines(prevMachines => ({
        ...prevMachines,
        [selectedMachine.name]: {
          x,
          y,
          description: selectedMachine.description || '',
          mergedHistory: { [selectedMachine.name]: true }
        }
      }));

      setAvailableMachines(prev => prev.filter(m => m.name !== selectedMachine.name));
      setSelectedMachine(null);
      setMachineUpdateCounter(c => c + 1); // Increment counter to trigger optimization
    }
  }, [walls, machines, selectedMachine]);

  const handleMachineMove = useCallback((machineName, x, y) => {
    const hasWall = walls.some(wall => wall.x === x && wall.y === y);

    // Check if there's already a machine at this position
    const existingMachine = Object.entries(machines).find(([name, pos]) =>
      name !== machineName && pos.x === x && pos.y === y
    );

    if (!hasWall && !existingMachine) {
      // Move the machine normally while preserving its structure
      setMachines(prevMachines => {
        const currentMachine = prevMachines[machineName] || { mergedHistory: { [machineName]: true } };
        return {
          ...prevMachines,
          [machineName]: {
            ...currentMachine,
            x,
            y
          }
        };
      });
      setMachineUpdateCounter(c => c + 1); // Increment counter to trigger optimization
    }
  }, [walls, machines]);

  const handleMachineRemove = useCallback((machineName) => {
    // Add the machine back to available machines
    const machineToAdd = {
      name: machineName,
      description: machines[machineName]?.description
    };
    setAvailableMachines(prev => [...prev, machineToAdd]);

    // Remove the machine from placed machines
    setMachines(prev => {
      const newMachines = { ...prev };
      delete newMachines[machineName];
      return newMachines;
    });
    setMachineUpdateCounter(c => c + 1); // Increment counter to trigger optimization
  }, [machines]);

  const handleAddNetwork = () => {
    if (networks.length >= MAX_NETWORKS) return;

    const newNetwork = {
      id: Date.now().toString(),
      name: `Network ${networks.length + 1}`,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      isDefault: false,
      visible: true,
      functions: []
    };

    handleNetworksChange([...networks, newNetwork]);
  };

  const handleRemoveNetwork = (networkId) => {
    const network = networks.find(n => n.id === networkId);
    if (network?.isDefault) return; // Prevent removing default networks

    handleNetworksChange(networks.filter(n => n.id !== networkId));
  };

  const handleNetworkVisibilityChange = (networkId, checked) => {
    setNetworks(prev => prev.map(network =>
      network.id === networkId
        ? { ...network, visible: checked }
        : network
    ));
    // Update networkVisibility state as well
    const network = networks.find(n => n.id === networkId);
    if (network) {
      setNetworkVisibility(prev => ({
        ...prev,
        [network.name]: checked
      }));
    }
  };
  //revisar
  const handleNetworksChange = (updatedNetworks) => {
    setNetworks(updatedNetworks);

    const machineCount = Object.keys(machines).length;
    const cablesToRoute = (importedCables.length > 0 ? importedCables : cables)
      .filter(cable => machines[cable.source] && machines[cable.target]);

    if (machineCount >= 2 && cablesToRoute.length > 0 && !isLoading) {
      fetchOptimalPaths();
    }
  };

  const handleFunctionDrop = (networkId, functionName) => {
    setNetworks(prev => prev.map(network => ({
      ...network,
      functions: network.id === networkId
        ? [...new Set([...network.functions, functionName])]
        : network.functions.filter(f => f !== functionName)
    })));
  };
  useEffect(() => {
    const machineCount = Object.keys(machines).length;
    const cablesToRoute = (importedCables.length > 0 ? importedCables : cables)
      .filter(cable => machines[cable.source] && machines[cable.target]);

    if (machineCount >= 2 && cablesToRoute.length > 0 && !isLoading) {
      fetchOptimalPaths();
    }
  }, [networks]); // 🔁 cuando cambien las redes

  // Get unique networks and their info
  const networkInfo = useMemo(() => {
    // Create a map of network types to their cable counts
    const networkCableCounts = new Map();

    cables.forEach(cable => {
      const network = networks.find(n => n.functions.includes(cable.cableFunction));
      if (network) {
        const count = networkCableCounts.get(network.name) || 0;
        networkCableCounts.set(network.name, count + 1);
      }
    });

    return networks.map(network => ({
      type: network.name,
      color: network.color,
      cables: new Set(Array(networkCableCounts.get(network.name) || 0).fill(null)),
      visible: networkVisibility[network.name] !== false
    }));
  }, [networks, cables, networkVisibility]);

  const handleMachineInherit = useCallback((targetMachineName, sourceMachineName) => {
    // Get the target machine from placed machines
    const targetMachine = machines[targetMachineName];
    if (!targetMachine) return;

    // Get the source machine either from placed machines or available machines
    const sourceMachine = machines[sourceMachineName] ||
      availableMachines.find(m => m.name === sourceMachineName);

    if (!sourceMachine) return;

    // Create merged history combining both machines
    const mergedHistory = {
      ...(targetMachine.mergedHistory || { [targetMachineName]: true }),
      ...(sourceMachine.mergedHistory || { [sourceMachineName]: true })
    };

    // Update the target machine with merged data
    const updatedMachines = {
      ...machines,
      [targetMachineName]: {
        ...targetMachine,
        mergedHistory,
        description: [
          targetMachine.description,
          sourceMachine.description
        ].filter(Boolean).join(' + ')
      }
    };

    // If source machine was placed, remove it from machines
    if (machines[sourceMachineName]) {
      delete updatedMachines[sourceMachineName];
    }

    // Update cables
    const updatedCables = (importedCables.length > 0 ? importedCables : cables).map(cable => {
      const newCable = { ...cable };

      // Update source if it matches the source machine
      if (cable.source === sourceMachineName) {
        newCable.source = targetMachineName;
        newCable.originalSource = sourceMachineName;
      }

      // Update target if it matches the source machine
      if (cable.target === sourceMachineName) {
        newCable.target = targetMachineName;
        newCable.originalTarget = sourceMachineName;
      }

      return newCable;
    });

    // Update state
    setMachines(updatedMachines);
    if (importedCables.length > 0) {
      setImportedCables(updatedCables);
    } else {
      setCables(updatedCables);
    }

    // Remove the source machine from available machines if it was there
    setAvailableMachines(prev => prev.filter(m => m.name !== sourceMachineName));
    setMachineUpdateCounter(c => c + 1); // Increment counter to trigger optimization
  }, [machines, cables, importedCables, availableMachines]);

  const handleCanvasSetup = (config) => {
    setCanvasConfig({
      width: config.width,
      height: config.height,
      gridResolution: config.gridResolution,
      backgroundImage: config.image
    });
    setShowInitialSetup(false);
  };

  // Add effect to handle path optimization after machine updates
  useEffect(() => {
    // Only calculate paths when we have at least 2 machines and some cables to route
    const machineCount = Object.keys(machines).length;
    const cablesToRoute = (importedCables.length > 0 ? importedCables : cables)
      .filter(cable => machines[cable.source] && machines[cable.target]);

    if (machineCount >= 2 && cablesToRoute.length > 0 && !isLoading) {
      fetchOptimalPaths();
    }
  }, [machineUpdateCounter]); // Only depend on the update counter

  useEffect(() => {
    if (!needsOptimization) return;
    fetchOptimalPaths();
    setNeedsOptimization(false);
  }, [needsOptimization, fetchOptimalPaths]);

  // Cleanup effect to cancel ongoing requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Helper function to get current grid resolution
  const getCurrentResolution = useCallback(() => {
    return canvasConfig.gridResolution || 0.1;
  }, [canvasConfig.gridResolution]);

  const optimizeCablePaths = useCallback(async () => {
    if (!networks.length || !cables.length) return;

    setIsLoading(true);
    setError('');

    try {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      console.group('🎯 Optimization Request');
      
      const availableCables = importedCables.length > 0 ? importedCables : cables;
      console.log('📊 Cable data:', availableCables);
      
      networks.forEach(network => {
        const networkCables = availableCables.filter(c => c.network === network.name);
        console.log(`🌐 ${network.name}:`, {
          cables: networkCables.length,
          functions: network.functions,
          color: network.color,
          visible: networkVisibility[network.name] !== false
        });
      });
      console.groupEnd();

      // Validate and clean machine data before sending to backend
      const cleanedMachines = {};
      Object.entries(machines).forEach(([key, machine]) => {
        cleanedMachines[key] = {
          ...machine,
          x: isNaN(machine.x) ? 0 : Number(machine.x),
          y: isNaN(machine.y) ? 0 : Number(machine.y),
          width: machine.width !== undefined ? (isNaN(machine.width) ? 1 : Number(machine.width)) : undefined,
          height: machine.height !== undefined ? (isNaN(machine.height) ? 1 : Number(machine.height)) : undefined
        };
      });

      // Validate and clean walls, trays, and perforations
      const cleanedWalls = walls.filter(w => !isNaN(w.x) && !isNaN(w.y)).map(w => ({
        x: Number(w.x),
        y: Number(w.y)
      }));
      
      const cleanedTrays = trays.filter(t => !isNaN(t.x) && !isNaN(t.y)).map(t => ({
        x: Number(t.x),
        y: Number(t.y)
      }));
      
      const cleanedPerforations = perforations.filter(p => !isNaN(p.x) && !isNaN(p.y)).map(p => ({
        x: Number(p.x),
        y: Number(p.y)
      }));

      console.log('✅ Data cleaned and validated');

      const currentResolution = getCurrentResolution();
      
      // Convert real-world canvas dimensions to grid units based on current resolution
      const gridWidth = metersToGridUnits(canvasConfig.width, currentResolution);
      const gridHeight = metersToGridUnits(canvasConfig.height, currentResolution);

      // Convert all coordinates to the current resolution's grid units
      const convertedMachines = {};
      Object.entries(cleanedMachines).forEach(([key, machine]) => {
        convertedMachines[key] = {
          ...machine,
          x: metersToGridUnits(machine.x * 0.1, currentResolution), // machine coords are in 0.1m units
          y: metersToGridUnits(machine.y * 0.1, currentResolution)
        };
      });

      const convertedWalls = cleanedWalls.map(w => ({
        x: metersToGridUnits(w.x * 0.1, currentResolution),
        y: metersToGridUnits(w.y * 0.1, currentResolution)
      }));

      const convertedTrays = cleanedTrays.map(t => ({
        x: metersToGridUnits(t.x * 0.1, currentResolution),
        y: metersToGridUnits(t.y * 0.1, currentResolution)
      }));

      const convertedPerforations = cleanedPerforations.map(p => ({
        x: metersToGridUnits(p.x * 0.1, currentResolution),
        y: metersToGridUnits(p.y * 0.1, currentResolution)
      }));

      const backendData = {
        width: gridWidth,
        height: gridHeight,
        walls: convertedWalls,
        trays: convertedTrays,
        perforations: convertedPerforations,
        machines: convertedMachines,
        cables: availableCables,
        networks: networks,
        gridResolution: currentResolution
      };

      console.log("Sending to backend:", backendData);

      const response = await fetch('/api/optimize-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendData),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("Backend response:", result);

      // Convert the backend results back to the current frontend coordinate system
      const convertBackendCoords = (coords) => {
        return {
          x: gridUnitsToMeters(coords.x, currentResolution) / 0.1, // Convert back to 0.1m units for frontend
          y: gridUnitsToMeters(coords.y, currentResolution) / 0.1
        };
      };

      // Convert sections back to frontend coordinates
      const convertedSections = result.sections?.map(section => ({
        ...section,
        points: section.points?.map(convertBackendCoords) || []
      })) || [];

      // Convert cable routes back to frontend coordinates
      const convertedCableRoutes = {};
      Object.entries(result.cableRoutes || {}).forEach(([cableId, route]) => {
        convertedCableRoutes[cableId] = route.map(convertBackendCoords);
      });

      // Convert Steiner points back to frontend coordinates
      const convertedSteinerPoints = result.steinerPoints?.map(convertBackendCoords) || [];

      setBackendSections(convertedSections);
      setCableRoutes(convertedCableRoutes);
      setHananGrid(result.hananGrid || { xCoords: [], yCoords: [] });
      setSteinerPoints(convertedSteinerPoints);

      console.log('✅ Cable path optimization completed');
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('⏹️ Optimization request cancelled');
        return;
      }
      console.error('❌ Optimization error:', error);
      setError(`Optimization failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    networks, cables, importedCables, machines, walls, trays, perforations, 
    canvasConfig, networkVisibility, getCurrentResolution
  ]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <InitialSetupModal
        isOpen={showInitialSetup}
        onClose={() => setShowInitialSetup(false)}
        onSubmit={handleCanvasSetup}
      />

      {/* Top toolbar */}
      <div className="flex justify-between items-center p-3 bg-white border-b border-gray-200 flex-shrink-0">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
          id="cable-import"
        />
        <div className="flex gap-2">
          <Button onClick={() => document.getElementById('cable-import').click()}>
            Import Cable List
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCableList(!showCableList)}
          >
            {showCableList ? 'Hide' : 'Show'} Cable List
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchOptimalPaths}
            disabled={isLoading || Object.keys(machines).length < 2}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"/>
                <path d="M3 12c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3"/>
                <path d="M10.5 9.5 8 12l2.5 2.5"/>
                <path d="m13.5 14.5 2.5-2.5-2.5-2.5"/>
              </svg>
            )}
            Recalculate Paths
          </Button>
        </div>
      </div>

      {/* Loading indicator with cancel option */}
      {isLoading && (
        <div className="p-2 bg-blue-50 border-b border-blue-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-sm text-blue-700 font-medium">
                Calculating optimal cable paths...
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (abortControllerRef.current) {
                  console.log(`🛑 [${new Date().toLocaleTimeString()}] USER CANCELLATION: Backend calculation manually cancelled by user`);
                  abortControllerRef.current.abort();
                  abortControllerRef.current = null;
                } else {
                  console.log(`⚠️ [${new Date().toLocaleTimeString()}] CANCEL ATTEMPT: No active request to cancel`);
                }
              }}
              className="text-blue-600 border-blue-300 hover:bg-blue-100"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Error indicator */}
      {error && (
        <div className="p-2 bg-red-50 border-b border-red-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-red-700">{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setError('')}
              className="text-red-600 border-red-300 hover:bg-red-100"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Main content area with flex-grow to use available space */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        
        {/* Cable list table - fixed at top of main content */}
        {showCableList && (importedCables.length > 0 || cables.length > 0) && (
          <Card className="mx-4 mt-2 mb-2 p-3 flex flex-col flex-shrink-0" style={{ maxHeight: '300px' }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold">
                Cable List ({filteredCables.length} / {(importedCables.length > 0 ? importedCables : cables).length} cables)
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCableList(false);
                  setCableSearchTerm('');
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
            
            {/* Cable search input */}
            <div className="mb-3">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search cables by label, source, target, or function..."
                  value={cableSearchTerm}
                  onChange={(e) => setCableSearchTerm(e.target.value)}
                  className="text-sm pl-8 pr-8"
                />
                <svg
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {cableSearchTerm && (
                  <button
                    onClick={() => setCableSearchTerm('')}
                    className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cable Label
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Function
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Length
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCables.length > 0 ? (
                    filteredCables.map((cable, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {cable.cableLabel}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {cable.source}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {cable.target}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {cable.cableFunction}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {cable.length}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                        {cableSearchTerm.trim() 
                          ? `No cables found matching "${cableSearchTerm}"`
                          : "No cables available"
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Main horizontal layout - takes remaining space */}
        <div className="flex flex-1 min-h-0 gap-4 items-start" style={{ padding: "8px 16px" }}>
          {/* Left sidebar - Machine list and tools */}
          <Card className={`${sidebarCollapsed ? 'w-16' : 'w-80'} p-4 flex flex-col transition-all duration-300 relative flex-shrink-0 min-w-16 h-full`}>
            {/* Collapse/Expand Button */}
            <Button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 z-10"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>

            {!sidebarCollapsed && (
              <>
                <div className="flex gap-2 mb-4 pb-4 border-b justify-center">
                  <Button
                    onClick={handleExport}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    title="Export layout to JSON"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>

                  <Button
                    onClick={() => fileInputRef.current.click()}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    title="Import layout from JSON"
                  >
                    <Upload className="h-4 w-4" />
                    Import
                  </Button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={handleImport}
                  />
                </div>

                <div className="flex gap-2 mb-4 pb-4 border-b justify-center">
                  <Button
                    variant={editorMode === EditorModes.PAN ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => {
                      setEditorMode(EditorModes.PAN);
                      setSelectedMachine(null);
                    }}
                    title="Pan Canvas"
                    className="w-10 h-10"
                  >
                    <Squirrel className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.WALL ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => {
                      setEditorMode(EditorModes.WALL);
                      setSelectedMachine(null);
                    }}
                    title="Draw Walls"
                    className="w-10 h-10"
                  >
                    <Blocks className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.TRAY ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => {
                      setEditorMode(EditorModes.TRAY);
                      setSelectedMachine(null);
                    }}
                    title="Draw Tray"
                    className="w-10 h-10"
                  >
                    <Wrench className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.PERFORATION ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => {
                      setEditorMode(EditorModes.PERFORATION);
                      setSelectedMachine(null);
                    }}
                    title="Add Perforations"
                    className="w-10 h-10"
                  >
                    <CircleDot className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.DELETE ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => {
                      setEditorMode(EditorModes.DELETE);
                      setSelectedMachine(null);
                    }}
                    title="Delete Walls and Trays"
                    className="w-10 h-10"
                  >
                    <Tractor className="h-5 w-5" />
                  </Button>
                </div>

                <div className="text-sm font-medium mb-2">Available Machines</div>
                
                {/* Machine search input */}
                <div className="mb-3">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Search machines by name or description..."
                      value={machineSearchTerm}
                      onChange={(e) => setMachineSearchTerm(e.target.value)}
                      className="text-sm pl-8 pr-8"
                    />
                    <svg
                      className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    {machineSearchTerm && (
                      <button
                        onClick={() => setMachineSearchTerm('')}
                        className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 min-h-0 border rounded-md p-2 overflow-y-auto">
                  <div className="grid gap-2">
                    {filteredAvailableMachines.map((machine) => (
                      <div
                        key={machine.name}
                        onClick={() => {
                          if (inheritMode.active) {
                            handleMachineInherit(inheritMode.targetMachine, machine.name);
                            setInheritMode({ active: false, targetMachine: null });
                            // Remove the machine from available machines since it's now merged
                            setAvailableMachines(prev => prev.filter(m => m.name !== machine.name));
                          } else {
                            handleMachineSelect(machine);
                          }
                        }}
                        className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${selectedMachine?.name === machine.name
                          ? 'bg-accent text-accent-foreground border-accent'
                          : inheritMode.active
                            ? 'bg-background hover:bg-blue-50 cursor-copy'
                            : 'bg-background hover:bg-accent/50 cursor-pointer'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${inheritMode.active ? 'bg-blue-500' : 'bg-green-500'
                          }`}>
                          {machine.name}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{machine.name}</span>
                          {machine.description && (
                            <span className="text-xs text-gray-500">{machine.description}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredAvailableMachines.length === 0 && (
                      <div className="text-sm text-gray-500 p-2 text-center">
                        {machineSearchTerm.trim() 
                          ? `No machines found matching "${machineSearchTerm}"`
                          : "All machines have been placed"
                        }
                      </div>
                    )}
                  </div>
                </div>

                {/* Add an indicator when in inherit mode */}
                {inheritMode.active && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-sm text-blue-700">Select a machine to inherit from</span>
                      </div>
                      <button
                        onClick={() => setInheritMode({ active: false, targetMachine: null })}
                        className="text-blue-500 hover:text-blue-700 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {Object.keys(machines).length >= 2 && (
                  <div className="mt-4 p-3 border rounded-md bg-gray-50">
                    <div className="text-sm font-medium mb-2">Cable Stats</div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Cables:</span>
                        <span className="font-medium bg-gray-100 px-2 py-0.5 rounded">
                          {cables.length}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Collapsed sidebar view */}
            {sidebarCollapsed && (
              <div className="flex flex-col gap-2 mt-8 items-center">
                <Button
                  onClick={handleExport}
                  variant="ghost"
                  size="sm"
                  className="w-10 h-10 p-0"
                  title="Export layout"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => fileInputRef.current.click()}
                  variant="ghost"
                  size="sm"
                  className="w-10 h-10 p-0"
                  title="Import layout"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                
                {/* All editing tools */}
                <div className="border-t pt-2 mt-2 flex flex-col gap-1">
                  <Button
                    variant={editorMode === EditorModes.PAN ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setEditorMode(EditorModes.PAN);
                      setSelectedMachine(null);
                    }}
                    title="Pan Canvas"
                    className="w-10 h-10 p-0"
                  >
                    <Squirrel className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.WALL ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setEditorMode(EditorModes.WALL);
                      setSelectedMachine(null);
                    }}
                    title="Draw Walls"
                    className="w-10 h-10 p-0"
                  >
                    <Blocks className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.TRAY ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setEditorMode(EditorModes.TRAY);
                      setSelectedMachine(null);
                    }}
                    title="Draw Tray"
                    className="w-10 h-10 p-0"
                  >
                    <Wrench className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.PERFORATION ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setEditorMode(EditorModes.PERFORATION);
                      setSelectedMachine(null);
                    }}
                    title="Add Perforations"
                    className="w-10 h-10 p-0"
                  >
                    <CircleDot className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={editorMode === EditorModes.DELETE ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setEditorMode(EditorModes.DELETE);
                      setSelectedMachine(null);
                    }}
                    title="Delete Walls and Trays"
                    className="w-10 h-10 p-0"
                  >
                    <Tractor className="h-4 w-4" />
                  </Button>
                </div>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={handleImport}
                />
              </div>
            )}
          </Card>

          {/* Network Panel */}
          <NetworkPanel
            className="flex-shrink min-w-48 max-w-md h-full"
            networks={networks}
            networkVisibility={networkVisibility}
            onNetworkVisibilityChange={setNetworkVisibility}
            hoveredNetwork={hoveredNetwork}
            onNetworkHover={setHoveredNetwork}
            backendSections={backendSections}
            onNetworksChange={handleNetworksChange}
            onAddNetwork={handleAddNetwork}
            onRemoveNetwork={handleRemoveNetwork}
            onFunctionDrop={handleFunctionDrop}
            importedCables={importedCables}
            maxNetworks={MAX_NETWORKS}
          />

          {/* Main Canvas Area */}
          <div 
            className="flex-grow flex-shrink-0 flex items-start justify-center h-full"
            style={{ 
              width: `${canvasContainerSize.width}px`,
              maxWidth: `${canvasContainerSize.width}px`
            }}
          >
            <div 
              className="bg-white rounded-lg shadow-sm border overflow-hidden"
              style={{ 
                width: `${canvasContainerSize.width}px`,
                height: `${canvasContainerSize.height}px`
              }}
            >
              <LayoutGrid
                gridSize={{
                  width: metersToGridUnits(canvasConfig.width, getCurrentResolution()),
                  height: metersToGridUnits(canvasConfig.height, getCurrentResolution())
                }}
                cellSize={10}
                gridResolution={getCurrentResolution()}
                walls={walls}
                perforations={perforations}
                machines={machines}
                cables={importedCables.length > 0 ? importedCables : cables}
                networks={networks}
                networkVisibility={networkVisibility}
                activeMode={editorMode}
                selectedMachine={selectedMachine}
                onWallAdd={handleWallAdd}
                onTrayAdd={handleTrayAdd}
                onDelete={handleRemoveWallsAndTrays}
                trays={trays}
                onPerforationAdd={handlePerforationAdd}
                onMachinePlace={handleMachinePlace}
                onMachineMove={handleMachineMove}
                onMachineRemove={handleMachineRemove}
                onNetworkVisibilityChange={setNetworkVisibility}
                backgroundImage={canvasConfig.backgroundImage}
                onMachineInherit={handleMachineInherit}
                backendSections={backendSections}
                cableRoutes={cableRoutes}
                hananGrid={hananGrid}
                hoveredCable={hoveredCable}
                onCableHover={setHoveredCable}
                hoveredNetwork={hoveredNetwork}
                onNetworkHover={setHoveredNetwork}
                steinerPoints={steinerPoints}
                selectedElement={selectedElement}
                hoveredElement={hoveredElement}
                onElementSelect={setSelectedElement}
              />
            </div>
          </div>

          {/* Right Info Sidebar */}
          <div className="flex flex-col min-w-48 max-w-96 h-full">
            <InfoSidebar
            selectedElement={selectedElement}
            hoveredElement={hoveredElement}
            onClose={() => setSelectedElement(null)}
            onCableHover={setHoveredCable}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayoutEditor;