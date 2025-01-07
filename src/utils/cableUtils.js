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
      score += segmentLength * 0.01; // Almost free to reuse existing path
    } else if (followsOtherNetwork) {
      score += segmentLength * 0.1; // Very low cost for following other network
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

// Helper function to determine direction
const getDirection = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Enforce exact horizontal or vertical direction only
  if (Math.abs(dx) > 0.1) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dy) > 0.1) return dy > 0 ? 'down' : 'up';
  return from.direction || 'right';
};

// Helper to find potential merge points along existing paths
const findPotentialMergePoints = (start, end, existingPaths, sections) => {
  const mergePoints = [];
  const targetVector = {
    x: end.x - start.x,
    y: end.y - start.y
  };

  // Check all existing paths for potential merge segments
  const checkPath = (path) => {
    for (let i = 0; i < path.length - 1; i++) {
      const pathStart = path[i];
      const pathEnd = path[i + 1];
      
      // Only consider orthogonal segments
      if (!isOrthogonalSegment(pathStart, pathEnd)) continue;

      // Calculate distance from our start point to this segment
      const distanceFromStart = pointToLineDistance(start, pathStart, pathEnd);
      const distanceFromEnd = pointToLineDistance(end, pathStart, pathEnd);
      
      // If either point is close to this segment, consider it for merging
      if (distanceFromStart < 5 || distanceFromEnd < 5) {
        const nearestStartPoint = nearestPointOnLine(start, pathStart, pathEnd);
        const nearestEndPoint = nearestPointOnLine(end, pathStart, pathEnd);
        
        mergePoints.push({
          pathSegment: { start: pathStart, end: pathEnd },
          nearestStartPoint,
          nearestEndPoint,
          distanceFromStart,
          distanceFromEnd,
          isHorizontal: Math.abs(pathStart.y - pathEnd.y) < 0.1
        });
      }
    }
  };

  // Check existing paths first
  existingPaths.forEach(path => checkPath(path));
  
  // Then check sections
  sections.forEach(section => checkPath(section.points));

  return mergePoints;
};

// Find path that maximizes reuse of existing paths
const findPath = (start, end, isBlockedGrid, GRID_SIZE, existingPaths = new Map(), sections = new Map()) => {
  // Calculate Manhattan distance between two points
  const manhattanDistance = (p1, p2) => 
    Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);

  // First collect all existing path segments
  const existingSegments = [];
  
  // Add segments from sections with their cable count
  sections.forEach(section => {
    for (let i = 0; i < section.points.length - 1; i++) {
      existingSegments.push({
        start: section.points[i],
        end: section.points[i + 1],
        cableCount: section.cables.size,
        points: section.points,
        type: 'section'
      });
    }
  });

  // Sort segments by cable count (descending)
  existingSegments.sort((a, b) => b.cableCount - a.cableCount);

  let bestPath = null;
  let bestScore = Infinity;

  // Try direct path as baseline
  const directPath = findOrthogonalPath(start, end, isBlockedGrid, GRID_SIZE);
  if (directPath) {
    bestPath = directPath;
    bestScore = calculateNewTraySections(directPath, existingPaths, sections);
  }

  // Find potential branch points on existing paths
  const branchCandidates = [];
  
  // Helper to check if a point is between start and end (with some margin)
  const isPointBetween = (point, start, end, margin = 1.2) => {
    const directDist = manhattanDistance(start, end);
    const throughPoint = manhattanDistance(start, point) + manhattanDistance(point, end);
    return throughPoint <= directDist * margin;
  };

  // For each existing segment, find potential branch points
  for (const segment of existingSegments) {
    // Skip non-orthogonal segments
    if (!isOrthogonalSegment(segment.start, segment.end)) continue;

    const isVertical = Math.abs(segment.start.x - segment.end.x) < 0.1;
    
    if (isVertical) {
      const x = segment.start.x;
      const minY = Math.min(segment.start.y, segment.end.y);
      const maxY = Math.max(segment.start.y, segment.end.y);
      
      // Check if this vertical segment is potentially useful
      const startProj = { x, y: Math.max(minY, Math.min(maxY, start.y)) };
      const endProj = { x, y: Math.max(minY, Math.min(maxY, end.y)) };
      
      if (isPointBetween(startProj, start, end)) {
        branchCandidates.push({
          point: startProj,
          segment,
          distanceFromStart: manhattanDistance(start, startProj),
          type: 'start'
        });
      }
      
      if (isPointBetween(endProj, start, end)) {
        branchCandidates.push({
          point: endProj,
          segment,
          distanceFromEnd: manhattanDistance(end, endProj),
          type: 'end'
        });
      }
    } else {
      const y = segment.start.y;
      const minX = Math.min(segment.start.x, segment.end.x);
      const maxX = Math.max(segment.start.x, segment.end.x);
      
      // Check if this horizontal segment is potentially useful
      const startProj = { x: Math.max(minX, Math.min(maxX, start.x)), y };
      const endProj = { x: Math.max(minX, Math.min(maxX, end.x)), y };
      
      if (isPointBetween(startProj, start, end)) {
        branchCandidates.push({
          point: startProj,
          segment,
          distanceFromStart: manhattanDistance(start, startProj),
          type: 'start'
        });
      }
      
      if (isPointBetween(endProj, start, end)) {
        branchCandidates.push({
          point: endProj,
          segment,
          distanceFromEnd: manhattanDistance(end, endProj),
          type: 'end'
        });
      }
    }
  }

  // Sort branch candidates by their potential value
  branchCandidates.sort((a, b) => {
    const scoreA = (a.distanceFromStart || a.distanceFromEnd) / (a.segment.cableCount + 1);
    const scoreB = (b.distanceFromStart || b.distanceFromEnd) / (b.segment.cableCount + 1);
    return scoreA - scoreB;
  });

  // Try each promising branch candidate
  for (const candidate of branchCandidates) {
    let path;
    
    if (candidate.type === 'start') {
      // Try path: start -> branch -> end
      const pathToBranch = findOrthogonalPath(start, candidate.point, isBlockedGrid, GRID_SIZE);
      if (!pathToBranch) continue;

      const pathFromBranch = findOrthogonalPath(candidate.point, end, isBlockedGrid, GRID_SIZE);
      if (!pathFromBranch) continue;

      path = [...pathToBranch.slice(0, -1), ...pathFromBranch];
    } else {
      // Try path: start -> branch -> end
      const pathToBranch = findOrthogonalPath(start, candidate.point, isBlockedGrid, GRID_SIZE);
      if (!pathToBranch) continue;

      const pathFromBranch = findOrthogonalPath(candidate.point, end, isBlockedGrid, GRID_SIZE);
      if (!pathFromBranch) continue;

      path = [...pathToBranch.slice(0, -1), ...pathFromBranch];
    }

    // Calculate score based on new tray needed and cable count
    const score = calculateNewTraySections(path, existingPaths, sections) / 
                 (candidate.segment.cableCount + 1);

    if (score < bestScore) {
      bestScore = score;
      bestPath = path;
    }
  }

  // If we found a good path, return it
  if (bestPath) {
    return bestPath;
  }

  // Otherwise, return the direct path
  return directPath;
};

