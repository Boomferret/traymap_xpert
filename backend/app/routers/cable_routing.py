from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass
import itertools
from heapq import heappush, heappop
from collections import deque
import math
import logging

router = APIRouter()

# Add new model for cable update request
class CableUpdateRequest(BaseModel):
    cableLabel: Optional[str] = None
    source: str
    target: str
    newLength: str

@router.post("/update-cable-length")
async def update_cable_length(request: CableUpdateRequest):
    """
    Update a cable's length. This is a simplified endpoint that just confirms
    the update. The actual re-optimization should be triggered by the frontend
    by calling the optimize-paths endpoint again with updated cable data.
    """
    try:
        print(f"[CABLE UPDATE] Received request to update cable {request.cableLabel or f'{request.source}-{request.target}'} to length {request.newLength}")
        
        return {
            "success": True,
            "message": f"Cable length updated to {request.newLength}",
            "cableIdentifier": request.cableLabel or f"{request.source}-{request.target}"
        }
    
    except Exception as ex:
        import traceback
        print("\n=== ERROR in update_cable_length ===")
        print(traceback.format_exc())
        raise HTTPException(500, f"Error updating cable length: {ex}")

# -------------------------------------------------------------
# Logging setup
# -------------------------------------------------------------
# We prefer the standard logging module over raw `print` so that
# the caller can configure verbosity (e.g. DEBUG vs INFO) and sink.

logger = logging.getLogger("traymap.cable_routing")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(_h)
    # default level can be overridden by the main application
    logger.setLevel(logging.INFO)

# ----------------- MODELS / DATA STRUCTS -----------------

class Point(BaseModel):
    x: int
    y: int

class Machine(BaseModel):
    x: int
    y: int
    description: Optional[str] = None
    mergedHistory: Optional[Dict[str, bool]] = None

class Cable(BaseModel):
    cableLabel: Optional[str] = None
    source: str
    target: str
    originalSource: Optional[str] = None
    originalTarget: Optional[str] = None
    diameter: Optional[float] = None
    cableFunction: Optional[str] = None
    network: Optional[str] = None
    cableType: Optional[str] = None
    length: Optional[str] = None

class GridConfig(BaseModel):
    gridResolution: Optional[float] = 0.1
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    walls: List[Point] = []
    trays: List[Point]=[]
    perforations: List[Point] = []
    machines: Dict[str, Machine] = {}
    cables: List[Cable] = []
    networks: List[Dict] = []

class CableDetail(BaseModel):
    cableLabel: Optional[str] = None
    source: str
    target: str
    originalSource: Optional[str] = None
    originalTarget: Optional[str] = None
    diameter: Optional[float] = None
    cableFunction: Optional[str] = None
    network: Optional[str] = None
    cableType: Optional[str] = None
    routeLength: Optional[float] = None
    length: Optional[str] = None

class Section(BaseModel):
    points: List[Point]
    cables: Set[str]
    network: Optional[str] = None
    details: Dict[str, CableDetail]
    strokeWidth: Optional[float] = None

class DebugInfo(BaseModel):
    initial_mst_length: float
    final_length: float
    improvement_percentage: float
    num_steiner_points: int
    num_sections: int
    num_components_tried: int
    num_components_used: int
    passes_used: int

class ProblematicCable(BaseModel):
    cableLabel: Optional[str] = None
    source: str
    target: str
    specifiedLength: float
    routeLength: float
    theoreticalMinLength: float
    excessLength: float
    excessPercentage: float

class RoutingResponse(BaseModel):
    sections: List[Section] = []
    cableRoutes: Dict[str, List[Point]] = {}
    hananGrid: Dict[str, List[int]] = {
        "xCoords": [],
        "yCoords": []
    }
    steinerPoints: List[Dict[str, int]] = []
    debug_info: Optional[DebugInfo] = None
    problematicCables: List[ProblematicCable] = []

@dataclass
class PathPoint:
    x: int
    y: int

    def __eq__(self, other):
        if not isinstance(other, PathPoint):
            return NotImplemented
        return (self.x == other.x) and (self.y == other.y)

    def __hash__(self):
        return hash((self.x, self.y))
    
    def __lt__(self, other):
        if not isinstance(other, PathPoint):
            return NotImplemented
        return (self.x, self.y) < (other.x, other.y)
    
    def __le__(self, other):
        if not isinstance(other, PathPoint):
            return NotImplemented
        return (self.x, self.y) <= (other.x, other.y)
    
    def __gt__(self, other):
        if not isinstance(other, PathPoint):
            return NotImplemented
        return (self.x, self.y) > (other.x, other.y)
    
    def __ge__(self, other):
        if not isinstance(other, PathPoint):
            return NotImplemented
        return (self.x, self.y) >= (other.x, other.y)

@dataclass
class FullComponent:
    terminals: List[PathPoint]
    steiner_points: List[PathPoint]
    connections: List[Tuple[PathPoint, PathPoint]]
    gain: float = 0.0

# ----------------- HELPER FUNCTIONS -----------------

def calculate_cell_weight(x: int, y: int, width: int, height: int, walls: Set[PathPoint], trays: Set[PathPoint]=[],redCalble:float = 1.0) -> float:
    """
    Calculate the weight for a cell based on its distance to the nearest wall.
    Cells closer to walls have lower weights (preferred for routing).
    """
    min_dist_to_tray = float('inf')
    for tray in trays:
        dist = abs(x - tray.x) + abs(y - tray.y)
        min_dist_to_tray = min(min_dist_to_tray, dist)

    if min_dist_to_tray == 0 and redCalble==1.0:
        return -0.40 
    

    # Base weight for open areas
    base_weight = 10.0
    
    # Find minimum distance to any wall
    min_dist_to_wall = float('inf')
    
    # Don't consider canvas boundaries as walls - only check internal walls
    # Check distance to internal walls
    for wall in walls:
        dist = abs(x - wall.x) + abs(y - wall.y)  # Manhattan distance
        min_dist_to_wall = min(min_dist_to_wall, dist)

    # If no walls exist, return base weight
    if min_dist_to_wall == float('inf'):
        return base_weight

    # Weight calculation: closer to walls = lower weight
    # Weight decreases exponentially as we get closer to walls
    #if the cable is shorther than te route we add a new param to be able to recalcule the weights
    if min_dist_to_wall == 0:
        return base_weight * 10  # High penalty for being on a wall (shouldn't happen)
    elif min_dist_to_wall == 1:
        return base_weight * 0.3  # Very low weight for adjacent to walls
    elif min_dist_to_wall == 2:
        return base_weight * 0.5 *redCalble # Low weight for cells 2 steps from walls
    elif min_dist_to_wall == 3:
        if redCalble!= 1.0:
            redCalble=redCalble/2
        return base_weight * 0.7 *redCalble # Moderate weight
    else:
        return base_weight  # Full weight for cells far from walls

