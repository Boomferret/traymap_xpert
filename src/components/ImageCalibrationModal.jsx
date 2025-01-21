"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './Modal';

export const ImageCalibrationModal = ({ isOpen, onClose, imageUrl, onCalibrate }) => {
  const [calibrationLength, setCalibrationLength] = useState(1);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load and draw image
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;

    const image = new Image();
    image.src = imageUrl;
    imageRef.current = image;

    image.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to match image size while maintaining aspect ratio
      const maxWidth = 800;
      const maxHeight = 600;
      let width = image.width;
      let height = image.height;
      
      if (width > maxWidth) {
        height = (maxWidth * height) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight * width) / height;
        height = maxHeight;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw image
      ctx.drawImage(image, 0, 0, width, height);
      setImageLoaded(true);
    };
  }, [imageUrl]);

  // Handle canvas click
  const handleCanvasClick = (e) => {
    if (!imageLoaded) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const point = { x, y };

    if (!startPoint) {
      setStartPoint(point);
    } else if (!endPoint) {
      setEndPoint(point);
    }
  };

  // Draw calibration line
  useEffect(() => {
    if (!canvasRef.current || !imageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Redraw image
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

    // Draw calibration line
    if (startPoint) {
      ctx.beginPath();
      ctx.arc(startPoint.x, startPoint.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      if (endPoint) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(endPoint.x, endPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }, [startPoint, endPoint, imageLoaded]);

  const handleCalibrate = () => {
    if (!startPoint || !endPoint || !imageRef.current) return;

    const pixelLength = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );

    const metersPerPixel = calibrationLength / pixelLength;
    const imageWidthMeters = imageRef.current.width * metersPerPixel;
    const imageHeightMeters = imageRef.current.height * metersPerPixel;

    onCalibrate({
      imageUrl,
      width: imageWidthMeters,
      height: imageHeightMeters,
      metersPerPixel,
      originalWidth: imageRef.current.width,
      originalHeight: imageRef.current.height
    });
    onClose();
  };

  const handleReset = () => {
    setStartPoint(null);
    setEndPoint(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Calibrate Image">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Draw a line and specify its length to calibrate the image dimensions
        </p>

        <div className="border rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="cursor-crosshair"
          />
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              Line Length (meters)
            </label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={calibrationLength}
              onChange={(e) => setCalibrationLength(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-700 border rounded-md hover:bg-gray-50"
          >
            Reset Line
          </button>
          <button
            onClick={handleCalibrate}
            disabled={!startPoint || !endPoint}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            Calibrate
          </button>
        </div>
      </div>
    </Modal>
  );
}; 