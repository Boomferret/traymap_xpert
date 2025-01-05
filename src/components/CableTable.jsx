"use client";
import React from 'react';

export const CableTable = ({ cables, onCableSelect, selectedCable }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Label
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Source
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Target
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Function
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Length
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {cables.map((cable) => (
            <tr
              key={cable.id}
              onClick={() => onCableSelect(cable)}
              className={`cursor-pointer hover:bg-gray-50 ${
                selectedCable?.id === cable.id ? 'bg-blue-50' : ''
              }`}
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {cable.cableLabel}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {cable.source}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {cable.target}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cable.color }}
                  />
                  {cable.type}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {cable.cableFunction}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {cable.length}m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};