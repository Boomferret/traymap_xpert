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
        cable_routes = {}

        # Process each network separately
        for network_name, cables in network_cables.items():
            try:
                network_sections = find_optimal_paths(
                    cables,
                    config.machines,
                    blocked,
                    config.width,
                    config.height,
                    network_name
                )
                sections.extend(network_sections)
                
                # Update cable routes
                for section in network_sections:
                    for cable in section.cables:
                        cable_routes[cable] = [{"x": p.x, "y": p.y} for p in section.points]
            except Exception as e:
                print(f"Error processing network {network_name}: {str(e)}")
                continue

        return RoutingResponse(
            sections=sections,
            cableRoutes=cable_routes,
            hananGrid=hanan_grid
        )
    except HTTPException:
        raise
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
        return self.x == other.x and self.y == other.y

    def __hash__(self):
        return hash((self.x, self.y))

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

def find_optimal_paths(cables: List[Cable], machines: Dict[str, Machine], 
                      blocked_grid: np.ndarray, width: int, height: int,
                      network_name: str) -> List[Section]:
    try:
        print(f"\n=== Processing cables for network {network_name} ===")
        print(f"Number of cables: {len(cables)}")

        # Create a grid to track existing paths and their usage count
        path_usage = np.zeros((height, width), dtype=int)
        
        # Update path usage from existing sections
        for y in range(height):
            for x in range(width):
                if not blocked_grid[y, x]:
                    # Reduce cost for cells that are already used by other paths
                    # This encourages path sharing between networks
                    path_usage[y, x] = 1

        # Extract terminal points from machines
        terminals = set()
        for cable in cables:
            if cable.source in machines and cable.target in machines:
                source_machine = machines[cable.source]
                target_machine = machines[cable.target]
                print(f"\nProcessing cable: {cable.source} -> {cable.target}")
                print(f"  Source: ({source_machine.x}, {source_machine.y})")
                print(f"  Target: ({target_machine.x}, {target_machine.y})")
                terminals.add(Point(source_machine.x, source_machine.y))
                terminals.add(Point(target_machine.x, target_machine.y))

        # Convert terminals to list for indexing
        terminal_list = list(terminals)
        print(f"\nFound {len(terminal_list)} unique terminals")
        
        if not terminal_list:
            print("No valid terminals found")
            return []
        
        # Find MST first
        mst = find_minimum_spanning_tree(terminal_list)
        print(f"\nMST found with {len(mst)} edges")
        print("MST edges:")
        for edge in mst:
            print(f"  ({edge[0].x}, {edge[0].y}) -> ({edge[1].x}, {edge[1].y})")
        
        # Find all proper stars with detailed logging
        stars = find_proper_stars(terminal_list, blocked_grid)
        print(f"\nFound {len(stars)} potential Steiner points")
        
        # Calculate gain for each star, considering path sharing
        for star in stars:
            # Increase gain if the star's center is on an existing path
            path_sharing_bonus = 2.0 if path_usage[star.center.y, star.center.x] > 0 else 1.0
            star.gain = calculate_star_gain(star, mst) * path_sharing_bonus
            print(f"\nSteiner point at ({star.center.x}, {star.center.y}):")
            print(f"  Base gain: {star.gain / path_sharing_bonus}")
            print(f"  Path sharing bonus: {path_sharing_bonus}x")
            print(f"  Final gain: {star.gain}")
        
        # Sort stars by gain
        stars.sort(key=lambda x: x.gain, reverse=True)
        
        # Build final tree using stars
        final_tree = build_final_tree(mst, stars, blocked_grid)
        print(f"\nFinal tree constructed with {len(final_tree)} edges")
        
        # Update path usage grid with new paths
        for edge in final_tree:
            p1, p2 = edge
            path = find_rectilinear_path(p1, p2)
            for point in path:
                path_usage[point.y, point.x] += 1
        
        # Convert tree to sections
        sections = convert_tree_to_sections(final_tree, cables, machines, network_name)
        print(f"\nCreated {len(sections)} sections for network {network_name}")
        return sections

    except Exception as e:
        print(f"Error in find_optimal_paths: {str(e)}")
        raise

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
    
    # Calculate length without Steiner point (current path length)
    current_length = 0
    star.bridges = set()  # Reset bridges
    
    # Build adjacency list from MST
    adj = {}
    for e in mst:
        if e[0] not in adj: adj[e[0]] = set()
        if e[1] not in adj: adj[e[1]] = set()
        adj[e[0]].add(e[1])
        adj[e[1]].add(e[0])
    
    # For each terminal connected to the Steiner point
    for terminal in star.terminals:
        # Find path from terminal to Steiner point
        path = find_rectilinear_path(star.center, terminal)
        current_length += sum(manhattan_distance(path[i], path[i+1]) 
                            for i in range(len(path)-1))
        
        # Find existing MST edges that would be replaced
        for i in range(len(path) - 1):
            p1, p2 = path[i], path[i+1]
            edge = tuple(sorted([p1, p2], key=lambda p: (p.x, p.y)))
            if edge in mst:
                star.bridges.add(edge)
            elif (p2, p1) in mst:
                star.bridges.add((p2, p1))
    
    # Calculate length with Steiner point
    steiner_length = sum(manhattan_distance(star.center, t) for t in star.terminals)
    
    # Calculate gain (positive means improvement)
    gain = current_length - steiner_length
    
    print(f"  Current path length: {current_length}")
    print(f"  Length with Steiner point: {steiner_length}")
    print(f"  Gain: {gain}")
    print(f"  Bridges to replace: {len(star.bridges)}")
    for bridge in star.bridges:
        print(f"    Bridge: ({bridge[0].x}, {bridge[0].y}) -> ({bridge[1].x}, {bridge[1].y})")
    
    # Apply multiplier to encourage Steiner points
    final_gain = gain * 1.5
    print(f"  Final gain (with multiplier): {final_gain}")
    
    return final_gain

