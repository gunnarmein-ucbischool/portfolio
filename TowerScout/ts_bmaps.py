#
# bing map class
#

from ts_maps import Map

class BingMap(Map):
   def __init__(self, api_key):
      self.key = api_key

   def get_url(self, center, zoom=19, size="640,640", sc=2, fmt="jpeg", maptype="satellite"):
      '''
      get satellite image url for static map API
      '''

      url = "http://dev.virtualearth.net/REST/v1/Imagery/Map/Aerial/"
      url += str(center[0]) + "," + str(center[1]) + \
                  "/" + str(zoom) + "?"\
                  "&mapSize=" + size + \
                  "&format=" + fmt + \
                  "&key=" + self.key
      #print(url)
      return url

   #
   # checkCutOffs() 
   #
   # Function to check if the object was detected in the logo or copyright notice part
   # of the image. If so, drastically reduce confidence.
   #
   def checkCutOffs(self, 
   object):
      if object['y2'] > 0.96 and (object['x1'] < 0.09 or object['x2'] > 0.67):
         return 0.1
      return 1