# Legacy (slow) version kept for reference – DO NOT USE.
def _build_weighted_graph_old(width: int, height: int, walls: Set[PathPoint], trays: Set[PathPoint] = set(),redCable:float = 1.0) -> Dict[PathPoint, List[Tuple[PathPoint, float]]]:
    """
    Build adjacency with weights. Each neighbor has (neighbor_point, weight) where 
    weight favors cells closer to walls.
    """
    graph = {}
    for x in range(width):
        for y in range(height):
            p = PathPoint(x, y)
            if p in walls:
                continue
            neighbors = []
            for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]:
                if 0 <= nx < width and 0 <= ny < height:
                    np = PathPoint(nx, ny)
                    if np not in walls:
                        # Calculate weight for the destination cell
                        weight = calculate_cell_weight(nx, ny, width, height, walls,trays,redCable)
                        neighbors.append((np, weight))
            graph[p] = neighbors
    return graph

# ============================================================
# NEW: DISTANCE TRANSFORM + FASTER WEIGHT COMPUTATION
# ============================================================

def _bfs_distance_map(width: int, height: int, sources: Set[PathPoint]) -> List[List[int]]:
    """Return a 2-D list with Manhattan distance to the closest point in *sources* using BFS."""
    logger.debug(f"Computing distance map for {len(sources)} sources on {width}x{height} grid…")
    # Initialise with +inf
    dist = [[math.inf for _ in range(width)] for _ in range(height)]
    q = deque()

    for p in sources:
        if 0 <= p.x < width and 0 <= p.y < height:
            dist[p.y][p.x] = 0
            q.append((p.x, p.y))

    # 4-neighbour BFS
    while q:
        x, y = q.popleft()
        d = dist[y][x] + 1
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < width and 0 <= ny < height and d < dist[ny][nx]:
                dist[ny][nx] = d
                q.append((nx, ny))

    logger.debug("Distance map computed.")
    return dist


def _compute_weight(dist_wall: int, dist_tray: int, redCable: float = 1.0) -> float:
    """Vectorised replacement for *calculate_cell_weight* using pre-computed distances."""
    # Base weight configuration copied from original logic
    if dist_tray == 0 and redCable == 1.0:
        return 0

    base_weight = 10.0

    if dist_wall == math.inf:
        return base_weight

    if dist_wall == 0:
        return base_weight * 10  # High penalty for being on a wall (shouldn't happen – we skip walls)
    elif dist_wall == 1:
        return base_weight * 0.35
    elif dist_wall == 2:
        return base_weight * 0.55* redCable
    elif dist_wall == 3:
        if redCable != 1.0:
            redCable = redCable / 2
        return base_weight * 0.7 * redCable
    else:
        return base_weight * redCable


def build_weighted_graph(
    width: int,
    height: int,
    walls: Set[PathPoint],
    trays: Set[PathPoint] = set(),
    redCable: float = 1.0,
    dist_wall: Optional[List[List[int]]] = None,
    dist_tray: Optional[List[List[int]]] = None,
) -> Dict[PathPoint, List[Tuple[PathPoint, float]]]:
    """Build adjacency list where edge weights favour cells near walls.

    The function now uses *distance transforms* so each weight is O(1).
    Pass pre-computed *dist_wall* and *dist_tray* for maximum speed.
    """
    logger.debug(f"Building weighted graph (redCable={redCable}) …")

    # Compute distance maps lazily if not provided
    if dist_wall is None:
        dist_wall = _bfs_distance_map(width, height, walls)
    if dist_tray is None:
        dist_tray = _bfs_distance_map(width, height, trays)

    graph: Dict[PathPoint, List[Tuple[PathPoint, float]]] = {}

    for x in range(width):
        for y in range(height):
            p = PathPoint(x, y)
            if p in walls:
                continue  # Impassable

            weight_here_wall = dist_wall[y][x]
            weight_here_tray = dist_tray[y][x]

            neighbors: List[Tuple[PathPoint, float]] = []
            for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if 0 <= nx < width and 0 <= ny < height:
                    np = PathPoint(nx, ny)
                    if np in walls:
                        continue

                    w = _compute_weight(dist_wall[ny][nx], dist_tray[ny][nx], redCable)
                    neighbors.append((np, w))

            graph[p] = neighbors

    logger.debug("Weighted graph built.")
    return graph

def dijkstra_path(start: PathPoint, end: PathPoint, 
                  graph: Dict[PathPoint, List[Tuple[PathPoint, float]]]) -> Optional[Tuple[float, List[PathPoint]]]:
    """
    Dijkstra's algorithm to find the lowest-cost path from start to end.
    Returns (total_cost, path) or None if no path exists.
    """
    if start not in graph or end not in graph:
        return None
    
    # Priority queue: (cost, counter, current_point)
    counter = itertools.count()
    heap = [(0.0, next(counter), start)]
    distances = {start: 0.0}
    came_from = {start: None}
    visited = set()

    while heap:
        current_cost, _, current = heappop(heap)
        
        if current in visited:
            continue
            
        visited.add(current)
        
        if current == end:
            # Reconstruct path
            path = []
            node = current
            while node is not None:
                path.append(node)
                node = came_from[node]
            path.reverse()
            return (current_cost, path)
        
        for neighbor, edge_weight in graph[current]:
            if neighbor in visited:
                continue
                
            new_cost = current_cost + edge_weight
            
            if neighbor not in distances or new_cost < distances[neighbor]:
                distances[neighbor] = new_cost
                came_from[neighbor] = current
                heappush(heap, (new_cost, next(counter), neighbor))
    
    return None

# -----------------------------------------------------------
# NEW: Multi-target Dijkstra + Lazy MST builder
# -----------------------------------------------------------


def _dijkstra_to_targets(
    source: PathPoint,
    target_set: Set[PathPoint],
    graph: Dict[PathPoint, List[Tuple[PathPoint, float]]],
) -> Dict[PathPoint, Tuple[float, List[PathPoint]]]:
    """Run Dijkstra from *source* until every *target* is reached.

    Returns mapping of target → (cost, path).
    """

    if not target_set:
        return {}

    counter = itertools.count()
    heap: List[Tuple[float, int, PathPoint]] = [(0.0, next(counter), source)]
    distances = {source: 0.0}
    came_from: Dict[PathPoint, Optional[PathPoint]] = {source: None}

    results: Dict[PathPoint, Tuple[float, List[PathPoint]]] = {}

    targets_remaining = set(target_set)

    while heap and targets_remaining:
        current_cost, _, current = heappop(heap)

        # skip if we have already processed this node with shorter cost
        if current_cost != distances[current]:
            continue

        if current in targets_remaining:
            # reconstruct path
            path: List[PathPoint] = []
            node: Optional[PathPoint] = current
            while node is not None:
                path.append(node)
                node = came_from[node]
            path.reverse()
            results[current] = (current_cost, path)
            targets_remaining.remove(current)
            if not targets_remaining:
                break

        for neighbor, w in graph[current]:
            new_cost = current_cost + w
            if neighbor not in distances or new_cost < distances[neighbor]:
                distances[neighbor] = new_cost
                came_from[neighbor] = current
                heappush(heap, (new_cost, next(counter), neighbor))

    return results


