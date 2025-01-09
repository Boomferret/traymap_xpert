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

const generateDistinctShades = (baseColor, numberOfShades) => {
  const hex2HSL = (hex) => {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [h * 360, s * 100, l * 100];
  };

  const HSL2hex = (h, s, l) => {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    const toHex = x => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const [h, s, l] = hex2HSL(baseColor);
  
  // Generate more distinct shades by varying hue, saturation, and lightness
  return Array.from({ length: numberOfShades }, (_, i) => {
    // Allow hue to vary slightly (±15 degrees)
    const hueOffset = (i - numberOfShades/2) * (30 / numberOfShades);
    const newH = (h + hueOffset + 360) % 360;
    
    // Create more dramatic variations in saturation and lightness
    const newS = Math.min(100, Math.max(40, s + (i - numberOfShades/2) * (60 / numberOfShades)));
    const newL = Math.min(80, Math.max(30, l + (i - numberOfShades/2) * (50 / numberOfShades)));
    
    return HSL2hex(newH, newS, newL);
  });
};

export const CableTraySimulation = ({ cables, networks, isOpen, onClose }) => {
  const svgRef = useRef(null);
  const [cablesWithDiameters, setCablesWithDiameters] = useState([]);
  const [hasPrompted, setHasPrompted] = useState(false);
  const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
  const [selectedTraySize, setSelectedTraySize] = useState(TRAY_SIZES[27]); // Default to 300×75mm
  const [fillMetrics, setFillMetrics] = useState({ heightPercent: 0, areaPercent: 0 });
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(2); // Default scale

  // Constants for visualization
  const MM_TO_PX = 2; // Scale factor to convert mm to pixels
  const SVG_PADDING = 100; // Padding around the tray
  const MIN_SVG_WIDTH = 800;
  const MIN_SVG_HEIGHT = 400;

  // Function to get color based on network and function
  const getColorForCable = (cable) => {
    if (cable.color) return cable.color;
    
    // Find the network this cable belongs to
    const network = networks.find(n => n.functions.includes(cable.cableFunction || cable.function));
    if (!network) return '#999999';
    
    // Get all functions for this network
    const networkFunctions = network.functions;
    // Find the index of this cable's function in the network's functions
    const functionIndex = networkFunctions.indexOf(cable.cableFunction || cable.function);
    
    // Generate shades based on the network's base color
    const shades = generateDistinctShades(network.color, networkFunctions.length || 1);
    
    // Return the appropriate shade for this function
    return shades[functionIndex] || network.color;
  };

  // Group cables by function for the legend
  const getCableFunctions = (cables) => {
    const networkMap = new Map();
    
    // First, create network groups with their functions
    networks.forEach(network => {
      networkMap.set(network.name, {
        networkName: network.name,
        baseColor: network.color,
        functions: new Map()
      });
    });
    
    // Then process each cable
    cables.forEach(cable => {
      const network = networks.find(n => n.functions.includes(cable.cableFunction || cable.function));
      if (!network) return;
      
      const networkGroup = networkMap.get(network.name);
      const functionKey = cable.cableFunction || cable.function;
      
      if (!networkGroup.functions.has(functionKey)) {
        // Generate color based on function's position in network's function list
        const functionIndex = network.functions.indexOf(functionKey);
        const shades = generateDistinctShades(network.color, network.functions.length);
        const color = shades[functionIndex];
        
        networkGroup.functions.set(functionKey, {
          function: functionKey,
          color: color
        });
      }
    });
    
    return Array.from(networkMap.values())
      .filter(group => group.functions.size > 0); // Only return networks that have cables
  };

  // Calculate SVG dimensions based on tray size
  const getSVGDimensions = (traySize) => {
    // Target size we want the tray to occupy (leaving room for padding and labels)
    const TARGET_WIDTH = MIN_SVG_WIDTH - (SVG_PADDING * 3);
    const TARGET_HEIGHT = MIN_SVG_HEIGHT - (SVG_PADDING * 3);
    
    // Calculate scale factors for width and height
    // Increase the target size by multiplying by 1.5 to make everything bigger
    const widthScale = (TARGET_WIDTH * 1.5) / traySize.width;
    const heightScale = (TARGET_HEIGHT * 1.5) / traySize.height;
    
    // Use the smaller scale to maintain aspect ratio
    const newScale = Math.min(widthScale, heightScale);
    
    // Set a higher minimum scale (3 instead of 1)
    const scale = Math.max(newScale, 3);
    
    const requiredWidth = (traySize.width * scale) + (SVG_PADDING * 2);
    const requiredHeight = (traySize.height * scale) + (SVG_PADDING * 2);
    
    return {
      width: Math.max(MIN_SVG_WIDTH, requiredWidth),
      height: Math.max(MIN_SVG_HEIGHT, requiredHeight),
      scale: scale
    };
  };

  // Update dimensions when tray size changes
  useEffect(() => {
    const dimensions = getSVGDimensions(selectedTraySize);
    setSvgDimensions({
      width: dimensions.width,
      height: dimensions.height
    });
    setScale(dimensions.scale);
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
    const trayBottom = trayY + trayHeight * scale;
    
    // Calculate used height from the bottom of the tray to the highest cable point
    const usedHeight = trayBottom - highestPoint;
    // Calculate height percentage relative to total tray height
    const heightPercent = (usedHeight / (trayHeight * scale)) * 100;

    // Calculate total area of cables vs tray area (in mm²)
    const totalCableArea = nodes.reduce((sum, n) => sum + Math.PI * Math.pow((n.diameter / 2), 2), 0);
    const trayArea = trayWidth * trayHeight;
    const areaPercent = (totalCableArea / trayArea) * 100;

    return {
      heightPercent: Math.max(0, Math.min(Math.round(heightPercent), 100)), // Ensure value is between 0 and 100
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
    const trayX = (SVG_WIDTH - selectedTraySize.width * scale) / 2;
    const trayY = (SVG_HEIGHT - selectedTraySize.height * scale) / 2;
    
    // Create nodes for each cable with the new scale
    const nodes = cablesWithDiameters.flatMap(cable => 
      Array.from({ length: cable.count }, () => ({
        x: trayX + Math.random() * (selectedTraySize.width * scale),
        y: trayY + Math.random() * 20,
        radius: cable.diameter * scale / 2,
        diameter: cable.diameter,
        label: cable.cableLabel,
        function: cable.cableFunction || cable.function || 'Unknown',
        network: cable.network || 'Unknown',
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
      .attr("width", selectedTraySize.width * scale)
      .attr("height", selectedTraySize.height * scale)
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
      .attr("y1", trayY + selectedTraySize.height * scale + dimensionOffset)
      .attr("x2", trayX + selectedTraySize.width * scale)
      .attr("y2", trayY + selectedTraySize.height * scale + dimensionOffset)
      .attr("marker-start", "url(#arrow)")
      .attr("marker-end", "url(#arrow)");

    // Vertical extension lines
    widthDimensionGroup.append("line")
      .attr("x1", trayX)
      .attr("y1", trayY + selectedTraySize.height * scale)
      .attr("x2", trayX)
      .attr("y2", trayY + selectedTraySize.height * scale + dimensionOffset);

    widthDimensionGroup.append("line")
      .attr("x1", trayX + selectedTraySize.width * scale)
      .attr("y1", trayY + selectedTraySize.height * scale)
      .attr("x2", trayX + selectedTraySize.width * scale)
      .attr("y2", trayY + selectedTraySize.height * scale + dimensionOffset);

    // Width dimension text
    widthDimensionGroup.append("text")
      .attr("x", trayX + (selectedTraySize.width * scale) / 2)
      .attr("y", trayY + selectedTraySize.height * scale + dimensionOffset - 5)
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
      .attr("y2", trayY + selectedTraySize.height * scale)
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
      .attr("y1", trayY + selectedTraySize.height * scale)
      .attr("x2", trayX)
      .attr("y2", trayY + selectedTraySize.height * scale);

    // Height dimension text
    heightDimensionGroup.append("text")
      .attr("x", trayX - dimensionOffset - 5)
      .attr("y", trayY + (selectedTraySize.height * scale) / 2)
      .attr("text-anchor", "middle")
      .attr("fill", dimensionColor)
      .attr("font-size", "12px")
      .attr("transform", `rotate(-90, ${trayX - dimensionOffset - 5}, ${trayY + (selectedTraySize.height * scale) / 2})`)
      .text(`${selectedTraySize.height}mm`);

    // Add measurement axes on right and top sides
    const axisGroup = svg.append("g")
      .attr("class", "measurement-axes")
      .style("stroke", dimensionColor)
      .style("stroke-width", 1);

    // Right side axis (height)
    const rightAxisX = trayX + selectedTraySize.width * scale + dimensionOffset;
    const heightTicks = Math.floor(selectedTraySize.height / 25);
    
    for (let i = 0; i <= heightTicks; i++) {
      const yPos = trayY + selectedTraySize.height * scale - (i * 25 * scale); // Reversed Y position
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
      const xPos = trayX + i * 25 * scale;
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
      .attr("x2", trayX + selectedTraySize.width * scale)
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
          content: `${d.label}\nØ ${d.diameter}mm\nFunction: ${d.function}\nNetwork: ${d.network}`,
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
          const rightWall = trayX + selectedTraySize.width * scale - d.radius;
          const bottomWall = trayY + selectedTraySize.height * scale - d.radius;
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
  }, [isOpen, cablesWithDiameters, selectedTraySize, svgDimensions, scale]);

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
            <div className="space-y-4">
              {getCableFunctions(cablesWithDiameters).map((networkGroup) => (
                <div key={networkGroup.networkName} className="space-y-1">
                  <div className="font-medium text-sm text-gray-700 pb-1 border-b">
                    {networkGroup.networkName}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Array.from(networkGroup.functions.values()).map(({ function: func, color }) => (
                      <div 
                        key={func} 
                        className="flex items-center gap-2 p-1 rounded hover:bg-gray-100"
                      >
                        <div 
                          className="w-4 h-4 rounded-full border border-gray-300" 
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-gray-600">
                          {func}
                        </span>
                      </div>
                    ))}
                  </div>
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