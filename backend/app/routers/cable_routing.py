from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass
import itertools
from heapq import heappush, heappop

router = APIRouter()

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
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    walls: List[Point] = []
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
    # Could add more fields if desired

class RoutingResponse(BaseModel):
    sections: List[Section] = []
    cableRoutes: Dict[str, List[Point]] = {}
    hananGrid: Dict[str, List[int]] = {
        "xCoords": [],
        "yCoords": []
    }
    steinerPoints: List[Dict[str, int]] = []
    debug_info: Optional[DebugInfo] = None

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

    # For tie-breaking in heaps
    def __lt__(self, other):
        if not isinstance(other, PathPoint):
            return NotImplemented
        return (self.x, self.y) < (other.x, other.y)

    # So you could do tuple unpacking if needed
    def __iter__(self):
        yield self.x
        yield self.y

@dataclass
class FullComponent:
    terminals: List[PathPoint]
    steiner_points: List[PathPoint]
    connections: List[Tuple[PathPoint, PathPoint]]
    gain: float = 0.0

# ----------------- HELPER FUNCTIONS -----------------

def manhattan_distance(a: PathPoint, b: PathPoint) -> int:
    """Calculate Manhattan distance."""
    return abs(a.x - b.x) + abs(a.y - b.y)

def create_rectilinear_path(start: PathPoint, end: PathPoint) -> List[PathPoint]:
    """
    Return a short L-shaped path (choose horizontal-first or vertical-first based on which is shorter).
    """
    if start == end:
        return [start]
    path1 = [start, PathPoint(end.x, start.y), end]
    dist1 = sum(manhattan_distance(path1[i], path1[i+1]) for i in range(len(path1) - 1))

    path2 = [start, PathPoint(start.x, end.y), end]
    dist2 = sum(manhattan_distance(path2[i], path2[i+1]) for i in range(len(path2) - 1))

    return path1 if dist1 <= dist2 else path2

def find_mst(terminals: List[PathPoint]) -> List[Tuple[PathPoint, PathPoint]]:
    """
    Basic Prim's MST using Manhattan distance in a complete graph.
    """
    if not terminals:
        return []
    
    in_mst = set()
    mst_edges = []
    in_mst.add(terminals[0])
    heap = []
    counter = itertools.count()

    for v in terminals[1:]:
        dist = manhattan_distance(terminals[0], v)
        heappush(heap, (dist, next(counter), terminals[0], v))

    while len(in_mst) < len(terminals) and heap:
        dist, _, u, w = heappop(heap)
        if w in in_mst:
            continue
        in_mst.add(w)
        mst_edges.append((u, w))
        # Add edges from w to all outside the MST
        for x in terminals:
            if x not in in_mst:
                cost = manhattan_distance(w, x)
                heappush(heap, (cost, next(counter), w, x))

    return mst_edges

def find_minimum_tree(points: Set[PathPoint],
                      connections: List[Tuple[PathPoint, PathPoint]]) -> List[Tuple[PathPoint, PathPoint]]:
    """
    Another Prim's MST, but we only use edges in 'connections' to define adjacency.
    Weight = Manhattan distance.
    """
    graph = {p: {} for p in points}
    for (u, v) in connections:
        dist = manhattan_distance(u, v)
        if v not in graph[u] or dist < graph[u][v]:
            graph[u][v] = dist
        if u not in graph[v] or dist < graph[v][u]:
            graph[v][u] = dist

    if not points:
        return []
    
    used = set()
    mst = []
    start = next(iter(points))
    used.add(start)
    heap = []
    counter = itertools.count()

    for adj, dist in graph[start].items():
        heappush(heap, (dist, next(counter), start, adj))

    while len(used) < len(points) and heap:
        dist, _, u, w = heappop(heap)
        if w in used:
            continue
        used.add(w)
        mst.append((u, w))
        for nxt, ndist in graph[w].items():
            if nxt not in used:
                heappush(heap, (ndist, next(counter), w, nxt))

    return mst

def find_optimal_steiner_point(p1: PathPoint, p2: PathPoint, p3: PathPoint) -> PathPoint:
    """Median-based Steiner point for rectilinear metric."""
    xs = sorted([p1.x, p2.x, p3.x])
    ys = sorted([p1.y, p2.y, p3.y])
    return PathPoint(xs[1], ys[1])