def build_mst_lazy(
    terminals: List[PathPoint],
    graph: Dict[PathPoint, List[Tuple[PathPoint, float]]],
) -> Tuple[List[Tuple[PathPoint, PathPoint]], Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]]:
    """Prim’s MST where each Dijkstra runs only once per terminal.

    Returns (mst_edges, pair_routes).
    """

    if not terminals:
        return [], {}

    print(
        f"Building MST lazily: {len(terminals)} terminals – at most {len(terminals)} Dijkstra runs instead of {len(terminals)*(len(terminals)-1)//2}."
    )

    visited: Set[PathPoint] = set()
    pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]] = {}
    mst_edges: List[Tuple[PathPoint, PathPoint]] = []

    # min-heap of candidate edges (cost, u, v) with u visited, v not yet
    edge_heap: List[Tuple[float, int, PathPoint, PathPoint]] = []
    counter = itertools.count()

    start = terminals[0]
    visited.add(start)

    # initial distances from start to all others
    targets = set(terminals[1:])
    for tgt, (cost, path) in _dijkstra_to_targets(start, targets, graph).items():
        pair_routes[(start, tgt)] = (cost, path)
        pair_routes[(tgt, start)] = (cost, list(reversed(path)))
        heappush(edge_heap, (cost, next(counter), start, tgt))

    while len(visited) < len(terminals):
        # Extract cheapest edge to an unvisited terminal
        while edge_heap and edge_heap[0][2] in visited and edge_heap[0][3] in visited:
            heappop(edge_heap)

        if not edge_heap:
            logger.warning("Graph appears disconnected – MST incomplete")
            break

        cost, _, u, v = heappop(edge_heap)
        if v in visited:
            continue

        mst_edges.append((u, v))
        visited.add(v)

        # Dijkstra from newly visited terminal to all yet-unvisited terminals
        remaining = set(t for t in terminals if t not in visited)
        if remaining:
            for tgt, (cost_vt, path_vt) in _dijkstra_to_targets(v, remaining, graph).items():
                pair_routes[(v, tgt)] = (cost_vt, path_vt)
                pair_routes[(tgt, v)] = (cost_vt, list(reversed(path_vt)))
                heappush(edge_heap, (cost_vt, next(counter), v, tgt))

    print(f"Lazy MST completed with {len(mst_edges)} edges and {len(pair_routes)//2} unique pair routes computed.")

    return mst_edges, pair_routes

def path_distance(path: List[PathPoint]) -> int:
    """Number of edges in a path => len(path)-1."""
    return max(0, len(path) - 1)

def weighted_path_cost(path: List[PathPoint], width: int, height: int, walls: Set[PathPoint], trays: Set[PathPoint] = set()) -> float:
    """Calculate the actual weighted cost of a path."""
    if len(path) <= 1:
        return 0.0
    
    total_cost = 0.0
    for i in range(1, len(path)):
        p = path[i]
        weight = calculate_cell_weight(p.x, p.y, width, height, walls,trays=trays)
        total_cost += weight
    return total_cost

# ----------------- PAIRWISE ROUTES + MST -----------------

def precompute_machine_pairs(terminals: List[PathPoint],
                             weighted_graph: Dict[PathPoint, List[Tuple[PathPoint, float]]], 
                             width: int, height: int, walls: Set[PathPoint]
                            ) -> Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]:
    """
    For each pair of terminal machines, run Dijkstra's algorithm.
    Store (weighted_cost, path) if found.
    """
    pair_routes = {}
    n = len(terminals)
    print(f"Precomputing routes for {n} terminals with wall-aware weights...")
    
    for i in range(n):
        for j in range(i+1, n):
            pA = terminals[i]
            pB = terminals[j]
            result = dijkstra_path(pA, pB, weighted_graph)
            if result:
                cost, route = result
                pair_routes[(pA, pB)] = (cost, route)
                pair_routes[(pB, pA)] = (cost, list(reversed(route)))
    
    print(f"Successfully computed {len(pair_routes)} pairwise routes")
    return pair_routes

def find_wall_aware_mst(terminals: List[PathPoint],
                        pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]
                       ) -> List[Tuple[PathPoint, PathPoint]]:
    """
    Prim's MST on weighted Dijkstra edges from pair_routes.
    """
    if not terminals:
        return []

    visited = set()
    mst_edges = []
    visited.add(terminals[0])
    heap = []
    counter = itertools.count()

    # Initialize edges from the first terminal
    for t in terminals[1:]:
        if (terminals[0], t) in pair_routes:
            cost = pair_routes[(terminals[0], t)][0]
            heappush(heap, (cost, next(counter), terminals[0], t))

    while len(visited) < len(terminals) and heap:
        cost, _, u, v = heappop(heap)
        if v in visited:
            continue
        visited.add(v)
        mst_edges.append((u, v))
        for w in terminals:
            if w not in visited:
                if (v, w) in pair_routes:
                    dw = pair_routes[(v, w)][0]
                    heappush(heap, (dw, next(counter), v, w))

    return mst_edges

def mst_total_length(mst_edges: List[Tuple[PathPoint, PathPoint]],
                     pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]) -> float:
    """Sum weighted costs for these edges."""
    total = 0.0
    for (u, v) in mst_edges:
        cost, _ = pair_routes.get((u, v), (0.0, []))
        total += cost
    return total

# ----------------- GENERATE STEINER COMPONENTS -----------------

def mst_sub_length_in_group(
    group: Set[PathPoint],
    mst_edges: List[Tuple[PathPoint, PathPoint]],
    pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]
) -> float:
    """
    Sum weighted costs for edges entirely within 'group'.
    """
    sub_len = 0.0
    for (a, b) in mst_edges:
        if a in group and b in group:
            sub_len += pair_routes[(a, b)][0]
    return sub_len

