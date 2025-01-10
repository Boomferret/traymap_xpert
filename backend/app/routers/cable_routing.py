from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Set, Tuple, Union
from dataclasses import dataclass
import numpy as np
from heapq import heappush, heappop

router = APIRouter()

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
    network: Optional[str] = None  # Add network field

class GridConfig(BaseModel):
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    walls: List[Point] = []
    perforations: List[Point] = []
    machines: Dict[str, Machine] = {}
    cables: List[Cable] = []
    networks: List[Dict] = []  # Add networks to the config

    class Config:
        json_schema_extra = {
            "example": {
                "width": 100,
                "height": 100,
                "walls": [{"x": 1, "y": 1}],
                "perforations": [],
                "machines": {
                    "machine1": {"x": 0, "y": 0, "description": "Machine 1"},
                    "machine2": {"x": 5, "y": 5, "description": "Machine 2"}
                },
                "cables": [
                    {
                        "source": "machine1",
                        "target": "machine2",
                        "type": "power",
                        "cableFunction": "POWER SUPPLY"
                    }
                ],
                "networks": [
                    {
                        "id": "1",
                        "name": "Power",
                        "functions": ["POWER SUPPLY"]
                    }
                ]
            }
        }

class Section(BaseModel):
    points: List[Point]
    cables: Set[str]
    network: Optional[str] = None
    details: Dict[str, Cable]
    strokeWidth: Optional[float] = None  # Add strokeWidth field to the model

class RoutingResponse(BaseModel):
    sections: List[Section] = []
    cableRoutes: Dict[str, List[Point]] = {}
    hananGrid: Dict[str, List[int]] = {
        "xCoords": [],
        "yCoords": []
    }
    steinerPoints: List[Dict[str, int]] = []  # Add this field

@router.post("/optimize-paths")
async def optimize_cable_paths(config: GridConfig) -> RoutingResponse:
    try:
        print("Received config:", config.dict())
        
        # Validate machines exist for all cable endpoints
        for cable in config.cables:
            if cable.source not in config.machines:
                raise HTTPException(
                    status_code=422,
                    detail=f"Source machine '{cable.source}' not found in machines"
                )
            if cable.target not in config.machines:
                raise HTTPException(
                    status_code=422,
                    detail=f"Target machine '{cable.target}' not found in machines"
                )

        # Create blocked grid
        blocked = np.zeros((config.height, config.width), dtype=bool)
        for wall in config.walls:
            if 0 <= wall.y < config.height and 0 <= wall.x < config.width:
                blocked[wall.y, wall.x] = True
        
        for perf in config.perforations:
            if 0 <= perf.y < config.height and 0 <= perf.x < config.width:
                blocked[perf.y, perf.x] = False

        # Extract terminal points from machines for Hanan grid
        terminals = []
        for machine in config.machines.values():
            if 0 <= machine.y < config.height and 0 <= machine.x < config.width:
                terminals.append(Point(x=machine.x, y=machine.y))
        
        # Calculate Hanan grid coordinates
        hanan_grid = calculate_hanan_grid(terminals)

        # Create network lookup for cable functions
        network_lookup = {}
        for network in config.networks:
            for function in network['functions']:
                network_lookup[function] = network['name']

        # Group cables by network
        network_cables = {}
        for cable in config.cables:
            # Find network for this cable's function
            network_name = network_lookup.get(cable.cableFunction)
            if network_name:
                if network_name not in network_cables:
                    network_cables[network_name] = []
                network_cables[network_name].append(cable)
            else:
                print(f"Warning: No network found for cable function: {cable.cableFunction}")

        sections = []
        cable_routes = {}  # Add this
        existing_paths = {}  # Track paths across all networks
        used_steiner_points = set()  # Add this
        
        # Process each network separately
        for network_name, cables in network_cables.items():
            try:
                # Pass existing_paths to find_optimal_paths
                network_sections, network_steiner_points = find_optimal_paths(
                    cables,
                    config.machines,
                    blocked,
                    config.width,
                    config.height,
                    network_name,
                    existing_paths
                )
                sections.extend(network_sections)
                used_steiner_points.update(network_steiner_points)
                
            except Exception as e:
                print(f"Error processing network {network_name}: {str(e)}")
                continue

        return RoutingResponse(
            sections=sections,
            cableRoutes=cable_routes,
            hananGrid=hanan_grid,
            steinerPoints=[{"x": p.x, "y": p.y} for p in used_steiner_points]
        )

    except Exception as e:
        print("Error processing request:", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )

@dataclass
class Point:
    x: int
    y: int

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return self.x == other.x and self.y == other.y

    def __hash__(self):
        return hash((self.x, self.y))
    
    def __lt__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) < (other.x, other.y)
    
    def __le__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) <= (other.x, other.y)
    
    def __gt__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) > (other.x, other.y)
    
    def __ge__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) >= (other.x, other.y)

@dataclass
class Star:
    center: Point
    terminals: List[Point]
    gain: float = 0
    bridges: Set[Tuple[Point, Point]] = None

    def __post_init__(self):
        if self.bridges is None:
            self.bridges = set()

