#!/usr/bin/env python3
"""Bake the pinned ODbL source extract into the game's flat, compressed roads."""
import json
import math
from pathlib import Path

root = Path(__file__).parent
source = json.loads((root / 'bay-route-source.json').read_text())

def simplify(points, tolerance):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    errors = [abs(dz * (x-a[0]) - dx * (z-a[1])) / length if length else math.hypot(x-a[0], z-a[1]) for x,z in points[1:-1]]
    error = max(errors)
    if error <= tolerance:
        return [a,b]
    index = errors.index(error) + 1
    return simplify(points[:index+1], tolerance)[:-1] + simplify(points[index:], tolerance)

def fit(route):
    # Local equirectangular meters, followed by a separate similarity transform
    # to attach each traced corridor to the existing three in-game cities.
    source_points = [(node[2]*88000, -node[1]*111000) for node in route['nodes']]
    x0,z0=source_points[0]
    vx,vz=source_points[-1][0]-x0,source_points[-1][1]-z0
    start,end=route['anchors']
    wx,wz=end[0]-start[0],end[1]-start[1]
    denom=vx*vx+vz*vz
    a=(wx*vx+wz*vz)/denom
    b=(wz*vx-wx*vz)/denom
    transformed=[(start[0]+a*(x-x0)-b*(z-z0),start[1]+b*(x-x0)+a*(z-z0)) for x,z in source_points]
    return [[round(x),round(z)] for x,z in simplify(transformed,35)]

def smooth(points):
    """Round sharp changes in heading while retaining the city endpoints."""
    result = [points[0]]
    for i in range(1,len(points)-1):
        a,p,b=points[i-1:i+2]
        left=math.dist(a,p); right=math.dist(p,b)
        u=((p[0]-a[0])/left,(p[1]-a[1])/left)
        v=((b[0]-p[0])/right,(b[1]-p[1])/right)
        angle=math.acos(max(-1,min(1,u[0]*v[0]+u[1]*v[1])))
        if angle<0.35:
            result.append(p)
            continue
        cut=min(160,left*.3,right*.3)
        start=(p[0]-u[0]*cut,p[1]-u[1]*cut)
        end=(p[0]+v[0]*cut,p[1]+v[1]*cut)
        for step in range(5):
            t=step/4
            result.append([round((1-t)**2*start[j]+2*(1-t)*t*p[j]+t*t*end[j]) for j in (0,1)])
    return result+[points[-1]]

def curve(start, end, incoming, outgoing, entry, exit, steps):
    """Sample a tangent-matched cubic in game meters without integer jitter."""
    def direction(vector):
        length=math.hypot(*vector)
        return [component/length for component in vector]
    incoming, outgoing=direction(incoming), direction(outgoing)
    first=[start[i]+incoming[i]*entry for i in (0,1)]
    second=[end[i]-outgoing[i]*exit for i in (0,1)]
    result=[]
    for step in range(steps+1):
        t=step/steps
        result.append([round((1-t)**3*start[i]+3*(1-t)**2*t*first[i]+3*(1-t)*t*t*second[i]+t**3*end[i],2) for i in (0,1)])
    return result

routes={route['id']:fit(route) for route in source['routes']}
# The real interchange is compressed away. The fictional connector is drawn
# as a broad tangent-matched bend, followed by an easing back into I-880.
# This avoids a very tight, hard-to-see hairpin at high driving speeds.
west=[1200,8497]; east=[2050,8300]; merge=[1912,7502]
join=curve(west,east,[1044,1465],[-138,-798],651,413,32)
ease=curve(east,merge,[-138,-798],[49,-439],261,354,16)
split=max(range(len(join)),key=lambda index:join[index][1])
peninsula=smooth(routes['peninsula'][:-2]+[west])[:-1]+join[:split+1]
east_tail=routes['east-bay'][1:]
# Remove an Oakland kink that otherwise turns ~72 degrees in 140 m.
east_tail.remove([301,376])
east_bay=join[split:]+ease[1:]+smooth(east_tail)[1:]

lines = [
    '/** OSM-derived and ODbL-licensed. Rebuild with python3 shared/bake-bay-highways.py.',
    ' * Source, relation versions, transformation and the interpolated gap: bay-route-source.json.',
    ' * © OpenStreetMap contributors · https://www.openstreetmap.org/copyright */',
    'export const BAY_HIGHWAY_TRACES = {',
]
for name, points in [('peninsula',peninsula),('east-bay',east_bay)]:
    pairs=','.join('['+str(x)+','+str(z)+']' for x,z in points)
    lines.append("  '"+name+"': ["+pairs+"],")
lines.extend(['} as const;', ''])
(root / 'bay-highway-traces.ts').write_text('\n'.join(lines))
