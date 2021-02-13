#
# TowerScout
#

# import basic functionality
from ts_yolov5 import YOLOv5_Detector
import ts_imgutil
from ts_bmaps import BingMap
from ts_gmaps import GoogleMap
from ts_zipcode import Zipcode_Provider
from ts_events import ExitEvents
import ts_maps
from flask import Flask, render_template, send_from_directory, request, session
from waitress import serve
import json
import torch
import os
import ssl
import asyncio
import time
import tempfile
from PIL import Image, ImageDraw
import torch
import threading
import gc

MAX_TILES = 512
MAX_TILES_SESSION = 2000


torch.set_num_threads(1)
print("Pytorch threads:", torch.get_num_threads())

engines = {
    'yolov5_xl_250': {'id': 'yolov5_xl_250', 'name': 'YOLOv5 x-large 250', 'engine': None, 'file':'xl_250_best.pt'},
    'yolov5_xl_100': {'id': 'yolov5_xl_100', 'name': 'YOLOv5 x-large 100', 'engine': None, 'file':'xl_100_best.pt'},
    'yolov5_l': {'id': 'yolov5_l', 'name': 'YOLOv5 large', 'engine': None, 'file':'large_100_best.pt'},
}

engine_default = 'yolov5_xl_250'
engine_lock = threading.Lock()

exit_events = ExitEvents()


# on-demand instantiate YOLOv5 model
def get_engine(e):
    if e is None:
        e = engine_default

    with engine_lock:
        # take all the other ones out of play
        for engine in engines:
            #print(engine)
            if engines[engine]['id'] != e:
                engines[engine]['engine'] = None
        gc.collect(generation=2)

        if engines[e]['engine'] is None:
            print (" loading model:", engines[e]['name'])
            engines[e]['engine'] = YOLOv5_Detector('model_params/yolov5/'+engines[e]['file'])
            
        return engines[e]['engine']

def find_model(m):
    for engine in engines:
        if m == engines[engine]['file']:
            return True
    return False

def get_custom_models():
    for f in os.listdir("./model_params/yolov5"):
        if f.endswith(".pt") and not find_model(f):
            add_model(f)

def add_model(m):
    engines[m] = {
        'id':m,
        'name':"Custom: "+m,
        'file':m,
        'engine':None
    }

providers = {
    'google': {'id': 'google', 'name': 'Google Maps'},
    'bing': {'id': 'bing', 'name': 'Bing Maps'},
}

# other global variables
google_api_key = ""
bing_api_key = ""
loop = asyncio.get_event_loop()

# prepare uploads directory
if not os.path.isdir("./uploads"):
    os.mkdir("./uploads")
for f in os.listdir("./uploads"):
    os.remove(os.path.join("./uploads", f))

print("Torch cuda:", "is" if torch.cuda.is_available() else "is not", "available")
ssl._create_default_https_context = ssl._create_unverified_context

# variable for zipcode provider
zipcode_lock = threading.Lock()
zipcode_provider = None
# eager instantiation - takes about 10 seconds at startup
# with zipcode_lock:
#     print("instantiating zipcode frame, could take 10 seconds ...")
#     zipcode_provider = Zipcode_Provider()



# Flask boilerplate stuff
app = Flask(__name__)
#session = Session()
app.config['UPLOAD_FOLDER'] = "uploads"

# route for js code
@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)

# route for custom images
@app.route('/uploads/<path:path>')
def send_img(path):
    return send_from_directory('uploads', path)

# route for js code
@app.route('/css/<path:path>')
def send_css(path):
    return send_from_directory('css', path)

# main page route
@app.route('/')
def map_func():

    # init default engine
    # get_engine(None)

    # check for compatible browser
    print(request.user_agent.string)
    # if not request.user_agent.browser in ['chrome','firefox']:
    #     return render_template('incompatible.html')

    # now render the map.html template, inserting the key
    return render_template('towerscout.html', google_map_key=google_api_key, bing_map_key=bing_api_key)

# cache control
# todo: ratchet this up after development


@app.after_request
def add_header(response):
    response.cache_control.max_age = 1
    return response

# retrieve available engine choices
@app.route('/getengines')
def get_engines():
    print("engines requested")
    result = json.dumps([{'id': k, 'name': v['name']}
                        for (k, v) in engines.items()])
    print(result)
    return result

# retrieve available map providers
@app.route('/getproviders')
def get_providers():
    print("map providers requested")
    result = json.dumps([{'id': k, 'name': v['name']}
                        for (k, v) in providers.items()])
    print(result)
    return result

