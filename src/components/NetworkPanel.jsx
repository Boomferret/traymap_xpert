"use client";

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, X, GripVertical, ChevronRight, ChevronDown, Settings } from 'lucide-react';
import PropTypes from 'prop-types';

export const NetworkPanel = ({ 
  networks = [], 
  networkVisibility = {}, 
  onNetworkVisibilityChange, 
  hoveredNetwork, 
  onNetworkHover,
  backendSections = [],
  className = "",
  // New props for network management
  onNetworksChange,
  onAddNetwork,
  onRemoveNetwork,
  onFunctionDrop,
  importedCables = [],
  maxNetworks = 8
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate network info with cable counts
  const networkInfo = React.useMemo(() => {
    const networkMap = new Map();
    
    networks.forEach(network => {
      networkMap.set(network.name, {
        ...network,
        cables: new Set(),
        visible: networkVisibility[network.name] !== false
      });
    });
    
    // Add cables to their respective networks based on section information
    backendSections.forEach(section => {
      if (!section.network) return;
      
      const networkEntry = networkMap.get(section.network);
      if (!networkEntry) return;
      
      // Add cables to the network
      section.cables.forEach(cableId => {
        networkEntry.cables.add(cableId);
      });
    });
    
    return Array.from(networkMap.values());
  }, [networks, networkVisibility, backendSections]);

  const handleNetworkNameChange = (networkId, newName) => {
    if (!onNetworksChange) return;
    
    const updatedNetworks = networks.map(network =>
      network.id === networkId ? { ...network, name: newName } : network
    );
    onNetworksChange(updatedNetworks);
  };

  if (networkInfo.length === 0) {
    return (
      <div className={`w-72 bg-white rounded-lg shadow-sm border flex-shrink-0 ${className}`}>
        <div className="p-4">
          <div className="text-sm font-medium mb-2">Networks</div>
          <div className="text-xs text-gray-500">No networks available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isExpanded ? 'w-full max-w-md' : 'w-72'} bg-white rounded-lg shadow-sm border flex-shrink-0 transition-all duration-300 ${className} flex flex-col h-full`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Networks</div>
            {!isExpanded && (
              <span className="text-xs text-gray-500">
                ({networkInfo.length})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isExpanded && onAddNetwork && networks.length < maxNetworks && (
              <Button
                onClick={onAddNetwork}
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                title="Add Network"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
            <Button
              onClick={() => setIsExpanded(!isExpanded)}
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              title={isExpanded ? 'Collapse' : 'Expand Network Management'}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <Settings className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!isExpanded ? (
          /* Collapsed View - Simple list with toggles and colors */
          <div className="p-4 space-y-2">
            {networkInfo.map((network) => (
              <div 
                key={network.id || network.name} 
                className={`flex items-center gap-3 p-2 rounded transition-colors ${
                  hoveredNetwork === network.name ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
                onMouseEnter={() => onNetworkHover && onNetworkHover(network.name)}
                onMouseLeave={() => onNetworkHover && onNetworkHover(null)}
              >
                <Switch
                  checked={networkVisibility[network.name] !== false}
                  onCheckedChange={(checked) => {
                    onNetworkVisibilityChange && onNetworkVisibilityChange({
                      ...networkVisibility,
                      [network.name]: checked
                    });
                  }}
                />
                <div
                  className={`w-3 h-3 rounded-full transition-transform flex-shrink-0 ${
                    hoveredNetwork === network.name ? 'scale-125' : ''
                  }`}
                  style={{ backgroundColor: network.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${
                    hoveredNetwork === network.name ? 'font-medium' : ''
                  }`}>
                    {network.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {network.cables.size} cables
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Expanded View - Full network management with single column layout */
          <div className="p-4 space-y-4">
            {/* Single column layout for networks - full width */}
            <div className="space-y-4">
              {networks.map((network) => {
                const networkData = networkInfo.find(n => n.id === network.id || n.name === network.name);
                return (
                  <Card key={network.id} className="p-3 w-full">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Switch
                          checked={networkVisibility[network.name] !== false}
                          onCheckedChange={(checked) => {
                            onNetworkVisibilityChange && onNetworkVisibilityChange({
                              ...networkVisibility,
                              [network.name]: checked
                            });
                          }}
                        />
                        <div
                          className={`w-4 h-4 rounded-full transition-transform flex-shrink-0 ${
                            hoveredNetwork === network.name ? 'scale-125' : ''
                          }`}
                          style={{ backgroundColor: network.color }}
                          onMouseEnter={() => onNetworkHover && onNetworkHover(network.name)}
                          onMouseLeave={() => onNetworkHover && onNetworkHover(null)}
                        />
                        <div className="flex-1 min-w-0">
                          {network.isDefault ? (
                            <span className="font-medium text-sm">{network.name}</span>
                          ) : (
                            <Input
                              value={network.name}
                              onChange={(e) => handleNetworkNameChange(network.id, e.target.value)}
                              className="text-sm font-medium h-6 px-2 py-0 max-w-48"
                            />
                          )}
                          <span className="text-xs text-gray-500 ml-1">
                            ({networkData?.cables.size || 0})
                          </span>
                        </div>
                      </div>
                      {!network.isDefault && onRemoveNetwork && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveNetwork(network.id)}
                          className="h-6 w-6 p-0 flex-shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    
                    <div
                      className="space-y-1 min-h-[80px] border-2 border-dashed rounded-lg p-2 w-full"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const functionName = e.dataTransfer.getData("function");
                        if (functionName && onFunctionDrop) {
                          onFunctionDrop(network.id, functionName);
                        }
                      }}
                    >
                      <div className="flex flex-wrap gap-1">
                        {network.functions.map((func) => (
                          <div
                            key={func}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("function", func)}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded border text-xs cursor-move group hover:bg-gray-100 transition-colors"
                          >
                            <GripVertical className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                            <span className="truncate">{func}</span>
                          </div>
                        ))}
                      </div>

                      {network.functions.length === 0 && (
                        <div className="h-full flex items-center justify-center text-xs text-gray-500">
                          Drop functions here
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Available Functions Section - spans full width */}
            {importedCables.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-lg w-full">
                <h4 className="text-xs font-medium mb-2">Available Functions</h4>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(importedCables.map(c => c.cableFunction)))
                    .filter(func => !networks.some(n => n.functions.includes(func)))
                    .map((func) => (
                      <div
                        key={func}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('function', func)}
                        className="px-2 py-1 bg-white rounded border text-xs cursor-move hover:bg-gray-50 transition-colors"
                      >
                        {func}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

NetworkPanel.propTypes = {
  networks: PropTypes.array,
  networkVisibility: PropTypes.object,
  onNetworkVisibilityChange: PropTypes.func,
  hoveredNetwork: PropTypes.string,
  onNetworkHover: PropTypes.func,
  backendSections: PropTypes.array,
  className: PropTypes.string,
  onNetworksChange: PropTypes.func,
  onAddNetwork: PropTypes.func,
  onRemoveNetwork: PropTypes.func,
  onFunctionDrop: PropTypes.func,
  importedCables: PropTypes.array,
  maxNetworks: PropTypes.number
};

export default NetworkPanel; 