require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/widgets/Search",
  "esri/geometry/geometryEngine",
  'esri/Graphic',
  'esri/layers/GraphicsLayer',
  "esri/widgets/Legend",
  "esri/widgets/Expand",
  "esri/widgets/Slider",
], (
  Map, 
  MapView,
  FeatureLayer,
  Search,
  geometryEngine,
  Graphic,
  GraphicsLayer,
  Legend,
  Expand,
  Slider,
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

    // Add Search widget
    const searchWidget = new Search({
      view:view,
      resultGraphicEnabled: true,
      popupEnabled: true,
    });
    
    // Add Legend widget
    const legend = new Legend({
      view: view,
      layerInfos: [{
        layer: oilWellsLayer,
        title: "Legend"
      }]
    });

    // Add Expand option for legend when screen is small enough
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

    // Add Slider widget
    const slider = new Slider({
      container: 'slider',
      min: 1,
      max: 50,
      values: [1], // The default value of the slider
      precision: 2,
      rangeLabelsVisible: true
    })

    // Change format if using on small screen
    if (window.screen.height < 1024 || window.screen.width < 1024) {
      view.ui.add(legendExpand, 'bottom-right');
    } else {
      view.ui.add(legend, 'bottom-right');
    }



    /* DEFINE FUNCTIONS */

    // Spatially query well feature layer with buffer polygon set as input query geometry
    function queryWells(polygon) {
      // Construct query object for query statistics
      const statsQuery = {
        groupByFieldsForStatistics: ['WellStatus'],
        outStatistics: [{
          onStatisticField: "wellStatus",
          outStatisticFieldName: "wellCount",
          statisticType: "count"
        }],
        where: "[*]",
        geometry: polygon,
        spatialRelationship: 'contains'
      }
      // Query the oils well layer with stats query
      oilWellsLayer.queryFeatures(statsQuery).then((results)=> {
        // Create well stats object based on results
        var wellStats = {'Total':0};
        results.features.forEach(stat => {
          wellStats[stat.attributes.WellStatus] = stat.attributes.wellCount;
          wellStats['Total'] += stat.attributes.wellCount;
        });
        // Populate DOM with results from query
        displayWellCounts(wellStats);
      });
    }

    // Calculates count of well types in buffer polygon
    function displayWellCounts(stats){
      document.getElementById('results').style.opacity=1;
      //const totalWells = `${results.length}`;
      function returnCount(wellType) {
        return (wellType in stats) ? stats[wellType] : 0;
      }
      document.getElementById('totalWells').innerHTML = stats['Total'];
      document.getElementById('newWells').innerHTML = returnCount('New');
      document.getElementById('activeWells').innerHTML = returnCount('Active');
      document.getElementById('idleWells').innerHTML = returnCount('Idle');
      document.getElementById('pluggedWells').innerHTML = returnCount('Plugged');
    }


    let searchGeometry;

    // Event handler for search widget
    searchWidget.viewModel.on('search-complete', (event) => {
      // Remove buffer polygon before other polygons are added
      bufferLayer.graphics.removeAll();
      // Add search result address to results div
      document.getElementById('location').innerHTML = event.results[0].results[0].feature.attributes.Match_addr;

      // Get search geometry and create buffer
      searchGeometry = event.results[0].results[0].feature.geometry;
      const buffer = geometryEngine.geodesicBuffer(searchGeometry, 1, 'miles');

      // Override default search widget zoom to result
      const goToOptions = {
        animate: true,
        duration: 550,
        ease: 'ease'
      }
      searchWidget.goToOverride = view.goTo(buffer.extent.expand(2.5).offset(0,-1000), goToOptions);

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

    // Event handler for slider
    slider.on("thumb-drag", (e)=> {
      document.getElementById('bufferRadius').innerHTML = e.value;
      // Create new buffer geometry based on slider value
      const newBufferGeometry = geometryEngine.geodesicBuffer(searchGeometry, e.value, 'miles');
      // Update buffer graphic with new radius
      bufferLayer.graphics.getItemAt(0).geometry = newBufferGeometry;
      // Change view extent to fit buffer geometry with goTo
      view.goTo(newBufferGeometry.extent.expand(2.5).offset(0,-1500));
      // Query features using new buffer geometry
      queryWells(newBufferGeometry);
    })
  }
});