@dataclass
class Section:
    points: List[Point]
    cables: List[str]
    network: Optional[str] = None
    details: Dict[str, Cable] = None
    strokeWidth: Optional[float] = None

    def __post_init__(self):
        if self.details is None:
            self.details = {}
        if self.strokeWidth is None:
            self.strokeWidth = 4 + min(len(self.cables), 10)
    
    def to_dict(self):
        """Convert Section to dictionary format"""
        return {
            "points": [{"x": p.x, "y": p.y} for p in self.points],
            "cables": self.cables,
            "network": self.network,
            "details": {label: cable.dict() for label, cable in self.details.items()},
            "strokeWidth": self.strokeWidth
        }

def manhattan_distance(p1: Point, p2: Point) -> int:
    return abs(p2.x - p1.x) + abs(p2.y - p1.y)

def find_steiner_points(terminals: List[Point], existing_paths: Dict[str, List[Point]], 
                       blocked_grid: np.ndarray, width: int, height: int) -> Set[Point]:
    """Find potential Steiner points using multiple strategies"""
    candidate_points = set()
    
    # 1. Add intersections from existing paths
    if existing_paths:
        for path in existing_paths.values():
            if isinstance(path, list) and path:  # Ensure path is a valid list
                for point in path:
                    if isinstance(point, Point):  # Ensure point is a Point object
                        if (0 <= point.x < width and 
                            0 <= point.y < height and 
                            not blocked_grid[point.y, point.x]):
                            candidate_points.add(point)
    
    # 2. Add Hanan grid points (intersections of terminal coordinates)
    x_coords = sorted(set(t.x for t in terminals))
    y_coords = sorted(set(t.y for t in terminals))
    
    for x in x_coords:
        for y in y_coords:
            point = Point(x, y)
            if (0 <= x < width and 
                0 <= y < height and 
                not blocked_grid[y, x]):
                candidate_points.add(point)
    
    # 3. Find proper stars among terminals
    stars = find_proper_stars(terminals, blocked_grid)
    for star in stars:
        if not blocked_grid[star.center.y, star.center.x]:
            candidate_points.add(star.center)
            
    # 4. Calculate gain for each candidate point
    steiner_points = set()
    for point in candidate_points:
        if point not in terminals:  # Don't use terminals as Steiner points
            gain = calculate_point_gain(point, terminals, existing_paths)
            if gain > 0:
                steiner_points.add(point)
                print(f"Added Steiner point at ({point.x}, {point.y}) with gain {gain}")
    
    return steiner_points

def calculate_point_gain(point: Point, terminals: List[Point], 
                        existing_paths: Dict[str, List[Point]]) -> float:
    """Calculate the potential gain of using this point as a Steiner point"""
    # Base cost without the Steiner point
    direct_cost = sum(manhattan_distance(t1, t2) 
                     for i, t1 in enumerate(terminals[:-1])
                     for t2 in terminals[i+1:])
    
    # Cost with the Steiner point
    steiner_cost = sum(manhattan_distance(point, t) for t in terminals)
    
    # Apply discounts for reusing existing paths
    if existing_paths:
        for path in existing_paths.values():
            for i in range(len(path) - 1):
                p1, p2 = path[i], path[i+1]
                if point in (p1, p2):
                    steiner_cost *= 0.85  # 15% discount for reusing paths
    
    # Calculate gain (positive means improvement)
    gain = direct_cost - steiner_cost
    
    return gain

