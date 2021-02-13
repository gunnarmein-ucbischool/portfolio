#
# the provider-independent part of maps
#

import requests
import time
import random
import tempfile
import math
import asyncio
import aiohttp
import aiofiles
import ssl


class Map:

    def get_sat_maps(self, tiles, loop, dir):
        ssl._create_default_https_context = ssl._create_unverified_context
        urls = []
        for tile in tiles:
            # ask provider for this specific url
            urls.append(self.get_url(tile))
            # print(urls[-1])
        # execute
        loop.run_until_complete(gather_urls(urls, dir))

    #
    # adapted from https://stackoverflow.com/users/6099211/anton-ovsyannikov
    # correct for both bing and GMaps
    #

    def get_static_map_wh(self, lat=None, lng=None, zoom=None, sx=None, sy=None):
        # lat, lng - center
        # sx, sy - map size in pixels

        # common factor based on latitude
        lat_factor = math.cos(lat*math.pi/180.)

        # determine degree size
        globe_size = 256 * 2 ** zoom  # total earth map size in pixels at current zoom
        d_lng = sx * 360. / globe_size  # degrees/pixel
        d_lat = sy * 360. * lat_factor / globe_size  # degrees/pixel

        # determine size in meters
        ground_resolution = 156543.04 * \
            lat_factor / (2 ** zoom)  # meters/pixel
        d_x = sx * ground_resolution
        d_y = sy * ground_resolution

        #print("d_lat", d_lat, "d_lng", d_lng)
        return (d_lat, d_lng, d_y, d_x)

    #
    # make_map_list:
    #
    # takes a center and radius, or bounds
    # returns a list of centers for zoom 19 scale 2 images
    #

    def make_map_list(self, bounds, overlap_percent=5):
        south, west, north, east = [float(x) for x in bounds.split(",")]

        # width and height of total map
        w = abs(west-east)
        h = abs(south-north)

        # width and height of a tile as degrees, also get the meters
        h_tile, w_tile, meters, meters_x = self.get_static_map_wh(
            lng=(east+west)/2., lat=(north+south)/2., zoom=19, sx=640, sy=640)
        #print(" tile: w:", w_tile, "h:", h_tile)

        # how many tiles horizontally and vertically?
        nx = math.ceil(w/w_tile/(1-overlap_percent/100.))
        ny = math.ceil(h/h_tile/(1-overlap_percent/100.))

        # now make a list of centerpoints of the tiles for the map
        tile_centers = []
        for row in range(ny):
            for col in range(nx):
                tile_centers.append((north - (0.5+row) * h_tile * (1-overlap_percent/100.),
                                     west + (col+0.5) * w_tile *
                                     (1-overlap_percent/100.),
                                     h_tile, w_tile))

        return tile_centers, nx, ny, meters, h_tile, w_tile


#
#  async file download helpers
#

async def gather_urls(urls, dir):
    # execute
    async with aiohttp.ClientSession() as session:
        await fetch_all(session, urls, dir)


async def fetch(session, url, dir, i):
    async with session.get(url) as response:
        if response.status != 200:
            response.raise_for_status()

        # write the file
        async with aiofiles.open(dir+"/temp"+str(i)+".jpg", mode='wb') as f:
            await f.write(await response.read())
            await f.close()


async def fetch_all(session, urls, dir):
    tasks = []
    for (i, url) in enumerate(urls):
        task = asyncio.create_task(fetch(session, url, dir, i))
        tasks.append(task)
    results = await asyncio.gather(*tasks)
    return results


#
# radian conversion and Haversine distance
#

def rad(x):
    return x * math.pi / 180.


def get_distance(x1, y1, x2, y2):
    R = 6378137.
    # Earth’s mean radius in meters
    dLat = rad(abs(y2 - y1))
    dLong = rad(abs(x2-x1))
    a = math.sin(dLat / 2) * math.sin(dLat / 2) + \
        math.cos(rad(y1)) * math.cos(rad(y2)) * \
        math.sin(dLong / 2) * math.sin(dLong / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    d = R * c
    return d
    # returns the distance in meters

#
# bounds checking
#


def check_bounds(x1, y1, x2, y2, bounds):
    south, west, north, east = [float(x) for x in bounds.split(",")]
    return not (y1 < south or y2 > north or x2 < west or x1 > east)


def check_tile_against_bounds(c, w, h, bounds):
    south, west, north, east = [float(x) for x in bounds.split(",")]
    x1 = c[1]-w/2
    x2 = c[1]+w/2
    y1 = c[0]+h/2
    y2 = c[0]-h/2

    return not (y1 < south or y2 > north or x2 < west or x1 > east)