// Helper to calculate how much new tray would be needed
const calculateNewTrayNeeded = (path, existingSegments) => {
  let newTrayLength = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    let segmentExists = false;

    // Check if this segment exists in any existing path
    for (const segment of existingSegments) {
      if (segmentOverlaps(start, end, segment.start, segment.end)) {
        segmentExists = true;
        break;
      }
    }

    if (!segmentExists) {
      newTrayLength += Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    }
  }

  return newTrayLength;
};

// Helper function to find nearest point on a line segment
const nearestPointOnLine = (point, lineStart, lineEnd) => {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let x, y;
  if (param < 0) {
    x = lineStart.x;
    y = lineStart.y;
  } else if (param > 1) {
    x = lineEnd.x;
    y = lineEnd.y;
  } else {
    x = lineStart.x + param * C;
    y = lineStart.y + param * D;
  }

  return { x, y };
};

// Helper to strictly check if a segment is orthogonal
const isOrthogonalSegment = (start, end) => {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return (dx < 0.1 && dy > 0.1) || (dx > 0.1 && dy < 0.1);
};

// Adjust calculateStepCost to heavily favor existing paths
const calculateStepCost = (current, nextPos, existingPaths, sections) => {
  if (!isOrthogonalSegment(current, nextPos)) {
    return Infinity;
  }

  let cost = 1;

  for (const path of existingPaths.values()) {
    if (pathContainsSegment(path, current, nextPos)) {
      return 0.01; // Almost free to reuse existing path
    }
  }
  
  for (const section of sections.values()) {
    if (pathContainsSegment(section.points, current, nextPos)) {
      return 0.1; // Very low cost for reusing other network path
    }
  }

  let minDistance = Infinity;
  let closestPath = null;

  for (const path of existingPaths.values()) {
    for (let i = 0; i < path.length - 1; i++) {
      const pathStart = path[i];
      const pathEnd = path[i + 1];
      
      if (!isOrthogonalSegment(pathStart, pathEnd)) continue;
      
      const distance = pointToLineDistance(nextPos, pathStart, pathEnd);
      if (distance < minDistance) {
        minDistance = distance;
        closestPath = { start: pathStart, end: pathEnd };
      }
    }
  }

  if (closestPath) {
    const isParallel = isOrthogonalSegment(current, nextPos) &&
                      isOrthogonalSegment(closestPath.start, closestPath.end) &&
                      ((Math.abs(nextPos.x - current.x) < 0.1 && Math.abs(closestPath.end.x - closestPath.start.x) < 0.1) ||
                       (Math.abs(nextPos.y - current.y) < 0.1 && Math.abs(closestPath.end.y - closestPath.start.y) < 0.1));

    const currentDist = pointToLineDistance(current, closestPath.start, closestPath.end);
    const nextDist = pointToLineDistance(nextPos, closestPath.start, closestPath.end);
    const isMovingTowardsPath = nextDist < currentDist;

    if (minDistance < 3) {
      if (isParallel) {
        cost *= minDistance < 1 ? 0.2 : 8.0;
      } else if (isMovingTowardsPath) {
        cost *= 0.1;
      } else {
        cost *= 5.0;
      }
    } else {
      cost *= (1 + Math.pow(minDistance / 3, 2));
    }
  }

  const newDirection = getDirection(current, nextPos);
  if (current.direction && newDirection !== current.direction) {
    cost *= 2.5;
  }
  
  return cost;
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

// Find direct orthogonal path between two points
const findOrthogonalPath = (start, end, isBlockedGrid, GRID_SIZE) => {
  const queue = new MinHeap((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
  const visited = new Map();
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  queue.push({
    pos: { x: start.x, y: start.y },
    cost: 0,
    heuristic: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
    path: [],
    direction: null
  });

  while (!queue.empty()) {
    const current = queue.pop();
    const key = `${Math.floor(current.pos.x)},${Math.floor(current.pos.y)}`;

    if (visited.has(key) && visited.get(key) <= current.cost) continue;
    visited.set(key, current.cost);

    if (Math.abs(current.pos.x - end.x) < 0.1 && Math.abs(current.pos.y - end.y) < 0.1) {
      return [...current.path, current.pos, end];
    }

    for (const [dx, dy] of dirs) {
      const nextX = current.pos.x + dx;
      const nextY = current.pos.y + dy;

      if (nextX >= 0 && nextX < GRID_SIZE &&
          nextY >= 0 && nextY < GRID_SIZE &&
          !isBlockedGrid[Math.floor(nextX)][Math.floor(nextY)]) {
        
        const nextPos = { x: nextX, y: nextY };
        
        // Ensure movement is orthogonal
        if (!isOrthogonalSegment(current.pos, nextPos)) continue;

        // Calculate turn cost
        const newDirection = getDirection(current.pos, nextPos);
        const turnCost = current.direction && newDirection !== current.direction ? 2 : 0;

        // Prefer paths that move towards the target
        const progressCost = Math.abs(end.x - nextX) + Math.abs(end.y - nextY) <
                           Math.abs(end.x - current.pos.x) + Math.abs(end.y - current.pos.y) ? 0 : 0.1;

        queue.push({
          pos: nextPos,
          cost: current.cost + 1 + turnCost + progressCost,
          heuristic: Math.abs(end.x - nextX) + Math.abs(end.y - nextY),
          path: [...current.path, current.pos],
          direction: newDirection
        });
      }
    }
  }

  return null;
};

// Helper function to calculate point to line distance
const pointToLineDistance = (point, lineStart, lineEnd) => {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy);
};

// Helper to get path along a segment
const getPathAlongSegment = (start, end, segment) => {
  const path = [];
  
  // If segment is horizontal
  if (Math.abs(segment.start.y - segment.end.y) < 0.1) {
    const y = segment.start.y;
    const minX = Math.min(segment.start.x, segment.end.x);
    const maxX = Math.max(segment.start.x, segment.end.x);
    
    // Get start and end x-coordinates within segment bounds
    const startX = Math.max(minX, Math.min(maxX, start.x));
    const endX = Math.max(minX, Math.min(maxX, end.x));
    
    // Generate path points
    const step = Math.sign(endX - startX);
    for (let x = startX; Math.abs(x - endX) > 0.1; x += step) {
      path.push({ x, y });
    }
    path.push({ x: endX, y });
  }
  // If segment is vertical
  else if (Math.abs(segment.start.x - segment.end.x) < 0.1) {
    const x = segment.start.x;
    const minY = Math.min(segment.start.y, segment.end.y);
    const maxY = Math.max(segment.start.y, segment.end.y);
    
    // Get start and end y-coordinates within segment bounds
    const startY = Math.max(minY, Math.min(maxY, start.y));
    const endY = Math.max(minY, Math.min(maxY, end.y));
    
    // Generate path points
    const step = Math.sign(endY - startY);
    for (let y = startY; Math.abs(y - endY) > 0.1; y += step) {
      path.push({ x, y });
    }
    path.push({ x, y: endY });
  }
  
  return path;
};

// Modified section creation function
const createSectionsFromSegment = (start, end, cables, networkType, sections, firstCable, machines) => {
  // First, check if this path intersects with any existing paths
  const intersections = [];
  
  for (const [key, section] of sections.entries()) {
    // Only consider sections from same network
    if (!key.startsWith(networkType + '-')) continue;

    for (let i = 0; i < section.points.length - 1; i++) {
      const secStart = section.points[i];
      const secEnd = section.points[i + 1];
      
      // Check for T-junction intersections
      if (isOrthogonalSegment(start, end) && isOrthogonalSegment(secStart, secEnd)) {
        const isVertical = Math.abs(start.x - end.x) < 0.1;
        const isSecVertical = Math.abs(secStart.x - secEnd.x) < 0.1;
        
        if (isVertical !== isSecVertical) { // Perpendicular segments
          const vertSeg = isVertical ? {start, end} : {start: secStart, end: secEnd};
          const horizSeg = isVertical ? {start: secStart, end: secEnd} : {start, end};
          
          // Check if they intersect
          const vertX = vertSeg.start.x;
          const horizY = horizSeg.start.y;
          
          const minX = Math.min(horizSeg.start.x, horizSeg.end.x);
          const maxX = Math.max(horizSeg.start.x, horizSeg.end.x);
          const minY = Math.min(vertSeg.start.y, vertSeg.end.y);
          const maxY = Math.max(vertSeg.start.y, vertSeg.end.y);
          
          if (vertX >= minX && vertX <= maxX && horizY >= minY && horizY <= maxY) {
            intersections.push({
              point: { x: vertX, y: horizY },
              section,
              segmentIndex: i
            });
          }
        }
      }
    }
  }

  // Sort intersections by position along the path
  intersections.sort((a, b) => {
    const isVertical = Math.abs(start.x - end.x) < 0.1;
    if (isVertical) {
      return a.point.y - b.point.y;
    }
    return a.point.x - b.point.x;
  });

  // Process path segments between intersections
  let currentPoint = start;
  const allPoints = [start, ...intersections.map(i => i.point), end];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const segStart = allPoints[i];
    const segEnd = allPoints[i + 1];
    
    // Create section for this segment
    const sectionKey = getSectionKey([segStart, segEnd], networkType);
    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, {
        points: [segStart, segEnd],
        cables: new Set(cables.map(c => c.cableLabel || c.name)),
        function: networkType,
        color: firstCable.color,
        type: 'trunk',
        details: new Map(cables.map(c => [c.cableLabel || c.name, c]))
      });
    } else {
      // Add cables to existing section
      const section = sections.get(sectionKey);
      cables.forEach(cable => {
        section.cables.add(cable.cableLabel || cable.name);
        section.details.set(cable.cableLabel || cable.name, cable);
      });
    }

    // If this is an intersection point, also update the intersecting section
    if (intersections[i]) {
      const intersection = intersections[i];
      const intersectingSection = intersection.section;
      
      // Split the intersecting section at the intersection point
      const points = intersectingSection.points;
      const splitIndex = intersection.segmentIndex + 1;
      
      // Create new sections for the split parts
      const part1Points = [...points.slice(0, splitIndex), intersection.point];
      const part2Points = [intersection.point, ...points.slice(splitIndex)];
      
      // Create new sections with the split parts
      const part1Key = getSectionKey(part1Points, networkType);
      const part2Key = getSectionKey(part2Points, networkType);
      
      sections.set(part1Key, {
        points: part1Points,
        cables: new Set(intersectingSection.cables),
        function: networkType,
        color: intersectingSection.color,
        type: 'trunk',
        details: new Map(intersectingSection.details)
      });
      
      sections.set(part2Key, {
        points: part2Points,
        cables: new Set(intersectingSection.cables),
        function: networkType,
        color: intersectingSection.color,
        type: 'trunk',
        details: new Map(intersectingSection.details)
      });
      
      // Remove the original section
      sections.delete(getSectionKey(points, networkType));
    }
  }
};

