require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/widgets/Search",
  "esri/geometry/geometryEngine",
  'esri/Graphic',
  'esri/layers/GraphicsLayer',
  "esri/widgets/Search/SearchViewModel",
  "esri/PopupTemplate",
  "esri/widgets/Legend",
  "esri/renderers/UniqueValueRenderer",
  "esri/widgets/Expand",
], (
  esriConfig,
  Map, 
  MapView,
  FeatureLayer,
  Search,
  geometryEngine,
  Graphic,
  GraphicsLayer,
  SearchVM,
  PopupTemplate,
  Legend,
  UniqueValueRenderer,
  Expand,
) => {
  setUpMap();


  // Set up map, map view and add necessary feature layers
  function setUpMap() {

    // Set up map and view
    const map = new Map({
      basemap: 'gray-vector'
    });

    function returnScale(){
      const width = window.screen.width;
      const height = window.screen.height;
      const resolution = height * width;
      if (resolution > 700000) {
        return 900000 + (1000000 - resolution/2) * 0.75;
      } else {
        return 900000 + (1000000 - resolution/2);
      }
    }

    const view = new MapView({
      map: map,
      center: [-118.215, 34.225], // Longitude, latitude
      scale: returnScale(),
      constraints: {
        snapToZoom: false,
        rotationEnabled: false,
        minZoom: 8, // Maximum zoom "out"
      },
      container:'viewDiv'
    });

    // Define layer for oil wells 
    const symbolSize = 7;
    const oilWellRenderer = {
      type: 'unique-value',
      field: 'WellStatus',
      defaultSymbol: {
        type: "simple-marker",
        size: symbolSize,
      },
      uniqueValueInfos: [{
        value: 'New',
        symbol: {
          type: 'simple-marker',
          size: symbolSize,
          color: [255, 0, 0, 0.65],
          outline: {
            width:0
          }
        }
      },{
        value: 'Active',
        symbol: {
          type: 'simple-marker',
          size: symbolSize,
          color: [0, 255, 0, 0.65],
          outline: {
            width:0
          }
        }
      },{
        value: 'Idle',
        symbol: {
          type: 'simple-marker',
          size: symbolSize,
          color: [255, 255, 0, 0.65],
          outline: {
            width:0
          }
        }
      },{
        value: 'Plugged',
        symbol: {
          type: 'simple-marker',
          size: symbolSize,
          color: [200, 200, 200, 0.25],
          outline: {
            width:0
          }
        }
      }]
    }

    // Add layer and add to map
    const oilWellsLayer = new FeatureLayer({
      url: 'https://gis.conservation.ca.gov/server/rest/services/WellSTAR/Wells/MapServer/0',
      legendEnabled: true,
      renderer: oilWellRenderer,
      maxScale:0,
      minScale:0,
    });
    map.add(oilWellsLayer);
    const bufferLayer = new GraphicsLayer();
    map.add(bufferLayer);

    // Add components to view UI
    const searchWidget = new Search({
      view:view,
      resultGraphicEnabled: true,
      popupEnabled: true,
    });
    const legend = new Legend({
      view: view,
      layerInfos: [{
        layer: oilWellsLayer,
        title: "Legend"
      }]
    });
    const legendExpand = new Expand({
      expandIconClass: "esri-icon-layer-list",  // see https://developers.arcgis.com/javascript/latest/guide/esri-icon-font/
      // expandTooltip: "Expand LayerList", // optional, defaults to "Expand" for English locale
      view: view,
      content: legend
    });
    view.ui.add(searchWidget,{
      position: "top-left",
      index: 2,
    });
    view.ui.move('zoom', 'top-right');
    view.ui.add('results', 'bottom-left');
    if (window.screen.height < 1024 || window.screen.width < 1024) {
      view.ui.add(legendExpand, 'bottom-right');
    } else {
      view.ui.add(legend, 'bottom-right');
    }


    // Define functions 

    // Spatially query well feature layer with buffer polygon set as input query geometry
    function queryWells(polygon){
      const query = {
        geometry: polygon,
        spatialRelationship: 'contains',
        outFields: ['WellStatus'],
      }
      oilWellsLayer.queryFeatures(query).then((results) => {
        const features = results.features;
        displayWellCounts(features);
      });
    }

    // Calculates count of well types in buffer polygon
    function displayWellCounts(results){
      document.getElementById('results').style.opacity=1;
      const countNewWells = ` ${results.filter(r => r.attributes['WellStatus']==='New').length}`;
      const countPluggedWells = ` ${results.filter(r => r.attributes['WellStatus']==='Plugged').length}`;
      const countIdleWells = ` ${results.filter(r => r.attributes['WellStatus']==='Idle').length}`;
      const countActiveWells = ` ${results.filter(r => r.attributes['WellStatus']==='Active').length}`;
      document.getElementById('newWells').innerHTML = countNewWells;
      document.getElementById('activeWells').innerHTML = countActiveWells;
      document.getElementById('idleWells').innerHTML = countIdleWells;
      document.getElementById('pluggedWells').innerHTML = countPluggedWells;
    }

    // Event handler for search widget
    searchWidget.viewModel.on('search-complete', function(event){

      // Remove buffer polygon before other polygons are added
      bufferLayer.graphics.removeAll();

      // Add search result address to results div
      document.getElementById('location').innerHTML = event.results[0].results[0].feature.attributes.Match_addr;

      // Get search geometry and create buffer
      const searchGeometry = event.results[0].results[0].feature.geometry;
      const buffer = geometryEngine.geodesicBuffer(searchGeometry, 1, 'miles');

      // Override default search widget zoom to result
      const goToOptions = {
        animate: true,
        duration: 550,
        ease: 'ease'
      }
      searchWidget.goToOverride = view.goTo(buffer.extent.expand(2), goToOptions);

      // Create buffer graphic polygon and add to bufferLayer
      const bufferGraphic = new Graphic({
        geometry: buffer,
        symbol: {
          type: "simple-fill",
          color: [126, 203, 198, 0.2],
          outline: {
            // autocasts as new SimpleLineSymbol()
            color: [126, 203, 198, 1],
            width: 0, // points
          }
        },
      });
      bufferLayer.add(bufferGraphic);
      
      // Query wells 
      queryWells(buffer);

    });
  }
});