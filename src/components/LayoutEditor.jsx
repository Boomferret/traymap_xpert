"use client";

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { EditorModes } from '@/constants/editorModes';
import { LayoutGrid } from './LayoutGrid';
import { Square as Wall, CircleDot, Plus, X, GripVertical } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InitialSetupModal } from './InitialSetupModal';

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

// Initial machine list
const initialMachines = Array.from({ length: 10 }, (_, i) => ({
  name: `M${i + 1}`
}));

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
      gridResolution: 0.1
    });
    const [editorMode, setEditorMode] = useState(EditorModes.WALL);
    const [walls, setWalls] = useState([]);
    const [perforations, setPerforations] = useState([]);
    const [machines, setMachines] = useState({});
    const [availableMachines, setAvailableMachines] = useState(initialMachines);
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
  
    useEffect(() => {
      const machineCount = Object.keys(machines).length;
      if (machineCount >= 2) {
        if (importedCables.length > 0) {
          // Group cables by their function
          const visibleNetworks = networks.filter(n => n.visible);
          const visibleFunctions = visibleNetworks.flatMap(n => n.functions);
          
          // Get all valid machine names including merged ones
          const validMachineNames = new Set();
          const mergedMachineMap = new Map(); // Map original names to current names
          
          Object.entries(machines).forEach(([name, machine]) => {
            if (machine.mergedHistory) {
              Object.keys(machine.mergedHistory).forEach(originalName => {
                validMachineNames.add(originalName);
                mergedMachineMap.set(originalName, name);
              });
            } else {
              validMachineNames.add(name);
              mergedMachineMap.set(name, name);
            }
          });
          
          const relevantCables = importedCables.filter(cable => {
            // Check if either the original or current source/target is a valid machine
            const sourceValid = validMachineNames.has(cable.source) || validMachineNames.has(cable.originalSource);
            const targetValid = validMachineNames.has(cable.target) || validMachineNames.has(cable.originalTarget);
            return sourceValid && targetValid && visibleFunctions.includes(cable.cableFunction);
          }).map(cable => {
            // Find the network this cable belongs to
            const network = networks.find(n => n.functions.includes(cable.cableFunction));
            
            // Update source and target to current machine names while preserving originals
            const newCable = {
              ...cable,
              type: network?.name || 'unknown',
              color: network?.color || '#999999',
              diameter: cable.diameter
            };

            // If source is merged, update it
            if (validMachineNames.has(cable.source)) {
              const currentMachine = mergedMachineMap.get(cable.source);
              if (currentMachine !== cable.source) {
                newCable.originalSource = cable.source;
                newCable.source = currentMachine;
              }
            }

            // If target is merged, update it
            if (validMachineNames.has(cable.target)) {
              const currentMachine = mergedMachineMap.get(cable.target);
              if (currentMachine !== cable.target) {
                newCable.originalTarget = cable.target;
                newCable.target = currentMachine;
              }
            }

            return newCable;
          });

          setCables(relevantCables);
        } else {
          const newCables = generateRandomCables(machines);
          setCables(newCables);
        }
      }
    }, [machines, importedCables, networks]);

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
    
            return {
              id,
              cableLabel,
              source: sourceDevice,
              sourceLocation,
              target: targetDevice,
              targetLocation,
              length,
              diameter,
              cableType,
              cableFunction,
              internalExternal
            };
          }).filter(cable => cable.id !== 'ID' && cable.internalExternal !== 'INTERNAL');
    
          setImportedCables(cables);
    
          // Extract unique machines
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
    
      const handleWallAdd = useCallback((x, y) => {
        setWalls(prevWalls => {
          const wallExists = prevWalls.some(wall => wall.x === x && wall.y === y);
          if (wallExists) {
            return prevWalls.filter(wall => !(wall.x === x && wall.y === y));
          }
          return [...prevWalls, { x, y }];
        });
      }, []);
    
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
        }
      }, [walls]);
    
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
      }, [machines]);
    
      const handleAddNetwork = () => {
        if (networks.length >= MAX_NETWORKS) return;
    
        const newNetwork = {
          id: Date.now().toString(),
          name: `Network ${networks.length + 1}`,
          color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          isDefault: false,
          visible: true,
          functions: []
        };
    
        setNetworks(prev => [...prev, newNetwork]);
      };
    
      const handleRemoveNetwork = (networkId) => {
        const network = networks.find(n => n.id === networkId);
        if (network?.isDefault) return; // Prevent removing default networks
    
        setNetworks(prev => prev.filter(n => n.id !== networkId));
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
    
      const handleFunctionDrop = (networkId, functionName) => {
        setNetworks(prev => prev.map(network => ({
          ...network,
          functions: network.id === networkId
            ? [...new Set([...network.functions, functionName])]
            : network.functions.filter(f => f !== functionName)
        })));
      };

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

      return (
        <div className="flex flex-col h-full gap-4">
          <InitialSetupModal
            isOpen={showInitialSetup}
            onClose={() => setShowInitialSetup(false)}
            onSubmit={handleCanvasSetup}
          />

          <div className="flex justify-between items-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="cable-import"
            />
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
    
          {showCableList && importedCables.length > 0 && (
            <Card className="p-4">
              <div className="overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
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
                    {importedCables.map((cable, idx) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

<div className="flex gap-4">
        <Card className="w-64 p-4 flex flex-col">
          <div className="flex gap-2 mb-4 pb-4 border-b">
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
              <Wall className="h-5 w-5" />
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
          </div>

          <div className="text-sm font-medium mb-2">Available Machines</div>
          <div className="flex-1 min-h-0 border rounded-md p-2 overflow-y-auto">
            <div className="grid gap-2">
              {availableMachines.map((machine) => (
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
                  className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                    selectedMachine?.name === machine.name 
                      ? 'bg-accent text-accent-foreground border-accent' 
                      : inheritMode.active
                        ? 'bg-background hover:bg-blue-50 cursor-copy'
                        : 'bg-background hover:bg-accent/50 cursor-pointer'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${
                    inheritMode.active ? 'bg-blue-500' : 'bg-green-500'
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
              {availableMachines.length === 0 && (
                <div className="text-sm text-gray-500 p-2 text-center">
                  All machines have been placed
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
        </Card>

        <Card className="flex-1 p-6 min-h-[600px] flex items-center justify-center bg-gray-50">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <LayoutGrid
              gridSize={canvasConfig.width * 10}
              cellSize={10}
              walls={walls}
              perforations={perforations}
              machines={machines}
              cables={cables}
              networks={networks}
              networkVisibility={networkVisibility}
              activeMode={editorMode}
              selectedMachine={selectedMachine}
              onWallAdd={handleWallAdd}
              onPerforationAdd={handlePerforationAdd}
              onMachinePlace={handleMachinePlace}
              onMachineMove={handleMachineMove}
              onMachineRemove={handleMachineRemove}
              onNetworkVisibilityChange={setNetworkVisibility}
              backgroundImage={canvasConfig.backgroundImage}
              onMachineInherit={handleMachineInherit}
            />
          </div>
        </Card>
      </div>

      {/* Networks Section */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Cable Networks</h2>
            {networks.length < MAX_NETWORKS && (
              <Button 
                onClick={handleAddNetwork}
                size="sm"
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Add Network
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {networks.map((network) => (
              <Card key={network.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Switch
                      checked={network.visible}
                      onCheckedChange={(checked) => 
                        handleNetworkVisibilityChange(network.id, checked)
                      }
                    />
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: network.color }}
                      />
                      {network.isDefault ? (
                        <span className="font-medium">{network.name}</span>
                      ) : (
                        <Input
                          value={network.name}
                          onChange={(e) =>
                            setNetworks(prev =>
                              prev.map(n =>
                                n.id === network.id
                                  ? { ...n, name: e.target.value }
                                  : n
                              )
                            )
                          }
                          className="text-sm font-medium w-40"
                        />
                      )}
                    </div>
                  </div>
                  {!network.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveNetwork(network.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div
                  className="space-y-2 min-h-[100px] border-2 border-dashed rounded-lg p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const functionName = e.dataTransfer.getData("function");
                    if (functionName) {
                      handleFunctionDrop(network.id, functionName);
                    }
                  }}
                >
                  {network.functions.map((func) => (
                    <div
                      key={func}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("function", func)}
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded border text-sm cursor-move group hover:bg-gray-100 transition-colors"
                    >
                      <GripVertical className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                      <span>{func}</span>
                    </div>
                  ))}

                  {network.functions.length === 0 && (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">
                      Drop cable functions here
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Available Functions Section */}
          {importedCables.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium mb-2">Available Functions</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(importedCables.map(c => c.cableFunction)))
                  .filter(func => !networks.some(n => n.functions.includes(func)))
                  .map((func) => (
                    <div
                      key={func}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('function', func)}
                      className="px-2 py-1 bg-white rounded border text-sm cursor-move hover:bg-gray-50 transition-colors"
                    >
                      {func}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default LayoutEditor;