// Helper function to find main path sections
const findMainPathSections = (sections, networkType) => {
  // Group sections by their base key (without network type)
  const sectionGroups = new Map();
  
  for (const [key, section] of sections.entries()) {
    if (!key.startsWith(networkType + '-')) continue;
    
    const baseKey = getBaseSectionKey(section.points);
    if (!sectionGroups.has(baseKey)) {
      sectionGroups.set(baseKey, []);
    }
    sectionGroups.get(baseKey).push({ key, section });
  }
  
  // For each group, identify the main section (one with most cables)
  const mainSections = new Map();
  const sectionsToRemove = new Set();
  
  for (const [baseKey, groupSections] of sectionGroups.entries()) {
    if (groupSections.length > 1) {
      // Sort sections by number of cables (descending)
      groupSections.sort((a, b) => b.section.cables.size - a.section.cables.size);
      
      // The first one is the main section
      const mainSection = groupSections[0];
      mainSections.set(baseKey, mainSection);
      
      // Merge all other sections into the main one and mark them for removal
      for (let i = 1; i < groupSections.length; i++) {
        const lesserSection = groupSections[i];
        
        // Merge cables from lesser section into main section
        lesserSection.section.cables.forEach(cableId => {
          mainSection.section.cables.add(cableId);
          if (lesserSection.section.details.has(cableId)) {
            mainSection.section.details.set(
              cableId,
              lesserSection.section.details.get(cableId)
            );
          }
        });
        
        sectionsToRemove.add(lesserSection.key);
      }
    } else if (groupSections.length === 1) {
      // If only one section, it's automatically the main one
      mainSections.set(baseKey, groupSections[0]);
    }
  }
  
  return { mainSections, sectionsToRemove };
};

