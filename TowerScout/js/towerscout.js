// TowerScout.js
// client-side logic



// maps

// The location of a spot in central NYC
const nyc = [-74.01020558171071, 40.71083794970947];

// main state
let bingMap = null;
let googleMap = null;
let currentMap;
let engines = {};
let currentProvider = null;
let currentUI = null;
let xhr = null;
let currentAddrElement = null;

const input = document.getElementById("search");
const upload = document.getElementById("upload_file");
const detectionsList = document.getElementById("checkBoxes");
const confSlider = document.getElementById("conf");

// Initialize and add the map
function initBingMap() {
  bingMap = new BingMap();
}

function initGoogleMap() {
  googleMap = new GoogleMap();
  setMyLocation();

  // the Google Map is also the default map
  currentMap = googleMap;
}



//
// Abstract Map base class
//

class TSMap {
  getBounds() {
    throw new Error("not implemented")
  }

  getBoundsUrl() {
    let b = this.getBounds();
    return [b[3], b[0], b[1], b[2]].join(","); // assemble in google format w, s, e, n
  }

  setCenter() {
    throw new Error("not implemented")
  }

  getCenter() {
    let b = this.getBounds();
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  getCenterUrl() {
    let c = this.getCenter();
    return c[0] + "," + c[1];
  }

  getZoom() {
    throw new Error("not implemented")
  }

  setZoom(z) {
    throw new Error("not implemented")
  }
  fitCenter() {
    throw new Error("not implemented")
  }

  search(place) {
    throw new Error("not implemented")
  }

  makeMapRect(o) {
    throw new Error("not implemented")
  }

  updateMapRect(o) {
    throw new Error("not implemented")
  }
}



//
// Bing Maps
//

class BingMap extends TSMap {
  constructor() {
    super();
    this.map = new Microsoft.Maps.Map('#bingMap', {
      center: new Microsoft.Maps.Location(nyc[1], nyc[0]),
      mapTypeId: Microsoft.Maps.MapTypeId.road,
      zoom: 19,
      maxZoom: 19,
    });

    // get view change event to bias place search results
    Microsoft.Maps.Events.addHandler(this.map, 'viewchangeend', () => googleMap.biasSearchBox());

    // load the spatial math module
    Microsoft.Maps.loadModule('Microsoft.Maps.SpatialMath', function () {
    });

    this.boundaries = [];
  }

  getBounds() {
    let rect = this.map.getBounds();
    return [
      rect.center.longitude - rect.width / 2,
      rect.center.latitude + rect.height / 2,
      rect.center.longitude + rect.width / 2,
      rect.center.latitude - rect.height / 2
    ];
  }

  fitBounds(b) {
    let locs = [
      new Microsoft.Maps.Location(b[1], b[0]),
      new Microsoft.Maps.Location(b[3], b[2]),
    ];
    let rect = Microsoft.Maps.LocationRect.fromLocations(locs);
    this.map.setView({ bounds: rect, padding: 0, zoom: 19 });
  }

  setCenter(c) {
    this.map.setView({
      center: new Microsoft.Maps.Location(c[1], c[0]),
    });
  }

  setZoom(z) {
    this.map.setView({
      zoom: z
    });
  }


  makeMapRect(o, listener) {
    let locs = [
      new Microsoft.Maps.Location(o.y1, o.x1),
      new Microsoft.Maps.Location(o.y1, o.x2),
      new Microsoft.Maps.Location(o.y2, o.x2),
      new Microsoft.Maps.Location(o.y2, o.x1),
      new Microsoft.Maps.Location(o.y1, o.x1)
    ];
    let color = Microsoft.Maps.Color.fromHex(o.color);
    color.a = o.opacity;
    let polygon = new Microsoft.Maps.Polygon(
      locs,
      {
        fillColor: color,
        strokeColor: o.color,
        strokeThickness: 1
      });

      if (typeof listener !== 'undefined') {
        Microsoft.Maps.Events.addHandler(polygon, 'click', listener);
      }
      this.map.entities.push(polygon);
    return polygon;
  }

  updateMapRect(o, onoff) {
    let r = o.mapRect;
    r.setOptions({ visible: onoff });
  }

  getZoom() {
    return this.map.getZoom();
  }

  resetBoundaries() {
    for (let b of this.boundaries) {
      for (var i = this.map.entities.getLength() - 1; i >= 0; i--) {
        var obj = this.map.entities.get(i);
        if (obj === b.bingObject) {
          this.map.entities.removeAt(i);
        }
      }
      b.bingObject = null;
    }
    this.boundaries = [];
  }

  addBoundary(b) {
    // make BingMap objects and link to them
    // all boundaries are polygons
    let points = [];
    for (let p of b.points) {
      points.push(new Microsoft.Maps.Location(p[1], p[0]));
    }
    const poly = new Microsoft.Maps.Polygon(points, {
      fillColor: "rgba(0,0,0,0)",
      strokeColor: "#0000FF",
      strokeThickness: 2
    });
    this.map.entities.push(poly);
    b.bingObject = poly;
    b.bingObjectBounds = poly.geometry.boundingBox;

    // add to active bounds
    this.boundaries.push(b);
  }

