                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    var GolestanProvince = Golestan;
var GolestanProvince_feature = ee.Feature(GolestanProvince, {label: 'Golesten'}
);

Map.addLayer(GolestanProvince, {},  "Golestan"); 

// /////////////////////////////// FUNCTIONS ////////////////////////////
var getQABits = function(image, start, end, newName) {
    // Compute the bits we need to extract.
    var pattern = 0;
    for (var i = start; i <= end; i++) {
      pattern += Math.pow(2, i);
    }
    // Return a single band image of the extracted QA bits, giving the band
    // a new name.
    return image.select([0], [newName])
                  .bitwiseAnd(pattern)
                  .rightShift(start);
};

// A function to mask out cloudy pixels.
var cloud_shadows = function(image) {
  // Select the QA band.
  var QA = image.select(['QA_PIXEL']);
  // Get the internal_cloud_algorithm_flag bit.
  return getQABits(QA, 3,3, 'cloud_shadows').eq(0);
  // Return an image masking out cloudy areas.
};

// A function to mask out cloudy pixels.
var clouds = function(image) {
  // Select the QA band.
  var QA = image.select(['QA_PIXEL']);
  // Get the internal_cloud_algorithm_flag bit.
  return getQABits(QA, 5,5, 'cloud').eq(0);
  // Return an image masking out cloudy areas.
};

var maskClouds = function(image) {
  var cs = cloud_shadows(image);
  var c = clouds(image);
  image = image.updateMask(cs);
  return image.updateMask(c);
};

// Applies scaling factors.
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true);
}

// create evi image using mathematical operators
function get_l8evi(image) {
var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('SR_B5'),
      'RED': image.select('SR_B4'),
      'BLUE': image.select('SR_B2')
});
    return evi; // here we use return
}

function get_l8ndvi(image) {
  var ndvi = image.select('SR_B5').subtract(L8_img_2017.select('SR_B4'))
   .divide(L8_img_2017.select('SR_B5').add(L8_img_2017.select('SR_B4')));
  
  return ndvi;
}

var l8_visualization = {
  bands: ['SR_B4', 'SR_B3', 'SR_B2'],
  min: 0.0,
  max: 0.3,
};

var eviVis = {
  min: 0.0,
  max: 1.0,
palette: [
    'ffffff', 'ce7e45', 'fcd163', 'c6ca02', '22cc04', '99b718', '207401',
    '012e01'

  ],
};

var ndviVis = {
  min: -1.0,
  max: 1.0,
  palette: [
    'ffffff', 'ce7e45', 'fcd163', 'c6ca02', '22cc04', '99b718', '207401',
    '012e01'
  ],
};

// /////////////////////////////// DATA ////////////////////////////
Map.setCenter(54.0, 33.0, 5);
//Selecting Landsat 8 2017, since the ground truth for the training is from 2017 Sentinel2
var L8_filtered = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(Golestan)
    .filter(ee.Filter.calendarRange(05, 2, 'month')) 
    .filter(ee.Filter.eq('IMAGE_QUALITY_OLI', 9))
    .filter(ee.Filter.lt('CLOUD_COVER', 10))
    .sort('CLOUD_COVER',false);


//remove the outlier data from 9th of July 2017
var start_bad_data = '2017-07-09T00:00:00';
var end_bad_data = '2017-07-10T00:00:00';
var bad_data_filter = ee.Filter.date(start_bad_data, end_bad_data);
var L8_good_data = L8_filtered.filter(bad_data_filter.not());


var L8_2017 = L8_good_data.filterDate('2017-01-01', '2017-12-31');

//put all dates in a list
var dates = ee.List(L8_2017.aggregate_array("system:time_start"))
    .map(function(d) { return ee.Date(d)});
// print a list with dates
//print(dates);



var L8_2017_collection = L8_2017.map(maskClouds)
                                .map(applyScaleFactors);

print("number of processed images in 2017", L8_2017_collection.size());

var L8_img_2017 = L8_2017_collection.median();
Map.addLayer(L8_img_2017.clip(Golestan), l8_visualization, 'L8_2017');

var histogram_vis_options = {
  title: 'Landsat 8 2017 reflectance histogram bands',
  fontSize: 20,
  hAxis: {title: 'Reflectance'},
  vAxis: {title: 'Count'},
  series: {
    0: {color: '1d6b99'}, // 
    1: {color: '0f8755'}, // 
    2: {color: 'cf513e'}, //  
    3: {color: 'FF9900'}, // 
  }};


//Reduce the region. The region parameter is the Feature geometry.
var medianDictionary = L8_img_2017.reduceRegion({
  reducer: ee.Reducer.median(),
  geometry: GolestanProvince_feature.geometry(),
  scale: 400,
  maxPixels: 1e9
});
//print(medianDictionary);

var hist = ui.Chart.image.histogram(L8_img_2017.select('SR_B[2-5]'), Golestan, 300)
    .setSeriesNames(['blue', 'green', 'red', 'nir'])
    .setOptions(histogram_vis_options);