// Helper to track cable assignments in sections
const CableSection = class {
  constructor(points, networkType) {
    this.points = points;
    this.cables = new Set();
    this.function = networkType;
    this.details = new Map();
    this.steinerPoint = null;
  }

  // Add cable to section
  addCable(cable) {
    this.cables.add(cable.cableLabel || cable.name);
    this.details.set(cable.cableLabel || cable.name, cable);
    // Set color and type from first cable if not already set
    if (!this.color) {
      this.color = cable.color;
      this.type = 'trunk';
    }
  }

  // Add method to check if section overlaps with another
  overlaps(other) {
    return this.points.some((p1, i) => {
      if (i === this.points.length - 1) return false;
      const p2 = this.points[i + 1];
      return other.points.some((op1, j) => {
        if (j === other.points.length - 1) return false;
        const op2 = other.points[j + 1];
        return segmentsOverlap(p1, p2, op1, op2);
      });
    });
  }

  // Merge another section into this one
  merge(other) {
    // Merge cables
    other.cables.forEach(cable => this.cables.add(cable));
    other.details.forEach((detail, key) => this.details.set(key, detail));

    // Transfer color and type if not already set
    if (!this.color) {
      this.color = other.color;
      this.type = other.type;
    }

    // Merge points ensuring connectivity
    const mergedPoints = new Set();
    const addPoint = p => mergedPoints.add(`${p.x},${p.y}`);
    this.points.forEach(addPoint);
    other.points.forEach(addPoint);

    this.points = Array.from(mergedPoints).map(str => {
      const [x, y] = str.split(',').map(Number);
      return {x, y};
    });

    // Sort points to maintain path continuity
    this.points = orderPointsForContinuity(this.points);
  }
};

