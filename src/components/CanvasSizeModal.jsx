"use client";
import React, { useState } from 'react';
import { Modal } from './Modal';

export const CanvasSizeModal = ({ isOpen, onClose, onSubmit, initialWidth = 10, initialHeight = 10 }) => {
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [selectedTab, setSelectedTab] = useState('blank');

  const handleSizeSubmit = (e) => {
    e.preventDefault();
    onSubmit({ width: Number(width), height: Number(height) });
    onClose();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      onSubmit({ width: Number(width), height: Number(height), image: file });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Layout">
      <div className="space-y-4">
        <div className="flex border-b">
          <button
            className={`px-4 py-2 ${selectedTab === 'blank' ? 'border-b-2 border-blue-500' : ''}`}
            onClick={() => setSelectedTab('blank')}
          >
            Blank Canvas
          </button>
          <button
            className={`px-4 py-2 ${selectedTab === 'image' ? 'border-b-2 border-blue-500' : ''}`}
            onClick={() => setSelectedTab('image')}
          >
            Upload Image
          </button>
        </div>

        {selectedTab === 'blank' ? (
          <form onSubmit={handleSizeSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Width (meters)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Height (meters)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              Create Canvas
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6">
              <input
                type="file"
                id="image-upload"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
              <label
                htmlFor="image-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <div className="text-4xl text-gray-400">↑</div>
                <span className="text-sm text-gray-600">
                  Click to upload or drag and drop
                </span>
                <span className="text-xs text-gray-400">
                  PNG, JPG up to 10MB
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}; 