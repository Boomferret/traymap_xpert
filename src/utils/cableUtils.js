/*****************************************************
 *  CABLE UTILS - VERSIÓN OPTIMIZADA
 *  ------------------------------------------------
 *  Implementación del algoritmo de Steiner rectilíneo
 *  basado en el paper "Faster Approximation Algorithms 
 *  for the Rectilinear Steiner Tree Problem"
 * 
 *  Incluye:
 *   1) Helpers geométricos y misceláneos
 *   2) Implementación de Estrellas (Stars)
 *   3) Router optimizado de Steiner
 *   4) Manejo de secciones y merging
 *   5) Utils y conexión final
 *   6) Función principal optimizeNetworkPaths
 *****************************************************/

// Importamos heap para la cola de prioridad
const MinHeap = require('heap');

/****************************************************
 *                1) HELPERS GENERALES
 ****************************************************/

/**
 * Verifica si dos segmentos se solapan
 */
const segmentsOverlap = (p1, p2, p3, p4) => {
  // Si los segmentos son verticales
  if (p1.x === p2.x && p3.x === p4.x && p1.x === p3.x) {
    const [minY1, maxY1] = [Math.min(p1.y, p2.y), Math.max(p1.y, p2.y)];
    const [minY2, maxY2] = [Math.min(p3.y, p4.y), Math.max(p3.y, p4.y)];
    return !(maxY1 < minY2 || maxY2 < minY1);
  }
  
  // Si los segmentos son horizontales
  if (p1.y === p2.y && p3.y === p4.y && p1.y === p3.y) {
    const [minX1, maxX1] = [Math.min(p1.x, p2.x), Math.max(p1.x, p2.x)];
    const [minX2, maxX2] = [Math.min(p3.x, p4.x), Math.max(p3.x, p4.x)];
    return !(maxX1 < minX2 || maxX2 < minX1);
  }
  
  return false; // No se solapan si no son paralelos o están en diferentes líneas
};

/****************************************************
 *            2) IMPLEMENTACIÓN GRILLA DE HANAN
 ****************************************************/

/**
 * Genera la grilla de Hanan a partir de las coordenadas de las máquinas.
 * La grilla de Hanan se forma con todas las intersecciones de las líneas
 * horizontales y verticales que pasan por los puntos dados.
 */
export const calculateHananGrid = (points) => {
  if (!points || points.length === 0) return { xCoords: [], yCoords: [] };

  try {
    // Obtener coordenadas x e y únicas
    const xCoords = [...new Set(points.map(p => p.pos.x))].sort((a, b) => a - b);
    const yCoords = [...new Set(points.map(p => p.pos.y))].sort((a, b) => a - b);

    return { xCoords, yCoords };
  } catch (error) {
    console.error('Error en calculateHananGrid:', error);
    return { xCoords: [], yCoords: [] };
  }
};

/****************************************************
 *      3) PROCESAMIENTO DE PAREDES Y PERFORACIONES
 ****************************************************/

/**
 * Preprocesa la grilla bloqueada y devuelve una función
 * que permite consultar si una celda está bloqueada.
 */
export const preprocessBlockedGrid = (walls, perforations, gridSize) => {
  // Crear array 2D para representar la grilla
  const blockedGrid = Array(gridSize.height).fill().map(() => 
    Array(gridSize.width).fill(false)
  );

  // Marcar paredes como bloqueadas
  walls.forEach(wall => {
    if (wall.x >= 0 && wall.x < gridSize.width && 
        wall.y >= 0 && wall.y < gridSize.height) {
      blockedGrid[wall.y][wall.x] = true;
    }
  });

  // Marcar perforaciones como pasables
  perforations.forEach(perf => {
    if (perf.x >= 0 && perf.x < gridSize.width && 
        perf.y >= 0 && perf.y < gridSize.height) {
      blockedGrid[perf.y][perf.x] = false;
    }
  });

  // Devolver función que verifica si una celda está bloqueada
  return (x, y) => {
    if (x < 0 || x >= gridSize.width || y < 0 || y >= gridSize.height) return true;
    return blockedGrid[y][x];
  };
};