// Helper to check if two segments overlap
const segmentsOverlap = (p1, p2, p3, p4) => {
  // Check if segments are parallel and overlapping
  if (Math.abs(p1.x - p2.x) < 0.1) { // Vertical segments
    if (Math.abs(p3.x - p4.x) < 0.1 && Math.abs(p1.x - p3.x) < 0.1) {
      const minY1 = Math.min(p1.y, p2.y);
      const maxY1 = Math.max(p1.y, p2.y);
      const minY2 = Math.min(p3.y, p4.y);
      const maxY2 = Math.max(p3.y, p4.y);
      return maxY1 >= minY2 && maxY2 >= minY1;
    }
  } else { // Horizontal segments
    if (Math.abs(p3.y - p4.y) < 0.1 && Math.abs(p1.y - p3.y) < 0.1) {
      const minX1 = Math.min(p1.x, p2.x);
      const maxX1 = Math.max(p1.x, p2.x);
      const minX2 = Math.min(p3.x, p4.x);
      const maxX2 = Math.max(p3.x, p4.x);
      return maxX1 >= minX2 && maxX2 >= minX1;
    }
  }
  return false;
};

// Helper to order points to maintain path continuity
const orderPointsForContinuity = (points) => {
  if (points.length <= 2) return points;

  const result = [points[0]];
  const remaining = new Set(points.slice(1));
  
  while (remaining.size > 0) {
    const last = result[result.length - 1];
    let nearest = null;
    let minDist = Infinity;

    for (const point of remaining) {
      const dist = manhattanDistance(last, point);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    if (!nearest) break;
    result.push(nearest);
    remaining.delete(nearest);
  }

  return result;
};

// Modify findRectilinearSteinerTree to better handle cable assignments through Steiner points
const findRectilinearSteinerTree = (networkCables, machines, isBlockedGrid, GRID_SIZE, existingPaths = new Map(), allSections = new Map()) => {
  const endpointGroups = new Map();
  const sections = new Map();
  
  // Group cables by their endpoints
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

  // Get unique points
  const points = Array.from(new Set(networkCables.flatMap(cable => 
    [cable.source, cable.target]
  ))).map(name => ({
    name,
    pos: machines[name]
  })).filter(p => p.pos);

  // First build the tree
  const { paths, steinerPoints } = buildSteinerTree(points, isBlockedGrid, GRID_SIZE, existingPaths, allSections);
  
  // Create initial sections
  for (const [pathKey, path] of paths.entries()) {
    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];
      const sectionKey = getSectionKey([start, end], networkCables[0].type);
      
      if (!sections.has(sectionKey)) {
        const newSection = new CableSection([start, end], networkCables[0].type);
        newSection.color = networkCables[0].color;
        newSection.type = 'trunk';
        sections.set(sectionKey, newSection);
      }
    }
  }

  // For each cable, find ALL possible paths through the tree
  for (const cable of networkCables) {
    const sourcePos = machines[cable.source];
    const targetPos = machines[cable.target];
    if (!sourcePos || !targetPos) continue;

    // Find all possible paths through the tree including Steiner points
    const possiblePaths = findAllPossiblePaths(
      sourcePos,
      targetPos,
      paths,
      steinerPoints
    );

    // Use the shortest valid path
    let bestPath = null;
    let bestScore = Infinity;

    for (const path of possiblePaths) {
      const score = calculatePathScore(path, existingPaths, allSections, steinerPoints);
      if (score < bestScore) {
        bestScore = score;
        bestPath = path;
      }
    }

    // Assign cable to all sections along the best path
    if (bestPath) {
      for (let i = 0; i < bestPath.length - 1; i++) {
        const start = bestPath[i];
        const end = bestPath[i + 1];
        const sectionKey = getSectionKey([start, end], cable.type);
        
        if (sections.has(sectionKey)) {
          const section = sections.get(sectionKey);
          section.addCable(cable);
        }
      }
    }
  }

  // Filter out sections with no cables
  const validSections = new Map();
  for (const [key, section] of sections.entries()) {
    if (section.cables.size > 0) {
      validSections.set(key, section);
    }
  }

  return { sections: validSections, paths };
};

// New helper to find all possible paths through the tree including Steiner points
const findAllPossiblePaths = (start, end, paths, steinerPoints) => {
  const allPaths = [];
  const visited = new Set();
  
  const findPaths = (current, currentPath) => {
    if (pointsEqual(current, end)) {
      allPaths.push([...currentPath, end]);
      return;
    }

    const key = `${current.x},${current.y}`;
    if (visited.has(key)) return;
    visited.add(key);

    // Look for connected points through existing paths
    for (const [_, path] of paths.entries()) {
      for (let i = 0; i < path.length - 1; i++) {
        const pathStart = path[i];
        const pathEnd = path[i + 1];

        if (pointsEqual(current, pathStart)) {
          findPaths(pathEnd, [...currentPath, current]);
        } else if (pointsEqual(current, pathEnd)) {
          findPaths(pathStart, [...currentPath, current]);
        }
      }
    }

    visited.delete(key);
  };

  findPaths(start, []);
  return allPaths;
};