def is_path_blocked(start: PathPoint, end: PathPoint, walls: Set[PathPoint]) -> bool:
    """
    Check if BOTH possible L-routes (horizontal->vertical or vertical->horizontal) are blocked.
    """
    route1_blocked = any(PathPoint(x, start.y) in walls
                         for x in range(min(start.x, end.x), max(start.x, end.x)+1)) \
                     or any(PathPoint(end.x, y) in walls
                            for y in range(min(start.y, end.y), max(start.y, end.y)+1))

    route2_blocked = any(PathPoint(start.x, y) in walls
                         for y in range(min(start.y, end.y), max(start.y, end.y)+1)) \
                     or any(PathPoint(x, end.y) in walls
                            for x in range(min(start.x, end.x), max(start.x, end.x)+1))

    return route1_blocked and route2_blocked

#
# --------------------  3-TERM & 4-TERM COMPONENTS  --------------------
#

def generate_3term_components(terminals: List[PathPoint],
                              mst_edges: List[Tuple[PathPoint, PathPoint]]
                             ) -> List[FullComponent]:
    """
    For each triple (t1,t2,t3), we create a single Steiner point (median-based),
    then connect (SP->t1), (SP->t2), (SP->t3).
    gain = sum of MST edges among t1,t2,t3 - sum of new edges.
    """
    comps = []
    n = len(terminals)
    for i in range(n-2):
        for j in range(i+1, n-1):
            for k in range(j+1, n):
                t1, t2, t3 = terminals[i], terminals[j], terminals[k]
                sp = find_optimal_steiner_point(t1, t2, t3)
                new_edges = [(sp, t1), (sp, t2), (sp, t3)]
                
                # sum MST edges among these 3
                triple_set = {t1, t2, t3}
                mst_sub_len = 0
                for (a, b) in mst_edges:
                    if a in triple_set and b in triple_set:
                        mst_sub_len += manhattan_distance(a, b)

                new_len = sum(manhattan_distance(a, b) for (a, b) in new_edges)
                gain = mst_sub_len - new_len
                if gain > 0:
                    comps.append(
                        FullComponent(
                            terminals=[t1, t2, t3],
                            steiner_points=[sp],
                            connections=new_edges,
                            gain=gain
                        )
                    )
    return comps

def generate_4term_components_advanced(
    terminals: List[PathPoint],
    mst_edges: List[Tuple[PathPoint, PathPoint]]
) -> List[FullComponent]:
    """
    Generate 4-terminal RSMT "full components" using multiple topologies:
      1) Pairwise partition (two Steiner points).
      2) H-topology (one Steiner point).
      (Potentially more shapes can be added.)

    For each shape, if gain>0, we keep it.
    """
    comps = []

    def mst_sub_length(group: Set[PathPoint]) -> int:
        sub_len = 0
        for (a, b) in mst_edges:
            if a in group and b in group:
                sub_len += manhattan_distance(a, b)
        return sub_len

    import itertools
    all_quads = list(itertools.combinations(terminals, 4))

    for quad in all_quads:
        t1, t2, t3, t4 = quad
        group_set = {t1, t2, t3, t4}
        sub_mst_len = mst_sub_length(group_set)

        # 1) Pairwise partition approach
        indices = [0,1,2,3]
        pts_list = [t1, t2, t3, t4]
        for pair_ij in itertools.combinations(indices, 2):
            pA = pts_list[pair_ij[0]]
            pB = pts_list[pair_ij[1]]
            remain = [p for i,p in enumerate(pts_list) if i not in pair_ij]
            pC, pD = remain[0], remain[1]

            # Steiner points for each pair
            spA = find_optimal_steiner_point(pA, pB, pB)
            spB = find_optimal_steiner_point(pC, pD, pD)

            edges = [(spA, pA), (spA, pB),
                     (spB, pC), (spB, pD),
                     (spA, spB)]
            new_len = sum(manhattan_distance(u, v) for (u,v) in edges)
            gain = sub_mst_len - new_len
            if gain > 0:
                comps.append(
                    FullComponent(
                        terminals=list(group_set),
                        steiner_points=[spA, spB],
                        connections=edges,
                        gain=gain
                    )
                )

        # 2) H-topology: pick 2 as "horizontal," 2 as "vertical"
        for horiz_pair in itertools.combinations(quad, 2):
            vert_pair = tuple(set(quad) - set(horiz_pair))
            if len(vert_pair) != 2:
                continue
            h1, h2 = horiz_pair
            v1, v2 = vert_pair

            # We'll pick the "Steiner point" at the approximate crossing
            # For rectilinear, we can pick the midpoint in x for (h1,h2),
            # and midpoint in y for (v1,v2).
            hx_coords = sorted([h1.x, h2.x])
            stx = (hx_coords[0] + hx_coords[1]) // 2

            vy_coords = sorted([v1.y, v2.y])
            sty = (vy_coords[0] + vy_coords[1]) // 2

            S = PathPoint(stx, sty)

            edges = [(S, h1), (S, h2), (S, v1), (S, v2)]
            new_len = sum(manhattan_distance(u, v) for (u,v) in edges)
            gain = sub_mst_len - new_len
            if gain > 0:
                comps.append(
                    FullComponent(
                        terminals=list(group_set),
                        steiner_points=[S],
                        connections=edges,
                        gain=gain
                    )
                )

    comps.sort(key=lambda c: c.gain, reverse=True)
    return comps