  showBoundaries() {
    // set map bounds to fit union of all active boundaries
    let bobjs = this.boundaries.map(x => x.bingObject);
    let bounds = Microsoft.Maps.LocationRect.fromShapes(bobjs);
    this.map.setView({ bounds: bounds, padding: 0 });
  }

}


//
// Google Maps
//


class GoogleMap extends TSMap {
  constructor() {
    super();
    // make the map 
    this.map = new google.maps.Map(document.getElementById("googleMap"), {
      zoom: 19,
      //center: nyc,
      fullscreenControl: false,
      streetViewControl: false,
      scaleControl: true,
      maxZoom: 19,
      tilt: 0,
    });
    this.boundaries = [];

    // Create the search box and link it to the UI element.
    this.searchBox = new google.maps.places.SearchBox(input);

    // Bias the SearchBox results towards current map's viewport.
    this.map.addListener("bounds_changed", () => {
      this.searchBox.setBounds(this.map.getBounds());
    });

    // Listen for the event fired when the user selects a prediction and retrieve
    // more details for that place.
    this.searchBox.addListener("places_changed", () => {
      let i = 0;
      this.places = this.searchBox.getPlaces();

      if (this.places.length == 0) {
        console.log("No places found.");
        return;
      }

      if (this.places.length >= 1) {
        let p = input.value;
        if (p.length === 5 && !isNaN(p)) {
          // special case: zipcode
          getZipcodePolygon(p);
          return;
        }
        this.getBoundsPolygon(input.value, this.places[0])
      }
    });
  }

  getBoundsPolygon(query, place) {
    googleMap.resetBoundaries();
    bingMap.resetBoundaries();

    console.log("Querying place outline for: " + query + " (" + place.name + ")");
    query = place.name

    googleMap.map.fitBounds(place.geometry.viewport);
    bingMap.fitBounds(googleMap.getBounds())

    $.ajax({
      url: "https://nominatim.openstreetmap.org/search.php",
      data: {
        q: query,
        polygon_geojson: "1",
        format: "json",
      },
      success: function (result) {
        let x = result[0];
        if (typeof x === 'undefined') {
          //googleMap.map.setCenter(place.geometry.location);
          googleMap.map.fitBounds(place.geometry.viewport);
          //googleMap.map.setZoom(19);
          bingMap.fitBounds(googleMap.getBounds())
          return;
        }
        console.log(" Display name: " + x['display_name'] + ": " + x['boundingbox']);
        if (x["geojson"]["type"] == "Polygon" || x["geojson"]["type"] == "MultiPolygon") {
          let bounds = null;
          let ps = x["geojson"]["coordinates"];
          for (let i = 0; i < ps.length; i++) {
            let p = ps[i];
            if (x["geojson"]["type"] == "MultiPolygon") {
              p = p[0];
            }
            //console.log(" Polygon: " + p);
            //let polyData = parseLatLngArray(p);
            googleMap.addBoundary(new PolygonBoundary(p));
            bingMap.addBoundary(new PolygonBoundary(p));
          }
          //console.log(bounds.toUrlValue());
        } else if (x["geojson"]["type"] == "LineString" || x["geojson"]["type"] == "Point") {
          googleMap.map.fitBounds(place.geometry.viewport, 0)
          bingMap.fitBounds(googleMap.getBounds())
        }
        if (googleMap.boundaries.length > 0) {
          googleMap.showBoundaries();
          bingMap.showBoundaries();
        }
      }
    });
  }


  // will always synchronize with the Google map,
  // which should in turn be in sych with the Bing map.
  biasSearchBox() {
    this.searchBox.setBounds(this.map.getBounds());
  }

  getBounds() {
    let bounds = this.map.getBounds();
    let ne = bounds.getNorthEast();
    let sw = bounds.getSouthWest();
    return [sw.lng(), ne.lat(), ne.lng(), sw.lat()];
  }

  fitBounds(x1, y1, x2, y2) {
    let bounds = google.maps.LatLngBounds({
      north: y1,
      south: y2,
      east: x2,
      west: x1
    });
    this.map.fitBounds(bounds);
  }

  setCenter(c) {
    this.map.setCenter({ lat: c[1], lng: c[0] });
    //this.map.setZoom(19);
  }

  getZoom() {
    return this.map.getZoom();
  }

  setZoom(z) {
    this.map.setZoom(z);
  }

