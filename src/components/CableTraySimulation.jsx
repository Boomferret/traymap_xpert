import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// Standard tray sizes
const TRAY_SIZES = [
  { width: 100, height: 35 }, { width: 100, height: 55 }, { width: 100, height: 60 }, { width: 100, height: 75 },
  { width: 100, height: 85 }, { width: 100, height: 105 }, { width: 100, height: 110 }, { width: 100, height: 160 },
  { width: 150, height: 35 }, { width: 150, height: 55 }, { width: 150, height: 60 }, { width: 150, height: 75 },
  { width: 150, height: 85 }, { width: 150, height: 105 }, { width: 150, height: 110 }, { width: 150, height: 160 },
  { width: 200, height: 35 }, { width: 200, height: 55 }, { width: 200, height: 60 }, { width: 200, height: 75 },
  { width: 200, height: 85 }, { width: 200, height: 105 }, { width: 200, height: 110 }, { width: 200, height: 160 },
  { width: 300, height: 35 }, { width: 300, height: 55 }, { width: 300, height: 60 }, { width: 300, height: 75 },
  { width: 300, height: 85 }, { width: 300, height: 105 }, { width: 300, height: 110 }, { width: 300, height: 160 },
  { width: 400, height: 35 }, { width: 400, height: 55 }, { width: 400, height: 60 }, { width: 400, height: 75 },
  { width: 400, height: 85 }, { width: 400, height: 105 }, { width: 400, height: 110 }, { width: 400, height: 160 },
  { width: 500, height: 35 }, { width: 500, height: 55 }, { width: 500, height: 60 }, { width: 500, height: 75 },
  { width: 500, height: 85 }, { width: 500, height: 105 }, { width: 500, height: 110 }, { width: 500, height: 160 },
  { width: 600, height: 35 }, { width: 600, height: 55 }, { width: 600, height: 60 }, { width: 600, height: 75 },
  { width: 600, height: 85 }, { width: 600, height: 105 }, { width: 600, height: 110 }, { width: 600, height: 160 }
].map(size => ({
  ...size,
  area: size.width * size.height,
  label: `${size.width}×${size.height}mm (${(size.width * size.height).toLocaleString()}mm²)`
}));