print(hist);

//Create band time series
var ts_options = { 
  title: 'Landsat 8 2013 bands time series', 
  vAxis: {title: 'Bands wavelength'}, 
  hAxis: {title: 'Time'}, 
  fontSize: 20,
  // lineWidth: 1, 
  // pointSize: 4, 
  series: { 
    0: {color: '1d6b99'}, // 
    1: {color: '0f8755'}, // 
    2: {color: 'cf513e'}, //  
    3: {color: 'FF9900'}, // 
}};


var bands_timeseries = ui.Chart.image.series(L8_2017_collection.select('SR_B[2-5]'), Golestan, ee.Reducer.median(), 300)
   .setSeriesNames(['blue', 'green', 'red', 'nir'])
   .setOptions(ts_options)

print(bands_timeseries);

var wavelengths = [0.45, 0.53, 0.63, 0.85];

var options = {
  title: 'Landsat 8 2017 spectra',
  hAxis: {title: 'Wavelength (micrometers)', 
  ticks:[0, 0.25, 0.50, 0.75, 1.0]},
  vAxis: {title: 'Reflectance'},
  lineWidth: 1,
  pointSize: 4,
};
var spec_SR = ui.Chart.image.regions(
    L8_img_2017.select('SR_B[2-5]'), Golestan, ee.Reducer.mean(), 300, 'label', wavelengths)
        .setChartType('ScatterChart')
        .setOptions(options);
print(spec_SR);


// Compute EVI and NDVI
var evi_2017 = get_l8evi(L8_img_2017);
Map.addLayer(evi_2017.clip(Golestan), eviVis, 'EVI_2017');

var ndvi_2017 = get_l8ndvi(L8_img_2017)
Map.addLayer(ndvi_2017.clip(Golestan), ndviVis, 'NDVI_2017');

////////////////////////////// 2013  /////////////////////////////
var L8_2013 = L8_filtered.filterDate('2013-01-01', '2013-12-31');
    
var composite_L8_2013_free = L8_2013.map(maskClouds);
var l8_collection_2013 = composite_L8_2013_free.map(applyScaleFactors)
print("number of processed images in 2013", l8_collection_2013.size());

var L8_img_2013 = l8_collection_2013.median()

Map.addLayer(L8_img_2013.clip(Golestan), l8_visualization, 'L8_2013');

var options = {
  title: 'Landsat 8 2013 reflectance histogram bands',
  fontSize: 20,
  hAxis: {title: 'Reflectance'},
  vAxis: {title: 'Count'},
  series: {
    0: {color: '1d6b99'},
    1: {color: '0f8755'},
    2: {color: 'cf513e'},
    3: {color: 'FF9900'}
  }};


// Reduce the region. The region parameter is the Feature geometry.
var medianDictionary = L8_img_2013.reduceRegion({
  reducer: ee.Reducer.median(),
  geometry: GolestanProvince_feature.geometry(),
  scale: 400,
  maxPixels: 1e9
});
//print(medianDictionary);

var hist = ui.Chart.image.histogram(L8_img_2013.select('SR_B[2-5]'), Golestan, 300)
    .setSeriesNames(['blue', 'green', 'red', 'nir'])
    .setOptions(options);

print(hist);


// Create band time series

  
var ts_options = { 
  title: 'Landsat 8 2013 bands time series', 
  vAxis: {title: 'Bands wavelength'}, 
  hAxis: {title: 'Time'}, 
  fontSize: 20,
  // lineWidth: 1, 
  // pointSize: 4, 
  series: { 
    0: {color: '1d6b99'}, // 
    1: {color: '0f8755'}, // 
    2: {color: 'cf513e'}, //  
    3: {color: 'FF9900'}, // 
}};

var bands_timeseries = ui.Chart.image.series(l8_collection_2013.select('SR_B[2-5]'), Golestan, ee.Reducer.median(), 300)
   .setSeriesNames(['blue', 'green', 'red', 'nir'])
   .setOptions(ts_options)

print(bands_timeseries);


var wavelengths = [0.45, 0.53, 0.63, 0.85];

var options = {
  title: 'Landsat 8 2013 spectra',
  hAxis: {title: 'Wavelength (micrometers)', 
  ticks:[0, 0.25, 0.50, 0.75, 1.0]},
  vAxis: {title: 'Reflectance'},
  lineWidth: 1,
  pointSize: 4,
};
var spec_SR = ui.Chart.image.regions(
    L8_img_2013.select('SR_B[2-5]'), Golestan, ee.Reducer.mean(), 300, 'label', wavelengths)
        .setChartType('ScatterChart')
        .setOptions(options);
print(spec_SR);


// Compute EVI and NDVI
var evi_2013 = get_l8evi(L8_img_2013);
Map.addLayer(evi_2013.clip(Golestan), eviVis, 'EVI_2013');

var ndvi_2013 = get_l8ndvi(L8_img_2013)
Map.addLayer(ndvi_2013.clip(Golestan), ndviVis, 'NDVI_2013');