/****************************************************
 *            4) IMPLEMENTACIÓN DE ESTRELLAS
 ****************************************************/

// Distancia Manhattan entre dos puntos
const manhattanDistance = (p1, p2) => {
  return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
};

// Comprueba si dos puntos son casi iguales
const pointsEqual = (p1, p2, eps = 0.1) => {
  return Math.abs(p1.x - p2.x) < eps && Math.abs(p1.y - p2.y) < eps;
};

// Verifica si un punto está dentro de un rectángulo
const isPointInRectangle = (point, rect) => {
  return point.x > rect.x1 && point.x < rect.x2 && 
         point.y > rect.y1 && point.y < rect.y2;
};

// Verifica si un rectángulo está vacío (sin terminales dentro)
const isRectangleEmpty = (rect, terminals) => {
  return !terminals.some(t => isPointInRectangle(t, rect));
};

// Para identificar secciones (sin tipo de red)
const getBaseSectionKey = (points) => {
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  return `${sorted[0].x},${sorted[0].y}-${sorted[1].x},${sorted[1].y}`;
};

// Para identificar secciones con tipo de red
const getSectionKey = (points, networkType) => {
  const baseKey = getBaseSectionKey(points);
  return networkType ? `${networkType}-${baseKey}` : baseKey;
};

/****************************************************
 *            2) IMPLEMENTACIÓN DE ESTRELLAS
 ****************************************************/

/**
 * Representa una estrella en el árbol de Steiner
 * Una estrella conecta 3 terminales mediante un punto central
 */
class Star {
  constructor(center, terminals) {
    this.center = center;        // Punto central Steiner
    this.terminals = terminals;  // Array de 3 terminales
    this.gain = 0;              // Ganancia de usar esta estrella
    this.rectangle = this.computeRectangle();
    this.bridges = new Set();    // Aristas que reemplaza
  }

  // Calcula el rectángulo que contiene la estrella
  computeRectangle() {
    const xs = this.terminals.map(t => t.x);
    const ys = this.terminals.map(t => t.y);
    return {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys)
    };
  }

  // Calcula la ganancia de usar esta estrella vs MST
  calculateGain(currentMST) {
    // Encontrar aristas del MST que serían reemplazadas
    this.bridges = this.findBridges(currentMST);
    const bridgeLength = Array.from(this.bridges)
      .reduce((sum, edge) => sum + manhattanDistance(edge.start, edge.end), 0);
    
    // Calcular longitud usando el punto Steiner
    const steinerLength = this.terminals.reduce((sum, terminal) => 
      sum + manhattanDistance(this.center, terminal), 0);
    
    this.gain = bridgeLength - steinerLength;
    return this.gain;
  }

  // Encuentra las aristas del MST que esta estrella reemplazaría
  findBridges(mst) {
    const bridges = new Set();
    const terminalPairs = [
      [this.terminals[0], this.terminals[1]],
      [this.terminals[1], this.terminals[2]],
      [this.terminals[0], this.terminals[2]]
    ];

    for (const [t1, t2] of terminalPairs) {
      const path = findPathInMST(t1, t2, mst);
      if (path) {
        const maxEdge = findMaxEdgeInPath(path);
        if (maxEdge) bridges.add(maxEdge);
      }
    }

    return bridges;
  }
}

/**
 * Encuentra un camino entre dos terminales en el MST
 */
const findPathInMST = (start, end, mst) => {
  if (!start || !end) return null;

  const edges = new Map();
  mst.forEach(edge => {
    const key1 = pointToString(edge.start);
    const key2 = pointToString(edge.end);
    
    if (!edges.has(key1)) edges.set(key1, new Set());
    if (!edges.has(key2)) edges.set(key2, new Set());
    
    edges.get(key1).add(key2);
    edges.get(key2).add(key1);
  });

  const visited = new Set();
  const path = [];
  
  const dfs = (current, target) => {
    const currentKey = pointToString(current);
    if (currentKey === pointToString(target)) return true;
    
    visited.add(currentKey);
    const neighbors = edges.get(currentKey) || new Set();
    
    for (const neighborKey of neighbors) {
      if (!visited.has(neighborKey)) {
        path.push({
          start: current,
          end: stringToPoint(neighborKey)
        });
        
        if (dfs(stringToPoint(neighborKey), target)) return true;
        path.pop();
      }
    }
    
    return false;
  };

  if (dfs(start, end)) return path;
  return null;
};