  makeMapRect(o, listener) {
    const rectangle = new google.maps.Rectangle({
      strokeColor: o.color,
      strokeOpacity: 1.0,
      strokeWeight: 1,
      fillColor: o.fillColor,
      fillOpacity: o.opacity,
      bounds: {
        north: o.y1,
        south: o.y2,
        east: o.x2,
        west: o.x1,
      },
    });
    if (typeof listener !== 'undefined') {
      rectangle.addListener("click", listener);
    }
    return rectangle;
  }

  updateMapRect(o, onoff) {
    let r = o.mapRect;
    r.setMap(onoff ? this.map : null)
  }

  resetBoundaries() {
    for (let b of this.boundaries) {
      b.object.setMap(null);
      b.object = null;
    }
    this.boundaries = [];
  }

  addBoundary(b) {
    // add to active bounds
    b.index = this.boundaries.length;

    // now make GoogleMap objects and link to them
    let points = b.points.map(p => ({ lng: p[0], lat: p[1] }));
    const poly = new google.maps.Polygon({
      paths: points,
      strokeColor: "#0000FF",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#00FF00",
      fillOpacity: 0,
    });
    poly.setMap(googleMap.map);
    b.object = poly;
    b.objectBounds = new google.maps.LatLngBounds();
    for (let p of points) {
      b.objectBounds.extend(p);
    }

    this.boundaries.push(b);


  }

  showBoundaries() {
    // set map bounds to fit union of all active boundaries
    let bounds = new google.maps.LatLngBounds();
    for (let b of this.boundaries) {
      bounds = bounds.union(b.objectBounds);
    }
    this.map.fitBounds(bounds, 0);
  }

  getBoundaryBoundsUrl() {
    // set map bounds to fit union of all active boundaries
    let bounds = new google.maps.LatLngBounds();
    for (let b of this.boundaries) {
      bounds = bounds.union(b.objectBounds);
    }
    return bounds.toUrlValue();
  }

  getBoundariesStr() {
    let result = [];
    for (let b of this.boundaries) {
      result.push(b.toString())
    }
    return "[" + result.join(",") + "]";
  }

}


//
// boundaries: simple, circle, polygon
//

class Boundary {
  constructor(kind) {
    this.kind = kind;
  }

  toString() {
    throw new Error("not implemented");
  }
}

class PolygonBoundary extends Boundary {
  constructor(points) {
    super("polygon");
    this.points = points;
  }

  toString() {
    return '{"kind":"polygon","points":' + JSON.stringify(this.points) + '}';
  }
}

class SimpleBoundary extends PolygonBoundary {
  constructor(bounds) {
    super("simple:" + bounds);
    this.points = [[bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
    [bounds[0], bounds[1]]
    ];
  }
}

class CircleBoundary extends PolygonBoundary {
  constructor(center, radius) {
    super("circle: " + center + ", " + radius + " m");
    // use MSFT stuff to compute the circle
    let locs = Microsoft.Maps.SpatialMath.getRegularPolygon(
      new Microsoft.Maps.Location(center[1], center[0]),
      radius,
      256,
      Microsoft.Maps.SpatialMath.DistanceUnits.Meters);
    this.points = locs.map(l => [l.longitude, l.latitude]);
  }
}



//
// PlaceRects - rectangles on the map (results, tiles, bounding boxes)
//

class PlaceRect {

  constructor(x1, y1, x2, y2, color, fillColor, opacity, classname, listener) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.color = color;
    this.fillColor = fillColor;
    this.opacity = opacity;
    this.classname = classname;
    this.address = "<unknown address>";
    this.map = currentMap
    this.mapRect = this.map.makeMapRect(this, listener);
    this.update();
    this.listener = listener;
  }

