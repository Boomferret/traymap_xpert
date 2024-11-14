export const generateRandomCables = (machines) => {
  const cables = [];
  const machineNames = Object.keys(machines);
  console.log('Generating cables for machines:', machineNames);

  if (machineNames.length < 2) return cables;
  
  // Generate 15 control cables
  for (let i = 1; i <= 15; i++) {
    const source = machineNames[Math.floor(Math.random() * machineNames.length)];
    let target;
    do {
      target = machineNames[Math.floor(Math.random() * machineNames.length)];
    } while (target === source);

    cables.push({
      id: `control-${i}`,
      name: `C${i}`,
      cableLabel: `C${i}`,
      source,
      target,
      type: 'control',
      color: '#2563eb' // Control network color
    });
  }

  // Generate 5 power cables
  for (let i = 1; i <= 5; i++) {
    const source = machineNames[Math.floor(Math.random() * machineNames.length)];
    let target;
    do {
      target = machineNames[Math.floor(Math.random() * machineNames.length)];
    } while (target === source);

    cables.push({
      id: `power-${i}`,
      name: `P${i}`,
      cableLabel: `P${i}`,
      source,
      target,
      type: 'power',
      color: '#ef4444' // Power network color
    });
  }

  console.log('Generated cables:', cables);
  return cables;
};

const findPath = (start, end, walls, perforations, GRID_SIZE) => {
  // Convert machine positions to grid coordinates (center of cells)
  const startPoint = {
    x: start.x + 0.5,
    y: start.y + 0.5
  };
  const endPoint = {
    x: end.x + 0.5,
    y: end.y + 0.5
  };

  const queue = [[{ 
    x: startPoint.x,
    y: startPoint.y,
    path: [] 
  }]];
  const visited = new Set();
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  // Helper function to check if a position has a wall and no perforation
  const isBlocked = (x, y) => {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    const hasWall = walls.some(wall => wall.x === gridX && wall.y === gridY);
    const hasPerforation = perforations.some(perf => perf.x === gridX && perf.y === gridY);
    return hasWall && !hasPerforation;
  };

  const isAtDestination = (current) => {
    const dx = Math.abs(current.x - endPoint.x);
    const dy = Math.abs(current.y - endPoint.y);
    return dx < 0.1 && dy < 0.1;
  };

  while (queue.length > 0) {
    const current = queue.shift()[0];
    const key = `${Math.floor(current.x)},${Math.floor(current.y)}`;

    if (isAtDestination(current)) {
      return [...current.path, current];
    }

    if (visited.has(key)) continue;
    visited.add(key);

    for (const [dx, dy] of dirs) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;

      if (nextX >= 0 && nextX < GRID_SIZE && 
          nextY >= 0 && nextY < GRID_SIZE && 
          !visited.has(`${Math.floor(nextX)},${Math.floor(nextY)}`) &&
          !isBlocked(nextX, nextY)) {
        
        const next = {
          x: nextX,
          y: nextY,
          path: [...current.path, current]
        };
        queue.push([next]);
      }
    }
  }
  return null;
};

// Helper function to get a standardized key for a section
const getSectionKey = (points) => {
  const sortedPoints = [...points].sort((a, b) => 
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  return `${sortedPoints[0].x},${sortedPoints[0].y}-${sortedPoints[1].x},${sortedPoints[1].y}`;
};

// Helper function to merge two sections
const mergeSections = (existingSection, newCable) => {
  existingSection.cables.add(newCable.cableLabel || newCable.name);
  existingSection.details.set(newCable.cableLabel || newCable.name, newCable);
  return existingSection;
};

export const optimizeNetworkPaths = (cables = [], machines = {}, walls = [], perforations = [], gridSize = 50) => {
  if (!Array.isArray(cables) || cables.length === 0) {
    return { sections: new Map(), cableRoutes: new Map() };
  }

  const sections = new Map();
  const cableRoutes = new Map();

  // Group cables by their type (network)
  const networkGroups = cables.reduce((groups, cable) => {
    const networkType = cable.type || 'unknown';
    if (!groups[networkType]) {
      groups[networkType] = [];
    }
    groups[networkType].push(cable);
    return groups;
  }, {});

  // Process each network type
  Object.entries(networkGroups).forEach(([networkType, networkCables]) => {
    // Process each cable in the network
    networkCables.forEach(cable => {
      const sourcePos = machines[cable.source];
      const targetPos = machines[cable.target];

      if (!sourcePos || !targetPos) {
        console.warn('Missing machine position:', { cable, machines });
        return;
      }

      const path = findPath(sourcePos, targetPos, walls, perforations, gridSize);
      
      if (path) {
        cableRoutes.set(cable.cableLabel || cable.name, path);

        // Create sections from path segments
        for (let i = 0; i < path.length - 1; i++) {
          const start = path[i];
          const end = path[i + 1];
          const sectionKey = getSectionKey([start, end]);

          if (sections.has(sectionKey)) {
            // Add cable to existing section
            const existingSection = sections.get(sectionKey);
            mergeSections(existingSection, cable);
          } else {
            // Create new section
            sections.set(sectionKey, {
              points: [start, end],
              cables: new Set([cable.cableLabel || cable.name]),
              function: networkType,
              color: cable.color,
              type: i === 0 ? 'source' : 
                    i === path.length - 2 ? 'target' : 'trunk',
              details: new Map([[cable.cableLabel || cable.name, cable]])
            });
          }
        }
      }
    });
  });

  return { sections, cableRoutes };
};