def find_optimal_paths(cables: List[Cable], machines: Dict[str, Machine], 
                      blocked_grid: np.ndarray, width: int, height: int,
                      network_name: str,
                      existing_paths: Dict[str, List[Point]] = None) -> Tuple[List[Section], Set[Point]]:
    """Find optimal paths for a set of cables"""
    try:
        print(f"\n=== Processing cables for network {network_name} ===")
        print(f"Number of cables: {len(cables)}")

        # Initialize existing_paths if None
        if existing_paths is None:
            existing_paths = {}
        
        # Create machine points mapping
        machine_points = {
            machine_id: Point(machine.x, machine.y)
            for machine_id, machine in machines.items()
        }
        
        # Extract terminal points from machines
        terminals = []
        for cable in cables:
            if cable.source in machines and cable.target in machines:
                source_machine = machines[cable.source]
                target_machine = machines[cable.target]
                terminals.extend([
                    Point(source_machine.x, source_machine.y),
                    Point(target_machine.x, target_machine.y)
                ])
        
        # Remove duplicates while preserving order
        terminals = list(dict.fromkeys(terminals))
        print(f"\nFound {len(terminals)} unique terminals")
        
        if not terminals:
            print("No valid terminals found")
            return [], set()

        # First find MST just with terminals
        initial_mst = find_minimum_spanning_tree(terminals)
        print(f"\nInitial MST found with {len(initial_mst)} edges")

        # Find potential Steiner points
        steiner_points = find_steiner_points(terminals, existing_paths, 
                                           blocked_grid, width, height)
        print(f"\nFound {len(steiner_points)} potential Steiner points")

        # Create graph with all points and calculate optimal paths
        all_points = terminals + list(steiner_points)
        edge_cables = {}
        used_steiner_points = set()

        # Build full adjacency list including Steiner points
        adj = {}
        for p1 in all_points:
            for p2 in all_points:
                if p1 != p2:
                    # Check if path between points is valid
                    path = find_rectilinear_path(p1, p2)
                    if path and not any(is_path_blocked(path[i], path[i+1], blocked_grid) 
                                      for i in range(len(path)-1)):
                        if p1 not in adj: adj[p1] = set()
                        if p2 not in adj: adj[p2] = set()
                        adj[p1].add(p2)
                        adj[p2].add(p1)

        # Route each cable using A* with optional Steiner points
        for cable in cables:
            if not cable.cableLabel:
                continue
                
            source = machine_points[cable.source]
            target = machine_points[cable.target]
            
            # Find path using A* with potential Steiner points
            path = find_cable_path(adj, source, target, steiner_points, existing_paths, network_name)
            
            if path:
                # Track which Steiner points are actually used
                used_points = set(path) & steiner_points
                used_steiner_points.update(used_points)
                
                # Add path to existing_paths and edge_cables
                path_key = f"{cable.cableLabel}_path"
                existing_paths[path_key] = path
                
                for i in range(len(path) - 1):
                    edge = tuple(sorted([path[i], path[i+1]], key=lambda p: (p.x, p.y)))
                    
                    # Add to edge_cables for section creation
                    if edge not in edge_cables:
                        edge_cables[edge] = set()
                    edge_cables[edge].add(cable.cableLabel)

        # Build final MST from used edges
        final_edges = set()
        final_cables = {}  # Track which cables use each edge
        for edge, cable_labels in edge_cables.items():
            final_edges.add(edge)
            for label in cable_labels:
                if label not in final_cables:
                    # Find original cable object by label
                    cable_obj = next((c for c in cables if c.cableLabel == label), None)
                    if cable_obj:
                        final_cables[label] = cable_obj

        # Convert to sections using the actual Cable objects
        sections = convert_tree_to_sections(final_edges, list(final_cables.values()), machines, network_name)
        
        print(f"\nFinal routing uses {len(used_steiner_points)} Steiner points")
        for point in used_steiner_points:
            print(f"Using Steiner point at ({point.x}, {point.y})")
            
        return sections, used_steiner_points

    except Exception as e:
        print(f"Error in find_optimal_paths: {str(e)}")
        return [], set()

def find_minimum_spanning_tree(terminals: List[Point]) -> Set[Tuple[Point, Point]]:
    """Find minimum spanning tree connecting all terminals"""
    try:
        if not terminals:
            return set()

        edges = set()
        visited = {terminals[0]}
        
        while len(visited) < len(terminals):
            min_edge = None
            min_dist = float('inf')
            min_path = None
            
            for v in visited:
                for t in terminals:
                    if t not in visited:
                        try:
                            path = find_rectilinear_path(v, t)
                            dist = manhattan_distance(v, t)
                            
                            if dist < min_dist:
                                min_dist = dist
                                min_edge = (v, t)
                                min_path = path
                        except Exception as e:
                            print(f"Error finding path between ({v.x}, {v.y}) and ({t.x}, {t.y}): {str(e)}")
                            continue
            
            if min_edge is None:
                raise Exception("Unable to find valid path in MST")
            
            # Add all segments in the path to edges
            for i in range(len(min_path) - 1):
                edges.add((min_path[i], min_path[i + 1]))
            
            visited.add(min_edge[1])
        
        return edges
    except Exception as e:
        print(f"Error in find_minimum_spanning_tree: {str(e)}")
        # Return simple direct connections as fallback
        edges = set()
        for i in range(len(terminals)-1):
            edges.add((terminals[i], terminals[i+1]))
        return edges

def find_rectilinear_path(start: Point, end: Point) -> List[Point]:
    """Find a rectilinear (L-shaped) path between two points"""
    try:
        path = [start]
        
        # Always create L-shaped paths, never diagonal
        if start.x != end.x or start.y != end.y:
            # First go horizontal, then vertical
            path1 = [
                start,
                Point(end.x, start.y),  # Horizontal movement
                end                     # Vertical movement
            ]
            
            # First go vertical, then horizontal
            path2 = [
                start,
                Point(start.x, end.y),  # Vertical movement
                end                     # Horizontal movement
            ]
            
            # Calculate Manhattan distance for both paths
            dist1 = sum(manhattan_distance(path1[i], path1[i+1]) 
                       for i in range(len(path1)-1))
            dist2 = sum(manhattan_distance(path2[i], path2[i+1]) 
                       for i in range(len(path2)-1))
            
            # Choose the shorter path
            path = path1 if dist1 <= dist2 else path2
            
            # Remove redundant middle point if start and end share x or y coordinate
            if start.x == end.x or start.y == end.y:
                path = [start, end]
            
        return path
    except Exception as e:
        print(f"Error in find_rectilinear_path: {str(e)}")
        print(f"Start point: ({start.x}, {start.y}), End point: ({end.x}, {end.y})")
        # Return direct path as fallback
        return [start, end]