def generate_all_components(
    terminals: List[PathPoint],
    mst_edges: List[Tuple[PathPoint, PathPoint]]
) -> List[FullComponent]:
    """
    Combine:
      - 3-term components (generate_3term_components)
      - 4-term advanced components (generate_4term_components_advanced)
    Sort them all by descending gain.
    """
    three_comps = generate_3term_components(terminals, mst_edges)
    four_comps = generate_4term_components_advanced(terminals, mst_edges)
    all_comps = three_comps + four_comps
    all_comps.sort(key=lambda c: c.gain, reverse=True)
    return all_comps

#
# ----------------- MST UPDATE & BFS ROUTING -----------------
#

def update_mst_with_components(mst_edges: List[Tuple[PathPoint, PathPoint]],
                               components: List[FullComponent]) -> List[Tuple[PathPoint, PathPoint]]:
    """
    Incorporate all chosen Steiner components at once, then re-run MST over all points + edges.
    """
    points = set()
    connections = []

    # keep old MST edges
    for (u, v) in mst_edges:
        points.add(u)
        points.add(v)
        connections.append((u, v))

    # add all chosen Steiner edges
    for comp in components:
        for sp in comp.steiner_points:
            points.add(sp)
        for (u, v) in comp.connections:
            points.add(u)
            points.add(v)
            connections.append((u, v))

    new_mst = find_minimum_tree(points, connections)
    return new_mst

def find_cable_route(src: PathPoint, dst: PathPoint,
                     edges: List[Tuple[PathPoint, PathPoint]]) -> List[Point]:
    """
    BFS in a graph expanded from MST edges. Each MST edge is expanded to L-shaped segments.
    """
    graph = {}
    for (u, v) in edges:
        path_uv = create_rectilinear_path(u, v)
        for i in range(len(path_uv)-1):
            p1, p2 = path_uv[i], path_uv[i+1]
            graph.setdefault(p1, set()).add(p2)
            graph.setdefault(p2, set()).add(p1)

    visited = set()
    queue = [(src, [src])]
    visited.add(src)

    while queue:
        current, path_ = queue.pop(0)
        if current == dst:
            return [Point(x=p.x, y=p.y) for p in path_]
        for nxt in graph.get(current, []):
            if nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, path_ + [nxt]))

    return []  # no route