def find_bridges_in_mst(star: Star, mst: Set[Tuple[Point, Point]]) -> Set[Tuple[Point, Point]]:
    """Find MST edges that would be replaced by this star"""
    bridges = set()
    
    # For each pair of terminals in the star
    for i in range(len(star.terminals)):
        for j in range(i + 1, len(star.terminals)):
            t1, t2 = star.terminals[i], star.terminals[j]
            
            # Find path between these terminals in MST
            path = find_path_in_mst(t1, t2, mst)
            if path:
                # Add the longest edge in the path
                max_edge = max(path, key=lambda e: manhattan_distance(e[0], e[1]))
                bridges.add(max_edge)
    
    return bridges

def find_path_in_mst(start: Point, end: Point, 
                     mst: Set[Tuple[Point, Point]]) -> List[Tuple[Point, Point]]:
    """Find path between two points in MST using DFS"""
    # Build adjacency list
    adj = {}
    for e in mst:
        if e[0] not in adj: adj[e[0]] = set()
        if e[1] not in adj: adj[e[1]] = set()
        adj[e[0]].add(e[1])
        adj[e[1]].add(e[0])
    
    visited = set()
    path = []
    
    def dfs(curr: Point, target: Point) -> bool:
        if curr == target:
            return True
            
        visited.add(curr)
        for next_point in adj[curr]:
            if next_point not in visited:
                path.append((curr, next_point))
                if dfs(next_point, target):
                    return True
                path.pop()
        return False
    
    if dfs(start, end):
        return path
    return None

def build_final_tree(mst: Set[Tuple[Point, Point]], stars: List[Star], 
                    blocked_grid: np.ndarray) -> Set[Tuple[Point, Point]]:
    """Build final tree incorporating beneficial stars"""
    print("\nBuilding final tree:")
    print(f"Starting with MST edges: {len(mst)}")
    print(f"Considering {len(stars)} Steiner points")
    
    final_tree = set(mst)
    
    for star in stars:
        if star.gain <= 0:
            print(f"Skipping Steiner point at ({star.center.x}, {star.center.y}) - no gain")
            continue
            
        if can_add_star(star, final_tree, blocked_grid):
            print(f"\nAdding Steiner point at ({star.center.x}, {star.center.y}):")
            print(f"  Gain: {star.gain}")
            
            # Remove replaced edges
            for bridge in star.bridges:
                if bridge in final_tree:
                    final_tree.remove(bridge)
            
            # Add new edges from star center
            for terminal in star.terminals:
                final_tree.add((star.center, terminal))
    
    print(f"\nFinal tree built with {len(final_tree)} edges")
    return final_tree