def find_proper_stars(terminals: List[Point], blocked_grid: np.ndarray) -> List[Star]:
    """Find all potential Steiner points that could improve the routing"""
    stars = []
    n = len(terminals)
    
    print(f"\nSearching for Steiner points among {n} terminals:")
    for terminal in terminals:
        print(f"  Terminal at ({terminal.x}, {terminal.y})")
    
    # Try all possible combinations of 3 terminals
    for i in range(n-2):
        for j in range(i+1, n-1):
            for k in range(j+1, n):
                t1, t2, t3 = terminals[i], terminals[j], terminals[k]
                star = create_star_if_proper(t1, t2, t3, blocked_grid)
                if star:
                    print(f"\nFound potential Steiner point at ({star.center.x}, {star.center.y}):")
                    print(f"  Connecting terminals: ({t1.x}, {t1.y}), ({t2.x}, {t2.y}), ({t3.x}, {t3.y})")
                    stars.append(star)
    
    print(f"\nTotal Steiner points found: {len(stars)}")
    return stars

def create_star_if_proper(t1: Point, t2: Point, t3: Point, 
                         blocked_grid: np.ndarray) -> Optional[Star]:
    """Find potential Steiner point for three terminals with detailed logging"""
    print(f"\n=== Analyzing potential star ===")
    print(f"Terminal 1: ({t1.x}, {t1.y})")
    print(f"Terminal 2: ({t2.x}, {t2.y})")
    print(f"Terminal 3: ({t3.x}, {t3.y})")
    
    # Get all unique x and y coordinates from terminals
    x_coords = sorted(set([t1.x, t2.x, t3.x]))
    y_coords = sorted(set([t1.y, t2.y, t3.y]))
    
    # Try all intersections on the Hanan grid
    potential_centers = []
    for x in x_coords:
        for y in y_coords:
            potential_centers.append(Point(x, y))
    
    # Find the best center point
    best_center = None
    min_total_dist = float('inf')
    
    for center in potential_centers:
        # Skip if center is blocked
        if blocked_grid[center.y, center.x]:
            print(f"  Skipping blocked center at ({center.x}, {center.y})")
            continue
            
        # Check if paths to center are blocked
        paths_blocked = False
        for t in [t1, t2, t3]:
            if is_path_blocked(center, t, blocked_grid):
                print(f"  Path blocked from ({center.x}, {center.y}) to ({t.x}, {t.y})")
                paths_blocked = True
                break
                
        if paths_blocked:
            continue
            
        # Calculate total Manhattan distance
        total_dist = sum(manhattan_distance(center, t) for t in [t1, t2, t3])
        
        if total_dist < min_total_dist:
            min_total_dist = total_dist
            best_center = center
            print(f"  Found better center at ({center.x}, {center.y}) with total distance {total_dist}")
    
    if best_center:
        return Star(center=best_center, terminals=[t1, t2, t3])
    
    print("  No valid Steiner point found")
    return None

def is_path_blocked(start: Point, end: Point, blocked_grid: np.ndarray) -> bool:
    """Check if there's a blocked cell in the rectilinear path"""
    path = find_rectilinear_path(start, end)
    
    for i in range(len(path) - 1):
        p1, p2 = path[i], path[i + 1]
        
        # Check all cells along this segment
        if p1.x == p2.x:  # Vertical segment
            y1, y2 = min(p1.y, p2.y), max(p1.y, p2.y)
            for y in range(y1, y2 + 1):
                if blocked_grid[y, p1.x]:
                    return True
        else:  # Horizontal segment
            x1, x2 = min(p1.x, p2.x), max(p1.x, p2.x)
            for x in range(x1, x2 + 1):
                if blocked_grid[p1.y, x]:
                    return True
    
    return False

def calculate_star_gain(star: Star, mst: Set[Tuple[Point, Point]]) -> float:
    """Calculate the gain of using this star vs direct paths"""
    print(f"\n=== Calculating gain for star at ({star.center.x}, {star.center.y}) ===")
    
    # Calculate length of current MST paths that would be replaced
    current_length = 0
    star.bridges = set()  # Reset bridges
    
    # Find bridges (MST edges that would be replaced)
    bridges = find_bridges_in_mst(star, mst)
    star.bridges = bridges
    
    # Calculate current length from bridges
    for bridge in bridges:
        current_length += manhattan_distance(bridge[0], bridge[1])
    
    # Calculate length with Steiner point, considering path reuse
    steiner_length = 0
    for terminal in star.terminals:
        # Check if any part of the path to this terminal reuses existing MST edges
        path = find_rectilinear_path(star.center, terminal)
        path_length = 0
        
        for i in range(len(path) - 1):
            p1, p2 = path[i], path[i+1]
            edge = tuple(sorted([p1, p2], key=lambda p: (p.x, p.y)))
            
            # If this segment exists in MST, its cost is nearly free
            if edge in mst or (p2, p1) in mst:
                path_length += manhattan_distance(p1, p2) * 0.1  # 90% discount for reusing paths
            else:
                path_length += manhattan_distance(p1, p2)
                
        steiner_length += path_length
    
    # Calculate gain (positive means improvement)
    gain = current_length - steiner_length
    
    print(f"  Current MST length: {current_length}")
    print(f"  Length with Steiner point: {steiner_length}")
    print(f"  Raw gain: {gain}")
    print(f"  Bridges to replace: {len(star.bridges)}")
    for bridge in star.bridges:
        print(f"    Bridge: ({bridge[0].x}, {bridge[0].y}) -> ({bridge[1].x}, {bridge[1].y})")
    
    # Apply multiplier to encourage Steiner points that provide gains
    # Higher multiplier for points that reuse more paths
    reuse_factor = sum(1 for t in star.terminals for i in range(len(path)-1) 
                      if tuple(sorted([path[i], path[i+1]], key=lambda p: (p.x, p.y))) in mst)
    multiplier = 1.5 + (reuse_factor * 0.2)  # Increase multiplier based on path reuse
    
    final_gain = gain * multiplier if gain > 0 else gain
    print(f"  Path reuse factor: {reuse_factor}")
    print(f"  Final gain (with multiplier {multiplier:.1f}x): {final_gain}")
    
    return final_gain