/**
 * Encuentra la arista más larga en un camino
 */
const findMaxEdgeInPath = (path) => {
  if (!path || path.length === 0) return null;
  
  return path.reduce((maxEdge, edge) => {
    const dist = manhattanDistance(edge.start, edge.end);
    const maxDist = maxEdge ? manhattanDistance(maxEdge.start, maxEdge.end) : -1;
    return dist > maxDist ? edge : maxEdge;
  }, null);
};

/**
 * Convierte un string de coordenadas a punto
 */
const stringToPoint = (str) => {
  const [x, y] = str.split(',').map(Number);
  return { x, y };
};

/****************************************************
 *         3) ROUTER OPTIMIZADO DE STEINER
 ****************************************************/

/**
 * Implementa el algoritmo optimizado del paper
 * para encontrar el árbol de Steiner rectilíneo
 */
class OptimizedSteinerRouter {
  constructor(terminals, blockedGrid, gridSize) {
    this.terminals = terminals;
    this.blockedGrid = blockedGrid;
    this.gridSize = gridSize;
    this.properStars = [];
    this.mst = null;
  }

  // Encuentra todas las estrellas propias (complejidad O(n))
  findProperStars() {
    // Ordenar terminales por coordenada x
    const sortedTerminals = [...this.terminals].sort((a, b) => a.x - b.x);

    // Para cada terminal, mirar los dos siguientes más cercanos
    for (let i = 0; i < sortedTerminals.length - 2; i++) {
      const t1 = sortedTerminals[i];
      
      for (let j = i + 1; j < i + 3 && j < sortedTerminals.length; j++) {
        const t2 = sortedTerminals[j];
        
        for (let k = j + 1; k < j + 3 && k < sortedTerminals.length; k++) {
          const t3 = sortedTerminals[k];
          
          // Verificar si forman una estrella propia
          const star = this.createStarIfProper(t1, t2, t3);
          if (star) {
            this.properStars.push(star);
          }
        }
      }
    }
  }

  // Crea una estrella si los tres puntos forman una configuración válida
  createStarIfProper(t1, t2, t3) {
    // Ordenar puntos para formar potencial estrella
    const [left, middle, right] = [t1, t2, t3].sort((a, b) => a.x - b.x);
    
    // Verificar si forma una configuración válida de estrella
    if (middle.y < Math.min(left.y, right.y) || 
        middle.y > Math.max(left.y, right.y)) {
      return null;
    }

    // Crear centro potencial
    const center = {
      x: middle.x,
      y: left.y
    };

    // Crear estrella y verificar si su rectángulo está vacío
    const star = new Star(center, [left, middle, right]);
    if (!isRectangleEmpty(star.rectangle, 
        this.terminals.filter(t => t !== t1 && t !== t2 && t !== t3))) {
      return null;
    }

    return star;
  }

  // Algoritmo principal para encontrar el árbol de Steiner óptimo
  findOptimalSteinerTree() {
    // 1. Encontrar MST inicial
    this.mst = this.findMinimumSpanningTree();
    
    // 2. Encontrar todas las estrellas propias
    this.findProperStars();
    
    // 3. Calcular ganancias
    this.properStars.forEach(star => star.calculateGain(this.mst));
    
    // 4. Ordenar estrellas por ganancia
    this.properStars.sort((a, b) => b.gain - a.gain);

    // 5. Procesar estrellas en orden de ganancia decreciente
    const finalTree = new Set(this.mst);
    const processedStars = new Set();

    for (const star of this.properStars) {
      if (star.gain <= 0) continue;
      
      if (this.canAddStarToTree(star, finalTree)) {
        // Remover aristas reemplazadas
        star.bridges.forEach(bridge => finalTree.delete(bridge));
        
        // Añadir nuevas aristas de la estrella
        star.terminals.forEach(terminal => {
          finalTree.add({
            start: star.center,
            end: terminal
          });
        });
        
        processedStars.add(star);
      }
    }

    return Array.from(finalTree);
  }