# zipcode bounadry lookup
@app.route('/getzipcode')
def get_zipcode():
    global zipcode_provider
    zipcode = request.args.get("zipcode")
    print("zipcode requested:",zipcode)
    with zipcode_lock:
        if zipcode_provider is None:
            print("instantiating zipcode frame, could take 10 seconds ...")
            zipcode_provider = Zipcode_Provider()
        print("looking up zipcode ...")
        return zipcode_provider.zipcode_polygon(zipcode)

# abort route
@app.route('/abort', methods=['get'])
def abort():
    print (" aborting ...", id(session), session['abort'])
    exit_events.signal(id(session))
    return "ok"

# detection route
@app.route('/getobjects', methods=['POST'])
def get_objects():
    print (" session:",id(session))

    # check whether this session is over its limit
    if 'tiles' not in session:
        session['tiles'] = 0

    print("tiles queried in session:", session['tiles'])
    if session['tiles'] > MAX_TILES_SESSION:
        return "-1"


    # start time, get params
    start = time.time()
    bounds = request.form.get("bounds")
    engine = request.form.get("engine")
    provider = request.form.get("provider")
    polygons = request.form.get("polygons")
    print("incoming detection request:")
    print(" bounds:", bounds)
    print(" engine:", engine)
    print(" map provider:", provider)
    # print(" polygons:",polygons)

    # make the polygons
    polygons = json.loads(polygons)
    # print(" parsed polygons:", polygons)
    polygons = [ts_imgutil.make_boundary(p) for p in polygons]
    print(" Shapely polygons:", polygons)

    # get the proper detector
    det = get_engine(engine)

    # empty results
    results = []

    # create a map provider object
    map = None
    if provider == "bing":
        map = BingMap(bing_api_key)
    elif provider == "google":
        map = GoogleMap(google_api_key)
    if map is None:
        print(" could not instantiate map provider:", provider)

    # divide the map into 640x640 parts
    tiles, nx, ny, meters, h, w = map.make_map_list(bounds)
    print(f" {len(tiles)} tiles, {nx} x {ny}, {meters} x {meters} m")
    # print(" Tile centers:")
    # for c in tiles:
    #   print("  ",c)

    tiles = [c for c in tiles if ts_maps.check_tile_against_bounds(c, w, h, bounds)]
    tiles = [c for c in tiles if ts_imgutil.tileIntersectsPolygons(c, w, h, polygons)]
    print (" tiles left after viewport and polygon filter:", len(tiles))

    if request.form.get("estimate") == "yes":
        # reset abort flag
        exit_events.alloc(id(session)) # todo: might leak some of these
        print(" returning tile number")
        print()
        return str(len(tiles)) #  + ("" if len(tiles) > MAX_TILES else " (exceeds limit)")

    if len(tiles) > MAX_TILES:
        print(" ---> request contains too many tiles")
        exit_events.free(id(session))
        return "[]"
    else:
        # tally the new request
        session['tiles'] += len(tiles)


    # retrieve them asynchronously, then process
    with tempfile.TemporaryDirectory() as tmpdirname:
        map.get_sat_maps(tiles, loop, tmpdirname)

        files = [tmpdirname+"/temp"+str(i)+".jpg" for i in range(len(tiles))]
        print(" asynchronously retrieved", len(tiles),"files")
        if exit_events.query(id(session)):
            print(" client aborted request.")
            exit_events.free(id(session))
            return "[]"

        # detect all towers
        results_raw = det.detect(files, exit_events, id(session))
        # abort if signaled
        if exit_events.query(id(session)):
            print(" client aborted request.")
            exit_events.free(id(session))
            return "[]"
        # print(" results_raw:")
        # print(" --------")
        # print(results_raw)
        # print(" --------")

    results = []

    # post-process the results
    for result, tile in zip(results_raw, tiles):
        # adjust xyxy normalized results to lat, long pairs
        tile_center_lat, tile_center_lng = tile[0], tile[1]
        tile_h, tile_w = tile[2], tile[3]
        for object in result:
            object['conf'] *= map.checkCutOffs(object)
            object['x1'] = tile_center_lng - 0.5*tile_w + object['x1']*tile_w
            object['x2'] = tile_center_lng - 0.5*tile_w + object['x2']*tile_w
            object['y1'] = tile_center_lat + 0.5*tile_h - object['y1']*tile_h
            object['y2'] = tile_center_lat + 0.5*tile_h - object['y2']*tile_h
            # print(" output:",str(object))
        results += result

    # filter out results out of bounds or polygon
    results = list(filter(lambda o:ts_imgutil.resultIntersectsPolygons(o['x1'],o['y1'],o['x2'],o['y2'], polygons), results))
    results = list(filter(lambda o:ts_maps.check_bounds(o['x1'],o['y1'],o['x2'],o['y2'], bounds), results))

    # sort the results by lat, long, conf
    results.sort(key=lambda x:x['y1']*2*180+2*x['x1']+x['conf'])

    # coaslesce neighboring (in list) towers that are closer than 1 m for x1, y1
    if len(results) > 1:
        i = 0
        while i < len(results)-1:
            if ts_maps.get_distance(results[i]['x1'], results[i]['y1'], 
                            results[i+1]['x1'], results[i+1]['y1']) < 1:
                print(" removing 1 duplicate result")
                results.remove(results[i+1])
            else:
                i += 1


    # append a pseudo-result for each tile, for debugging
    for tile in tiles:
        tile_center_lat, tile_center_lng = tile[0], tile[1]
        tile_h, tile_w = tile[2], tile[3]
        results.append({
            'x1':tile_center_lng - 0.5*tile_w,
            'y1':tile_center_lat + 0.5*tile_h,
            'x2':tile_center_lng + 0.5*tile_w,
            'y2':tile_center_lat - 0.5*tile_h,
            'class':1,
            'class_name':'tile',
            'conf':1,
        })

    # all done    
    print(" request complete, elapsed time: ",(time.time()-start))

    exit_events.free(id(session))
    return json.dumps(results)


