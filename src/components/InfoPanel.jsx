"use client";

import React, { useState } from 'react';
import PropTypes from 'prop-types';

export const InfoPanel = ({ hoveredInfo, selectedElement, onClose, onCableHover }) => {
  const [activeTab, setActiveTab] = useState('info');
  const info = selectedElement || hoveredInfo;

  if (!info || !info.data) return null;

  const renderCableDetails = (section) => {
    if (!section || !section.cables) return null;

    // Get cables array and ensure we have the details
    const cables = Array.from(section.cables).map(cableId => ({
      ...section.details[cableId],
      cableLabel: cableId
    }));

    const totalDiameter = cables.reduce((sum, cable) => {
      return sum + (parseFloat(cable?.diameter) || 0);
    }, 0);
    const avgDiameter = cables.length > 0 ? totalDiameter / cables.length : 0;

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
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div 
                  className="w-5 h-5 rounded-full shadow-sm" 
                  style={{ backgroundColor: section.color || '#9ca3af' }}
                />
                <div className="text-sm font-medium text-gray-900">
                  {section.network || 'Unknown Network'}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Cables</span>
                  <span className="text-sm font-medium">{cables.length}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Average Diameter</span>
                  <span className="text-sm font-medium">{avgDiameter.toFixed(1)}mm</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Total Diameter</span>
                  <span className="text-sm font-medium">{totalDiameter.toFixed(1)}mm</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cables' && (
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {cables.map((cable, index) => (
              <div 
                key={index} 
                className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                onMouseEnter={() => onCableHover(cable.cableLabel)}
                onMouseLeave={() => onCableHover(null)}
              >
                <div className="text-sm font-medium text-gray-900 mb-2">
                  {cable.cableLabel || `Cable ${index + 1}`}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Type:</span>
                    <span className="text-xs text-gray-900">{cable.cableType || cable.type || 'N/A'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Function:</span>
                    <span className="text-xs text-gray-900">{cable.cableFunction || cable.function || 'N/A'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Diameter:</span>
                    <span className="text-xs text-gray-900">{cable.diameter ? `${cable.diameter}mm` : 'N/A'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">From:</span>
                    <span className="text-xs text-gray-900">
                      {cable.source || cable.originalSource || 'N/A'}
                      {cable.sourceLocation && ` (${cable.sourceLocation})`}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">To:</span>
                    <span className="text-xs text-gray-900">
                      {cable.target || cable.originalTarget || 'N/A'}
                      {cable.targetLocation && ` (${cable.targetLocation})`}
                    </span>
                  </div>
                  {cable.length && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-500 w-20">Length:</span>
                      <span className="text-xs text-gray-900">{cable.length}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100"
          >
            ×
          </button>
        )}
      </div>
      
      <div className="flex-1 p-4 overflow-hidden">
        {info.type === 'machine' ? (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Machine details here...
            </p>
          </div>
        ) : (
          renderCableDetails(info.data)
        )}
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