  // Encuentra el MST inicial usando Prim
  findMinimumSpanningTree() {
    const edges = new Set();
    const visited = new Set([this.terminals[0]]);
    
    while (visited.size < this.terminals.length) {
      let minEdge = null;
      let minDist = Infinity;

      // Encontrar la arista más corta que conecta a un nuevo terminal
      for (const v of visited) {
        for (const t of this.terminals) {
          if (!visited.has(t)) {
            const dist = manhattanDistance(v, t);
            if (dist < minDist) {
              minDist = dist;
              minEdge = { start: v, end: t };
            }
          }
        }
      }

      edges.add(minEdge);
      visited.add(minEdge.end);
    }

    return edges;
  }

  // Verifica si una estrella puede ser añadida al árbol
  canAddStarToTree(star, currentTree) {
    // Verificar que todas las aristas a reemplazar existen
    for (const bridge of star.bridges) {
      if (!this.edgeExistsInTree(bridge, currentTree)) {
        return false;
      }
    }

    // Verificar que no crea ciclos
    const testTree = new Set(currentTree);
    star.bridges.forEach(bridge => testTree.delete(bridge));
    star.terminals.forEach(terminal => {
      testTree.add({
        start: star.center,
        end: terminal
      });
    });

    return !this.hasCycle(testTree);
  }

  // Helpers para verificación de ciclos
  edgeExistsInTree(edge, tree) {
    return Array.from(tree).some(e => 
      (pointsEqual(e.start, edge.start) && pointsEqual(e.end, edge.end)) ||
      (pointsEqual(e.start, edge.end) && pointsEqual(e.end, edge.start))
    );
  }

  hasCycle(edges) {
    // Implementación simple de detección de ciclos
    // usando conjunto disjunto (Union-Find)
    const vertices = new Set();
    edges.forEach(e => {
      vertices.add(e.start);
      vertices.add(e.end);
    });

    const parent = new Map();
    vertices.forEach(v => parent.set(v, v));

    const find = (v) => {
      if (parent.get(v) !== v) {
        parent.set(v, find(parent.get(v)));
      }
      return parent.get(v);
    };

    const union = (v1, v2) => {
      const p1 = find(v1);
      const p2 = find(v2);
      if (p1 !== p2) {
        parent.set(p2, p1);
        return false; // No ciclo
      }
      return true; // Ciclo encontrado
    };

    for (const edge of edges) {
      if (union(edge.start, edge.end)) {
        return true;
      }
    }
    return false;
  }
}

/****************************************************
 *         4) MANEJO DE SECCIONES Y MERGING
 ****************************************************/

class CableSection {
  constructor(points, networkType) {
    this.points = points;
    this.cables = new Set();
    this.function = networkType;
    this.details = new Map();
    this.color = null;
    this.type = 'trunk';
  }

  addCable(cable) {
    const cableId = cable.cableLabel || cable.name;
    this.cables.add(cableId);
    this.details.set(cableId, cable);
    if (!this.color) {
      this.color = cable.color;
    }
  }

  // Verifica solapamiento con otra sección
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

  // Fusiona otra sección con esta
  merge(other) {
    other.cables.forEach(c => this.cables.add(c));
    other.details.forEach((detail, key) => this.details.set(key, detail));

    if (!this.color) {
      this.color = other.color;
      this.type = other.type;
    }

    // Unir puntos manteniendo orden
    const uniquePoints = new Set();
    const addPoint = (p) => uniquePoints.add(`${p.x},${p.y}`);
    this.points.forEach(addPoint);
    other.points.forEach(addPoint);

    this.points = Array.from(uniquePoints)
      .map(str => {
        const [x, y] = str.split(',').map(Number);
        return { x, y };
      });

    this.points = orderPointsForContinuity(this.points);
  }
}