// Helper to find sections that form a path between two points
const findPathSections = (start, end, sections) => {
  const pathSections = new Set();
  let current = start;
  
  while (manhattanDistance(current, end) > 0.1) {
    let nextPoint = null;
    let nextSection = null;
    
    // Find section connected to current point that leads toward end
    for (const [key, section] of sections.entries()) {
      const [secStart, secEnd] = section.points;
      
      if (pointsEqual(secStart, current)) {
        if (manhattanDistance(secEnd, end) < manhattanDistance(current, end)) {
          nextPoint = secEnd;
          nextSection = key;
          break;
        }
      } else if (pointsEqual(secEnd, current)) {
        if (manhattanDistance(secStart, end) < manhattanDistance(current, end)) {
          nextPoint = secStart;
          nextSection = key;
          break;
        }
      }
    }
    
    if (!nextSection) break; // No path found
    
    pathSections.add(nextSection);
    current = nextPoint;
  }
  
  return pathSections;
};

// Helper to compare points
const pointsEqual = (p1, p2) => 
  Math.abs(p1.x - p2.x) < 0.1 && Math.abs(p1.y - p2.y) < 0.1;

// Helper to build Steiner tree from points
const buildSteinerTree = (points, isBlockedGrid, GRID_SIZE, existingPaths, allSections) => {
  if (points.length < 2) return { paths: new Map(), steinerPoints: new Set() };

  // Sort points by proximity to existing paths
  const sortedPoints = [...points].sort((a, b) => {
    const aScore = getPointProximityScore(a.pos, existingPaths, allSections);
    const bScore = getPointProximityScore(b.pos, existingPaths, allSections);
    return aScore - bScore;
  });
  
  const connectedPoints = new Set([sortedPoints[0].name]);
  const paths = new Map();
  const steinerPoints = new Set();

  while (connectedPoints.size < points.length) {
    let bestConnection = null;
    let bestScore = Infinity;
    
    for (const point of sortedPoints) {
      if (connectedPoints.has(point.name)) continue;
      
      // First try finding Steiner points (prioritize four-way junctions)
      const steinerCandidates = findAllPotentialSteinerPoints(point.pos, paths, allSections);
      
      for (const candidate of steinerCandidates) {
        const path = findOrthogonalPathWithLimitedTurns(
          point.pos,
          candidate,
          isBlockedGrid,
          GRID_SIZE,
          existingPaths
        );
        
        if (path) {
          // Pass steinerPoints to calculatePathScore
          let score = calculatePathScore(path, existingPaths, allSections, steinerPoints);
          if (candidate.type === 'projection') {
            score *= 0.8; // 20% bonus for projected points
          }
          
          if (score < bestScore) {
            bestScore = score;
            bestConnection = { point, path, steinerPoint: candidate };
          }
        }
      }
      
      // Try direct connections
      for (const connectedName of connectedPoints) {
        const connected = sortedPoints.find(p => p.name === connectedName);
        const path = findOrthogonalPathWithLimitedTurns(
          point.pos,
          connected.pos,
          isBlockedGrid,
          GRID_SIZE,
          existingPaths
        );
        
        if (path) {
          // Pass steinerPoints to calculatePathScore
          const score = calculatePathScore(path, existingPaths, allSections, steinerPoints);
          if (score < bestScore) {
            bestScore = score;
            bestConnection = { point, path };
          }
        }
      }
    }
    
    if (bestConnection) {
      connectedPoints.add(bestConnection.point.name);
      
      if (bestConnection.steinerPoint) {
        steinerPoints.add(bestConnection.steinerPoint);
        paths.set(
          getPathKey(bestConnection.point.pos, bestConnection.steinerPoint),
          bestConnection.path
        );
      } else {
        paths.set(
          getPathKey(bestConnection.point.pos, bestConnection.path[bestConnection.path.length - 1]),
          bestConnection.path
        );
      }
    } else {
      break;
    }
  }

  return { paths, steinerPoints };
};

// New helper to find ALL potential Steiner points
const findAllPotentialSteinerPoints = (point, existingPaths, allSections) => {
  const candidates = new Set();
  
  // First check other network paths (give them priority)
  for (const section of allSections.values()) {
    for (const candidate of findPotentialSteinerPoints(point, section.points)) {
      candidates.add(candidate);
    }
  }
  
  // Then check current network paths
  for (const [_, path] of existingPaths.entries()) {
    for (const candidate of findPotentialSteinerPoints(point, path)) {
      candidates.add(candidate);
    }
  }
  
  return candidates;
};

// New helper to score point proximity to existing paths
const getPointProximityScore = (point, existingPaths, allSections) => {
  let minDistance = Infinity;
  
  // Check distances to existing paths
  for (const path of existingPaths.values()) {
    for (let i = 0; i < path.length - 1; i++) {
      const distance = pointToLineDistance(point, path[i], path[i + 1]);
      minDistance = Math.min(minDistance, distance);
    }
  }
  
  // Check distances to other network paths
  for (const section of allSections.values()) {
    for (let i = 0; i < section.points.length - 1; i++) {
      const distance = pointToLineDistance(point, section.points[i], section.points[i + 1]);
      minDistance = Math.min(minDistance, distance);
    }
  }
  
  return minDistance;
};

