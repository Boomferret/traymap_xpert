"use client";

import React, { useState } from 'react';
import PropTypes from 'prop-types';

export const InfoPanel = ({ hoveredInfo, selectedElement, onClose, onCableHover }) => {
  const [activeTab, setActiveTab] = useState('info');
  const info = selectedElement || hoveredInfo;

  // Move getCableStatus outside of renderCableDetails
  const getCableStatus = (cable) => {
    if (!cable.length || !cable.routeLength) return 'default';
    
    // Parse the original length (remove any unit suffixes like 'm' or 'mm')
    const originalLength = parseFloat(cable.length.replace(/[^\d.-]/g, ''));
    if (isNaN(originalLength)) return 'default';

    const difference = originalLength - cable.routeLength;
    
    if (difference >= 3) return 'good';  // At least 3m extra
    if (difference > 0) return 'warning';  // Some extra length but not enough
    return 'error';  // Route is longer than cable
  };

  // Add statusColors as a constant
  const statusColors = {
    good: 'bg-green-50 hover:bg-green-100 border-green-200',
    warning: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
    error: 'bg-red-50 hover:bg-red-100 border-red-200',
    default: 'bg-gray-50 hover:bg-gray-100 border-gray-100'
  };

  // Add headerColorClass helper
  const getHeaderColorClass = (status) => {
    switch (status) {
      case 'good': return 'bg-green-100 border-b border-green-200';
      case 'warning': return 'bg-orange-100 border-b border-orange-200';
      case 'error': return 'bg-red-100 border-b border-red-200';
      default: return 'bg-gray-100 border-b border-gray-200';
    }
  };

  if (!info || !info.data) return null;

  const renderCableDetails = (section) => {
    if (!section || !section.cables) return null;

    // Calculate tray segment length from points
    const calculateSegmentLength = (points) => {
      let length = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;
        length += Math.abs(dx) + Math.abs(dy);
      }
      // Convert from grid units to meters (assuming 0.1m per grid unit)
      return length * 0.1;
    };

    const segmentLength = calculateSegmentLength(section.points);

    const cables = Array.from(section.cables).map(cableId => {
      const details = section.details[cableId];
      return {
        ...details,
        cableLabel: cableId,
        cableType: details.cableType || details.type,
        // Calculate estimated route length if we have the points
        estimatedLength: details.points ? calculateSegmentLength(details.points) : null
      };
    });

    const totalArea = cables.reduce((sum, cable) => {
      const diameter = parseFloat(cable?.diameter) || 0;
      const radius = diameter / 2;
      return sum + (Math.PI * radius * radius);
    }, 0);

    const functionGroups = cables.reduce((groups, cable) => {
      const func = cable.cableFunction || 'Unknown';
      if (!groups[func]) {
        groups[func] = [];
      }
      groups[func].push(cable);
      return groups;
    }, {});

    return (
      <div className="h-full flex flex-col">
        <div className="flex space-x-2 mb-4">
          <button
            className={`px-4 py-2 rounded-md transition-colors ${
              activeTab === 'info' 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTab('info')}
          >
            Info
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors ${
              activeTab === 'cables' 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTab('cables')}
          >
            Cables ({cables.length})
          </button>
        </div>

        {activeTab === 'info' && (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-5 h-5 rounded-full shadow-sm" 
                    style={{ backgroundColor: section.color || '#9ca3af' }}
                  />
                  <div className="text-sm font-medium text-gray-900">
                    {section.network || 'Unknown Network'}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Total Cables</span>
                    <span className="text-sm font-medium">{cables.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Segment Length</span>
                    <span className="text-sm font-medium">{segmentLength.toFixed(1)}m</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Total Area</span>
                    <span className="text-sm font-medium">{totalArea.toFixed(1)} mm²</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cable Functions
                  </div>
                  {Object.entries(functionGroups).map(([func, cables]) => (
                    <div 
                      key={func}
                      className="flex justify-between items-center py-2 px-3 bg-white rounded border border-gray-100"
                    >
                      <span className="text-sm text-gray-900">{func}</span>
                      <span className="text-sm font-medium text-gray-600">
                        {cables.length} cable{cables.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cables' && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
            {cables.map((cable, index) => {
              const status = getCableStatus(cable);
              return (
                <div 
                  key={index} 
                  className={`rounded-lg border transition-colors overflow-hidden ${statusColors[status]}`}
                  onMouseEnter={() => onCableHover(cable.cableLabel)}
                  onMouseLeave={() => onCableHover(null)}
                >
                  <div className={`px-3 py-2 ${getHeaderColorClass(status)}`}>
                    <div className="text-sm font-medium text-gray-900">
                      {cable.cableLabel}
                    </div>
                  </div>

                  <div className="p-3 space-y-1.5 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2 text-gray-900 break-words">{cable.cableType || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-gray-500">Function:</span>
                      <span className="ml-2 text-gray-900">{cable.cableFunction || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-gray-500">Diameter:</span>
                      <span className="ml-2 text-gray-900">{cable.diameter ? `${cable.diameter}mm` : 'N/A'}</span>
                    </div>

                    {cable.length && (
                      <div>
                        <span className="text-gray-500">Cable length:</span>
                        <span className="ml-2 text-gray-900">{cable.length}</span>
                      </div>
                    )}

                    <div>
                      <span className="text-gray-500">Route length:</span>
                      <span className="ml-2 text-gray-900">{cable.routeLength ? `${cable.routeLength.toFixed(1)}m` : 'N/A'}</span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div>
                        <span className="text-gray-500">From:</span>
                        <span className="ml-2 text-gray-900">{cable.source || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">To:</span>
                        <span className="ml-2 text-gray-900">{cable.target || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderMachineDetails = (machine) => {
    // Get all cables where this machine is source or target
    const sourceCables = Object.values(machine.cables || {})
      .filter(cable => cable.source === machine.name);
    const targetCables = Object.values(machine.cables || {})
      .filter(cable => cable.target === machine.name);

    // Group cables by function
    const groupByFunction = (cables) => {
      return cables.reduce((groups, cable) => {
        const func = cable.cableFunction || 'Unknown';
        if (!groups[func]) groups[func] = [];
        groups[func].push(cable);
        return groups;
      }, {});
    };

    const sourceFunctions = groupByFunction(sourceCables);
    const targetFunctions = groupByFunction(targetCables);

    // Calculate total cable area
    const calculateTotalArea = (cables) => {
      return cables.reduce((sum, cable) => {
        const diameter = parseFloat(cable?.diameter) || 0;
        const radius = diameter / 2;
        return sum + (Math.PI * radius * radius);
      }, 0);
    };

    return (
      <div className="h-full flex flex-col">
        <div className="flex space-x-2 mb-4">
          <button
            className={`px-4 py-2 rounded-md transition-colors ${
              activeTab === 'info' 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTab('info')}
          >
            Info
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors ${
              activeTab === 'source' 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTab('source')}
          >
            Source ({sourceCables.length})
          </button>
          <button
            className={`px-4 py-2 rounded-md transition-colors ${
              activeTab === 'target' 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTab('target')}
          >
            Target ({targetCables.length})
          </button>
        </div>

        {activeTab === 'info' && (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <div className="text-sm font-medium text-gray-900">
                  Machine Overview
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Add description if available */}
                {machine.description && (
                  <div className="text-sm text-gray-600 pb-3 border-b border-gray-100">
                    {machine.description}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Total Connections</span>
                    <span className="text-sm font-medium">{sourceCables.length + targetCables.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Source Cables</span>
                    <span className="text-sm font-medium">{sourceCables.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Target Cables</span>
                    <span className="text-sm font-medium">{targetCables.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Total Cable Area</span>
                    <span className="text-sm font-medium">
                      {calculateTotalArea([...sourceCables, ...targetCables]).toFixed(1)} mm²
                    </span>
                  </div>
                </div>

                {/* Function breakdown */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cable Functions
                  </div>
                  {Object.entries({...sourceFunctions, ...targetFunctions}).map(([func, cables]) => (
                    <div 
                      key={func}
                      className="flex justify-between items-center py-2 px-3 bg-white rounded border border-gray-100"
                    >
                      <span className="text-sm text-gray-900">{func}</span>
                      <span className="text-sm font-medium text-gray-600">
                        {cables.length} cable{cables.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {(activeTab === 'source' || activeTab === 'target') && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
            {(activeTab === 'source' ? sourceCables : targetCables)
              .map((cable, index) => {
                const status = getCableStatus(cable);
                return (
                  <div 
                    key={index} 
                    className={`rounded-lg border transition-colors overflow-hidden ${statusColors[status]}`}
                    onMouseEnter={() => onCableHover(cable.cableLabel)}
                    onMouseLeave={() => onCableHover(null)}
                  >
                    <div className={`px-3 py-2 ${getHeaderColorClass(status)}`}>
                      <div className="text-sm font-medium text-gray-900">
                        {cable.cableLabel}
                      </div>
                    </div>

                    <div className="p-3 space-y-1.5 text-sm">
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className="ml-2 text-gray-900 break-words">{cable.cableType || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-gray-500">Function:</span>
                        <span className="ml-2 text-gray-900">{cable.cableFunction || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-gray-500">Diameter:</span>
                        <span className="ml-2 text-gray-900">{cable.diameter ? `${cable.diameter}mm` : 'N/A'}</span>
                      </div>

                      {cable.length && (
                        <div>
                          <span className="text-gray-500">Cable length:</span>
                          <span className="ml-2 text-gray-900">{cable.length}</span>
                        </div>
                      )}

                      <div>
                        <span className="text-gray-500">Route length:</span>
                        <span className="ml-2 text-gray-900">{cable.routeLength ? `${cable.routeLength.toFixed(1)}m` : 'N/A'}</span>
                      </div>

                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div>
                          <span className="text-gray-500">From:</span>
                          <span className="ml-2 text-gray-900">{cable.source || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">To:</span>
                          <span className="ml-2 text-gray-900">{cable.target || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-900">
          {info.type === 'machine' ? `Machine ${info.data.name}` : 'Cable Section Details'}
        </h3>
        {selectedElement && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl font-bold w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100">
            ×
          </button>
        )}
      </div>
      
      <div className="flex-1 p-4 overflow-hidden">
        {info.type === 'machine' ? renderMachineDetails(info.data) : renderCableDetails(info.data)}
      </div>
    </div>
  );
};

InfoPanel.propTypes = {
  hoveredInfo: PropTypes.object,
  selectedElement: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onCableHover: PropTypes.func.isRequired,
};