/****************************************************
 *            5) UTILS Y CONEXIÓN FINAL
 ****************************************************/

// Ordena puntos para continuidad en una ruta
const orderPointsForContinuity = (points) => {
  if (points.length <= 2) return points;

  const result = [points[0]];
  const remaining = new Set(points.slice(1));

  while (remaining.size > 0) {
    const last = result[result.length - 1];
    let nearest = null;
    let minDist = Infinity;

    for (const point of remaining) {
      // Only consider points that form rectilinear paths (same x or same y)
      if (point.x === last.x || point.y === last.y) {
        const dist = manhattanDistance(last, point);
        if (dist < minDist) {
          minDist = dist;
          nearest = point;
        }
      }
    }

    // If no rectilinear point found, create intermediate point
    if (!nearest) {
      const nextPoint = Array.from(remaining)[0];
      // Create L-shaped path using intermediate point
      const intermediate = {
        x: last.x,
        y: nextPoint.y
      };
      result.push(intermediate);
      result.push(nextPoint);
      remaining.delete(nextPoint);
    } else {
      result.push(nearest);
      remaining.delete(nearest);
    }
  }

  return result;
};

// Verifica si un cable podría usar un segmento de ruta
const couldUsePath = (cable, start, end, machines) => {
  const source = machines[cable.source];
  const target = machines[cable.target];
  
  if (!source || !target) return false;

  // Verificar si este segmento ayuda a llegar del origen al destino
  const distWithSegment = 
    manhattanDistance(source, start) + 
    manhattanDistance(start, end) + 
    manhattanDistance(end, target);
  
  const directDist = manhattanDistance(source, target);
  
  // Permitir cierta desviación del camino directo
  return distWithSegment <= directDist * 1.5;
};

// Encuentra un camino a través de las secciones para un cable
const findPathThroughSections = (cable, sections, machines) => {
  const source = machines[cable.source];
  const target = machines[cable.target];
  
  if (!source || !target) return null;

  // Crear grafo de secciones conectadas
  const graph = new Map();
  sections.forEach((section, key) => {
    if (!section.cables.has(cable.cableLabel || cable.name)) return;
    
    const [start, end] = section.points;
    if (!graph.has(pointToString(start))) graph.set(pointToString(start), new Set());
    if (!graph.has(pointToString(end))) graph.set(pointToString(end), new Set());
    
    graph.get(pointToString(start)).add(pointToString(end));
    graph.get(pointToString(end)).add(pointToString(start));
  });

  // Usar A* para encontrar el camino más corto
  const path = findShortestPath(
    pointToString(source),
    pointToString(target),
    graph,
    point => {
      const [x, y] = point.split(',').map(Number);
      return manhattanDistance({x, y}, target);
    }
  );

  if (!path) return null;

  // Convertir strings de vuelta a puntos
  return path.map(str => {
    const [x, y] = str.split(',').map(Number);
    return {x, y};
  });
};

// Helper para convertir punto a string
const pointToString = (point) => `${point.x},${point.y}`;

// Implementación de A* para encontrar camino más corto
const findShortestPath = (start, goal, graph, heuristic) => {
  const frontier = new MinHeap((a, b) => a.priority - b.priority);
  frontier.push({state: start, priority: 0});
  
  const cameFrom = new Map();
  const costSoFar = new Map();
  cameFrom.set(start, null);
  costSoFar.set(start, 0);

  while (!frontier.empty()) {
    const current = frontier.pop().state;
    
    if (current === goal) {
      const path = [];
      let curr = goal;
      while (curr) {
        path.unshift(curr);
        curr = cameFrom.get(curr);
      }
      return path;
    }

    for (const next of (graph.get(current) || [])) {
      const [x1, y1] = current.split(',').map(Number);
      const [x2, y2] = next.split(',').map(Number);
      const newCost = costSoFar.get(current) + manhattanDistance({x: x1, y: y1}, {x: x2, y: y2});

      if (!costSoFar.has(next) || newCost < costSoFar.get(next)) {
        costSoFar.set(next, newCost);
        const priority = newCost + heuristic(next);
        frontier.push({state: next, priority});
        cameFrom.set(next, current);
      }
    }
  }

  return null;
};

