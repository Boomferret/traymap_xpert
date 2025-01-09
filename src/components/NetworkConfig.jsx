"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

export const NetworkConfig = ({ cableFunctions, onNetworksChange }) => {
  const [networks, setNetworks] = useState([
    {
      id: '1',
      name: 'Power Network',
      color: '#ef4444', // Red
      functions: ['POWER SUPPLY CAT. C2', 'POWER SUPPLY CAT. C3']
    },
    {
      id: '2',
      name: 'Control Network',
      color: '#2563eb', // Blue
      functions: ['CONTROL', 'MEASUREMENT', 'SIGNAL', 'OPTICAL']
    },
    {
      id: '3',
      name: 'HV Network',
      color: '#7c3aed', // Purple
      functions: ['DC HIGH VOLTAGE']
    },
    {
      id: '4',
      name: 'Ground Network',
      color: '#059669', // Green
      functions: ['GROUNDING AND EQUIPOTENTIAL VOLTAGE']
    }
  ]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const { source, destination } = result;
    const newNetworks = [...networks];
    const [removed] = newNetworks[source.droppableId].functions.splice(source.index, 1);
    newNetworks[destination.droppableId].functions.splice(destination.index, 0, removed);
    
    setNetworks(newNetworks);
    onNetworksChange(newNetworks);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-4 gap-4">
        {networks.map((network, networkIndex) => (
          <Card key={network.id} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div 
                className="w-4 h-4 rounded" 
                style={{ backgroundColor: network.color }}
              />
              <h3 className="font-medium">{network.name}</h3>
            </div>
            <Droppable droppableId={networkIndex.toString()}>
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {network.functions.map((func, index) => (
                    <Draggable
                      key={func}
                      draggableId={func}
                      index={index}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="p-2 bg-white rounded border text-sm"
                        >
                          {func}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </Card>
        ))}
      </div>
    </DragDropContext>
  );
};