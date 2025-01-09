/**
 * Implementación de algoritmo de Steiner Tree basado en MST
 * usando la aproximación de Kou, Markowsky & Berman
 */

const MinHeap = require('heap');
import { pathContainsSegment } from './cableUtils';

// Estructura para el grafo
class Graph {
  constructor() {
    this.vertices = new Set();
    this.edges = new Map(); // Map<string, {start, end, weight}>
    this.adjacencyList = new Map();
  }

  addVertex(vertex) {
    this.vertices.add(JSON.stringify(vertex));
    if (!this.adjacencyList.has(JSON.stringify(vertex))) {
      this.adjacencyList.set(JSON.stringify(vertex), []);
    }
  }

  addEdge(start, end, weight) {
    const edgeKey = `${JSON.stringify(start)}-${JSON.stringify(end)}`;
    this.edges.set(edgeKey, { start, end, weight });
    
    this.adjacencyList.get(JSON.stringify(start)).push({vertex: end, weight});
    this.adjacencyList.get(JSON.stringify(end)).push({vertex: start, weight});
  }
}

/**
 * Verifica si un punto es válido dentro del grid
 */
function isValidPoint(point, gridSize) {
  return point.x >= 0 && 
         point.x < gridSize.width && 
         point.y >= 0 && 
         point.y < gridSize.height;
}

/**
 * Encuentra los puntos de Steiner óptimos para un conjunto de terminales
 */
function findSteinerPoints(terminals, existingPaths, gridSize) {
  const candidatePoints = new Set();
  
  // 1. Añadir intersecciones de caminos existentes como candidatos
  for (const path of existingPaths.values()) {
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      if (isValidPoint(point, gridSize)) {
        candidatePoints.add(JSON.stringify(point));
      }
    }
  }

  // 2. Añadir puntos de Hanan (intersecciones de coordenadas x,y de terminales)
  const xCoords = [...new Set(terminals.map(t => t.x))].sort((a, b) => a - b);
  const yCoords = [...new Set(terminals.map(t => t.y))].sort((a, b) => a - b);
  
  for (const x of xCoords) {
    for (const y of yCoords) {
      const point = { x, y };
      if (isValidPoint(point, gridSize)) {
        candidatePoints.add(JSON.stringify(point));
      }
    }
  }

  return Array.from(candidatePoints).map(p => JSON.parse(p));
}

/**
 * Construye un grafo completo con los puntos dados
 */
function buildCompleteGraph(points, existingPaths) {
  const graph = new Graph();
  
  // Añadir todos los vértices
  points.forEach(point => graph.addVertex(point));
  
  // Conectar cada par de puntos
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const start = points[i];
      const end = points[j];
      
      // Calcular peso considerando caminos existentes
      const weight = calculateEdgeWeight(start, end, existingPaths);
      graph.addEdge(start, end, weight);
    }
  }
  
  return graph;
}

/**
 * Calcula el peso de una arista considerando caminos existentes
 */
function calculateEdgeWeight(start, end, existingPaths) {
  const baseCost = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
  
  // Verificar si el camino ya existe
  for (const path of existingPaths.values()) {
    if (pathContainsSegment(path, start, end)) {
      return baseCost * 0.1; // 90% de descuento si ya existe
    }
  }
  
  return baseCost;
}

/**
 * Implementación de Prim para MST
 */
function findMST(graph, startVertex) {
  const visited = new Set();
  const mst = new Graph();
  const pq = new MinHeap((a, b) => a.weight - b.weight);
  
  // Añadir el vértice inicial
  visited.add(JSON.stringify(startVertex));
  mst.addVertex(startVertex);
  
  // Añadir aristas adyacentes al PQ
  graph.adjacencyList.get(JSON.stringify(startVertex)).forEach(({vertex, weight}) => {
    pq.push({
      start: startVertex,
      end: vertex,
      weight
    });
  });
  
  while (!pq.empty()) {
    const { start, end, weight } = pq.pop();
    
    if (visited.has(JSON.stringify(end))) continue;
    
    // Añadir el nuevo vértice y arista al MST
    visited.add(JSON.stringify(end));
    mst.addVertex(end);
    mst.addEdge(start, end, weight);
    
    // Añadir nuevas aristas al PQ
    graph.adjacencyList.get(JSON.stringify(end)).forEach(({vertex, weight}) => {
      if (!visited.has(JSON.stringify(vertex))) {
        pq.push({
          start: end,
          end: vertex,
          weight
        });
      }
    });
  }
  
  return mst;
}

/**
 * Función principal que implementa el algoritmo de Steiner
 */
export function findOptimalSteinerTree(terminals, existingPaths, gridSize) {
  // 1. Encontrar puntos de Steiner candidatos
  const steinerPoints = findSteinerPoints(terminals, existingPaths, gridSize);
  
  // 2. Construir grafo completo con terminales y puntos de Steiner
  const allPoints = [...terminals, ...steinerPoints];
  const completeGraph = buildCompleteGraph(allPoints, existingPaths);
  
  // 3. Encontrar MST
  const mst = findMST(completeGraph, terminals[0]);
  
  // 4. Optimizar eliminando puntos de Steiner innecesarios
  const optimizedTree = pruneTree(mst, new Set(terminals.map(t => JSON.stringify(t))));
  
  return optimizedTree;
}

/**
 * Elimina puntos de Steiner innecesarios
 */
function pruneTree(tree, requiredPoints) {
  const optimizedTree = new Graph();
  
  // Copiar vértices y aristas necesarios
  for (const [edgeKey, edge] of tree.edges) {
    const startStr = JSON.stringify(edge.start);
    const endStr = JSON.stringify(edge.end);
    
    if (requiredPoints.has(startStr) || requiredPoints.has(endStr)) {
      optimizedTree.addVertex(edge.start);
      optimizedTree.addVertex(edge.end);
      optimizedTree.addEdge(edge.start, edge.end, edge.weight);
    }
  }
  
  return optimizedTree;
} 