def find_promising_terminal_groups(terminals: List[PathPoint], 
                                 pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]],
                                 cables: List[Cable],
                                 machines: Dict[str, Machine],
                                 max_groups: int = 50) -> List[List[PathPoint]]:
    """
    Find promising groups of 3-4 terminals that are:
    1. Close to each other (using Dijkstra distances)
    2. Connected by cables in the same network
    3. Form potential corner/intersection patterns
    """
    # Build network groups
    network_groups = {}
    for cable in cables:
        src_pt = PathPoint(machines[cable.source].x, machines[cable.source].y)
        dst_pt = PathPoint(machines[cable.target].x, machines[cable.target].y)
        net = cable.network or "default"
        network_groups.setdefault(net, set()).add(src_pt)
        network_groups.setdefault(net, set()).add(dst_pt)

    promising_groups = []
    
    # For each network group
    for net_terminals in network_groups.values():
        if len(net_terminals) < 3:
            continue
            
        # Find terminals that form L or T shapes
        for t1 in net_terminals:
            nearby = []
            # Find terminals close to t1
            for t2 in net_terminals:
                if t1 == t2:
                    continue
                if (t1, t2) in pair_routes:
                    dist, _ = pair_routes[(t1, t2)]
                    nearby.append((dist, t2))  # tuple of (distance, point)
            
            # Sort by distance only (first element of tuple)
            nearby.sort(key=lambda x: x[0])  # Sort by distance
            nearby = nearby[:5]  # Consider only 5 closest neighbors
            
            # Look for L-shapes (3 terminals)
            for _, t2 in nearby:
                for _, t3 in nearby:
                    if t2 == t3:
                        continue
                    # Check if they form roughly an L-shape
                    if (abs(t1.x - t2.x) + abs(t2.y - t3.y) < 
                        abs(t1.x - t3.x) + abs(t2.y - t1.y)):
                        promising_groups.append([t1, t2, t3])
                        
                    # Look for potential T or H shapes (4 terminals)
                    for _, t4 in nearby:
                        if t4 in (t1, t2, t3):
                            continue
                        # Check for T-shape potential
                        if (abs(t1.x - t2.x) > abs(t3.x - t4.x) and
                            abs(t3.y - t4.y) > abs(t1.y - t2.y)):
                            promising_groups.append([t1, t2, t3, t4])

    # Remove duplicates and limit total groups
    unique_groups = []
    seen = set()
    for group in promising_groups:
        group_key = tuple(sorted((t.x, t.y) for t in group))
        if group_key not in seen:
            seen.add(group_key)
            unique_groups.append(group)
            if len(unique_groups) >= max_groups:
                break

    print(f"\nFound {len(unique_groups)} promising terminal groups")
    return unique_groups

def generate_all_components(
    terminals: List[PathPoint], 
    mst_edges: List[Tuple[PathPoint, PathPoint]], 
    pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]], 
    weighted_graph: Dict[PathPoint, List[Tuple[PathPoint, float]]],
    width: int,
    height: int,
    walls: Set[PathPoint],
    trays:Set[PathPoint],
    cables: List[Cable] = None,
    machines: Dict[str, Machine] = None
) -> List[FullComponent]:
    """
    Instead of trying all combinations, only try promising groups
    that are likely to form good Steiner components.
    """
    comps = []

    # Memoisation cache for ad-hoc Dijkstra requests in this call
    dijkstra_cache: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]] = {}

    def get_path(u: PathPoint, v: PathPoint) -> Tuple[float, List[PathPoint]]:
        """Return (cost,path) for u→v using cache / pair_routes / fresh Dijkstra."""
        if (u, v) in dijkstra_cache:
            return dijkstra_cache[(u, v)]
        if (u, v) in pair_routes:
            dijkstra_cache[(u, v)] = pair_routes[(u, v)]
            return pair_routes[(u, v)]

        res = dijkstra_path(u, v, weighted_graph)
        if res:
            cost, path = res
            # store bidirectionally in pair_routes for future global reuse
            pair_routes[(u, v)] = (cost, path)
            pair_routes[(v, u)] = (cost, list(reversed(path)))
            dijkstra_cache[(u, v)] = (cost, path)
            dijkstra_cache[(v, u)] = (cost, list(reversed(path)))
            return cost, path
        # unreachable in normal grids; return high cost placeholder
        return float('inf'), []

    # ------------------------------------------------------------
    # Helper: accurate gain calculation for a component
    # ------------------------------------------------------------

    def component_gain(connections: List[Tuple[PathPoint, PathPoint]], group_set: Set[PathPoint]) -> Tuple[float, float, float]:
        """Return (removed_cost, added_cost, gain) for the component."""
        # 1) cost removed - use merged cost to avoid double counting
        old_paths = []
        for (u, v) in mst_edges:
            if u in group_set and v in group_set:
                old_paths.append(pair_routes[(u, v)][1])
        
        # Calculate merged cost to avoid double-counting shared cells
        visited = set()
        removed = 0.0
        for path in old_paths:
            for p in path[1:]:  # Skip first point to avoid double counting endpoints
                if p not in visited:
                    visited.add(p)
                    removed += calculate_cell_weight(p.x, p.y, width, height, walls, trays)

        # 2) cost added - also use merged cost to avoid double counting
        new_paths = []
        for (u, v) in connections:
            _, path = get_path(u, v)
            if not path:
                return (removed, float('inf'), -float('inf'))
            new_paths.append(path)
        
        # Calculate merged cost for new connections
        visited = set()
        added = 0.0
        for path in new_paths:
            for p in path[1:]:  # Skip first point to avoid double counting endpoints
                if p not in visited:
                    visited.add(p)
                    added += calculate_cell_weight(p.x, p.y, width, height, walls, trays)
        
        gain_val = removed - added
        return removed, added, gain_val

    # Get promising groups instead of all combinations
    if cables and machines:
        groups = find_promising_terminal_groups(terminals, pair_routes, cables, machines)
    else:
        # Fallback to simple combinations if cables/machines not provided
        groups = []
        for size in [3, 4]:
            for group in itertools.combinations(terminals, size):
                groups.append(list(group))
    
    for group in groups:
        if len(group) == 3:
            # Try 3-terminal component
            t1, t2, t3 = group
            group_set = {t1, t2, t3}

            # --- fast lower-bound check ----------------------------------
            removed_lb = 0.0
            for (u,v) in mst_edges:
                if u in group_set and v in group_set:
                    removed_lb += pair_routes[(u,v)][0]

            # Simple span lower bound
            span_lb = (max(p.x for p in group_set) - min(p.x for p in group_set)) + \
                       (max(p.y for p in group_set) - min(p.y for p in group_set))

            if removed_lb - span_lb <= 0:
                print(f"[SkipLB] 3-term span LB {[(p.x,p.y) for p in group_set]} removed={removed_lb:.1f} spanLB={span_lb:.1f}")
                continue

            xs = sorted([t1.x, t2.x, t3.x])
            ys = sorted([t1.y, t2.y, t3.y])
            sx, sy = xs[1], ys[1]
            lb_cost = (abs(sx - t1.x) + abs(sy - t1.y) +
                       abs(sx - t2.x) + abs(sy - t2.y) +
                       abs(sx - t3.x) + abs(sy - t3.y))

            if removed_lb - lb_cost <= 0:
                print(f"[SkipLB] 3-term group {[(p.x,p.y) for p in group_set]} removed={removed_lb:.1f} lb={lb_cost:.1f}")
                continue

            xs = sorted([t1.x, t2.x, t3.x])
            ys = sorted([t1.y, t2.y, t3.y])
            sx, sy = xs[1], ys[1]  # median
            lb_cost = (abs(sx - t1.x) + abs(sy - t1.y) +
                       abs(sx - t2.x) + abs(sy - t2.y) +
                       abs(sx - t3.x) + abs(sy - t3.y))

            if removed_lb - lb_cost <= 0:
                print(f"[SkipLB] 3-term group {[(p.x,p.y) for p in group_set]} removed={removed_lb:.1f} lb={lb_cost:.1f}")
                continue

            xs = sorted([t1.x, t2.x, t3.x])
            ys = sorted([t1.y, t2.y, t3.y])
            sx, sy = xs[1], ys[1]  # median
            sp = PathPoint(sx, sy)

            r1 = dijkstra_path(sp, t1, weighted_graph)
            r2 = dijkstra_path(sp, t2, weighted_graph)
            r3 = dijkstra_path(sp, t3, weighted_graph)
            if not (r1 and r2 and r3):
                continue
            # Compute gain properly while being robust to 2-tuple fallbacks
            cg_result = component_gain([(sp, t1), (sp, t2), (sp, t3)], group_set)
            if len(cg_result) == 2:
                removed_cost, added_cost = cg_result
                gain = removed_cost - added_cost
            else:
                removed_cost, added_cost, gain = cg_result
            print(f"[SteinerTest] 3-term at ({sx},{sy}): removed={removed_cost:.2f}, added={added_cost:.2f}, gain={gain:.2f}")
            if gain > 0:
                conns = [(sp, t1), (sp, t2), (sp, t3)]
                comps.append(
                    FullComponent(
                        terminals=[t1,t2,t3],
                        steiner_points=[sp],
                        connections=conns,
                        gain=gain
                    )
                )
                
        elif len(group) == 4:
            # Try 4-terminal component with pairwise partition
            t1, t2, t3, t4 = group
            group_set = {t1, t2, t3, t4}

            removed_lb = 0.0
            for (u,v) in mst_edges:
                if u in group_set and v in group_set:
                    removed_lb += pair_routes[(u,v)][0]

            # Simple span lower bound
            span_lb = (max(p.x for p in group_set) - min(p.x for p in group_set)) + \
                       (max(p.y for p in group_set) - min(p.y for p in group_set))

            if removed_lb - span_lb <= 0:
                print(f"[SkipLB] 4-term span LB {[(p.x,p.y) for p in group_set]} removed={removed_lb:.1f} spanLB={span_lb:.1f}")
                continue

            cx = (min(p.x for p in group_set) + max(p.x for p in group_set))//2
            cy = (min(p.y for p in group_set) + max(p.y for p in group_set))//2
            lb_cost = sum(abs(p.x-cx)+abs(p.y-cy) for p in group_set)

            if removed_lb - lb_cost <= 0:
                print(f"[SkipLB] 4-term group {[(p.x,p.y) for p in group_set]} removed={removed_lb:.1f} lb={lb_cost:.1f}")
                continue
            
            # Try partitioning based on geometry
            if abs(t1.x - t2.x) < abs(t1.y - t2.y):
                pair_groups = [(t1, t2), (t3, t4)]
            else:
                pair_groups = [(t1, t3), (t2, t4)]
                
            for pairs in [pair_groups, list(reversed(pair_groups))]:
                (pA, pB), (pC, pD) = pairs  # Unpack the pairs
                
                # Create Steiner points at L-corners
                spA = PathPoint(pA.x, pB.y)  # L-corner for first pair
                spB = PathPoint(pC.x, pD.y)  # L-corner for second pair
                
                rA1 = dijkstra_path(spA, pA, weighted_graph)
                rA2 = dijkstra_path(spA, pB, weighted_graph)
                rB1 = dijkstra_path(spB, pC, weighted_graph)
                rB2 = dijkstra_path(spB, pD, weighted_graph)
                if not (rA1 and rA2 and rB1 and rB2):
                    continue
                rAB = dijkstra_path(spA, spB, weighted_graph)
                if not rAB:
                    continue

                connections = [(spA, pA), (spA, pB), (spB, pC), (spB, pD), (spA, spB)]
                removed_cost, added_cost, gain = component_gain(connections, group_set)
                print(f"[SteinerTest] 4-term at ({spA.x},{spA.y})/({spB.x},{spB.y}): removed={removed_cost:.2f}, added={added_cost:.2f}, gain={gain:.2f}")
                if gain > 0:
                    comps.append(
                        FullComponent(
                            terminals=list(group_set),
                            steiner_points=[spA, spB],
                            connections=connections,
                            gain=gain
                        )
                    )

    # Sort by gain as before
    comps.sort(key=lambda c: c.gain, reverse=True)
    return comps

