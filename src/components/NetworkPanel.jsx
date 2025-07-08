"use client";

import React from 'react';
import { Switch } from '@/components/ui/switch';
import PropTypes from 'prop-types';

export const NetworkPanel = ({ 
  networks = [], 
  networkVisibility = {}, 
  onNetworkVisibilityChange, 
  hoveredNetwork, 
  onNetworkHover,
  backendSections = [],
  className = ""
}) => {
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

  if (networkInfo.length === 0) {
    return (
      <div className={`w-48 bg-white rounded-lg shadow-sm p-4 flex-shrink-0 ${className}`}>
        <div className="text-sm font-medium mb-2">Networks</div>
        <div className="text-xs text-gray-500">No networks available</div>
      </div>
    );
  }

  return (
    <div className={`w-48 bg-white rounded-lg shadow-sm p-4 flex-shrink-0 ${className}`}>
      <div className="text-sm font-medium mb-3">Networks</div>
      <div className="space-y-2">
        {networkInfo.map((network) => (
          <div 
            key={network.id || network.name} 
            className={`flex items-center gap-2 p-2 rounded transition-colors ${
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
            <div className="flex items-center gap-2 flex-1 min-w-0">
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
          </div>
        ))}
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
  className: PropTypes.string
};

export default NetworkPanel; 