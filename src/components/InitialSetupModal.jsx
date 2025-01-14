"use client";

import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ImageCalibrationModal } from './ImageCalibrationModal';

export const InitialSetupModal = ({ isOpen, onClose, onSubmit }) => {
  const [selectedOption, setSelectedOption] = useState('blank');
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [image, setImage] = useState(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      type: selectedOption,
      width: Number(width),
      height: Number(height),
      image: selectedOption === 'image' ? image : null,
      gridResolution: 0.1 // 10cm grid squares
    });
    onClose();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setUploadedImage(URL.createObjectURL(file));
      setShowCalibration(true);
    }
  };

  const handleCalibrate = (calibrationData) => {
    setShowCalibration(false);
    onSubmit({
      type: 'image',
      width: Math.round(calibrationData.width * 10) / 10, // Round to nearest 0.1
      height: Math.round(calibrationData.height * 10) / 10,
      image: image,
      gridResolution: 0.1
    });
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Create New Layout">
        <div className="space-y-6">
          <div className="flex border-b">
            <button
              className={`px-4 py-2 ${selectedOption === 'blank' ? 'border-b-2 border-blue-500' : ''}`}
              onClick={() => setSelectedOption('blank')}
            >
              Blank Canvas
            </button>
            <button
              className={`px-4 py-2 ${selectedOption === 'image' ? 'border-b-2 border-blue-500' : ''}`}
              onClick={() => setSelectedOption('image')}
            >
              Upload Image
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedOption === 'blank' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Width (meters)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Height (meters)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
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
                {image && (
                  <p className="text-sm text-gray-600">
                    Selected: {image.name}
                  </p>
                )}
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 mb-4">
                Grid resolution: 0.1m (10cm) per square
              </p>
              <Button
                type="submit"
                className="w-full"
                disabled={selectedOption === 'image' && !image}
              >
                Create Layout
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <ImageCalibrationModal
        isOpen={showCalibration}
        onClose={() => setShowCalibration(false)}
        imageUrl={uploadedImage}
        onCalibrate={handleCalibrate}
      />
    </>
  );
}; 