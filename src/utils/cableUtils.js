const MinHeap = require('heap'); // Priority queue library

// Calculate how much new tray would be needed for this path
const calculateNewTraySections = (newPath, existingPaths, sections = new Map()) => {
  let score = 0;
  
  for (let i = 0; i < newPath.length - 1; i++) {
    const start = newPath[i];
    const end = newPath[i + 1];
    
    // Check if this segment follows an existing path in same network
    const followsExisting = Array.from(existingPaths.values()).some(path => 
      pathContainsSegment(path, start, end)
    );

    // Check if this segment follows a path from other networks
    const followsOtherNetwork = Array.from(sections.values()).some(section =>
      pathContainsSegment(section.points, start, end)
    );
    
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    
    if (followsExisting) {
      score += segmentLength * 0.2; // Much lower cost for following same network
    } else if (followsOtherNetwork) {
      score += segmentLength * 0.4; // Lower cost for following other network
    } else {
      score += segmentLength; // Full cost for new path
    }
  }
  
  return score;
};

// Helper function to check if a path contains a segment
const pathContainsSegment = (path, start, end) => {
  for (let i = 0; i < path.length - 1; i++) {
    const pathStart = path[i];
    const pathEnd = path[i + 1];
    
    if ((pathStart.x === start.x && pathStart.y === start.y &&
         pathEnd.x === end.x && pathEnd.y === end.y) ||
        (pathStart.x === end.x && pathStart.y === end.y &&
         pathEnd.x === start.x && pathEnd.y === start.y)) {
      return true;
    }
  }
  return false;
};

// Helper function to get a standardized key for a section
const getSectionKey = (points, networkType) => {
  // Ensure the points are sorted consistently to avoid duplicate keys
  const sortedPoints = [...points].sort((a, b) => 
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  // Create a base key from the points
  const baseKey = `${sortedPoints[0].x},${sortedPoints[0].y}-${sortedPoints[1].x},${sortedPoints[1].y}`;
  // Always prefix with network type to ensure separate sections for each network
  return networkType ? `${networkType}-${baseKey}` : baseKey;
};

// Helper function to get base section key without network type
const getBaseSectionKey = (points) => {
  const sortedPoints = [...points].sort((a, b) => 
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  return `${sortedPoints[0].x},${sortedPoints[0].y}-${sortedPoints[1].x},${sortedPoints[1].y}`;
};

// Helper function to merge sections
const mergeSections = (existingSection, newCable) => {
  // Only merge if they belong to the same network
  if (existingSection.function !== newCable.type) {
    return false;
  }

  // Add the new cable label or name to the set of cables in this section
  existingSection.cables.add(newCable.cableLabel || newCable.name);

  // Add detailed information about the new cable to the section
  existingSection.details.set(newCable.cableLabel || newCable.name, newCable);

  return true;
};


// Preprocess blocked grid
const preprocessBlockedGrid = (walls, perforations, gridSize) => {
  const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));

  // Mark walls as blocked
  walls.forEach(({ x, y }) => {
    grid[x][y] = true;
  });

  // Mark perforations as unblocked
  perforations.forEach(({ x, y }) => {
    grid[x][y] = false;
  });

  return grid;
};

// Helper function to get path cache key
const getPathCacheKey = (start, end) => {
  // Sort points to ensure consistent key regardless of direction
  const points = [
    { x: start.x, y: start.y },
    { x: end.x, y: end.y }
  ].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
  
  return `${points[0].x},${points[0].y}-${points[1].x},${points[1].y}`;
};

// Path cache to store precomputed paths
const pathCache = new Map();