// Modify calculatePathScore to receive steinerPoints parameter
const calculatePathScore = (path, existingPaths, allSections, steinerPoints = new Set()) => {
  let score = 0;
  let lastDirection = null;

  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    const segmentLength = manhattanDistance(start, end);
    
    // Calculate direction and check for turns
    const direction = getDirection(start, end);
    if (lastDirection && direction !== lastDirection) {
      // Check if turn is near a machine or Steiner point
      const isNearEndpoint = isNearMachineOrSteiner(start, path[0], path[path.length - 1], steinerPoints);
      
      // Only penalize turns if they're not near endpoints
      if (!isNearEndpoint) {
        score += 10; // Heavy penalty for mid-path turns
      }
    }
    lastDirection = direction;
    
    // Check if this segment follows ANY existing path
    let followsExistingPath = false;
    
    // Check existing paths and other networks
    for (const existingPath of existingPaths.values()) {
      if (pathContainsSegment(existingPath, start, end)) {
        followsExistingPath = true;
        break;
      }
    }
    for (const section of allSections.values()) {
      if (pathContainsSegment(section.points, start, end)) {
        followsExistingPath = true;
        break;
      }
    }
    
    // Extremely low cost for following existing path
    score += followsExistingPath ? segmentLength * 0.01 : segmentLength;
  }
  
  return score;
};

// New helper to check if a point is near a machine or Steiner point
const isNearMachineOrSteiner = (point, startPoint, endPoint, steinerPoints, threshold = 2) => {
  // Check distance to path endpoints (machines)
  if (manhattanDistance(point, startPoint) <= threshold || 
      manhattanDistance(point, endPoint) <= threshold) {
    return true;
  }
  
  // Check distance to Steiner points
  for (const steinerPoint of steinerPoints) {
    if (manhattanDistance(point, steinerPoint) <= threshold) {
      return true;
    }
  }
  
  return false;
};

// Modify findPotentialSteinerPoints to prefer four-way junctions
const findPotentialSteinerPoints = (point, path) => {
  const candidates = new Set();
  
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    
    // Only consider orthogonal segments
    if (!isOrthogonalSegment(start, end)) continue;
    
    // For vertical segments
    if (Math.abs(start.x - end.x) < 0.1) {
      const x = start.x;
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      
      // Project point onto segment
      const projectedY = Math.max(minY, Math.min(maxY, point.y));
      
      // Add projected point with high priority (potential four-way junction)
      candidates.add({
        x,
        y: projectedY,
        priority: 2, // Higher priority for projected points
        type: 'projection'
      });
    }
    // For horizontal segments
    else if (Math.abs(start.y - end.y) < 0.1) {
      const y = start.y;
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      
      // Project point onto segment
      const projectedX = Math.max(minX, Math.min(maxX, point.x));
      
      // Add projected point with high priority
      candidates.add({
        x: projectedX,
        y,
        priority: 2,
        type: 'projection'
      });
    }
  }
  
  return candidates;
};

