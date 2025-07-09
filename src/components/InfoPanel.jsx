"use client";

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export const InfoPanel = ({ 
  selectedElement, 
  hoveredElement, 
  onClose, 
  onCableHover 
}) => {
  const [activeTab, setActiveTab] = useState('info');
  const displayElement = selectedElement || hoveredElement;

  // --------------------------------------------------
  // Normalise incoming shapes from different callers
  // --------------------------------------------------

  let elementType = displayElement?.type;
  let elementData = displayElement?.data;

  if (!elementData && displayElement) {
    // CableTrayLayout passes {type:'section', section, ...}
    if (elementType === 'section' && displayElement.section) {
      elementData = displayElement.section;
    }
    // For machine from CableTrayLayout the object itself *is* the data
    if (elementType === 'machine') {
      elementData = displayElement;
    }
  }

  // For machines coming from CableTrayLayout, ensure combined cables array exists
  if (elementType === 'machine' && elementData && !elementData.cables) {
    const combined = [
      ...(elementData.powerCables || []),
      ...(elementData.controlCables || [])
    ];
    elementData = { ...elementData, cables: combined };
  }

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

  if (!displayElement) {
    return (
      <Card className="w-full h-full p-4 flex items-center justify-center flex-shrink-0">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium">No Selection</p>
          <p className="text-sm">Click on an element to view details</p>
        </div>
      </Card>
    );
  }

  const renderCableDetails = (section) => {
    if (!section || !section.cables) return null;

    // Handle two shapes:
    // • Tray section  → section.cables is Set, section.details is map
    // • Machine       → section.cables is Array of cable objects, no details

    let cableEntries = [];

    if (section.details) {
      // Tray-section path
      cableEntries = Array.from(section.cables).map(cid => {
        const details = section.details[cid] || {};
        return {
          ...details,
          cableLabel: cid,
          cableType: details.cableType || details.type,
        };
      });
    } else if (Array.isArray(section.cables)) {
      // Machine path – cables already objects
      cableEntries = section.cables.map(c => ({
        ...c,
        cableLabel: c.cableLabel || c.name,
        cableType: c.cableType || c.type,
      }));
    }

    if (cableEntries.length === 0) return null;

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

    const segmentLength = section.points ? calculateSegmentLength(section.points) : 0;

    const cables = cableEntries.map(cable => ({
      ...cable,
      estimatedLength: cable.points ? calculateSegmentLength(cable.points) : null,
    }));

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
                        <span className="ml-2 text-gray-900">{cable.displaySource || cable.source || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">To:</span>
                        <span className="ml-2 text-gray-900">{cable.displayTarget || cable.target || 'N/A'}</span>
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
    // Get all cables where this machine is source or target, including merged machines
    const mergedNames = new Set(Object.keys(machine.mergedHistory || { [machine.name]: true }));
    
    const cableArray = Array.isArray(machine.cables) ? machine.cables : Object.values(machine.cables || {});

    const sourceCables = cableArray.filter(cable => mergedNames.has(cable.originalSource || cable.source));
    const targetCables = cableArray.filter(cable => mergedNames.has(cable.originalTarget || cable.target));

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

    // Combine to count functions across source & target without loss
    const combinedFunctions = { ...sourceFunctions };
    Object.entries(targetFunctions).forEach(([func, arr]) => {
      combinedFunctions[func] = [...(combinedFunctions[func] || []), ...arr];
    });

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
                {/* Show merged machines */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Machine Designations
                  </div>
                  {Object.keys(machine.mergedHistory || { [machine.name]: true }).map(name => (
                    <div 
                      key={name}
                      className="py-1.5 px-3 bg-white rounded border border-gray-100 text-sm text-gray-900"
                    >
                      {name}
                    </div>
                  ))}
                </div>

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
                  {Object.entries(combinedFunctions).map(([func, cables]) => (
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
                          <span className="ml-2 text-gray-900">{cable.displaySource || cable.source || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">To:</span>
                          <span className="ml-2 text-gray-900">{cable.displayTarget || cable.target || 'N/A'}</span>
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
    <Card className="w-full h-full p-4 flex flex-col flex-shrink-0">
      

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Content */}
        {(() => {
          if (elementType === 'machine') {
            if (['info','source','target'].includes(activeTab)) {
              return renderMachineDetails(elementData);
            }
            return null;
          }
          // Section / others
          if (activeTab === 'info') return renderCableDetails(elementData);
          if (activeTab === 'cables') return renderCableDetails(elementData);
          return null;
        })()}
      </div>
    </Card>
  );
};

InfoPanel.propTypes = {
  hoveredElement: PropTypes.object,
  selectedElement: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onCableHover: PropTypes.func.isRequired,
};

export default InfoPanel;