/****************************************************
 *         6) FUNCIÓN PRINCIPAL optimizeNetworkPaths
 ****************************************************/

/**
 * Función principal que optimiza las rutas de cables
 * utilizando el algoritmo optimizado de Steiner
 */
export const optimizeNetworkPaths = (cables, machines, walls, perforations, gridSize, isBlockedGrid) => {
  try {
    if (!Array.isArray(cables) || cables.length === 0) {
      return { sections: new Map(), cableRoutes: new Map() };
    }

    // Agrupar cables por tipo de red en lugar de función
    const cablesByNetwork = new Map();
    cables.forEach(cable => {
      // Use cable.type (network type) instead of cable.cableFunction
      if (!cablesByNetwork.has(cable.type)) {
        cablesByNetwork.set(cable.type, []);
      }
      cablesByNetwork.get(cable.type).push(cable);
    });

    const allSections = new Map();
    const cableRoutes = new Map();

    // Procesar cada grupo de cables por red
    for (const [networkType, networkCables] of cablesByNetwork) {
      // Skip unknown network types
      if (networkType === 'unknown') continue;

      // Recolectar terminales (máquinas) para esta red
      const terminals = new Set();
      networkCables.forEach(cable => {
        const source = machines[cable.source];
        const target = machines[cable.target];
        if (source && target) {
          terminals.add(source);
          terminals.add(target);
        }
      });

      // Usar el router rectilíneo para encontrar las rutas óptimas
      const router = new RectilinearRouter(Array.from(terminals), gridSize);
      const paths = router.optimizeWithSteinerPoints();

      // Crear secciones a partir de los paths
      paths.forEach((path, index) => {
        for (let i = 0; i < path.length - 1; i++) {
          const sectionPoints = [path[i], path[i + 1]];
          // Use networkType instead of cable function for section key
          const sectionKey = getSectionKey(sectionPoints, networkType);
          
          if (!allSections.has(sectionKey)) {
            allSections.set(sectionKey, new CableSection(sectionPoints, networkType));
          }
          
          // Asignar cables a las secciones
          networkCables.forEach(cable => {
            const source = machines[cable.source];
            const target = machines[cable.target];
            if (source && target && couldUsePath(cable, path[i], path[i + 1], machines)) {
              allSections.get(sectionKey).addCable(cable);
            }
          });
        }
      });

      // Asignar rutas a cada cable
      networkCables.forEach(cable => {
        const path = findPathThroughSections(cable, allSections, machines);
        if (path) {
          cableRoutes.set(cable.cableLabel || cable.name, path);
        }
      });
    }

    // Fusionar secciones solapadas
    mergeSections(allSections);

    return { sections: allSections, cableRoutes };
  } catch (error) {
    console.error('Error in optimizeNetworkPaths:', error);
    return { sections: new Map(), cableRoutes: new Map() };
  }
};

class RectilinearRouter {
  constructor(terminals, gridSize) {
    this.terminals = terminals;
    this.gridSize = gridSize;
    this.mst = null;
  }

  findRectilinearPath(start, end) {
    const path = [
      { x: start.x, y: start.y },
      { x: start.x, y: end.y },
      { x: end.x, y: end.y }
    ];

    if (start.x === end.x || start.y === end.y) {
      return [path[0], path[2]];
    }

    return path;
  }

  findMinimumSpanningTree() {
    const edges = new Set();
    const visited = new Set([this.terminals[0]]);

    while (visited.size < this.terminals.length) {
      let minEdge = null;
      let minPath = null;
      let minDist = Infinity;

      for (const v of visited) {
        for (const t of this.terminals) {
          if (!visited.has(t)) {
            const path = this.findRectilinearPath(v, t);
            const dist = manhattanDistance(v, t);
            
            if (dist < minDist) {
              minDist = dist;
              minEdge = { start: v, end: t };
              minPath = path;
            }
          }
        }
      }

      for (let i = 0; i < minPath.length - 1; i++) {
        edges.add({
          start: minPath[i],
          end: minPath[i + 1],
          isRectilinear: true
        });
      }

      visited.add(minEdge.end);
    }

    this.mst = edges;
    return edges;
  }

