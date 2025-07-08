"use client";

import React from 'react';
import { InfoPanel } from './InfoPanel';
import { X } from 'lucide-react';
import PropTypes from 'prop-types';
import { Card } from '@/components/ui/card';

export const InfoSidebar = ({ 
  selectedElement, 
  hoveredElement, 
  onClose, 
  onCableHover 
}) => {
  const displayElement = selectedElement || hoveredElement;

  if (!displayElement) {
    return (
      <Card className="w-full h-full p-4 flex items-center justify-center flex-shrink-0">
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 text-gray-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">No selection</p>
          <p className="text-xs text-gray-400">
            Click on a machine or cable section to view details
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full p-4 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 flex-shrink-0">
        <h3 className="text-lg font-semibold">
          {displayElement.type === 'machine' ? 'Machine Details' : 'Section Details'}
        </h3>
        {selectedElement && onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            title="Close details"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <InfoPanel
          hoveredInfo={hoveredElement}
          selectedElement={selectedElement}
          onClose={onClose}
          onCableHover={onCableHover}
        />
      </div>
    </Card>
  );
};

InfoSidebar.propTypes = {
  selectedElement: PropTypes.object,
  hoveredElement: PropTypes.object,
  onClose: PropTypes.func,
  onCableHover: PropTypes.func
};

export default InfoSidebar; 