def allowed_extension(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg'}

# detection route for provided images
@app.route('/getobjectscustom', methods=['POST'])
def get_objects_custom():
    start = time.time()
    engine = request.form.get("engine")
    print("incoming custom image detection request:")
    print(" engine:", engine)

    # upload the file
    if request.method != 'POST':
        print(" --- POST requests only please")
        return None

    # check if the post request has the file part
    if 'image' not in request.files:
        print(" --- no file part in request")
        return None

    file = request.files['image']
    if file.filename == '':
        print(' --- no selected image file')
        return None

    if not file or not allowed_extension(file.filename):
        print(" --- invalid file or extension:", file.filename)
        return None

    # get the proper detector
    det = get_engine(engine)

    # empty results
    results = []

    # filename = secure_filename(file.filename)
    filename = file.filename
    file.save("uploads/"+ filename)
    print(" uploaded file ")
    results = det.detect(["uploads/"+filename])

    # draw result bounding boxes on image
    objects = 0
    with Image.open("uploads/"+ filename) as im:
        for result in results:
            for object in result:
                drawResult(object, im)
                objects += 1
        im.save("uploads/"+ filename, quality=95)
    print (" done drawing results.")
    
    # all done    
    print(" custom request complete,", objects," objects, elapsed time: ",(time.time()-start))

    return json.dumps(results)


# 
# pillow helper function to draw
#
def drawResult(r, im):
    print (" drawing ...")
    draw = ImageDraw.Draw(im)
    draw.rectangle([
        im.size[0]*r['x1'],
        im.size[1]*r['y1'],
        im.size[0]*r['x2'],
        im.size[1]*r['y2']
        ],
        outline="red")


# upload a new model
@app.route('/uploadmodel', methods=['POST'])
def upload_model():
    print("uploading model:")

    # upload the file
    if request.method != 'POST':
        print(" --- POST requests only please")
        return None

    # check if the post request has the file part
    if 'model' not in request.files:
        print(" --- no file part in request")
        return None

    file = request.files['model']
    if file.filename == '':
        print(' --- no selected model file')
        return None

    if not file or not file.filename.endswith(".pt"):
        print(" --- invalid file or extension:", file.filename)
        return None

    # filename = secure_filename(file.filename)
    filename = file.filename
    file.save("model_params/yolov5/"+ filename)
    print(" uploaded file!")

    add_model(filename)

    print (" installed model", file.filename)

    return "ok"



if __name__ == '__main__':
    # read maps api key (not in source code due to security reasons)
    # has to be an api key with access to maps, staticmaps and places
    # todo: deploy CDC-owned key in final version
    with open('apikey.txt') as f:
        google_api_key = f.readline().split()[0]
        bing_api_key = f.readline().split()[0]
        f.close
    # app.run(debug = True)  
    app.secret_key = 'super secret key'
    app.config['SESSION_TYPE'] = 'filesystem'
    get_custom_models()

    serve(app, host='0.0.0.0', port=5000)  