  optimizeWithSteinerPoints() {
    if (!this.mst) {
      this.findMinimumSpanningTree();
    }

    const finalEdges = new Set(this.mst);
    const processedPoints = new Set();

    for (const terminal of this.terminals) {
      if (processedPoints.has(`${terminal.x},${terminal.y}`)) continue;
      
      const incidentEdges = Array.from(finalEdges).filter(edge =>
        (edge.start.x === terminal.x && edge.start.y === terminal.y) ||
        (edge.end.x === terminal.x && edge.end.y === terminal.y)
      );

      if (incidentEdges.length >= 3) {
        this.optimizeCorner(terminal, incidentEdges, finalEdges);
      }

      processedPoints.add(`${terminal.x},${terminal.y}`);
    }

    const segments = [];
    for (const edge of finalEdges) {
      segments.push([edge.start, edge.end]);
    }

    return this.mergeSegments(segments);
  }

  optimizeCorner(point, edges, finalEdges) {
    const connectedPoints = edges.map(edge => 
      edge.start.x === point.x && edge.start.y === point.y ? edge.end : edge.start
    );

    const steinerPoint = {
      x: Math.round(connectedPoints.reduce((sum, p) => sum + p.x, 0) / connectedPoints.length),
      y: Math.round(connectedPoints.reduce((sum, p) => sum + p.y, 0) / connectedPoints.length)
    };

    const lengthWithout = edges.reduce((sum, edge) => 
      sum + manhattanDistance(edge.start, edge.end), 0
    );

    const lengthWith = connectedPoints.reduce((sum, p) =>
      sum + manhattanDistance(p, steinerPoint), 0
    );

    if (lengthWith < lengthWithout) {
      edges.forEach(edge => finalEdges.delete(edge));

      connectedPoints.forEach(p => {
        const path = this.findRectilinearPath(p, steinerPoint);
        for (let i = 0; i < path.length - 1; i++) {
          finalEdges.add({
            start: path[i],
            end: path[i + 1],
            isRectilinear: true
          });
        }
      });
    }
  }

  mergeSegments(segments) {
    const paths = [];
    const used = new Set();

    while (segments.length > used.size) {
      let currentPath = [];
      let current = null;

      for (let i = 0; i < segments.length; i++) {
        if (!used.has(i)) {
          currentPath = [...segments[i]];
          current = currentPath[currentPath.length - 1];
          used.add(i);
          break;
        }
      }

      let foundConnection;
      do {
        foundConnection = false;
        for (let i = 0; i < segments.length; i++) {
          if (used.has(i)) continue;

          const [start, end] = segments[i];
          if (start.x === current.x && start.y === current.y) {
            currentPath.push(end);
            current = end;
            used.add(i);
            foundConnection = true;
            break;
          }
          if (end.x === current.x && end.y === current.y) {
            currentPath.push(start);
            current = start;
            used.add(i);
            foundConnection = true;
            break;
          }
        }
      } while (foundConnection);

      paths.push(currentPath);
    }

    return paths;
  }
}

// Main routing function
export function findRectilinearPaths(terminals, gridSize) {
  const router = new RectilinearRouter(terminals, gridSize);
  return router.optimizeWithSteinerPoints();
}

// Función auxiliar para fusionar secciones solapadas
const mergeSections = (sections) => {
  let merged = true;
  while (merged) {
    merged = false;
    const sectionEntries = Array.from(sections.entries());
    
    for (let i = 0; i < sectionEntries.length; i++) {
      const [key1, sec1] = sectionEntries[i];
      
      for (let j = i + 1; j < sectionEntries.length; j++) {
        const [key2, sec2] = sectionEntries[j];
        
        if (sec1.function === sec2.function && sec1.overlaps(sec2)) {
          sec1.merge(sec2);
          sections.delete(key2);
          merged = true;
          break;
        }
      }
      
      if (merged) break;
    }
  }
};