// Helper to get path key
const getPathKey = (start, end) => {
  // Sort points to ensure consistent key
  const points = [start, end].sort((a, b) => 
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  return `${points[0].x},${points[0].y}-${points[1].x},${points[1].y}`;
};

// Helper for finding orthogonal paths with limited turns
const findOrthogonalPathWithLimitedTurns = (start, end, isBlockedGrid, GRID_SIZE, existingPaths) => {
  const queue = new MinHeap((a, b) => 
    (a.cost + a.heuristic + a.turns * 4) - (b.cost + b.heuristic + b.turns * 4)
  );
  
  const visited = new Map();
  const maxTurns = 2; // Even more limited turns
  
  queue.push({
    pos: { x: Math.round(start.x), y: Math.round(start.y) },
    cost: 0,
    heuristic: manhattanDistance(start, end),
    path: [],
    turns: 0,
    direction: null
  });

  const dirs = [
    { dx: 0, dy: 1, dir: 'down' },
    { dx: 1, dy: 0, dir: 'right' },
    { dx: 0, dy: -1, dir: 'up' },
    { dx: -1, dy: 0, dir: 'left' }
  ];

  while (!queue.empty()) {
    const current = queue.pop();
    
    if (pointsEqual(current.pos, end)) {
      return [...current.path, current.pos, end];
    }

    const key = `${Math.round(current.pos.x)},${Math.round(current.pos.y)},${current.direction},${current.turns}`;
    if (visited.has(key) && visited.get(key) <= current.cost) continue;
    visited.set(key, current.cost);

    for (const { dx, dy, dir } of dirs) {
      // Only allow movement in one direction until hitting target coordinate
      if (current.direction && dir !== current.direction) {
        // If moving horizontally, only allow vertical turn if we're at target x
        if ((current.direction === 'left' || current.direction === 'right') &&
            Math.abs(current.pos.x - end.x) > 0.1) {
          continue;
        }
        // If moving vertically, only allow horizontal turn if we're at target y
        if ((current.direction === 'up' || current.direction === 'down') &&
            Math.abs(current.pos.y - end.y) > 0.1) {
          continue;
        }
      }

      const nextX = current.pos.x + dx;
      const nextY = current.pos.y + dy;

      if (nextX < 0 || nextX >= GRID_SIZE || 
          nextY < 0 || nextY >= GRID_SIZE ||
          isBlockedGrid[Math.floor(nextX)][Math.floor(nextY)]) {
        continue;
      }

      const nextPos = { x: nextX, y: nextY };
      const turnCost = current.direction && dir !== current.direction ? 1 : 0;
      const newTurns = current.turns + turnCost;
      
      if (newTurns > maxTurns) continue;

      let moveCost = 1;
      
      // Much stronger preference for following existing paths
      for (const path of existingPaths.values()) {
        if (pathContainsSegment(path, current.pos, nextPos)) {
          moveCost = 0.01; // Even stronger preference
          break;
        }
      }

      const nextCost = current.cost + moveCost;
      const nextHeuristic = manhattanDistance(nextPos, end);

      queue.push({
        pos: nextPos,
        cost: nextCost,
        heuristic: nextHeuristic,
        path: [...current.path, current.pos],
        turns: newTurns,
        direction: dir
      });
    }
  }

  // If no path found, try simpler orthogonal path
  return findDirectOrthogonalPath(start, end, isBlockedGrid, GRID_SIZE);
};

// Helper for finding direct orthogonal path (fallback)
const findDirectOrthogonalPath = (start, end, isBlockedGrid, GRID_SIZE) => {
  const path = [];
  let current = { ...start };
  path.push(current);

  // First move horizontally
  while (Math.abs(current.x - end.x) > 0.1) {
    const nextX = current.x + Math.sign(end.x - current.x);
    if (nextX < 0 || nextX >= GRID_SIZE || 
        isBlockedGrid[Math.floor(nextX)][Math.floor(current.y)]) {
      return null;
    }
    current = { x: nextX, y: current.y };
    path.push(current);
  }

  // Then move vertically
  while (Math.abs(current.y - end.y) > 0.1) {
    const nextY = current.y + Math.sign(end.y - current.y);
    if (nextY < 0 || nextY >= GRID_SIZE || 
        isBlockedGrid[Math.floor(current.x)][Math.floor(nextY)]) {
      return null;
    }
    current = { x: current.x, y: nextY };
    path.push(current);
  }

  return path;
};

// Helper to reconstruct full path from sections
const reconstructPath = (pathSections, sections) => {
  if (pathSections.size === 0) return null;

  const path = [];
  const sectionArray = Array.from(pathSections);
  
  // Start with first point of first section
  const firstSection = sections.get(sectionArray[0]);
  path.push(firstSection.points[0]);
  
  // Build ordered path through sections
  for (let i = 0; i < sectionArray.length; i++) {
    const section = sections.get(sectionArray[i]);
    const [start, end] = section.points;
    
    // If this is not the first section, check which point connects to previous
    if (i > 0) {
      const lastPoint = path[path.length - 1];
      
      // Add points in correct order based on connection
      if (pointsEqual(lastPoint, start)) {
        path.push(end);
      } else if (pointsEqual(lastPoint, end)) {
        path.push(start);
      } else {
        // If no connection found, try to find closest point
        const startDist = manhattanDistance(lastPoint, start);
        const endDist = manhattanDistance(lastPoint, end);
        path.push(startDist < endDist ? start : end);
      }
    } else {
      // For first section, add second point
      path.push(end);
    }
  }
  
  // Remove any duplicate consecutive points
  return path.filter((point, index) => 
    index === 0 || !pointsEqual(point, path[index - 1])
  );
};

export const optimizeNetworkPaths = (cables = [], machines = {}, walls = [], perforations = [], gridSize = 100) => {
  if (!Array.isArray(cables) || cables.length === 0) {
    return { sections: new Map(), cableRoutes: new Map() };
  }

  const isBlockedGrid = preprocessBlockedGrid(walls, perforations, gridSize);
  const allSections = new Map();
  const cableRoutes = new Map();

  // Group cables by network type
  const networkGroups = cables.reduce((groups, cable) => {
    const networkType = cable.type || 'unknown';
    if (!groups[networkType]) groups[networkType] = [];
    groups[networkType].push(cable);
    return groups;
  }, {});

  // Process each network type
  for (const [networkType, networkCables] of Object.entries(networkGroups)) {
    const { sections, paths } = findRectilinearSteinerTree(
      networkCables,
      machines,
      isBlockedGrid,
      gridSize,
      allSections
    );
    
    // Add sections to global sections map
    for (const [key, section] of sections.entries()) {
      allSections.set(key, section);
    }
    
    // Record cable routes
    networkCables.forEach(cable => {
      const sourcePos = machines[cable.source];
      const targetPos = machines[cable.target];
      if (!sourcePos || !targetPos) return;
      
      const pathSections = findPathSections(sourcePos, targetPos, sections);
      const route = reconstructPath(pathSections, sections);
      if (route) {
        cableRoutes.set(cable.cableLabel || cable.name, route);
      }
    });
  }

  // Filter out sections with no cables before returning
  const validSections = new Map();
  for (const [key, section] of allSections.entries()) {
    if (section.cables.size > 0) {
      validSections.set(key, section);
    }
  }

  return { sections: validSections, cableRoutes };
};

// Helper to calculate Manhattan distance between points
const manhattanDistance = (p1, p2) => {
  return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
};