def convert_to_sections(final_mst: List[Tuple[PathPoint, PathPoint]],
                        cables: List[Cable],
                        machines: Dict[str, Machine],
                        networks: List[Dict]) -> List[Section]:
    """
    Convert MST edges to sections, grouping by network. 
    """
    print("\n=== Converting Edges to Sections ===")
    
    # Helper to calculate segment length
    def calculate_length(points: List[Point]) -> float:
        length = 0
        for i in range(len(points) - 1):
            dx = abs(points[i + 1].x - points[i].x)
            dy = abs(points[i + 1].y - points[i].y)
            length += dx + dy
        return length * 0.1  # Convert to meters (0.1m per grid unit)

    # Calculate routes and their lengths first
    cable_routes = {}
    cable_lengths = {}
    for cb in cables:
        cid = cb.cableLabel or f"{cb.source}-{cb.target}"
        spt = PathPoint(machines[cb.source].x, machines[cb.source].y)
        tpt = PathPoint(machines[cb.target].x, machines[cb.target].y)
        route = find_cable_route(spt, tpt, final_mst)
        if route:
            cable_routes[cid] = route
            # Calculate total length for this route
            cable_lengths[cid] = calculate_length(route)

    # Build network-lookup
    network_lookup = {}
    for net in networks:
        for func in net.get("functions", []):
            network_lookup[func] = net["name"]

    # Group cables by network
    grouped = {}
    for c in cables:
        net_name = network_lookup.get(c.cableFunction)
        if not net_name:
            continue
        grouped.setdefault(net_name, []).append(c)

    def points_form_segment(p1: Point, p2: Point, seg_start: Point, seg_end: Point) -> bool:
        """Check if p1->p2 is exactly within seg_start->seg_end (horiz or vert)."""
        if seg_start.x == seg_end.x:  # vertical
            if p1.x != seg_start.x or p2.x != seg_start.x:
                return False
            mn, mx = sorted([seg_start.y, seg_end.y])
            return (mn <= p1.y <= mx) and (mn <= p2.y <= mx)
        else:  # horizontal
            if p1.y != seg_start.y or p2.y != seg_start.y:
                return False
            mn, mx = sorted([seg_start.x, seg_end.x])
            return (mn <= p1.x <= mx) and (mn <= p2.x <= mx)

    sections = []
    for net_name, net_cables in grouped.items():
        print(f"\nProcessing network: {net_name}")
        for (u, v) in final_mst:
            path_uv = create_rectilinear_path(u, v)
            pyd_points = [Point(x=p.x, y=p.y) for p in path_uv]

            used_cables = set()
            cable_details = {}
            for c in net_cables:
                cid = c.cableLabel or f"{c.source}-{c.target}"
                route = cable_routes.get(cid)
                if not route:
                    continue
                # see if route has pyd_points as a sub-segment
                for i in range(len(route)-1):
                    if points_form_segment(route[i], route[i+1],
                                           pyd_points[0], pyd_points[-1]):
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
                            routeLength=cable_lengths.get(cid, 0),
                            length=getattr(c, 'length', None)
                        )
                        break

            if used_cables:
                sec = Section(
                    points=pyd_points,
                    cables=used_cables,
                    network=net_name,
                    details=cable_details,
                    strokeWidth=4 + min(len(used_cables)*0.75, 15)
                )
                sections.append(sec)

    print(f"\nTotal sections: {len(sections)}")
    return sections

def calculate_hanan_grid(all_points: List[PathPoint]) -> Dict[str, List[int]]:
    xs = sorted({p.x for p in all_points})
    ys = sorted({p.y for p in all_points})
    return {"xCoords": xs, "yCoords": ys}

# ----------------- MAIN ENDPOINT: MULTI-PASS + PER-COMPONENT ITERATION -----------------