def find_bridges_in_mst(star: Star, mst: Set[Tuple[Point, Point]]) -> Set[Tuple[Point, Point]]:
    """Find MST edges that would be replaced by this star"""
    bridges = set()
    
    # Build adjacency list from MST
    adj = {}
    for e in mst:
        if e[0] not in adj: adj[e[0]] = set()
        if e[1] not in adj: adj[e[1]] = set()
        adj[e[0]].add(e[1])
        adj[e[1]].add(e[0])
    
    # For each pair of terminals in the star
    for i in range(len(star.terminals)):
        for j in range(i + 1, len(star.terminals)):
            t1, t2 = star.terminals[i], star.terminals[j]
            
            # Find path between these terminals in MST
            path = find_path_in_mst(t1, t2, mst)
            if path:
                # Add all edges in the path to bridges
                for k in range(len(path) - 1):
                    edge = tuple(sorted([path[k], path[k+1]], key=lambda p: (p.x, p.y)))
                    bridges.add(edge)
    
    return bridges

def find_path_in_mst(start: Point, end: Point, mst: Set[Tuple[Point, Point]]) -> List[Point]:
    """Find path between two points in MST using BFS"""
    # Build adjacency list
    adj = {}
    for e in mst:
        if e[0] not in adj: adj[e[0]] = set()
        if e[1] not in adj: adj[e[1]] = set()
        adj[e[0]].add(e[1])
        adj[e[1]].add(e[0])
    
    # BFS
    queue = [(start, [start])]
    visited = {start}
    
    while queue:
        current, path = queue.pop(0)
        if current == end:
            return path
            
        for next_point in adj.get(current, set()):
            if next_point not in visited:
                visited.add(next_point)
                queue.append((next_point, path + [next_point]))
    
    return None

def build_final_tree(mst: Set[Tuple[Point, Point]], stars: List[Star], 
                    blocked_grid: np.ndarray) -> Set[Tuple[Point, Point]]:
    """Build final tree incorporating beneficial stars"""
    print("\nBuilding final tree:")
    print(f"Starting with MST edges: {len(mst)}")
    print(f"Considering {len(stars)} Steiner points")
    
    final_tree = set(mst)
    added_steiner_points = []  # Keep track of added Steiner points
    
    def verify_tree_connectivity(tree: Set[Tuple[Point, Point]], terminals: List[Point]) -> bool:
        """Verify that all terminals are connected in the tree"""
        if not tree:
            return False
            
        # Get all points in the tree
        all_points = {p for e in tree for p in e}
        if not all_points:
            return False
            
        # Build adjacency list
        adj = {}
        for e in tree:
            if e[0] not in adj: adj[e[0]] = set()
            if e[1] not in adj: adj[e[1]] = set()
            adj[e[0]].add(e[1])
            adj[e[1]].add(e[0])
            
        # Start from first terminal
        start = terminals[0]
        reachable = get_reachable_points(tree, start)
        
        # Check if all terminals are reachable
        return all(t in reachable for t in terminals)
    
    for star in stars:
        if star.gain <= 0:
            print(f"Skipping Steiner point at ({star.center.x}, {star.center.y}) - no gain")
            continue
            
        if can_add_star(star, final_tree, blocked_grid):
            print(f"\nAdding Steiner point at ({star.center.x}, {star.center.y}):")
            print(f"  Gain: {star.gain}")
            
            # Create new tree with Steiner point
            new_tree = set()
            
            # First, add all edges from previously added Steiner points
            for prev_star in added_steiner_points:
                for terminal in prev_star.terminals:
                    new_tree.add(tuple(sorted([prev_star.center, terminal], 
                                            key=lambda p: (p.x, p.y))))
            
            # Add new Steiner point connections
            for terminal in star.terminals:
                new_tree.add(tuple(sorted([star.center, terminal], 
                                        key=lambda p: (p.x, p.y))))
            
            # Add remaining edges that don't create cycles
            for edge in final_tree:
                # Skip edges between terminals connected by any Steiner point
                skip_edge = False
                for s in [star] + added_steiner_points:
                    if edge[0] in s.terminals and edge[1] in s.terminals:
                        skip_edge = True
                        break
                if skip_edge:
                    continue
                    
                # Add edge if it doesn't create a cycle
                test_tree = new_tree | {edge}
                all_points = {p for e in test_tree for p in e}
                if len(test_tree) <= len(all_points) - 1:
                    new_tree.add(edge)
            
            # Get all terminals (including those connected to previous Steiner points)
            all_terminals = set()
            for s in [star] + added_steiner_points:
                all_terminals.update(s.terminals)
            
            # Verify connectivity
            if verify_tree_connectivity(new_tree, list(all_terminals)):
                print("  Tree connectivity verified - all terminals are reachable")
                final_tree = new_tree
                added_steiner_points.append(star)
                print(f"  Successfully added Steiner point with {len(star.terminals)} connections")
                
                # Debug: print all edges in new tree
                print("  New tree edges:")
                for edge in final_tree:
                    print(f"    ({edge[0].x}, {edge[0].y}) -> ({edge[1].x}, {edge[1].y})")
            else:
                print("  Failed to verify tree connectivity - some terminals would be disconnected")
                print("  Current edges:")
                for edge in new_tree:
                    print(f"    ({edge[0].x}, {edge[0].y}) -> ({edge[1].x}, {edge[1].y})")
    
    print(f"\nFinal tree built with {len(final_tree)} edges")
    print(f"Added {len(added_steiner_points)} Steiner points:")
    for star in added_steiner_points:
        print(f"  - ({star.center.x}, {star.center.y}) with {len(star.terminals)} connections")
    
    return final_tree