export const CableTraySimulation = ({ cables, networks, isOpen, onClose }) => {
  const svgRef = useRef(null);
  const [cablesWithDiameters, setCablesWithDiameters] = useState([]);
  const [hasPrompted, setHasPrompted] = useState(false);
  const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
  const [selectedTraySize, setSelectedTraySize] = useState(TRAY_SIZES[27]); // Default to 300×75mm
  const [fillMetrics, setFillMetrics] = useState({ heightPercent: 0, areaPercent: 0 });

  // Constants for visualization
  const MM_TO_PX = 2; // Scale factor to convert mm to pixels
  const SVG_PADDING = 100; // Padding around the tray
  const MIN_SVG_WIDTH = 800;
  const MIN_SVG_HEIGHT = 400;

  // Function to get color based on network and function
  const getColorForCable = (cable) => {
    if (cable.color) return cable.color;
    const network = networks.find(n => n.functions.includes(cable.function));
    if (network) {
      return network.color;
    }
    return '#999999'; // Default gray for unknown networks
  };

  // Group cables by function for the legend
  const getCableFunctions = (cables) => {
    const functionMap = new Map();
    
    cables.forEach(cable => {
      const functionKey = cable.function || 'Unknown';
      
      if (!functionMap.has(functionKey)) {
        functionMap.set(functionKey, {
          function: functionKey,
          network: cable.network || cable.type || 'Unknown',
          color: cable.color || '#999999'
        });
      }
    });
    
    return Array.from(functionMap.values());
  };

  // Calculate SVG dimensions based on tray size
  const getSVGDimensions = (traySize) => {
    const requiredWidth = (traySize.width * MM_TO_PX) + (SVG_PADDING * 2);
    const requiredHeight = (traySize.height * MM_TO_PX) + (SVG_PADDING * 2);
    
    return {
      width: Math.max(MIN_SVG_WIDTH, requiredWidth),
      height: Math.max(MIN_SVG_HEIGHT, requiredHeight)
    };
  };

  // Calculate initial dimensions
  const [svgDimensions, setSvgDimensions] = useState(getSVGDimensions(selectedTraySize));

  // Update dimensions when tray size changes
  useEffect(() => {
    setSvgDimensions(getSVGDimensions(selectedTraySize));
  }, [selectedTraySize]);

  // Helper function to parse diameter string
  const parseDiameter = (diameterStr) => {
    if (!diameterStr) return null;
    
    // If it's already a number, return it
    if (typeof diameterStr === 'number') return diameterStr;
    
    // Convert to string if it's not already
    const str = String(diameterStr);
    
    // Remove "mm" and trim whitespace
    const cleaned = str.replace('mm', '').trim();
    // Replace comma with dot for decimal numbers
    const normalized = cleaned.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  };

  // Helper function to group cables by label
  const groupCables = (cables) => {
    const groupedMap = new Map();
    
    cables.forEach(cable => {
      const key = cable.cableLabel;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          ...cable,
          count: 1
        });
      } else {
        groupedMap.get(key).count++;
      }
    });

    return Array.from(groupedMap.values());
  };

  // Helper function to calculate fill metrics (using real mm dimensions)
  const calculateFillMetrics = (nodes, trayWidth, trayHeight, trayY) => {
    if (nodes.length === 0) return { heightPercent: 0, areaPercent: 0 };

    // Find highest point of any cable (lowest y value since SVG coordinates)
    const highestPoint = Math.min(...nodes.map(n => n.y - n.radius));
    const trayBottom = trayY + trayHeight * MM_TO_PX;
    const usedHeight = trayBottom - highestPoint;
    const heightPercent = (usedHeight / (trayHeight * MM_TO_PX)) * 100;

    // Calculate total area of cables vs tray area (in mm²)
    const totalCableArea = nodes.reduce((sum, n) => sum + Math.PI * Math.pow((n.diameter / 2), 2), 0);
    const trayArea = trayWidth * trayHeight;
    const areaPercent = (totalCableArea / trayArea) * 100;

    return {
      heightPercent: Math.min(Math.round(heightPercent), 100),
      areaPercent: Math.min(Math.round(areaPercent), 100)
    };
  };

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasPrompted(false);
      setCablesWithDiameters([]);
      setTooltip({ show: false, content: '', x: 0, y: 0 });
    }
  }, [isOpen]);

  // Handle diameter prompts
  useEffect(() => {
    if (!isOpen || !cables || hasPrompted) return;
    
    const processedCables = [...cables];
    const uniqueCables = Array.from(new Map(cables.map(cable => [cable.cableLabel, cable])).values());
    const missingDiameters = uniqueCables.filter(cable => !parseDiameter(cable.diameter));

    const getDiametersFromUser = async () => {
      const diametersMap = new Map();

      for (const cable of missingDiameters) {
        const diameter = prompt(
          `Enter the diameter (in mm) for cable ${cable.cableLabel}\nExample: 25 for a 25mm diameter cable\nPress Cancel to skip this cable`,
          ''
        );
        
        if (diameter === null) {
          diametersMap.set(cable.cableLabel, null);
        } else {
          const numDiameter = parseFloat(diameter);
          if (!isNaN(numDiameter) && numDiameter > 0) {
            diametersMap.set(cable.cableLabel, numDiameter);
          } else {
            diametersMap.set(cable.cableLabel, null);
          }
        }
      }
      
      const updatedCables = processedCables.filter(cable => {
        const existingDiameter = parseDiameter(cable.diameter);
        if (existingDiameter) {
          cable.diameter = existingDiameter;
          return true;
        }
        
        const promptedDiameter = diametersMap.get(cable.cableLabel);
        if (promptedDiameter === null) return false;
        if (promptedDiameter) {
          cable.diameter = promptedDiameter;
          return true;
        }
        return false;
      });

      // Group cables before setting state
      const groupedCables = groupCables(updatedCables);
      setCablesWithDiameters(groupedCables);
      setHasPrompted(true);
    };

    if (missingDiameters.length > 0) {
      getDiametersFromUser();
    } else {
      // Convert all existing diameters to numbers and group cables
      const updatedCables = processedCables.map(cable => ({
        ...cable,
        diameter: parseDiameter(cable.diameter)
      })).filter(cable => cable.diameter !== null);
      
      const groupedCables = groupCables(updatedCables);
      setCablesWithDiameters(groupedCables);
      setHasPrompted(true);
    }
  }, [isOpen, cables, hasPrompted]);

  // D3 simulation effect
  useEffect(() => {
    if (!isOpen || !svgRef.current || !cablesWithDiameters || cablesWithDiameters.length === 0) return;

    const { width: SVG_WIDTH, height: SVG_HEIGHT } = svgDimensions;
    const trayX = (SVG_WIDTH - selectedTraySize.width * MM_TO_PX) / 2;
    const trayY = (SVG_HEIGHT - selectedTraySize.height * MM_TO_PX) / 2;
    
    // Create nodes for each cable
    const nodes = cablesWithDiameters.flatMap(cable => 
      Array.from({ length: cable.count }, () => ({
        x: trayX + Math.random() * (selectedTraySize.width * MM_TO_PX),
        y: trayY + Math.random() * 20,
        radius: cable.diameter * MM_TO_PX / 2,
        diameter: cable.diameter,
        label: cable.cableLabel,
        function: cable.cableFunction,
        network: cable.type === 'power' ? 'power' : 
                cable.type === 'control' ? 'control' : 
                cable.network || 'other',
        vy: 0
      }))
    );

    // Sort nodes by diameter in descending order for better packing
    nodes.sort((a, b) => b.diameter - a.diameter);
    nodes.forEach((d, index) => {
      d.delay = index * 5;
    });

    // Create color scale based on unique cable labels
    const uniqueLabels = [...new Set(nodes.map(d => d.label))].sort();
    const colorScale = d3.scaleOrdinal()
      .domain(uniqueLabels)
      .range(d3.schemeSet3);

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    // Create new SVG
    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, SVG_WIDTH, SVG_HEIGHT])
      .style("background", "#f5f5f5");

    // Draw tray boundary
    svg.append("rect")
      .attr("x", trayX)
      .attr("y", trayY)
      .attr("width", selectedTraySize.width * MM_TO_PX)
      .attr("height", selectedTraySize.height * MM_TO_PX)
      .attr("fill", "none")
      .attr("stroke", "#333")
      .attr("stroke-width", 2);

    // Add dimension lines
    const arrowSize = 5;
    const dimensionOffset = 20;
    const dimensionColor = "#666";

    // Create arrow marker definition
    svg.append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", arrowSize)
      .attr("markerHeight", arrowSize)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", dimensionColor);

    // Width dimension line
    const widthDimensionGroup = svg.append("g")
      .attr("class", "dimension-line")
      .style("stroke", dimensionColor)
      .style("stroke-width", 1);

    // Horizontal line with arrows
    widthDimensionGroup.append("line")
      .attr("x1", trayX)
      .attr("y1", trayY + selectedTraySize.height * MM_TO_PX + dimensionOffset)
      .attr("x2", trayX + selectedTraySize.width * MM_TO_PX)
      .attr("y2", trayY + selectedTraySize.height * MM_TO_PX + dimensionOffset)
      .attr("marker-start", "url(#arrow)")
      .attr("marker-end", "url(#arrow)");

    // Vertical extension lines
    widthDimensionGroup.append("line")
      .attr("x1", trayX)
      .attr("y1", trayY + selectedTraySize.height * MM_TO_PX)
      .attr("x2", trayX)
      .attr("y2", trayY + selectedTraySize.height * MM_TO_PX + dimensionOffset);

    widthDimensionGroup.append("line")
      .attr("x1", trayX + selectedTraySize.width * MM_TO_PX)
      .attr("y1", trayY + selectedTraySize.height * MM_TO_PX)
      .attr("x2", trayX + selectedTraySize.width * MM_TO_PX)
      .attr("y2", trayY + selectedTraySize.height * MM_TO_PX + dimensionOffset);

    // Width dimension text
    widthDimensionGroup.append("text")
      .attr("x", trayX + (selectedTraySize.width * MM_TO_PX) / 2)
      .attr("y", trayY + selectedTraySize.height * MM_TO_PX + dimensionOffset - 5)
      .attr("text-anchor", "middle")
      .attr("fill", dimensionColor)
      .attr("font-size", "12px")
      .text(`${selectedTraySize.width}mm`);

    // Height dimension line
    const heightDimensionGroup = svg.append("g")
      .attr("class", "dimension-line")
      .style("stroke", dimensionColor)
      .style("stroke-width", 1);

    // Vertical line with arrows
    heightDimensionGroup.append("line")
      .attr("x1", trayX - dimensionOffset)
      .attr("y1", trayY)
      .attr("x2", trayX - dimensionOffset)
      .attr("y2", trayY + selectedTraySize.height * MM_TO_PX)
      .attr("marker-start", "url(#arrow)")
      .attr("marker-end", "url(#arrow)");

    // Horizontal extension lines
    heightDimensionGroup.append("line")
      .attr("x1", trayX - dimensionOffset)
      .attr("y1", trayY)
      .attr("x2", trayX)
      .attr("y2", trayY);

    heightDimensionGroup.append("line")
      .attr("x1", trayX - dimensionOffset)
      .attr("y1", trayY + selectedTraySize.height * MM_TO_PX)
      .attr("x2", trayX)
      .attr("y2", trayY + selectedTraySize.height * MM_TO_PX);

    // Height dimension text
    heightDimensionGroup.append("text")
      .attr("x", trayX - dimensionOffset - 5)
      .attr("y", trayY + (selectedTraySize.height * MM_TO_PX) / 2)
      .attr("text-anchor", "middle")
      .attr("fill", dimensionColor)
      .attr("font-size", "12px")
      .attr("transform", `rotate(-90, ${trayX - dimensionOffset - 5}, ${trayY + (selectedTraySize.height * MM_TO_PX) / 2})`)
      .text(`${selectedTraySize.height}mm`);

    // Add measurement axes on right and top sides
    const axisGroup = svg.append("g")
      .attr("class", "measurement-axes")
      .style("stroke", dimensionColor)
      .style("stroke-width", 1);

    // Right side axis (height)
    const rightAxisX = trayX + selectedTraySize.width * MM_TO_PX + dimensionOffset;
    const heightTicks = Math.floor(selectedTraySize.height / 25);
    
    for (let i = 0; i <= heightTicks; i++) {
      const yPos = trayY + selectedTraySize.height * MM_TO_PX - (i * 25 * MM_TO_PX); // Reversed Y position
      // Draw tick
      axisGroup.append("line")
        .attr("x1", rightAxisX)
        .attr("y1", yPos)
        .attr("x2", rightAxisX + 5)
        .attr("y2", yPos);
      // Add label
      axisGroup.append("text")
        .attr("x", rightAxisX + 8)
        .attr("y", yPos + 4)
        .attr("font-size", "10px")
        .attr("fill", dimensionColor)
        .text(`${i * 25}`);
    }

    // Top side axis (width)
    const topAxisY = trayY - dimensionOffset;
    const widthTicks = Math.floor(selectedTraySize.width / 25);
    
    for (let i = 0; i <= widthTicks; i++) {
      const xPos = trayX + i * 25 * MM_TO_PX;
      // Draw tick
      axisGroup.append("line")
        .attr("x1", xPos)
        .attr("y1", topAxisY)
        .attr("x2", xPos)
        .attr("y2", topAxisY - 5);
      // Add label
      axisGroup.append("text")
        .attr("x", xPos)
        .attr("y", topAxisY - 8)
        .attr("font-size", "10px")
        .attr("fill", dimensionColor)
        .attr("text-anchor", "middle")
        .text(`${i * 25}`);
    }

    // Draw fill height indicator line
    const fillLine = svg.append("line")
      .attr("x1", trayX)
      .attr("x2", trayX + selectedTraySize.width * MM_TO_PX)
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4");

    // Create circles for cables
    const circles = svg.selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", d => d.radius)
      .attr("fill", d => getColorForCable(d))
      .attr("stroke", "#2c3e50")
      .attr("stroke-width", 1.5)
      .on("mouseover", (event, d) => {
        const [mouseX, mouseY] = d3.pointer(event);
        setTooltip({
          show: true,
          content: `${d.label}\nØ ${d.diameter}mm\nFunction: ${d.function || 'Unknown'}\nNetwork: ${d.network || 'Unknown'}`,
          x: mouseX,
          y: mouseY
        });
      })
      .on("mousemove", (event) => {
        const [mouseX, mouseY] = d3.pointer(event);
        setTooltip(prev => ({
          ...prev,
          x: mouseX,
          y: mouseY
        }));
      })
      .on("mouseout", () => {
        setTooltip({ show: false, content: '', x: 0, y: 0 });
      })
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Create simulation
    const simulation = d3.forceSimulation(nodes)
      .force("collision", d3.forceCollide().radius(d => d.radius * 1.05).strength(1))
      .alphaDecay(0.01)
      .alphaMin(0.001);

    // Tick function with gravity
    function ticked() {
      const gravity = 0.8;

      nodes.forEach((d) => {
        if (d.delay > 0) {
          d.delay -= 1;
        } else {
          // Apply gravity
          d.vy = (d.vy || 0) + gravity;
          d.y += d.vy;

          // Constrain to tray boundaries
          const leftWall = trayX + d.radius;
          const rightWall = trayX + selectedTraySize.width * MM_TO_PX - d.radius;
          const bottomWall = trayY + selectedTraySize.height * MM_TO_PX - d.radius;
          const topWall = trayY + d.radius;

          // Horizontal constraints with slight damping
          if (d.x < leftWall) { d.x = leftWall; d.vx = Math.abs(d.vx || 0) * 0.5; }
          if (d.x > rightWall) { d.x = rightWall; d.vx = -Math.abs(d.vx || 0) * 0.5; }

          // Vertical constraints with bounce
          if (d.y > bottomWall) {
            d.y = bottomWall;
            d.vy = 0;
          }
          if (d.y < topWall) {
            d.y = topWall;
            d.vy = Math.abs(d.vy) * 0.5; // Bounce with damping
          }
        }
      });

      // Update circle positions
      circles.attr("cx", d => d.x).attr("cy", d => d.y);

      // Update fill metrics and line position
      const metrics = calculateFillMetrics(nodes, selectedTraySize.width, selectedTraySize.height, trayY);
      setFillMetrics(metrics);

      // Update fill line position to show highest point
      const highestPoint = Math.min(...nodes.map(n => n.y - n.radius));
      fillLine.attr("y1", highestPoint).attr("y2", highestPoint);
    }

    simulation.on("tick", ticked);

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [isOpen, cablesWithDiameters, selectedTraySize, svgDimensions]);

  // Calculate required modal dimensions including legend and controls
  const getModalDimensions = () => {
    // Default dimensions for server-side rendering
    const defaultDimensions = {
      width: 800,
      height: 600
    };

    // Only access window if we're in the browser
    if (typeof window === 'undefined') {
      return defaultDimensions;
    }

    const modalPadding = 32;
    const controlsHeight = 200;
    const maxWidth = window.innerWidth - modalPadding * 2;
    const maxHeight = window.innerHeight - modalPadding * 2;

    return {
      width: Math.min(maxWidth, 1200),
      height: Math.min(maxHeight - controlsHeight, 800)
    };
  };

  // Add state for modal dimensions
  const [modalDimensions, setModalDimensions] = useState(getModalDimensions());

  // Update dimensions when window resizes
  useEffect(() => {
    const handleResize = () => {
      setModalDimensions(getModalDimensions());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-lg p-4 max-w-[90vw] max-h-[90vh] w-full h-full flex flex-col overflow-hidden"
        style={{
          width: `${modalDimensions.width}px`,
          height: `${modalDimensions.height}px`
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Cable Tray Fill Simulation</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        {/* Control Panel */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg flex flex-wrap gap-4">
          <div className="space-y-2 flex-1 min-w-[300px]">
            <h3 className="font-medium text-gray-700">Tray Size</h3>
            <div className="flex gap-4">
              <select
                value={`${selectedTraySize.width},${selectedTraySize.height}`}
                onChange={(e) => {
                  const [width, height] = e.target.value.split(',').map(Number);
                  const newSize = TRAY_SIZES.find(size => size.width === width && size.height === height);
                  setSelectedTraySize(newSize);
                }}
                className="w-full px-2 py-1 border rounded text-sm"
              >
                {TRAY_SIZES.map(size => (
                  <option key={`${size.width}-${size.height}`} value={`${size.width},${size.height}`}>
                    {size.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 flex-1 min-w-[200px]">
            <h3 className="font-medium text-gray-700">Fill Metrics</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Height Fill:</span>
                <span className="font-medium text-gray-900">{fillMetrics.heightPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Area Fill:</span>
                <span className="font-medium text-gray-900">{fillMetrics.areaPercent}%</span>
              </div>
            </div>
          </div>

          {/* Cable Legend */}
          <div className="space-y-2 w-full">
            <h3 className="font-medium text-gray-700">Cable Functions</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {getCableFunctions(cablesWithDiameters).map(({ function: func, network, color }) => (
                <div key={func} className="flex items-center gap-2 p-1 rounded hover:bg-gray-100">
                  <div 
                    className="w-4 h-4 rounded-full border border-gray-300" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-gray-600">
                    {func} ({network})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 relative flex justify-center items-center min-h-0">
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ 
              maxWidth: '100%',
              maxHeight: '100%'
            }}
            preserveAspectRatio="xMidYMid meet"
          />
          {tooltip.show && (
            <div
              className="absolute bg-white px-2 py-1 rounded shadow-lg text-sm pointer-events-none whitespace-pre-line"
              style={{
                left: tooltip.x + 15,
                top: tooltip.y - 15,
                transform: 'translate(40%, -200%)'
              }}
            >
              {tooltip.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 