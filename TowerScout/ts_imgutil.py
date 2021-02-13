from PIL import Image
import math
from shapely import geometry
from shapely.geometry import Point, Polygon
import json


def crop(img, x1, y1, x2, y2):
    im = Image.open("image.png")
    im = im.crop((0, 50, 777, 686))
    im.show()

def make_boundary(boundary):
    if boundary['kind'] == "polygon":
        return Polygon(boundary['points'])
    else:
        print("Cannot parse polygon request:")
        print(boundary)


def tileIntersectsPolygons(center, w, h, polygons):
    if len(polygons) == 0:
        return True

    # make polygon from tile
    pt = Polygon([
        (center[1]-w/2, center[0]+h/2),
        (center[1]+w/2, center[0]+h/2),
        (center[1]+w/2, center[0]-h/2),
        (center[1]-w/2, center[0]-h/2),
        (center[1]-w/2, center[0]+h/2)
    ])
    #print (" tile polygon:"+str(pt.bounds))
    for p in polygons:
      #print (" boundary polygon:"+str(p.bounds))
      if pt.intersects(p):
        return True

    return False

def resultIntersectsPolygons(x1, y1, x2, y2, polygons):
    if len(polygons) == 0:
        return True
    
    # make polygon from result
    pr = Polygon([
        (x1, y1),
        (x2, y1),
        (x2, y2),
        (x1, y2),
        (x1, y1)
    ])
    for p in polygons:
      if pr.intersects(p):
        return True
        
    return False