def get_reachable_points(tree: Set[Tuple[Point, Point]], start: Point) -> Set[Point]:
    """Get all points reachable from start point in tree"""
    # Build adjacency list
    adj = {}
    for e in tree:
        if e[0] not in adj: adj[e[0]] = set()
        if e[1] not in adj: adj[e[1]] = set()
        adj[e[0]].add(e[1])
        adj[e[1]].add(e[0])
    
    # BFS to find reachable points
    reachable = {start}
    queue = [start]
    
    while queue:
        current = queue.pop(0)
        for next_point in adj.get(current, set()):
            if next_point not in reachable:
                reachable.add(next_point)
                queue.append(next_point)
    
    return reachable

def can_add_star(star: Star, current_tree: Set[Tuple[Point, Point]], 
                 blocked_grid: np.ndarray) -> bool:
    """Check if a star can be added to the current tree"""
    print(f"\nChecking if star at ({star.center.x}, {star.center.y}) can be added:")
    
    # Check if new paths are blocked
    for terminal in star.terminals:
        if is_path_blocked(star.center, terminal, blocked_grid):
            print(f"  Path to terminal ({terminal.x}, {terminal.y}) is blocked")
            return False
    
    # Create new tree starting with just the Steiner point connections
    new_tree = set()
    for terminal in star.terminals:
        new_tree.add(tuple(sorted([star.center, terminal], key=lambda p: (p.x, p.y))))
    
    # Add remaining edges from current tree that don't create cycles
    remaining_edges = set(current_tree)
    for edge in current_tree:
        # Skip edges between terminals connected by the Steiner point
        if edge[0] in star.terminals and edge[1] in star.terminals:
            continue
            
        # Add edge if it doesn't create a cycle
        test_tree = new_tree | {edge}
        all_points = {p for e in test_tree for p in e}
        if len(test_tree) <= len(all_points) - 1:  # Tree property: |E| = |V| - 1
            new_tree.add(edge)
    
    # Check if network is still connected and has no cycles
    all_points = {p for e in new_tree for p in e}
    if not all_points:
        return False
        
    start_point = next(iter(all_points))
    reachable = get_reachable_points(new_tree, start_point)
    
    # For a tree:
    # 1. All points must be reachable (connected)
    # 2. Number of edges must be number of points - 1
    is_connected = len(reachable) == len(all_points)
    num_vertices = len(all_points)
    num_edges = len(new_tree)
    is_tree = num_edges == num_vertices - 1
    
    print(f"  Network would be {'connected' if is_connected else 'disconnected'}")
    print(f"  Vertices: {num_vertices}, Edges: {num_edges}")
    print(f"  Would {'not create' if is_tree else 'create'} cycles")
    
    # Additional debug info
    if not is_tree:
        print(f"  Expected {num_vertices - 1} edges for a tree, but got {num_edges}")
        print("  Edges in new tree:")
        for edge in new_tree:
            print(f"    ({edge[0].x}, {edge[0].y}) -> ({edge[1].x}, {edge[1].y})")
    
    return is_connected and is_tree

def has_cycle(edges: Set[Tuple[Point, Point]]) -> bool:
    """Check if graph has a cycle using Union-Find"""
    parent = {}
    
    def find(p: Point):
        if p not in parent:
            parent[p] = p
        if parent[p] != p:
            parent[p] = find(parent[p])
        return parent[p]
    
    def union(p1: Point, p2: Point) -> bool:
        root1, root2 = find(p1), find(p2)
        if root1 == root2:
            return True
        parent[root2] = root1
        return False
    
    return any(union(e[0], e[1]) for e in edges)

def convert_path_to_points(start: Point, end: Point) -> List[Point]:
    """Convert a path between two points into a list of points with proper L-shaped routing"""
    if start.x == end.x or start.y == end.y:
        # If points are already in line, return direct path
        return [start, end]
    else:
        # Create L-shaped path with intermediate point
        mid_point = Point(end.x, start.y)  # Could also use Point(start.x, end.y)
        return [start, mid_point, end]

def create_section_points(points: List[Point]) -> List[Point]:
    """Convert a list of points into a proper path with only horizontal/vertical segments"""
    if len(points) < 2:
        return points

    result = [points[0]]
    
    # For each pair of consecutive points
    for i in range(1, len(points)):
        prev = points[i-1]
        curr = points[i]
        
        # If points aren't colinear (horizontal or vertical)
        if prev.x != curr.x and prev.y != curr.y:
            # Add intermediate point to create L-shaped path
            # Use the previous point's coordinate for one axis
            result.append(Point(curr.x, prev.y))
            
        result.append(curr)
    
    return result

