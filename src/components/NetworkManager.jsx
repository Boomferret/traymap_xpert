"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, GripVertical } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';

export const NetworkManager = ({ cableFunctions, onNetworksChange }) => {
  const [parent] = useAutoAnimate();
  const [networks, setNetworks] = useState([
    {
      id: '1',
      name: 'Power Network',
      color: '#ef4444',
      functions: ['POWER SUPPLY CAT. C2', 'POWER SUPPLY CAT. C3']
    },
    {
      id: '2',
      name: 'Control Network',
      color: '#2563eb',
      functions: ['CONTROL', 'MEASUREMENT', 'SIGNAL', 'OPTICAL']
    },
    {
      id: '3',
      name: 'HV Network',
      color: '#7c3aed',
      functions: ['DC HIGH VOLTAGE']
    },
    {
      id: '4',
      name: 'Ground Network',
      color: '#059669',
      functions: ['GROUNDING AND EQUIPOTENTIAL VOLTAGE']
    }
  ]);

  const addNetwork = () => {
    const newNetwork = {
      id: Date.now().toString(),
      name: `Network ${networks.length + 1}`,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      functions: []
    };
    setNetworks([...networks, newNetwork]);
  };

  const removeNetwork = (networkId) => {
    setNetworks(networks.filter(n => n.id !== networkId));
  };

  const updateNetwork = (networkId, updates) => {
    setNetworks(networks.map(n => 
      n.id === networkId ? { ...n, ...updates } : n
    ));
  };

  const handleFunctionDrop = (functionName, targetNetworkId) => {
    // Remove from old network
    const updatedNetworks = networks.map(network => ({
      ...network,
      functions: network.functions.filter(f => f !== functionName)
    }));

    // Add to new network
    const targetNetwork = updatedNetworks.find(n => n.id === targetNetworkId);
    if (targetNetwork && !targetNetwork.functions.includes(functionName)) {
      targetNetwork.functions.push(functionName);
    }

    setNetworks(updatedNetworks);
    onNetworksChange(updatedNetworks);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Cable Networks</h2>
        <Button onClick={addNetwork} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Network
        </Button>
      </div>

      <div ref={parent} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {networks.map((network) => (
          <Card key={network.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Input
                value={network.name}
                onChange={(e) => updateNetwork(network.id, { name: e.target.value })}
                className="text-sm font-medium w-40"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeNetwork(network.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div 
              className="space-y-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const functionName = e.dataTransfer.getData('function');
                handleFunctionDrop(functionName, network.id);
              }}
            >
              {network.functions.map((func) => (
                <div
                  key={func}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('function', func)}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded border text-sm cursor-move group"
                >
                  <GripVertical className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                  <span>{func}</span>
                </div>
              ))}
              
              {network.functions.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500 border-2 border-dashed rounded">
                  Drop cable functions here
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium mb-2">Available Functions</h3>
        <div className="flex flex-wrap gap-2">
          {cableFunctions.map((func) => (
            <div
              key={func}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('function', func)}
              className="px-2 py-1 bg-white rounded border text-sm cursor-move hover:bg-gray-50"
            >
              {func}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};