# ----------------- MST UPDATE & ROUTING -----------------

def update_mst_with_components(
    mst_edges: List[Tuple[PathPoint, PathPoint]],
    components: List[FullComponent],
    pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]],
    weighted_graph: Dict[PathPoint, List[Tuple[PathPoint, float]]]
) -> List[Tuple[PathPoint, PathPoint]]:
    """
    Incorporate chosen component edges & possible new Steiner points, then re-run MST.
    """
    points = set()
    for (u, v) in mst_edges:
        points.add(u)
        points.add(v)
    for comp in components:
        for sp in comp.steiner_points:
            points.add(sp)
        for (u, v) in comp.connections:
            if (u, v) not in pair_routes:
                result = dijkstra_path(u, v, weighted_graph)
                if result:
                    cost, route = result
                    pair_routes[(u, v)] = (cost, route)
                    pair_routes[(v, u)] = (cost, list(reversed(route)))

    new_points = list(points)
    new_mst = find_wall_aware_mst(new_points, pair_routes)
    return new_mst

def build_mst_adjacency(mst_edges: List[Tuple[PathPoint, PathPoint]],
                        pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]
                       ) -> Dict[PathPoint, Set[PathPoint]]:
    """
    Create a graph adjacency for all Dijkstra paths used by MST edges.
    If MST edge (u,v) has path p1->p2->...->pn, link them in both directions.
    """
    adjacency = {}
    for (u, v) in mst_edges:
        dist_uv, path_uv = pair_routes.get((u, v), (0.0, []))
        for i in range(len(path_uv)-1):
            p1 = path_uv[i]
            p2 = path_uv[i+1]
            adjacency.setdefault(p1, set()).add(p2)
            adjacency.setdefault(p2, set()).add(p1)
    return adjacency

def detect_steiner_points(mst_adjacency: Dict[PathPoint, Set[PathPoint]]) -> Set[PathPoint]:
    """
    A 'natural' Steiner point or T-junction is any node with degree >= 3.
    """
    result = set()
    for p, nbrs in mst_adjacency.items():
        if len(nbrs) >= 3:
            result.add(p)
    return result