def merge_overlapping_sections(sections: List[dict]) -> List[dict]:
    """Merge sections that share cables and have overlapping segments"""
    if not sections:
        return sections

    def segments_overlap(points1: List[dict], points2: List[dict]) -> bool:
        """Check if two sets of points have overlapping segments"""
        # Convert points to set of segments for easier comparison
        def get_segments(points):
            segments = set()
            for i in range(len(points) - 1):
                p1, p2 = points[i], points[i + 1]
                # Ensure consistent segment ordering
                if p1['x'] > p2['x'] or (p1['x'] == p2['x'] and p1['y'] > p2['y']):
                    p1, p2 = p2, p1
                segments.add((p1['x'], p1['y'], p2['x'], p2['y']))
            return segments
        
        segs1 = get_segments(points1)
        segs2 = get_segments(points2)
        return bool(segs1 & segs2)  # Check for common segments

    def merge_two_sections(sec1: dict, sec2: dict) -> dict:
        """Merge two sections that share cables and have overlapping segments"""
        # Combine points maintaining proper ordering
        all_points = []
        used_points = set()
        
        # Helper to add points ensuring no duplicates and maintaining connectivity
        def add_point(point):
            point_key = (point['x'], point['y'])
            if point_key not in used_points:
                all_points.append(point)
                used_points.add(point_key)
        
        # Add points from both sections
        for point in sec1['points']:
            add_point(point)
        for point in sec2['points']:
            add_point(point)
            
        # Sort points to ensure proper connectivity
        # This might need to be improved to handle more complex merges
        points = create_section_points([Point(p['x'], p['y']) for p in all_points])
        points = [{'x': p.x, 'y': p.y} for p in points]

        # Calculate stroke width based on number of cables
        merged_cables = set(sec1['cables']) | set(sec2['cables'])
        stroke_width = 4 + min(len(merged_cables), 10)  # Base width + up to 10 additional pixels

        return {
            'points': points,
            'cables': list(merged_cables),
            'network': sec1['network'],
            'details': {**sec1['details'], **sec2['details']},
            'strokeWidth': stroke_width
        }

    # Keep merging until no more overlaps found
    while True:
        merged = False
        for i in range(len(sections)):
            if sections[i] is None:
                continue
            for j in range(i + 1, len(sections)):
                if sections[j] is None:
                    continue
                    
                sec1, sec2 = sections[i], sections[j]
                if (sec1['network'] == sec2['network'] and 
                    segments_overlap(sec1['points'], sec2['points'])):
                    # Merge sections
                    sections[i] = merge_two_sections(sec1, sec2)
                    sections[j] = None
                    merged = True
                    print(f"Merged two sections with {len(sec1['cables'])} and {len(sec2['cables'])} cables")
        
        if not merged:
            break
    
    # Remove None entries and return merged sections
    return [s for s in sections if s is not None]