// A* Algorithm with Min-Heap
const findPath = (start, end, isBlockedGrid, GRID_SIZE, existingPaths = new Map(), sections = new Map()) => {
  const queue = new MinHeap((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
  const visited = new Map();
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  const getDirection = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.abs(dx) > Math.abs(dy) ?
      (dx > 0 ? 'right' : 'left') :
      (dy > 0 ? 'down' : 'up');
  };

  const calculateStepCost = (current, nextPos) => {
    let cost = 1;
    const newDirection = getDirection(current, nextPos);
     if (current.direction && newDirection !== current.direction) cost += 3; // Turn penalty

    // Check if this step follows any existing path (same network)
    const followsExisting = Array.from(existingPaths.values()).some(path =>
      pathContainsSegment(path, current, nextPos)
    );

    // Check if this step follows any path from other networks
    const followsOtherNetwork = Array.from(sections.values()).some(section =>
      pathContainsSegment(section.points, current, nextPos)
    );

    // Apply stronger cost reductions
    if (followsExisting) {
      cost *= 0.2; // Much stronger bonus (80% reduction) for following same network
    } else if (followsOtherNetwork) {
      cost *= 0.4; // Stronger bonus (60% reduction) for following other networks
    }

    return cost;
  };

  queue.push({
    x: start.x,
    y: start.y,
    cost: 0,
    heuristic: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
    path: [],
    direction: null
  });

  while (!queue.empty()) {
    const current = queue.pop();
    const key = `${Math.floor(current.x)},${Math.floor(current.y)}`;

    if (visited.has(key) && visited.get(key) <= current.cost) continue;
    visited.set(key, current.cost);

    if (Math.abs(current.x - end.x) < 0.1 && Math.abs(current.y - end.y) < 0.1) {
      return [...current.path, { x: end.x, y: end.y }];
    }

    for (const [dx, dy] of dirs) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const nextKey = `${Math.floor(nextX)},${Math.floor(nextY)}`;

      if (nextX >= 0 && nextX < GRID_SIZE &&
          nextY >= 0 && nextY < GRID_SIZE &&
          !isBlockedGrid[Math.floor(nextX)][Math.floor(nextY)] &&
          (!visited.has(nextKey) || visited.get(nextKey) > current.cost)) {
        
        const nextPos = { x: nextX, y: nextY };
        const stepCost = calculateStepCost(current, nextPos);

        queue.push({
          x: nextX,
          y: nextY,
          cost: current.cost + stepCost,
          heuristic: Math.abs(end.x - nextX) + Math.abs(end.y - nextY),
          path: [...current.path, { x: current.x, y: current.y }],
          direction: getDirection(current, nextPos)
        });
      }
    }
  }

  return null;
};

// Find minimal network with path caching
const findMinimalNetwork = (machines, networkCables, walls, perforations, GRID_SIZE, sections = new Map()) => {
  const isBlockedGrid = preprocessBlockedGrid(walls, perforations, GRID_SIZE);
  
  // Group cables by their endpoints (regardless of direction)
  const endpointGroups = new Map();
  networkCables.forEach(cable => {
    const sourcePos = machines[cable.source];
    const targetPos = machines[cable.target];
    if (!sourcePos || !targetPos) return;
    
    const key = getPathCacheKey(sourcePos, targetPos);
    if (!endpointGroups.has(key)) {
      endpointGroups.set(key, []);
    }
    endpointGroups.get(key).push(cable);
  });

  const endpoints = new Set();
  networkCables.forEach(cable => {
    endpoints.add(cable.source);
    endpoints.add(cable.target);
  });

  const points = Array.from(endpoints).map(name => ({
    name,
    pos: machines[name]
  })).filter(p => p.pos);

  if (points.length < 2) return new Map();

  const connectedPoints = new Set([points[0].name]);
  const paths = new Map();

  while (connectedPoints.size < points.length) {
    let bestPath = null;
    let bestScore = Infinity;
    let bestConnection = null;

    for (const connected of connectedPoints) {
      const connectedPos = machines[connected];
      
      for (const point of points) {
        if (connectedPoints.has(point.name)) continue;

        const cacheKey = getPathCacheKey(connectedPos, point.pos);
        let path = pathCache.get(cacheKey);

        if (!path) {
          path = findPath(connectedPos, point.pos, isBlockedGrid, GRID_SIZE, paths, sections);
          if (path) {
            pathCache.set(cacheKey, path);
            // Also cache the reverse path
            const reversePath = [...path].reverse();
            const reverseKey = getPathCacheKey(point.pos, connectedPos);
            if (reverseKey !== cacheKey) {
              pathCache.set(reverseKey, reversePath);
            }
          }
        }

        if (path) {
          const score = calculateNewTraySections(path, paths, sections);
          if (score < bestScore) {
            bestScore = score;
            bestPath = path;
            bestConnection = {
              from: connected,
              to: point.name
            };
          }
        }
      }
    }

    if (bestPath && bestConnection) {
      connectedPoints.add(bestConnection.to);
      const pathKey = getPathCacheKey(
        machines[bestConnection.from],
        machines[bestConnection.to]
      );
      paths.set(pathKey, bestPath);
    } else {
      break;
    }
  }

  return paths;
};

// Helper function to compare cable sets
const haveSameCables = (cables1, cables2, details1, details2) => {
  if (!cables1 || !cables2) return false;
  if (cables1.size !== cables2.size) return false;

  // First check if they belong to the same network
  const getNetwork = (details) => {
    const firstCable = details.values().next().value;
    return firstCable?.type || 'unknown';
  };
  
  const network1 = getNetwork(details1);
  const network2 = getNetwork(details2);
  
  // Never combine different networks
  if (network1 !== network2) {
    return false;
  }

  // For cables in the same network, check if they're exactly the same set
  const cables1Array = Array.from(cables1);
  const cables2Array = Array.from(cables2);
  
  return cables1Array.length === cables2Array.length &&
         cables1Array.every(cable => cables2Array.includes(cable));
};