@router.post("/optimize-paths")
async def optimize_cable_paths(config: GridConfig) -> RoutingResponse:
    """
    A more advanced multi-pass approach. In each pass:
      1) Generate all 3-terminal *and* 4-terminal components (with various topologies).
      2) Iteratively pick the SINGLE best component that yields improvement:
         - Check overlap, check walls, etc.
         - Update MST immediately.
         - Recompute gains and repeat until no single improvement is found.
      3) If no improvement occurs in a pass, stop.
    """
    try:
        print("\n=== Starting Cable Path Optimization with 3-term & 4-term Components ===")
        print(f"Grid: {config.width}x{config.height}")
        print(f"Machines: {len(config.machines)}, Cables: {len(config.cables)}")
        print(f"Walls: {len(config.walls)}, Perfs: {len(config.perforations)}")

        # Possibly a parameter you can expose:
        max_passes = 5

        # Validate cables
        for cb in config.cables:
            if cb.source not in config.machines:
                raise HTTPException(422, f"Source machine {cb.source} not found")
            if cb.target not in config.machines:
                raise HTTPException(422, f"Target machine {cb.target} not found")

        # Walls
        walls = {PathPoint(w.x, w.y) for w in config.walls}
        # Perforations => remove them from walls
        perfs = {PathPoint(p.x, p.y) for p in config.perforations}
        walls -= perfs

        # Build terminals
        terminals = []
        for mid, m in config.machines.items():
            pt = PathPoint(m.x, m.y)
            terminals.append(pt)

        # 1) Build initial MST
        print("\n--- PASS 0: Building Initial MST ---")
        mst_edges = find_mst(terminals)
        init_length = sum(manhattan_distance(a,b) for (a,b) in mst_edges)
        print(f"Initial MST length: {init_length}")

        current_length = init_length
        used_steiner_points = set()
        passes_used = 0
        total_comps_used = 0

        for pass_id in range(1, max_passes+1):
            print(f"\n=== PASS {pass_id} ===")
            improved_any = False
            iteration_count = 0

            while True:
                iteration_count += 1
                print(f"\n  PASS {pass_id}, iteration {iteration_count}: generating 3- & 4-term components...")

                # Generate 3- and 4-term components for the current MST
                comps = generate_all_components(terminals, mst_edges)
                print(f"  Found {len(comps)} candidate components with positive gain.")

                if not comps:
                    # no more improvements
                    print("  No more positive-gain components, stopping this pass.")
                    break

                # Now pick the SINGLE best component that yields improvement
                best_improvement = 0.0
                best_comp = None
                best_new_mst = None

                for comp in comps:
                    # Check for walls in each connection
                    blocked = False
                    for (u,v) in comp.connections:
                        if is_path_blocked(u, v, walls):
                            blocked = True
                            break
                    if blocked:
                        continue

                    # Try updating MST with just this component
                    new_edges = update_mst_with_components(mst_edges, [comp])
                    new_len = sum(manhattan_distance(a,b) for (a,b) in new_edges)
                    improvement = current_length - new_len
                    if improvement > best_improvement:
                        best_improvement = improvement
                        best_comp = comp
                        best_new_mst = new_edges

                if best_comp and best_improvement > 0:
                    print(f"  Accepted a component with gain={best_comp.gain:.2f}, actual improvement={best_improvement:.2f}")
                    mst_edges = best_new_mst
                    current_length -= best_improvement
                    used_steiner_points.update(best_comp.steiner_points)
                    total_comps_used += 1
                    improved_any = True
                else:
                    print("  No single-component improvement found this iteration.")
                    break

            # If we didn't improve at all in this pass, we're done
            if improved_any:
                print(f"Completed PASS {pass_id} with MST length={current_length:.2f}")
                passes_used = pass_id
            else:
                print(f"No improvement in PASS {pass_id}, stopping.")
                break

        # Summarize
        final_len = current_length
        improvement_pct = 0.0
        if init_length > 0:
            improvement_pct = 100*(init_length - final_len)/init_length

        print(f"\nFinal MST length: {final_len}, improvement over initial: {improvement_pct:.2f}%")
        print(f"Used Steiner points: {len(used_steiner_points)}, total comps used: {total_comps_used}")
        print(f"Passes used: {passes_used}")

        # Convert MST to sections
        sections = convert_to_sections(mst_edges, config.cables, config.machines, config.networks)

        # Build Hanan grid
        hanan = calculate_hanan_grid(terminals + list(used_steiner_points))

        # Cable routes
        cable_routes = {}
        for cb in config.cables:
            spt = PathPoint(config.machines[cb.source].x, config.machines[cb.source].y)
            tpt = PathPoint(config.machines[cb.target].x, config.machines[cb.target].y)
            route = find_cable_route(spt, tpt, mst_edges)
            if route:
                cable_routes[cb.cableLabel or f"{cb.source}-{cb.target}"] = route

        dbg = DebugInfo(
            initial_mst_length=init_length,
            final_length=final_len,
            improvement_percentage=improvement_pct,
            num_steiner_points=len(used_steiner_points),
            num_sections=len(sections),
            num_components_tried=0,  # Could track how many total comps we built across all passes if desired
            num_components_used=total_comps_used,
            passes_used=passes_used
        )

        response = RoutingResponse(
            sections=sections,
            cableRoutes=cable_routes,
            hananGrid=hanan,
            steinerPoints=[{"x": sp.x, "y": sp.y} for sp in used_steiner_points],
            debug_info=dbg
        )
        print("\nSample section details:", sections[0].details if sections else None)
        return response

    except Exception as ex:
        import traceback
        print("\n=== ERROR in optimize_cable_paths ===")
        print(traceback.format_exc())
        raise HTTPException(500, f"Error: {ex}")