def convert_tree_to_sections(tree: Set[Tuple[Point, Point]], 
                           cables: List[Cable],
                           machines: Dict[str, Machine],
                           network_name: str) -> List[dict]:
    """Convert final tree to sections with assigned cables"""
    try:
        print(f"\nConverting tree with {len(tree)} edges to sections")
        sections = []
        
        # Create mappings with error checking
        machine_points = {}
        for machine_id, machine in machines.items():
            if machine is None:
                print(f"Warning: Machine {machine_id} is None")
                continue
            machine_points[machine_id] = Point(machine.x, machine.y)
            
        cable_map = {}
        for cable in cables:
            if cable is None or not cable.cableLabel:
                continue
            cable_map[cable.cableLabel] = cable

        # Validate tree is not empty
        if not tree:
            print("Warning: Empty tree provided")
            return []

        # Build adjacency list with validation
        adj = {}
        for edge in tree:
            if edge is None or len(edge) != 2:
                print(f"Warning: Invalid edge in tree: {edge}")
                continue
            p1, p2 = edge
            if p1 is None or p2 is None:
                print(f"Warning: Invalid points in edge: ({p1}, {p2})")
                continue
            if p1 not in adj: adj[p1] = set()
            if p2 not in adj: adj[p2] = set()
            adj[p1].add(p2)
            adj[p2].add(p1)

        # Find terminals and Steiner points with validation
        terminals = set(machine_points.values())
        if not terminals:
            print("Warning: No terminals found")
            return []
            
        steiner_points = set()
        for point, neighbors in adj.items():
            if point is None or neighbors is None:
                continue
            if len(neighbors) >= 3 and point not in terminals:
                steiner_points.add(point)
                print(f"Found Steiner point at ({point.x}, {point.y}) with {len(neighbors)} connections")

        # Map cables to edges with validation
        edge_cables = {}
        for cable in cables:
            if not cable or not cable.cableLabel:
                continue
            if cable.source not in machine_points or cable.target not in machine_points:
                print(f"Warning: Invalid source/target for cable {cable.cableLabel}")
                continue
                
            source = machine_points[cable.source]
            target = machine_points[cable.target]
            path = find_path_in_mst(source, target, tree)
            
            if not path:
                print(f"Warning: No path found for cable {cable.cableLabel}")
                continue
                
            for i in range(len(path) - 1):
                edge = tuple(sorted([path[i], path[i+1]], key=lambda p: (p.x, p.y)))
                if edge not in edge_cables:
                    edge_cables[edge] = set()
                edge_cables[edge].add(cable.cableLabel)

        # Helper function with validation
        def find_connected_edges(point: Point, cable_set: set) -> List[Tuple[Point, Point]]:
            if point is None or cable_set is None:
                return []
            connected = []
            for neighbor in adj.get(point, set()):
                edge = tuple(sorted([point, neighbor], key=lambda p: (p.x, p.y)))
                if edge not in processed_edges and edge_cables.get(edge) == cable_set:
                    connected.append(edge)
            return connected

        # Create sections
        processed_edges = set()
        start_points = terminals | steiner_points
        
        for start_point in start_points:
            if start_point is None:
                continue
                
            for neighbor in adj.get(start_point, set()):
                edge = tuple(sorted([start_point, neighbor], key=lambda p: (p.x, p.y)))
                if edge in processed_edges:
                    continue
                    
                cable_set = edge_cables.get(edge, set())
                if not cable_set:
                    continue

                # Build section
                section_points = [start_point]
                current = neighbor
                processed_edges.add(edge)
                
                try:
                    while current not in start_points:
                        section_points.append(current)
                        next_edges = find_connected_edges(current, cable_set)
                        if not next_edges:
                            break
                        next_edge = next_edges[0]
                        processed_edges.add(next_edge)
                        current = next_edge[1] if next_edge[0] == current else next_edge[0]
                    
                    section_points.append(current)
                    final_points = create_section_points(section_points)
                    
                    cable_details = {
                        label: cable_map[label]
                        for label in cable_set
                        if label in cable_map
                    }

                    section = Section(
                        points=final_points,
                        cables=list(cable_set),
                        network=network_name,
                        details=cable_details
                    )
                    section_dict = section.to_dict()
                    section_dict['strokeWidth'] = 4 + min(len(cable_set), 10)
                    sections.append(section_dict)
                    
                except Exception as e:
                    print(f"Warning: Error processing section: {str(e)}")
                    continue

        print(f"\nCreated {len(sections)} sections for network {network_name}")
        return sections

    except Exception as e:
        print(f"Error in convert_tree_to_sections: {str(e)}")
        return []  # Return empty list instead of raising

def find_cable_path(adj: Dict[Point, Set[Point]], 
                   start: Point, 
                   end: Point,
                   steiner_points: Set[Point],
                   existing_paths: Dict[str, List[Point]] = None,
                   network_name: str = None) -> List[Point]:
    """Find path between two points, potentially detouring through Steiner points and reusing existing paths"""
    
    def heuristic(p: Point) -> int:
        # Base heuristic using Manhattan distance
        direct_dist = manhattan_distance(p, end)
        
        # Consider beneficial Steiner point detours
        if p != end:
            for steiner in steiner_points:
                detour_dist = manhattan_distance(p, steiner) + manhattan_distance(steiner, end)
                detour_dist *= 0.85  # Incentivize using Steiner points
                direct_dist = min(direct_dist, detour_dist)
        
        return direct_dist
    
    def calculate_path_cost(current: Point, next_point: Point) -> float:
        base_cost = manhattan_distance(current, next_point)
        multiplier = 1.0
        
        # Discount for Steiner points
        if current in steiner_points or next_point in steiner_points:
            multiplier *= 0.85
        
        # Discount for reusing existing paths
        if existing_paths:
            # Check if this segment exists in any existing path
            segment = (current, next_point)
            for path in existing_paths.values():
                if isinstance(path, list) and len(path) > 1:
                    for i in range(len(path) - 1):
                        if (path[i], path[i+1]) == segment or (path[i+1], path[i]) == segment:
                            multiplier *= 0.85  # 15% discount for reusing paths
                            break
        
        return base_cost * multiplier

    open_set = [(heuristic(start), 0, start, [start])]
    closed_set = set()
    g_score = {start: 0}
    
    while open_set:
        _, cost, current, path = heappop(open_set)
        
        if current == end:
            return path
            
        if current in closed_set:
            continue
            
        closed_set.add(current)
        
        # Consider all neighbors
        for next_point in adj[current]:
            if next_point in closed_set:
                continue
                
            # Calculate cost with all discounts applied
            new_cost = g_score[current] + calculate_path_cost(current, next_point)
            
            if next_point not in g_score or new_cost < g_score[next_point]:
                g_score[next_point] = new_cost
                new_path = path + [next_point]
                f_score = new_cost + heuristic(next_point)
                heappush(open_set, (f_score, new_cost, next_point, new_path))
    
    return None

def calculate_hanan_grid(points: List[Point]) -> Dict[str, List[int]]:
    """Calculate Hanan grid coordinates from terminal points"""
    if not points:
        return {"xCoords": [], "yCoords": []}

    # Get unique x and y coordinates
    x_coords = sorted(list(set(p.x for p in points)))
    y_coords = sorted(list(set(p.y for p in points)))

    return {
        "xCoords": x_coords,
        "yCoords": y_coords
    } 