export const optimizeNetworkPaths = (cables = [], machines = {}, walls = [], perforations = [], gridSize = 100) => {
  if (!Array.isArray(cables) || cables.length === 0) {
    return { sections: new Map(), cableRoutes: new Map() };
  }

  const sections = new Map();
  const cableRoutes = new Map();
  const isBlockedGrid = preprocessBlockedGrid(walls, perforations, gridSize);
  const allPaths = new Map();

  // First, group cables by network type
  const networkGroups = cables.reduce((groups, cable) => {
    const networkType = cable.type || 'unknown';
    if (!groups[networkType]) groups[networkType] = [];
    groups[networkType].push(cable);
    return groups;
  }, {});

  // Helper to check if a path exists in any network
  const pathExistsInAnyNetwork = (start, end) => {
    // Get the base key without network type
    const baseKey = getBaseSectionKey([start, end]);
    // Check if any network has a section with this base key
    return Array.from(sections.keys()).some(key => {
      const [networkType, sectionKey] = key.split('-');
      return sectionKey === baseKey;
    });
  };

  // Modified calculateStepCost to consider all existing paths
  const calculateStepCost = (current, nextPos, existingPaths) => {
    let cost = 1;
    
    // Check if this step follows any existing path (same network)
    const followsSameNetwork = Array.from(existingPaths.values()).some(path =>
      pathContainsSegment(path, current, nextPos)
    );

    // Check if this step follows any path from other networks
    const followsOtherNetwork = pathExistsInAnyNetwork(current, nextPos);

    // Apply cost reductions
    if (followsSameNetwork) {
      cost *= 0.2; // Significant bonus for following same network
    } else if (followsOtherNetwork) {
      cost *= 0.4; // Moderate bonus for following other networks
    }

    return cost;
  };

  // Process each network type
  Object.entries(networkGroups).forEach(([networkType, networkCables]) => {
    // Group cables by their endpoints
    const endpointGroups = new Map();
    networkCables.forEach(cable => {
      const sourcePos = machines[cable.source];
      const targetPos = machines[cable.target];
      if (!sourcePos || !targetPos) return;
      
      const key = getPathCacheKey(sourcePos, targetPos);
      if (!endpointGroups.has(key)) {
        endpointGroups.set(key, []);
      }
      endpointGroups.get(key).push(cable);
    });

    // Get all unique machine positions for this network
    const networkMachines = new Set();
    networkCables.forEach(cable => {
      networkMachines.add(cable.source);
      networkMachines.add(cable.target);
    });

    // Create paths for this network
    const minimalNetwork = findMinimalNetwork(
      Object.fromEntries(
        Array.from(networkMachines).map(name => [name, machines[name]])
      ),
      networkCables,
      walls,
      perforations,
      gridSize,
      sections
    );

    // Store paths for this network
    for (const [key, path] of minimalNetwork.entries()) {
      allPaths.set(`${networkType}-${key}`, path);
    }

    // Route individual cables
    for (const [groupKey, groupCables] of endpointGroups) {
      if (groupCables.length === 0) continue;

      const firstCable = groupCables[0];
      const sourcePos = machines[firstCable.source];
      const targetPos = machines[firstCable.target];

      if (!sourcePos || !targetPos) {
        console.warn('Missing machine position:', { firstCable, machines });
        continue;
      }

      const path = findPath(sourcePos, targetPos, isBlockedGrid, gridSize, minimalNetwork, sections);

      if (path) {
        // Add all cables in this group to the same path
        groupCables.forEach(cable => {
          cableRoutes.set(cable.cableLabel || cable.name, path);
        });

        // Create sections for each segment of the path
        for (let i = 0; i < path.length - 1; i++) {
          const start = path[i];
          const end = path[i + 1];
          const sectionKey = getSectionKey([start, end], networkType);

          if (sections.has(sectionKey)) {
            // Add all cables to existing section of the same network
            groupCables.forEach(cable => {
              mergeSections(sections.get(sectionKey), cable);
            });
          } else {
            // Create new section for this network
            sections.set(sectionKey, {
              points: [start, end],
              cables: new Set(groupCables.map(c => c.cableLabel || c.name)),
              function: networkType,
              color: firstCable.color,
              type: i === 0 ? 'source' : 
                    i === path.length - 2 ? 'target' : 'trunk',
              details: new Map(groupCables.map(c => [c.cableLabel || c.name, c]))
            });
          }
        }
      }
    }
  });

  // Filter out any sections with 0 cables
  const validSections = new Map();
  for (const [key, section] of sections.entries()) {
    if (section.cables.size > 0) {
      validSections.set(key, section);
    }
  }

  pathCache.clear();
  return { sections: validSections, cableRoutes };
};