def can_add_star(star: Star, current_tree: Set[Tuple[Point, Point]], 
                 blocked_grid: np.ndarray) -> bool:
    """Check if a star can be added to the current tree"""
    print(f"\nChecking if star at ({star.center.x}, {star.center.y}) can be added:")
    
    # Check if bridges exist in current tree
    for bridge in star.bridges:
        if bridge not in current_tree and (bridge[1], bridge[0]) not in current_tree:
            print(f"  Bridge {bridge} not found in current tree")
            return False
    
    # Check if new paths are blocked
    for terminal in star.terminals:
        if is_path_blocked(star.center, terminal, blocked_grid):
            print(f"  Path to terminal ({terminal.x}, {terminal.y}) is blocked")
            return False
    
    # Check if adding star creates a cycle
    test_tree = set(current_tree)
    for bridge in star.bridges:
        if bridge in test_tree:
            test_tree.remove(bridge)
        elif (bridge[1], bridge[0]) in test_tree:
            test_tree.remove((bridge[1], bridge[0]))
    
    for terminal in star.terminals:
        test_tree.add((star.center, terminal))
    
    has_cycles = has_cycle(test_tree)
    print(f"  Would {'create' if has_cycles else 'not create'} cycles")
    
    return not has_cycles

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
        
        # Create mappings
        machine_points = {
            machine_id: Point(machine.x, machine.y)
            for machine_id, machine in machines.items()
        }
        cable_map = {cable.cableLabel: cable for cable in cables if cable.cableLabel}

        # Build adjacency list and track cables for each edge
        adj = {}
        edge_cables = {}  # Maps edge segments to sets of cable labels
        
        # Initialize adjacency list
        for edge in tree:
            p1, p2 = edge
            if p1 not in adj: adj[p1] = set()
            if p2 not in adj: adj[p2] = set()
            adj[p1].add(p2)
            adj[p2].add(p1)

        # Process each cable to find its path and track cable assignments
        for cable in cables:
            if not cable.cableLabel:
                continue

            source = machine_points[cable.source]
            target = machine_points[cable.target]
            path = find_path_in_graph(adj, source, target)
            
            if path:
                # Add cable to each segment in its path
                for i in range(len(path) - 1):
                    edge = tuple(sorted([path[i], path[i+1]], key=lambda p: (p.x, p.y)))
                    if edge not in edge_cables:
                        edge_cables[edge] = set()
                    edge_cables[edge].add(cable.cableLabel)

        # Create sections by following connected segments with same cables
        processed_edges = set()
        
        def get_next_point(current: Point, prev: Point, cable_set: set) -> Optional[Point]:
            """Find next point that continues the section with same cables"""
            for next_point in adj[current]:
                if next_point != prev:
                    edge = tuple(sorted([current, next_point], key=lambda p: (p.x, p.y)))
                    if edge not in processed_edges and edge_cables.get(edge, set()) == cable_set:
                        return next_point
            return None

        # Start from each unprocessed edge
        for edge in tree:
            if edge in processed_edges:
                continue
                
            start_edge = tuple(sorted([edge[0], edge[1]], key=lambda p: (p.x, p.y)))
            cable_set = edge_cables.get(start_edge, set())
            
            if not cable_set:
                continue

            # Build section points
            raw_points = [edge[0], edge[1]]
            processed_edges.add(start_edge)
            processed_edges.add(tuple(reversed(start_edge)))
            
            # Extend in both directions while cables match
            # Forward direction
            current = edge[1]
            prev = edge[0]
            while True:
                next_point = get_next_point(current, prev, cable_set)
                if not next_point:
                    break
                raw_points.append(next_point)
                edge_key = tuple(sorted([current, next_point], key=lambda p: (p.x, p.y)))
                processed_edges.add(edge_key)
                processed_edges.add(tuple(reversed(edge_key)))
                prev = current
                current = next_point

            # Convert raw points into proper path with only horizontal/vertical segments
            section_points = create_section_points(raw_points)

            # Create section
            cable_details = {
                label: cable_map[label]
                for label in cable_set
                if label in cable_map
            }
            
            section = Section(
                points=section_points,
                cables=list(cable_set),
                network=network_name,
                details=cable_details
            )
            section_dict = section.to_dict()
            # Add stroke width
            section_dict['strokeWidth'] = 4 + min(len(cable_set), 10)
            sections.append(section_dict)
            print(f"\nCreated section with {len(cable_set)} cables and {len(section_points)} points:")
            print(f"Cables: {list(cable_set)}")
            print(f"Points: {' -> '.join([f'({p.x}, {p.y})' for p in section_points])}")

        print(f"\nCreated {len(sections)} sections for network {network_name}")
        
        # Merge overlapping sections
        merged_sections = merge_overlapping_sections(sections)
        print(f"Merged into {len(merged_sections)} sections")
        
        return merged_sections

    except Exception as e:
        print(f"Error in convert_tree_to_sections: {str(e)}")
        raise

def find_path_in_graph(graph: Dict[Point, Set[Point]], start: Point, end: Point) -> List[Point]:
    """Find path between two points in graph using BFS"""
    if start not in graph or end not in graph:
        return None
        
    queue = [(start, [start])]
    visited = {start}
    
    while queue:
        current, path = queue.pop(0)
        if current == end:
            return path
            
        for next_point in graph[current]:
            if next_point not in visited:
                visited.add(next_point)
                queue.append((next_point, path + [next_point]))
    
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