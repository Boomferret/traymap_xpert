"use client";

import React from 'react';

export const InfoPanel = ({ hoveredInfo, selectedElement, onClose }) => {
  const info = selectedElement || hoveredInfo;

  if (!info) return null;

  return (
    <div className="w-64 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden h-fit sticky top-4">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-900">
          {info.type === 'machine' ? `Machine ${info.name}` : 
           `${info.section.function.charAt(0).toUpperCase() + info.section.function.slice(1)} ${info.section.type}`}
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
      
      <div className="p-4">
        {info.type === 'machine' ? (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {info.powerCables.length + info.controlCables.length} connected cables
            </p>
            
            {info.powerCables.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-red-500 mb-2">Power Cables:</p>
                <ul className="space-y-1 max-h-32 overflow-y-auto pr-2">
                  {info.powerCables.map(cable => (
                    <li key={cable.name} className="text-sm text-gray-600 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-red-400 mr-2 flex-shrink-0"></span>
                      <span className="truncate">
                        {cable.name} ({cable.source === info.name ? 'Source' : 'Target'})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {info.controlCables.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-blue-500 mb-2">Control Cables:</p>
                <ul className="space-y-1 max-h-32 overflow-y-auto pr-2">
                  {info.controlCables.map(cable => (
                    <li key={cable.name} className="text-sm text-gray-600 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-blue-400 mr-2 flex-shrink-0"></span>
                      <span className="truncate">
                        {cable.name} ({cable.source === info.name ? 'Source' : 'Target'})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {info.section.cables.size} cables in this section
            </p>
            <ul className="space-y-1 max-h-64 overflow-y-auto pr-2">
              {Array.from(info.section.cables).sort().map(cable => (
                <li key={cable} className="text-sm text-gray-600 flex items-center">
                  <span 
                    className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
                      cable.startsWith('P') ? 'bg-red-400' : 'bg-blue-400'
                    }`}
                  ></span>
                  <span className="truncate">{cable}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selectedElement && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded border border-gray-300 hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};