def split_path_at_steiner_points(path_uv: List[PathPoint],
                                 steiner_points: Set[PathPoint]
                                ) -> List[List[PathPoint]]:
    """
    Given a Dijkstra path from MST (u-> ... -> v),
    split it into sub-paths whenever we hit a Steiner point in the interior.
    Example:
      path = [A, ..., X, S, Y, ..., B], where S is a steiner point, yields
      [A, ..., X, S] and [S, Y, ..., B].
    If there's multiple steiner points, we keep splitting.
    """
    segments = []
    current_segment = []
    for i, p in enumerate(path_uv):
        current_segment.append(p)
        if i < len(path_uv)-1:
            # if p is a steiner point and not the very last point
            if p in steiner_points and i != 0:
                # segment ends here
                segments.append(current_segment)
                current_segment = [p]
        else:
            # last point => always end the final segment
            segments.append(current_segment)
    return segments

def find_cable_route(src: PathPoint, dst: PathPoint,
                     mst_edges: List[Tuple[PathPoint, PathPoint]],
                     pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]
                    ) -> List[Point]:
    """
    Build MST adjacency and search from src to dst inside that adjacency.
    Because each MST edge is a Dijkstra path, we unify them in one big adjacency.
    """
    adjacency = build_mst_adjacency(mst_edges, pair_routes)

    # If src or dst is not in adjacency, no route
    if src not in adjacency or dst not in adjacency:
        return []

    # BFS on adjacency (unweighted since we're searching in the MST structure)
    queue = deque([src])
    came_from = {src: None}
    while queue:
        current = queue.popleft()
        if current == dst:
            # reconstruct
            rev_path = []
            while current is not None:
                rev_path.append(current)
                current = came_from[current]
            rev_path.reverse()
            return [Point(x=p.x, y=p.y) for p in rev_path]
        for nbr in adjacency[current]:
            if nbr not in came_from:
                came_from[nbr] = current
                queue.append(nbr)
    return []

# ----------------- BUILDING SECTIONS -----------------

def convert_to_sections(
    grid_resolution: float ,
    final_mst: List[Tuple[PathPoint, PathPoint]],
    cables: List[Cable],
    machines: Dict[str, Machine],
    networks: List[Dict],
    pair_routes: Dict[Tuple[PathPoint, PathPoint], Tuple[float, List[PathPoint]]]
) -> List[Section]:
    """
    1) Build MST adjacency.
    2) Detect steiner points (T-junctions).
    3) For each MST edge path, we split at steiner points to form sub-segments.
    4) For each sub-segment, see which cables overlap it => form a Section.
    """
    print(f"\n=== convert_to_sections DEBUG ===")
    print(f"📥 Input: {len(cables)} cables, {len(networks)} networks, {len(final_mst)} MST edges")
    
    # Debug networks
    print(f"📊 Networks received:")
    for i, net in enumerate(networks):
        functions = net.get("functions", [])
        print(f"  Network {i+1}: '{net.get('name')}' → functions: {functions}")
    
    # 1) MST adjacency
    mst_adjacency = build_mst_adjacency(final_mst, pair_routes)
    # 2) Steiner points
    steiner_points_set = detect_steiner_points(mst_adjacency)
    print(f"🔹 Detected {len(steiner_points_set)} Steiner points")

    # We'll soon need Dijkstra-based cable routes:
    cable_routes = {}
    cable_lengths = {}

    # Quick Dijkstra route for each cable
    def calc_length(points: List[Point]) -> float:
        return (len(points)-1) * grid_resolution if len(points)>1 else 0.0

    for cb in cables:
        cid = cb.cableLabel or f"{cb.source}-{cb.target}"
        spt = PathPoint(machines[cb.source].x, machines[cb.source].y)
        tpt = PathPoint(machines[cb.target].x, machines[cb.target].y)
        route = find_cable_route(spt, tpt, final_mst, pair_routes)
        cable_routes[cid] = route
        cable_lengths[cid] = calc_length(route)

    # Build a network lookup
    network_lookup = {}
    for net in networks:
        for func in net.get("functions", []):
            network_lookup[func] = net["name"]
    
    print(f"🔍 Network lookup table built: {len(network_lookup)} function mappings")
    for func, net_name in network_lookup.items():
        print(f"  '{func}' → '{net_name}'")

    # Group cables by network
    grouped = {}
    cables_without_network = []
    
    print(f"🔗 Processing {len(cables)} cables for network grouping:")
    for c in cables:
        cable_id = c.cableLabel or f"{c.source}-{c.target}"
        cable_func = c.cableFunction
        net_name = network_lookup.get(cable_func)
        
        print(f"  📌 Cable '{cable_id}': function='{cable_func}' → network='{net_name}'")
        
        if not net_name:
            cables_without_network.append((cable_id, cable_func))
            print(f"    ⚠️  SKIPPED: No network found for function '{cable_func}'")
            continue
            
        grouped.setdefault(net_name, []).append(c)
        print(f"    ✅ Added to network '{net_name}'")

    print(f"\n📈 Network grouping results:")
    print(f"  🎯 {len(grouped)} networks with cables:")
    for net_name, net_cables in grouped.items():
        cable_ids = [c.cableLabel or f"{c.source}-{c.target}" for c in net_cables]
        print(f"    '{net_name}': {len(net_cables)} cables → {cable_ids}")
    
    if cables_without_network:
        print(f"  ❌ {len(cables_without_network)} cables WITHOUT networks:")
        for cable_id, func in cables_without_network:
            print(f"    '{cable_id}' (function: '{func}')")

    sections = []

    # 3) For each MST edge, get Dijkstra path & split:
    total_mst_segments = 0
    total_cable_overlaps = 0
    
    print(f"\n🧩 Processing MST edges for section creation:")
    for net_name, net_cables in grouped.items():
        print(f"  🌐 Processing network '{net_name}' with {len(net_cables)} cables")
        
        for edge_idx, (u, v) in enumerate(final_mst):
            dist_uv, path_uv = pair_routes.get((u,v), (0.0, []))
            if not path_uv:
                print(f"    ⚠️  Edge {edge_idx+1}: No path found for {u} → {v}")
                continue

            print(f"    🔗 Edge {edge_idx+1}: {u} → {v} (path length: {len(path_uv)} points)")

            # Split the Dijkstra path at internal Steiner points
            sub_paths = split_path_at_steiner_points(path_uv, steiner_points_set)
            total_mst_segments += len(sub_paths)
            print(f"      📏 Split into {len(sub_paths)} sub-segments")

            # 4) For each sub-segment, see if it overlaps with cables in net_cables
            for seg_idx, seg in enumerate(sub_paths):
                pyd_points = [Point(x=p.x, y=p.y) for p in seg]
                if len(pyd_points) < 2:
                    print(f"        ⏭️  Sub-segment {seg_idx+1}: Too short ({len(pyd_points)} points)")
                    continue

                used_cables = set()
                cable_details = {}

                # naive intersection check
                seg_set = {(p.x, p.y) for p in pyd_points}
                print(f"        🔍 Sub-segment {seg_idx+1}: Checking overlap with {len(net_cables)} cables")
                
                for c in net_cables:
                    cid = c.cableLabel or f"{c.source}-{c.target}"
                    route = cable_routes[cid]
                    route_set = {(rp.x, rp.y) for rp in route}
                    # If there's an overlap of 2+ points => consider used
                    inter = seg_set.intersection(route_set)
                    
                    if len(inter) >= 2:
                        used_cables.add(cid)
                        cable_details[cid] = CableDetail(
                            cableLabel=c.cableLabel,
                            source=c.source,
                            target=c.target,
                            originalSource=c.originalSource,
                            originalTarget=c.originalTarget,
                            diameter=c.diameter,
                            cableFunction=c.cableFunction,
                            network=net_name,
                            cableType=c.cableType,
                            routeLength=cable_lengths[cid],
                            length=getattr(c, 'length', None)
                        )
                        total_cable_overlaps += 1
                        print(f"          ✅ Cable '{cid}': {len(inter)} overlapping points")
                    else:
                        print(f"          ❌ Cable '{cid}': Only {len(inter)} overlapping points (need ≥2)")

                if used_cables:
                    sec = Section(
                        points=pyd_points,
                        cables=used_cables,
                        network=net_name,
                        details=cable_details,
                        strokeWidth=4 + min(len(used_cables)*0.75, 15)
                    )
                    sections.append(sec)
                    print(f"          🎯 SECTION CREATED: {len(used_cables)} cables, {len(pyd_points)} points")
                else:
                    print(f"          ⭕ No cables overlap this sub-segment")

    print(f"\n📋 FINAL RESULTS:")
    print(f"  📦 Created {len(sections)} sections")
    print(f"  🧩 Processed {total_mst_segments} MST sub-segments") 
    print(f"  🔗 Found {total_cable_overlaps} cable overlaps")
    print(f"  ❌ {len(cables_without_network)} cables skipped (no network)")
    
    if len(sections) == 0 and len(cables) > 0:
        print(f"  🚨 WARNING: No sections created despite having {len(cables)} cables!")
        if len(cables_without_network) == len(cables):
            print(f"  💡 LIKELY CAUSE: All cables skipped due to missing network mappings")

    return sections

