import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const ProblematicCablesPanel = ({ 
  problematicCables = [], 
  onCableLengthUpdate,
  isLoading = false 
}) => {
  const [editingCable, setEditingCable] = useState(null);
  const [newLength, setNewLength] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleEditStart = (cable) => {
    setEditingCable(cable);
    setNewLength(cable.specifiedLength.toString());
  };

  const handleEditCancel = () => {
    setEditingCable(null);
    setNewLength('');
  };

  const handleLengthUpdate = async (cable) => {
    if (!newLength || isNaN(parseFloat(newLength))) {
      alert('Please enter a valid length');
      return;
    }

    const newLengthNum = parseFloat(newLength);
    if (newLengthNum <= cable.theoreticalMinLength) {
      alert(`Length must be greater than theoretical minimum (${cable.theoreticalMinLength.toFixed(2)}m)`);
      return;
    }

    setIsUpdating(true);
    try {
      await onCableLengthUpdate(cable, newLength);
      setEditingCable(null);
      setNewLength('');
    } catch (error) {
      console.error('Error updating cable length:', error);
      alert('Failed to update cable length');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatLength = (length) => `${length.toFixed(2)}m`;

  if (problematicCables.length === 0) {
    return (
      <Card className="p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-green-500" />
          <h3 className="font-semibold text-sm">Cable Issues</h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-green-500" />
          <p className="text-sm">No cable issues detected</p>
          <p className="text-xs text-gray-400 mt-1">All cables fit within their specified lengths</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <h3 className="font-semibold text-sm">Cable Issues</h3>
        <Badge variant="destructive" className="text-xs">
          {problematicCables.length}
        </Badge>
      </div>

      <div className="text-xs text-gray-600 mb-4 p-2 bg-red-50 border border-red-200 rounded">
        <p className="font-medium">⚠️ Cables below require longer lengths:</p>
        <p>Route length exceeds specified cable length. Increase cable length or modify layout.</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {problematicCables.map((cable, index) => (
          <div key={index} className="border rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <h4 className="font-medium text-sm truncate">
                  {cable.cableLabel || `${cable.source} → ${cable.target}`}
                </h4>
                <p className="text-xs text-gray-500 truncate">
                  {cable.source} → {cable.target}
                </p>
              </div>
              <Badge variant="destructive" className="text-xs ml-2 shrink-0">
                +{formatLength(cable.excessLength)}
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500">Specified:</span>
                  <p className="font-medium">{formatLength(cable.specifiedLength)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Route:</span>
                  <p className="font-medium text-red-600">{formatLength(cable.routeLength)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500">Min possible:</span>
                  <p className="font-medium text-blue-600">{formatLength(cable.theoreticalMinLength)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Excess:</span>
                  <p className="font-medium text-red-600">+{cable.excessPercentage.toFixed(1)}%</p>
                </div>
              </div>

              {editingCable === cable ? (
                <div className="space-y-2 pt-2 border-t">
                  <div>
                    <label className="text-xs text-gray-500">New length (m):</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newLength}
                      onChange={(e) => setNewLength(e.target.value)}
                      className="text-xs h-7"
                      placeholder="Enter new length"
                      min={cable.theoreticalMinLength}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => handleLengthUpdate(cable)}
                      disabled={isUpdating}
                      className="text-xs h-6 px-2 flex-1"
                    >
                      {isUpdating ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        'Update'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleEditCancel}
                      disabled={isUpdating}
                      className="text-xs h-6 px-2"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditStart(cable)}
                    className="text-xs h-6 px-2 w-full"
                    disabled={isLoading}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Increase Length
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-center">
          <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1" />
          <p className="text-xs text-blue-600">Re-optimizing routes...</p>
        </div>
      )}
    </Card>
  );
}; 