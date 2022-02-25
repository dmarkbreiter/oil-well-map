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
  "esri/tasks/Locator",
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
  Locator,

) => {
  setUpMap();


  // Set up map, map view and add necessary feature layers
  function setUpMap() {

    var oilWellsViewLayer, highlight, searchGeometry;

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
      center: [-118.25, 33.98], // Longitude, latitude
      scale: returnScale(),
      constraints: {
        snapToZoom: false,
        rotationEnabled: false,
        geometry: {
          type: "extent",
          xmin: -121.5,
          ymin:  32.7,
          xmax: -114.7,
          ymax:  41.0
        },
        minZoom: 7, // Maximum zoom "out"
      },
      container:'viewDiv'
    });

    // Define layer for oil wells 
    const symbolSize = 7;
    const oilWellRenderer = {
      type: 'unique-value',
      valueExpression: `When($feature.WellStatus == 'Idle', 'Idle',$feature.WellStatus == 'New' || $feature.WellStatus == 'Active', 'Active', $feature.WellStatus == 'Plugged', 'Plugged', null)`,
      //field: 'WellStatus',
      defaultSymbol: null,
      uniqueValueInfos: [{
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
          color: [244, 244, 0, 0.85],
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
    };

    view.popup.dockOptions =  {
      position:"top-right",
    };

    const popup = {
      title: "API: {API}",
      "content": `<b>Well Status:</b> {WellStatus}<br><b>Drilling Start Date:</b> {SpudDate}<br><b>Operator Name:</b> {OperatorName}`,
    }

    // Add layer and add to map
    const oilWellsLayer = new FeatureLayer({
      url: 'https://gis.conservation.ca.gov/server/rest/services/WellSTAR/Wells/MapServer/0',
      legendEnabled: true,
      renderer: oilWellRenderer,
      maxScale:0,
      minScale:0,
      popupTemplate: popup,
      definitionExpression: `WellStatus IN ('Active', 'New', 'Plugged', 'Idle')`,
      outFields: ["API", "WellStatus", "OperatorName", "SpudDate"],
    });

    oilWellsLayer.orderBy = [{
      valueExpression: `When($feature.WellStatus == 'Idle', 1, $feature.WellStatus == 'New' || $feature.WellStatus == 'Active', 0, $feature.WellStatus == 'Plugged', 2, 3)`,
      //order: "ascending"
    }];

    oilWellsLayer.when(function() {

      // get a reference the csvlayerview when it is ready. It will used to do
      // client side queries when user draws polygon to select features
      view.whenLayerView(oilWellsLayer).then(function(layerView) {
        oilWellsViewLayer = layerView;
      });
    })

    map.add(oilWellsLayer);

    const bufferLayer = new GraphicsLayer();
    map.add(bufferLayer);

    // Add Search widget
    const searchWidget = new Search({
      includeDefaultSources: false,
      view:view,
      sources: [
        {
          locator: new Locator({
            url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
          }),
          placeholder: "Search",
          outFields: ['Match_addr', 'Addr_type'],
          singleLineFieldName: "SingleLine", // Required for search to return results for impartial search terms
          name: "ArcGIS World Geocoding Service",
          filter: {
            geometry: view.constraints.geometry,
          },

        },
      ],
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
      content: legend,
      autoCollapse: false,
      mode:'floating'
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
      min: 0.1,
      max: 10,
      values: [1], // The default value of the slider
      precision: 1,
      rangeLabelsVisible: true,
      visibleElements: {
        rangeLabels: true,
        labels: true
      }
    })

    // Change format if using on small screen
    if (window.screen.height < 1024 || window.screen.width < 1024) {
      view.ui.add(legendExpand, 'bottom-right');
    } else {
      view.ui.add(legend, 'bottom-right');
    }



    /* DEFINE FUNCTIONS */

    // Highlight features that intersect with buffer
    function highlightWells(geometry) {
      if (highlight) {
        highlight.remove();
      }
      const query = {
        geometry: geometry
      };
      oilWellsViewLayer.queryFeatures(query).then((results) => {
        highlight = oilWellsViewLayer.highlight(results.features);
      });


    }

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
        outFields: ["*"]
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
      highlightWells(polygon);
    }

    // Calculates count of well types in buffer polygon
    function displayWellCounts(stats){
      if (view.width < 750) {
        const legendWidget = document.getElementsByClassName('esri-legend')[0]
        legendWidget.style.display = 'none';
      }
      results.style.display = 'block';
      //const totalWells = `${results.length}`;
      function returnCount(wellType) {
        return (wellType in stats) ? stats[wellType] : 0;
      }
      document.getElementById('totalWells').innerHTML = stats['Total'].toLocaleString();
      //document.getElementById('newWells').innerHTML = returnCount('New');
      document.getElementById('activeWells').innerHTML = returnCount('Active') + returnCount('New');
      document.getElementById('idleWells').innerHTML = returnCount('Idle');
      document.getElementById('pluggedWells').innerHTML = returnCount('Plugged');
    }

      // Override default search widget zoom to result
      var goToOptions = {
        animate: true,
        duration: 550,
        ease: 'ease'
      }

    // Event handler for search widget
    searchWidget.viewModel.on('search-complete', (event) => {
      // Remove buffer polygon before other polygons are added
      bufferLayer.graphics.removeAll();
      // Get address
      const address = event.results[0].results[0].name
      // Add search result address to results div
      document.getElementById('location').innerHTML = address.split(',')[0];

      // Get search geometry and create buffer
      searchGeometry = event.results[0].results[0].feature.geometry;
      const buffer = geometryEngine.geodesicBuffer(searchGeometry, 1, 'miles');
      //oilWellsLayer.highlight(buffer);

      searchWidget.goToOverride = view.goTo(buffer.extent.expand(2.5).offset(0,-2000), goToOptions);

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
      //console.log(e.state);
      document.getElementById('bufferRadius').innerHTML = (e.value == 1) ? '1 mile' : `${e.value} miles`;
      // Create new buffer geometry based on slider value
      const newBufferGeometry = geometryEngine.geodesicBuffer(searchGeometry, e.value, 'miles');
      // Update buffer graphic with new radius
      bufferLayer.graphics.getItemAt(0).geometry = newBufferGeometry;
      // Change view extent to fit buffer geometry with 'goTo'
      const offsetFactor = e.value * -2500 
      view.goTo(newBufferGeometry.extent.expand(2.5).offset(0, offsetFactor));
      // Query features using new buffer geometry
      if (e.state === 'stop') {
        queryWells(newBufferGeometry);
      }

    });

    // Event handler for close button
    const closeButton = document.getElementsByClassName('close-button')[0];
    closeButton.addEventListener('click', () => {
      bufferLayer.graphics.removeAll();
      const center = {
        center: [-118.25, 33.98],
        scale: returnScale(),
      }
      //view.goTo(center, goToOptions);
      highlight.remove();
      results.style.display = 'none';
      const legendWidget = document.getElementsByClassName('esri-legend')[0]
      legendWidget.style.display = 'block';
    });

  }
});