  centerInMap() {
    this.map.setCenter([(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2]);
    currentMap.setZoom(19);
  }

  getCenter() {
    return [(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2];
  }

  getCenterUrl() {
    let c = this.getCenter();
    return c[1] + "," + c[0];
  }

  augment(addr) {
    this.addrSpan.innerText = addr;
    this.address = addr;
    //console.log("tower " + i + ": " + addr)
  }

  update(newMap) {
    if (typeof newMap !== 'undefined') {
      this.map.updateMapRect(this, false);
      this.mapRect = newMap.makeMapRect(this, this.listener);
      this.map = newMap;
    }
    this.map.updateMapRect(this, true);
  }
}

let Tile_tiles = [];
class Tile extends PlaceRect {
  static resetAll() {
    for (let i = 0; i < Tile_tiles.length; i++) {
      currentMap.updateMapRect(Tile_tiles[i], false);
    }
    Tile_tiles = [];
  }

  constructor(x1, y1, x2, y2) {
    super(x1, y1, x2, y2, "#0000FF", "#0000FF", 0.0, "tile")

    Tile_tiles.push(this);
  }
}

let Detection_detections = []
let Detection_detectionsAugmented = 0;
let Detection_minConfidence = 0.35;

function Detection_click(det) {
  //console.log("clicked: " + det);
  Detection.showDetection(det.firstDet.id);
}

class Detection extends PlaceRect {
  static resetAll() {
    for (let i = 0; i < Detection_detections.length; i++) {
      Detection_detections[i].select(false);
    }
    Detection_detections = [];
    Detection_detectionsAugmented = 0;
    detectionsList.innerHTML = "";
  }

  constructor(x1, y1, x2, y2, classname, conf) {
    super(x1, y1, x2, y2, "#FF0000", "#FF0000", 0.2, classname, () => {
      Detection_click(this);
    })
    this.conf = conf;
    this.selected = true;
    this.address = "";
    this.maxConf = conf; // minimum confidence across same address towers, only recorded in first
    this.firstDet = null; // first of block of same address towers

    this.id = Detection_detections.length;
    Detection_detections.push(this);
  }

  static sort() {
    Detection_detections.sort((a, b) => {
      if (a.address < b.address) {
        return -1;
      } else if (a.address < b.address) {
        return 1;
      } else {
        return b.conf - a.conf;
      }
    });

    // fix ids
    for (let i = 0; i < Detection_detections.length; i++) {
      let det = Detection_detections[i];
      det.id = i;
    }
  }

  static generateList() {
    let currentAddr = "";
    let firstDet = null;
    let boxes = "<ul>"
    for (let det of Detection_detections) {
      if (det.address !== currentAddr) {
        if (currentAddr !== "") {
          boxes += "</ul></li>";
        }
        boxes += "<li id='addrli" + det.id + "'>";
        boxes += "<span class='caret' onclick='";
        boxes += "this.parentElement.querySelector(\".nested\").classList.toggle(\"active\"),";
        boxes += "this.classList.toggle(\"caret-down\")';"
        boxes += "'></span>";
        boxes += "<input type='checkbox' id='addrcb" + det.id + "' name='addrcb" + det.id;
        boxes + "' value='";
        boxes += det.id + "' checked style='display:inline;vertical-align:-10%;'"
        boxes += " onclick='Detection_detections[" + det.id + "].selectAddr(undefined)'>";
        boxes += "<span class='address' id='addrlabel" + det.id + "' onclick='Detection_detections[" + det.id + "].centerInMap()'>"
        boxes += det.address + "</span><br>";
        boxes += "<ul class='nested' id='towerslist" + det.id;
        boxes += "style='text-indent:-25px; padding-left: 60px;'>";
        currentAddr = det.address;
        firstDet = det;
      }
      boxes += det.generateCheckBox();
      firstDet.maxConf = Math.max(det.conf, firstDet.conf); // record min conf in block header
      det.firstDet = firstDet; // record block header
      det.update();
    }
    boxes += "</li></ul>";
    detectionsList.innerHTML = boxes;
  }

  generateCheckBox() {
    let box = "<li><div style='display:block' id='detdiv" + this.id + "'>";
    box += "<input type='checkbox' id='detcb" + this.id + "' name='detcb" + this.id + "'";
    box += " value='" + this.id + "' checked";
    box += " style='display:inline;vertical-align:-10%;'"
    box += " onclick='Detection_detections[" + this.id + "].select(undefined)'>";
    box += "&nbsp;";
    box += "<span class='address' onclick='Detection_detections[" + this.id + "].centerInMap()'>";
    box += "P(" + this.conf.toFixed(2) + ")</span></li>";
    box += "</div>";

    this.checkBoxId = 'detdiv' + this.id;
    return box;
  }

  select(onoff) {
    if (typeof onoff === 'undefined') {
      onoff = !this.selected;
    }
    this.selected = onoff;
    document.getElementById("detcb" + this.id).checked = onoff;
    this.update();
  }

  selectAddr(onoff) {
    if (typeof onoff === 'undefined') {
      onoff = !this.selected;
    }
    for (let det of Detection_detections) {
      if (det.address === this.address) {
        det.selected = onoff;
        document.getElementById("detcb" + det.id).checked = onoff;
        det.update();
      }
    }
  }

  show(onoff) {
    document.getElementById("detdiv" + this.id).style.display = onoff ? "block" : "none";
  }

  showAddr(onoff) {
    document.getElementById("addrli" + this.id).style.display = onoff ? "block" : "none";
  }

  static showDetection(id) {
    if (currentAddrElement != null) {
      currentAddrElement.style.fontWeight = "normal";
      currentAddrElement.style.textDecoration = "";
    }
    let element = document.getElementById('addrlabel' + id);
    element.scrollIntoView();
    element.style.fontWeight = "bolder";
    element.style.textDecoration = "underline";

    currentAddrElement = element;

    Detection_detections[id].centerInMap();
  }

  augment(addr) {
    // this.addrSpan.innerText = addr;
    this.address = addr;
    Detection_detectionsAugmented++;
    //console.log("tower " + i + ": " + addr)
  }

  update(newMap) {
    // first, process any map UI change
    super.update(newMap)

    // then update by confidence
    this.map.updateMapRect(this, this.selected && this.conf >= Detection_minConfidence);
  }
}


function createElementFromHTML(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
}

// retrieve satellite image and detect objects
function getObjects() {
  //let center = currentMap.getCenterUrl();
  let engine = $('input[name=model]:checked', '#engines').val()
  let provider = $('input[name=provider]:checked', '#providers').val()
  provider = provider.substring(0, provider.length - 9);
  // let boundaries = googleMap.getBoundariesStr();
  // if (boundaries === "[]" && radius == "") {
  //   console.log("No boundary selected, instead using viewport: " + googleMap.getBounds())
  //   googleMap.addBoundary(new SimpleBoundary(googleMap.getBounds()));
  //   bingMap.addBoundary(new SimpleBoundary(googleMap.getBounds()));
  // }


  // now get the boundaries ready to ship
  let bounds = currentMap.getBoundsUrl();
  let boundaries = googleMap.getBoundariesStr();
  let kinds = ["None", "Polygon", "Multiple polygons"]
  console.log("Detection request: Boundary type: "
    + kinds[googleMap.boundaries.length % kinds.length]
    + ", Engine: " + engines[engine]);
  //console.log("request boundaries:" + boundaries);

  // erase the previous set of towers and tiles
  Detection.resetAll();
  Tile.resetAll();

  // first, play the request, but get an estimate of the number of tiles
  xhr = $.post({
    url: "/getobjects",
    data: {
      bounds: bounds,
      //center: center,
      engine: engine,
      provider: provider,
      polygons: boundaries,
      estimate: "yes"
    },
    success: function (result) {
      if (Number(result) === -1) {
        fatalError("Tile limit for this session exceeded. Please close browser to continue.")
        return;
      }
      console.log("Number of tiles: " + result)
      // let nt = estimateNumTiles(currentMap.getZoom());
      // console.log("  Estimated tiles:" + nt);
      let nt = Number(result);
      enableProgress(nt);
      setProgress(0);
      startTime = performance.now();

      // now, the actual request

      Detection.resetAll();
      xhr = $.post({
        url: "/getobjects",
        data: {
          bounds: bounds,
          //center: center,
          engine: engine,
          provider: provider,
          polygons: boundaries,
        },
        success: function (result) {
          result = JSON.parse(result);
          conf = Number(document.getElementById("conf").value);
          if (result.length === 0) {
            console.log(":::::: Area too big. Please " + (radius !== "" ? "enter a smaller radius." : "zoom in."));
            disableProgress(0, 0);
            return;
          }
          // sort objects by confidence
          result.sort((a, b) => b['conf'] - a['conf']);
          for (let i = 0; i < result.length; i++) {
            let r = result[i];
            //console.log(" " + JSON.stringify(result[i]));
            if (r['class'] === 0) {
              let det = new Detection(r['x1'], r['y1'], r['x2'], r['y2'], r['class_name'], r['conf']);
            } else if (r['class'] === 1) {
              let tile = new Tile(r['x1'], r['y1'], r['x2'], r['y2']);
            }
          }
          console.log("" + Detection_detections.length + " detections.")
          disableProgress((performance.now() - startTime) / 1000, Tile_tiles.length);
          augmentDetections(provider);
          if (boundaries != "[]") {
            googleMap.showBoundaries();
            bingMap.showBoundaries();
          }
        }
      });
    }
  });
}



function cancelRequest() {
  xhr.abort();
  disableProgress(0, 0);
  fetch('/abort', { method: "GET" })
  .then(response => {
    response.text();
  })
  .then(response => {
    console.log("aborted.");
  })
  .catch(error =>{
    console.log("abort error: "+error);
  });
}

function circleBoundary() {
  // radius? construct a circle
  let radius = document.getElementById("radius").value;
  if (radius !== "") {
    googleMap.resetBoundaries();
    bingMap.resetBoundaries();
    // convert to m
    radius = Number(radius) * 1000;

    // make circle
    let centerCoordsG = googleMap.getCenter();
    let centerCoordsB = googleMap.getCenter();

    googleMap.addBoundary(new CircleBoundary(centerCoordsG, radius));
    bingMap.addBoundary(new CircleBoundary(centerCoordsB, radius));

    googleMap.showBoundaries();
    bingMap.showBoundaries();
  }
}


function parseLatLngArray(a) {
  result = [];
  for (let i = 0; i < a.length; i++) {
    result.push({ lat: a[i][1], lng: a[i][0] });
  }
  return result;
}

function polyBounds(p) {
  bounds = new google.maps.LatLngBounds();

  for (let i = 1; i < p.length; i++) {
    bounds.extend(p[i]);
  }
  return bounds;
}

function fillEngines() {
  $.ajax({
    url: "/getengines",
    success: function (result) {
      let html = "";
      //console.log(result);
      let es = JSON.parse(result);
      engines = {};
      //console.log(engines);
      for (let i = 0; i < es.length; i++) {
        html += "<input type='radio' id='" + es[i]['id']
        html += "' name='model' value='" + es[i]['id'] + "'"
        html += i == 0 ? " checked>" : ">"
        html += "<label for='" + es[i]['id'] + "'>" + es[i]['name'] + "</label><br>";
        engines[es[i]['id']] = es[i]['name'];
      }
      $("#engines").html(html);
    }
  });
}

function fillProviders() {
  // retrieve the backend providers
  $.ajax({
    url: "/getproviders",
    success: function (result) {
      let html = "";
      //console.log(result);
      let ps = JSON.parse(result);
      providers = {};
      //console.log(engines);
      for (let i = 0; i < ps.length; i++) {
        html += "<input type='radio' id='" + ps[i]['id']
        html += "_provider' name='provider' value='" + ps[i]['id'] + "_provider'"
        html += i == 0 ? " checked>" : ">"
        html += "<label for='" + ps[i]['id'] + "_provider'>" + ps[i]['name'] + "</label><br>";
        providers[ps[i]['id']] = ps[i]['name'];
      }
      $("#providers").html(html);

      // add change listeners for the backend provider radio box
      let rad = document.providers.provider;
      currentProvider = rad[0];

      for (let i = 0; i < rad.length; i++) {
        rad[i].addEventListener('change', function () {
          // no action right now
        });
      }

      // and one for the file input box
      let fileBox = document.getElementById("upload_file");
      fileBox.addEventListener('change', () => {
        uploadImage();
      });

      // and one for the model upload box
      let modelBox = document.getElementById("upload_model");
      modelBox.addEventListener('change', () => {
        uploadModel();
      });

    }
  });

  // also add change listeners for the UI providers
  // add change listeners
  var rad = document.uis.uis;
  currentUI = rad[0];
  setMap(currentUI);

  for (var i = 0; i < rad.length; i++) {
    rad[i].addEventListener('change', function () {
      setMap(this);
    });
  }
}

function setMap(newMap) {
  if (currentUI !== null) {
    document.getElementById(currentUI.value + "Map").style.display = "none";
  }
  currentUI = newMap;
  handle = document.getElementById(currentUI.value + "Map");
  handle.style.display = "block";
  handle.style.width = "100%";
  handle.style.height = "100%";

  let lastMap = currentMap;
  let zoom;
  let center;
  if (typeof lastMap !== 'undefined') {
    zoom = currentMap.getZoom();
    center = currentMap.getCenter();
  }

  if (currentUI.value === "upload") {
    document.getElementById("uploadsearchui").style.display = "block";
    document.getElementById("mapsearchui").style.display = "none";
    document.getElementById("fdetect").style.display = "none";
    document.getElementById("ftowers").style.display = "none";
    document.getElementById("fsave").style.display = "none";
  } else if (currentUI.value === "google") {
    document.getElementById("uploadsearchui").style.display = "none";
    document.getElementById("mapsearchui").style.display = "block";
    document.getElementById("fdetect").style.display = "block";
    document.getElementById("ftowers").style.display = "block";
    document.getElementById("fsave").style.display = "block";
    currentMap = googleMap;
  } else if (currentUI.value === "bing") {
    document.getElementById("uploadsearchui").style.display = "none";
    document.getElementById("mapsearchui").style.display = "block";
    document.getElementById("fdetect").style.display = "block";
    document.getElementById("ftowers").style.display = "block";
    document.getElementById("fsave").style.display = "block";
    currentMap = bingMap;
    // recreate boundaries for bing
    let bs = bingMap.boundaries;
    bingMap.resetBoundaries();
    bs.map(b => bingMap.addBoundary(b));
  }

  // set center and zoom

  if (typeof lastMap !== 'undefined') {
    if (currentMap.boundaries.length > 0) {
      currentMap.showBoundaries();
    }
    currentMap.setZoom(zoom);
    currentMap.setCenter(center);
  }

  // move all rectangles over to the new map
  Tile_tiles.forEach(t => t.update(currentMap));
  Detection_detections.forEach(d => d.update(currentMap))
}

function adjustConfidence() {
  Detection_minConfidence = confSlider.value / 100;
  for (let det of Detection_detections) {
    det.firstDet.showAddr(det.firstDet.maxConf >= Detection_minConfidence)
    det.show(det.conf >= Detection_minConfidence)
    det.update();
  }
  document.getElementById('confpercent').innerText = confSlider.value;
}

function augmentDetections(provider) {
  Detection_detectionsAugmented = 0;
  for (let i = 0; i < Detection_detections.length; i++) {
    let det = Detection_detections[i]
    let loc = det.getCenterUrl();
    $.ajax({
      url: "https://maps.googleapis.com/maps/api/geocode/json",
      data: {
        latlng: loc,
        key: gak,
        location_type: "ROOFTOP",
        result_type: "street_address",
      },
      success: function (result) {
        let addr = "";
        if (result['status'] === "OK") {
          addr = result['results'][0]['formatted_address'];
          det.augment(addr);
          afterAugment();
        } else {
          addr = "(unable to determine address)";
          // console.log("Cannot parse address result for tower "+i+": "+JSON.stringify(result));
          // call Bing maps api instead at:
          $.ajax({
            url: "http://dev.virtualearth.net/REST/v1/locationrecog/" + loc,
            data: {
              key: bak,
              includeEntityTypes: "address",
              output: "json",
            },
            success: function (result) {
              let addr = result['resourceSets'][0]['resources'][0]['addressOfLocation'][0]['formattedAddress'];
              det.augment(addr);
              afterAugment();
            }
          });
        }
        //det.augment(addr);
      }
    });

  }
}

function afterAugment() {
  // wait for the last one
  if (Detection_detectionsAugmented !== Detection_detections.length) {
    return;
  }

  Detection.sort();
  Detection.generateList();

  // now hide low confidence values, sort the list and do the rest
  adjustConfidence();
}




function rad(x) {
  return x * Math.PI / 180;
};

// returns the Haversine distance between two points, in meters
function getDistance(p1, p2) {
  var R = 6378137; // Earth’s mean radius in meters
  var dLat = rad(p2[1] - p1[1]);
  var dLong = rad(p2[0] - p1[0]);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(p1[1])) * Math.cos(rad(p2[1])) *
    Math.sin(dLong / 2) * Math.sin(dLong / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c;
  return d;
};


function download(filename, data) {
  // create blob object with our data
  let blob = new Blob([data], { type: 'text/csv' });

  // create a temp anchor element
  let elem = window.document.createElement('a');

  // direct it to the blob and filename
  elem.href = window.URL.createObjectURL(blob);
  elem.download = filename;

  // briefly insert it into the document, click it, remove it
  document.body.appendChild(elem);
  elem.click();
  document.body.removeChild(elem);
}

function download_csv() {
  text = "id,selected,meets threshold,latitude (deg),longitude (deg),distance from center (m),address,confidence\n";
  for (let i = 0; i < Detection_detections.length; i++) {
    let det = Detection_detections[i];
    text += [
      i,
      det['selected'],
      det['conf'] >= confSlider.value / 100,
      det.getCenter()[1].toFixed(8),
      det.getCenter()[0].toFixed(8),
      getDistance(det.getCenter(), currentMap.getCenter()).toFixed(1),
      ("\"" + det['address'] + "\""),
      det['conf'].toFixed(2)
    ].join(",") + "\n";
  }
  download("detections.csv", text);
}

function download_kml() {
  text = '<?xml version="1.0" encoding="UTF-8"?>\n';
  text += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  text += "  <Document>\n";
  text += "<Style id='icon-1736-0F9D58-normal'><IconStyle><color>ff589d0f</color><scale>1</scale>";
  text += "<Icon><href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>\n";

  text += "<Style id='icon-1736-0F9D58-highlight'><IconStyle><color>ff589d0f</color><scale>1</scale>";
  text += "<Icon><href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>1</scale></LabelStyle></Style>\n";

  text += "<StyleMap id='icon-1736-0F9D58'><Pair><key>normal</key><styleUrl>";
  text += "#icon-1736-0F9D58-normal</styleUrl></Pair><Pair><key>highlight</key>";
  text += "<styleUrl>#icon-1736-0F9D58-highlight</styleUrl></Pair></StyleMap>";

  text += "<Style id='icon-1736-0F9D58-normal'><IconStyle><color>ff589d0f</color><scale>1</scale>";
  text += "<Icon><href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>0</scale></LabelStyle>";
  text += "<BalloonStyle><text><![CDATA[<h3>$[name]</h3>]]></text></BalloonStyle></Style>\n";

  text += "<Style id='icon-1736-0F9D58-highlight'><IconStyle><color>ff589d0f</color><scale>1</scale>";
  text += "<Icon><href>https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>1</scale></LabelStyle>";
  text += "<BalloonStyle><text><![CDATA[<h3>$[name]</h3>]]></text></BalloonStyle></Style>\n";

  text += "<StyleMap id='icon-1736-0F9D58-nodesc'><Pair><key>normal</key><styleUrl>";
  text += "#icon-1736-0F9D58-nodesc-normal</styleUrl></Pair><Pair><key>highlight</key>";
  text += "<styleUrl>#icon-1736-0F9D58-nodesc-highlight</styleUrl></Pair></StyleMap>";

  for (let det of Detection_detections) {
    if (det.conf >= Detection_minConfidence && det.selected) {
      text += "    <Placemark>\n";
      //text += '      <name>' + det.address + '</name>\n';
      text += '      <description>P(' + det.conf.toFixed(2);
      text += ') at ' + det.address + '</description>\n';
      text += "      <styleUrl>#icon-1736-0F9D58</styleUrl>"
      text += '      <Point>\n';
      text += '        <altitudeMode>relativeToGround</altitudeMode>\n';
      text += '        <extrude>1</extrude>\n'
      text += '        <coordinates>' + det.getCenter()[0] + ',' + det.getCenter()[1] + ',300</coordinates>\n'
      text += '      </Point>\n';
      text += "    </Placemark>\n";
    }
  }
  text += "  </Document>\n";
  text += '</kml>\n';
  download("detections.kml", text);
}

//
// model upload functionality
// 

function uploadModel() {
  let model = document.getElementById("upload_model").files[0];
  let formData = new FormData();

  Detection.resetAll();
  console.log("Model upload request in progress ...")

  formData.append("model", model);
  fetch('/uploadmodel', { method: "POST", body: formData })
    .then(response => {
      console.log("installed model " + model);
      fillEngines();
    })
    .catch(error => {
      console.log(error);
    });
}


//
// file upload functionality
//

function uploadImage() {
  let image = document.getElementById("upload_file").files[0];
  let engine = $('input[name=model]:checked', '#engines').val()
  let formData = new FormData();

  Detection.resetAll();
  console.log("Custome image detection request in progress ...")

  formData.append("image", image);
  formData.append("engine", engine)
  fetch('/getobjectscustom', { method: "POST", body: formData })
    .then(response => response.json())
    .then(response => {
      response = response[0];
      console.log(response.length + " object" + (response.length == 1 ? "" : "s") + " detected");
      console.log("loading file " + image.name);
      drawCustomImage("/uploads/" + image.name);
    })
    .catch(error => {
      console.log(error);
    });
}

function drawCustomImage(url) {
  let img = document.getElementById('canvas');
  img.src = url;
}

//
// estimate number of tiles
//

function estimateNumTiles(zoom, bounds) {
  // cop-out: do it from zoom, does not take window size into account
  let num = Math.pow(2, (19 - zoom) * 2 + 1);
  return Math.ceil(num);
}

//
// progress bar
//

let progressTimer = null;
let totalSecsEstimated = 0;
let secsElapsed = 0;
let numTiles = 0;
let secsPerTile = 0;
let dataPoints = 0;

function enableProgress(tiles) {
  document.getElementById("progress_div").style.display = "flex";

  progressTimer = setInterval(progressFunction, 100);
  if (dataPoints === 0) {
    secsPerTile = 0.15;
  }
  numTiles = tiles;
  totalSecsEstimated = secsPerTile * numTiles;
  secsElapsed = 0;
}
function fatalError(msg) {
  document.getElementById("fatal_div").style.display = "flex";
  document.getElementById("fatal_div").innerHTML = "<center>" + msg + "</center>";
}

function disableProgress(time, actualTiles) {
  document.getElementById("progress_div").style.display = "none";

  clearInterval(progressTimer);
  if (time !== 0) {
    let secsPerTileLast = time / actualTiles;
    secsPerTile = (secsPerTile * dataPoints + secsPerTileLast) / (dataPoints + 1);
    dataPoints++;
  }
}
function progressFunction() {
  secsElapsed += 0.1;
  setProgress(secsElapsed / totalSecsEstimated * 100);
}

function setProgress(val) {
  document.getElementById("progress").value = String(val);
}


// debug helper: rerouting console.log into the window

class myConsole {
  constructor() {
    this.textArea = document.getElementById("output");
    console.log("output area: " + this.textArea);

  }

  print(text) {
    this.textArea.innerText += text;
  }

  newLine() {
    this.textArea.innerHTML += "<br>";
    this.textArea.scrollTop = 99999;
  }

  log(text) {
    this.print(text);
    this.newLine();
  }
}

//
// initial position
//

function setMyLocation() {
  if (location.protocol === 'https:' && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition);
  } else {
    googleMap.setCenter(nyc);
  }
}

function showPosition(position) {
  googleMap.setCenter([position.coords.longitude, position.coords.latitude]);
}


//
// zipcode lookup
//

function getZipcodePolygon(zipcode) {
  fetch('/getzipcode?zipcode=' + zipcode, { method: "GET" })
    .then(response => response.json())
    .then(response => {
      let polygons = parseZipcodeResult(response);
      if (polygons !== []) {
        currentMap.resetBoundaries();
        for (let polygon of polygons) {
          currentMap.addBoundary(new PolygonBoundary(polygon));
        }
        currentMap.showBoundaries();
      }
    })
    .catch(error => {
      console.log(error);
    });
}

function parseZipcodeResult(result) {
  if (result['type'] !== 'FeatureCollection') {
    return [];
  }

  let features = result['features'];
  let f = features[0];
  let coords = f['geometry']['coordinates'];
  return coords;
}

// init actions
console = new myConsole();
fillEngines();
fillProviders();
// dynamically adjust confidence of visible predictions
confSlider.oninput = adjustConfidence;



console.log("TowerScout initialized.");