def calculate_hanan_grid(all_points: List[PathPoint]) -> Dict[str, List[int]]:
    xs = sorted({p.x for p in all_points})
    ys = sorted({p.y for p in all_points})
    return {"xCoords": xs, "yCoords": ys}



# ----------------- MAIN ENDPOINT -----------------

@router.post("/optimize-paths")
async def optimize_cable_paths(config: GridConfig) -> RoutingResponse:
    """
    Dijkstra-based approach with multi-pass Steiner + T-junction detection.
    """
    try:
        print("\n=== Starting Dijkstra-based Cable Path Optimization ===")
        print(f"Grid: {config.width}x{config.height}")
        print(f"Machines: {len(config.machines)}, Cables: {len(config.cables)}")
        print(f"Walls: {len(config.walls)}, Perfs: {len(config.perforations)}")
        print(f"Trays: {len(config.trays)}")

        max_passes = 5

        # Validate cables
# Filter cables with valid machine references
        valid_cables = []
        for cb in config.cables:
            if cb.source in config.machines and cb.target in config.machines:
                valid_cables.append(cb)
            else:
                print(f"[INFO] Ignoring cable {cb.cableLabel or f'{cb.source}-{cb.target}'} due to missing machine(s)")

        config.cables = valid_cables

        # Build walls set
        walls = {PathPoint(w.x, w.y) for w in config.walls}
        trays = {PathPoint(t.x, t.y) for t in config.trays}
        perfs = {PathPoint(p.x, p.y) for p in config.perforations}
        walls -= perfs  # remove perforations from the walls
        print(walls)
        print(trays)
        # ------------------------------------------------------------
        # 1) Pre-compute distance maps & set up a lightweight graph cache
        # ------------------------------------------------------------

        print("Pre-computing distance transforms …")
        dist_wall = _bfs_distance_map(config.width, config.height, walls)
        dist_tray = _bfs_distance_map(config.width, config.height, trays)

        graph_cache: Dict[float, Dict[PathPoint, List[Tuple[PathPoint, float]]]] = {}

        def get_graph(red: float = 1.0):
            """Return (and cache) the weighted graph for a given *redCable* factor."""
            if red not in graph_cache:
                print(f"Creating weighted graph cache entry for redCable={red:.2f}")
                graph_cache[red] = build_weighted_graph(
                    config.width,
                    config.height,
                    walls,
                    trays=trays,
                    redCable=red,
                    dist_wall=dist_wall,
                    dist_tray=dist_tray,
                )
            return graph_cache[red]

        weighted_graph = get_graph(1.0)

        # 2) Collect terminals
        terminals = []
        for mid, m in config.machines.items():
            pt = PathPoint(m.x, m.y)
            terminals.append(pt)

        # 3) Build MST lazily (avoids O(M^2) Dijkstra)
        print("\n--- PASS 0: Building Initial MST (lazy Prim) ---")
        mst_edges, pair_routes = build_mst_lazy(terminals, weighted_graph)
        init_length = mst_total_length(mst_edges, pair_routes)
        print(f"Initial MST distance: {init_length}")

        current_length = init_length
        used_steiner_points = set()
        passes_used = 0
        total_comps_used = 0

        # 5) Multi-pass improvement with 3-term, 4-term components
        for pass_id in range(1, max_passes+1):
            print(f"\n=== PASS {pass_id} ===")
            improved_any = False
            iteration_count = 0

            while True:
                iteration_count += 1
                print(f"  PASS {pass_id}, iteration {iteration_count}: generating 3- & 4-term components...")
                print(f"    ➕ Terminals (incl. Steiner): {len(terminals)}")

                comps = generate_all_components(
                    terminals, 
                    mst_edges, 
                    pair_routes, 
                    weighted_graph,
                    config.width,
                    config.height,
                    walls,
                    trays,
                    cables=config.cables,
                    machines=config.machines
                )
                print(f"  Found {len(comps)} candidate components with gain>0.")
                if comps:
                    print("    Top candidate components (up to 5):")
                    for i, c in enumerate(comps[:5]):
                        term_labels = [(p.x, p.y) for p in c.terminals]
                        st_labels = [(p.x, p.y) for p in c.steiner_points]
                        print(f"      #{i+1}: gain={c.gain:.2f}, terminals={term_labels}, steiner={st_labels}")

                if not comps:
                    print("  No more components, stopping this pass.")
                    break

                best_improvement = 0.0
                best_comp = None
                best_new_mst = None

                for comp in comps:
                    new_edges = update_mst_with_components(mst_edges, [comp], pair_routes, weighted_graph)
                    new_len = mst_total_length(new_edges, pair_routes)
                    improvement = current_length - new_len
                    if improvement > best_improvement:
                        best_improvement = improvement
                        best_comp = comp
                        best_new_mst = new_edges

                if best_comp and best_improvement > 0:
                    print(f"  Accepted component with gain={best_comp.gain:.2f}, improvement={best_improvement:.2f}")
                    print(f"    ✅ Accepted Steiner points at {[ (p.x,p.y) for p in best_comp.steiner_points ]}")
                    mst_edges = best_new_mst
                    current_length -= best_improvement
                    used_steiner_points.update(best_comp.steiner_points)
                    # Include new Steiner points as terminals for subsequent component generation
                    terminals.extend([sp for sp in best_comp.steiner_points if sp not in terminals])
                    total_comps_used += 1
                    improved_any = True
                else:
                    print("    😕 No component improves the MST further in this iteration.")
                    break

            if improved_any:
                print(f"Completed PASS {pass_id} with MST distance={current_length}")
                passes_used = pass_id
            else:
                print(f"No improvement in PASS {pass_id}, stopping.")
                break

        final_len = current_length
        improvement_pct = 0.0
        if init_length > 0:
            improvement_pct = 100*(init_length - final_len)/init_length

        print(f"\nFinal MST distance: {final_len}, improvement over initial: {improvement_pct:.2f}%")
        print(f"Used Steiner points: {len(used_steiner_points)}, total comps used: {total_comps_used}")
        print(f"Passes used: {passes_used}")
        grid_resolution=config.gridResolution
        # 6) Convert MST to sections (split around T-junctions), detect "natural" Steiner points
        sections = convert_to_sections( grid_resolution,mst_edges, config.cables, config.machines, config.networks, pair_routes)

        # Build adjacency again to detect T-junctions that might not come from explicit 3/4-term comps
        mst_adjacency = build_mst_adjacency(mst_edges, pair_routes)
        t_junction_points = detect_steiner_points(mst_adjacency)

        if t_junction_points:
            print("🔸 Natural Steiner points (T-junctions):",
                  [(p.x, p.y) for p in t_junction_points])
            print("💡 Consider using these as new terminals for further optimisation passes!")
        else:
            print("🔸 No natural Steiner points detected")

        # Combine them with used_steiner_points for final reporting
        all_steiner = set(used_steiner_points) | t_junction_points

        # 7) Build Hanan grid for debugging
        hanan = calculate_hanan_grid(terminals + list(all_steiner))

        # 8) Build final cable routes
        cable_routes = {}
        problematic_cables = []  # Track cables with length issues
        
        for cb in config.cables:
            cid = cb.cableLabel or f"{cb.source}-{cb.target}"
            spt = PathPoint(config.machines[cb.source].x, config.machines[cb.source].y)
            tpt = PathPoint(config.machines[cb.target].x, config.machines[cb.target].y)
            final_route = find_cable_route(spt, tpt, mst_edges, pair_routes)
            cable_routes[cid] = final_route
            
            # --------------------------------------------------------
            # 📏  Cable length sanity-check vs available cable length
            # --------------------------------------------------------
            def _parse_length(val: Optional[str]) -> Optional[float]:
                if not val:
                    return None
                try:
                    txt = val.strip().lower().replace("m", "").replace(",", ".")
                    return float(txt)
                except Exception:
                    return None

            expected_len = _parse_length(getattr(cb, "length", None))
            actual_len = max(0, len(final_route) - 1) * config.gridResolution  # 0.1m per grid edge
            
            # Calculate theoretical minimum length (Manhattan distance)
            theoretical_min = abs(spt.x - tpt.x) + abs(spt.y - tpt.y)
            theoretical_min_len = theoretical_min * config.gridResolution

            if expected_len is not None:
                if actual_len <= expected_len and (cb.source!="CUS" or cb.target!="CUS"):
                    print(f"[LENGTH ✅] Cable {cid}: route {actual_len:.2f}m ≤ specified {expected_len:.2f}m")
                else:
                    over = actual_len - expected_len
                    pct = 100 * over / expected_len
                    print(f"[LENGTH ❌] Cable {cid}: route {actual_len:.2f}m exceeds {expected_len:.2f}m (+{over:.2f}m, {pct:.1f}% longer)")
 
                    # Add to problematic cables
                    problematic_cables.append(ProblematicCable(
                        cableLabel=cb.cableLabel,
                        source=cb.source,
                        target=cb.target,
                        specifiedLength=expected_len,
                        routeLength=actual_len,
                        theoreticalMinLength=theoretical_min_len,
                        excessLength=over,
                        excessPercentage=pct
                    ))
            else:
                # No specified physical length ➜ just log route
                print(f"[LENGTH] Cable {cid}: route length {actual_len:.2f}m (no specified max)")



        # Build network lookup table for proper network assignment
        network_lookup = {}
        for net in config.networks:
            for func in net.get("functions", []):
                network_lookup[func] = net["name"]

        cables_in_sections = set()
        for sec in sections:
            cables_in_sections.update(sec.cables)

        # Create sections for cables not in sections
        for cid, route in cable_routes.items():
            if cid in cables_in_sections:
                continue

            cb = next((c for c in config.cables if (c.cableLabel or f"{c.source}-{c.target}") == cid), None)
            if not cb:
                continue

            # Use network lookup to determine proper network, fallback to cable.network or "default"
            net_name = network_lookup.get(cb.cableFunction) or cb.network or "default"

            sec = Section(
                points=route,
                cables={cid},
                network=net_name,
                details={
                    cid: CableDetail(
                        cableLabel=cb.cableLabel,
                        source=cb.source,
                        target=cb.target,
                        originalSource=cb.originalSource,
                        originalTarget=cb.originalTarget,
                        diameter=cb.diameter,
                        cableFunction=cb.cableFunction,
                        network=net_name,
                        cableType=cb.cableType,
                        routeLength=max(0, len(route)-1) * grid_resolution,
                        length=cb.length
                    )
                },
                strokeWidth=4
            )
            sections.append(sec)
            print(f"➕ Section added for cable {cid} with {len(route)} points in network '{net_name}'")

        for i in (0,5):
            for cb in config.cables:
                cid = cb.cableLabel or f"{cb.source}-{cb.target}"
                spt = PathPoint(config.machines[cb.source].x, config.machines[cb.source].y)
                tpt = PathPoint(config.machines[cb.target].x, config.machines[cb.target].y)
                final_route = find_cable_route(spt, tpt, mst_edges, pair_routes)
                cable_routes[cid] = final_route

            sections = [sec for sec in sections if sec.cables]



        dbg = DebugInfo(
            initial_mst_length=init_length,
            final_length=final_len,
            improvement_percentage=improvement_pct,
            num_steiner_points=len(all_steiner),
            num_sections=len(sections),
            num_components_tried=0,  # could track more precisely
            num_components_used=total_comps_used,
            passes_used=passes_used
        )

        response = RoutingResponse(
            sections=sections,
            cableRoutes=cable_routes,
            hananGrid=hanan,
            steinerPoints=[{"x": sp.x, "y": sp.y} for sp in all_steiner],
            debug_info=dbg,
            problematicCables=problematic_cables
        )

        return response

    except Exception as ex:
        import traceback
        print("\n=== ERROR in optimize_cable_paths ===")
        print(traceback.format_exc())
        raise HTTPException(500, f"Error: {ex}")
