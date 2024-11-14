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
      functions: ['POWER SUPPLY CAT. C2', 'POWER SUPPLY CAT. C3']
    },
    {
      id: '2',
      name: 'Control Network',
      functions: ['CONTROL', 'MEASUREMENT', 'SIGNAL', 'OPTICAL']
    },
    {
      id: '3',
      name: 'HV Network',
      functions: ['DC HIGH VOLTAGE']
    },
    {
      id: '4',
      name: 'Ground Network',
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
            <h3 className="font-medium mb-2">{network.name}</h3>
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