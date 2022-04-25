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


var addNDVI_l8 = function(image) {
  var ndvi = image.select('SR_B5').subtract(image.select('SR_B4'))
   .divide(image.select('SR_B5').add(image.select('SR_B4'))).rename('NDVI');
  return image.addBands(ndvi);
};


var l8_visualization = {
  bands: ['SR_B4', 'SR_B3', 'SR_B2'],
  min: 0.0,
  max: 0.3,
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
    .filter(ee.Filter.calendarRange(6, 8, 'month'))
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
                                .map(applyScaleFactors)
                                .map(addNDVI_l8)
                                .map(function(image){return image.clip(Golestan)});
                                
//print(L8_2017_collection, 'Image Collection with NDVI');

//print("number of processed images in 2017", L8_2017_collection.size());

var L8_img_2017 = L8_2017_collection.median();
//Map.addLayer(L8_img_2017, l8_visualization, 'L8_2017');

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

//print(hist);

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
  .setOptions(ts_options);

//print(bands_timeseries);

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
//print(spec_SR);


// Compute NDVI
var ndvi_2017 = L8_2017_collection.select('NDVI');
print(ndvi_2017, 'NDVI 2017')
Map.addLayer(ndvi_2017, ndviVis, 'NDVI 2017', false);



// ////////////////////////////// 2013  /////////////////////////////
var L8_2013 = L8_filtered.filterDate('2013-01-01', '2013-12-31');
    

var L8_2013_collection = L8_2013.map(maskClouds)
                                .map(applyScaleFactors)
                                .map(addNDVI_l8)
                                .map(function(image){return image.clip(Golestan)});
                                
//print("number of processed images in 2013", L8_2013_collection.size());

var L8_img_2013 = L8_2013_collection.median();

//Map.addLayer(L8_img_2013, l8_visualization, 'L8_2013');

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

//print(hist);


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

var bands_timeseries = ui.Chart.image.series(L8_2013_collection.select('SR_B[2-5]'), Golestan, ee.Reducer.median(), 300)
  .setSeriesNames(['blue', 'green', 'red', 'nir'])
  .setOptions(ts_options)

//print(bands_timeseries);


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
//print(spec_SR);



// Compute NDVI
var ndvi_2013 = L8_2013_collection.select('NDVI');
print(ndvi_2013, 'NDVI 2013')
Map.addLayer(ndvi_2013, ndviVis, 'NDVI 2013', false);
//Map.addLayer(ndvi_2013.median(), ndviVis, 'MEDIAN NDVI 2013', false);




///////////////// NDVI DIFF //////////////

var pre_event = L8_2013_collection
              .select('NDVI')
              .median();
Map.addLayer(pre_event, ndviVis, 'Pre-Event', false);

var post_event = L8_2017_collection
              .select('NDVI')
              .median();
Map.addLayer(post_event, ndviVis, 'Post-Event', false);

//Adding the pre- and post-event layers to the map might make our project take a bit longer to compute and render, however there is also one decisive advantage; we can later use the maps to extract NDVI-values via the Inspector!  
//If this bothers you, simply add false to the command line or untick the layer in the map panel.

var ndvi_diff = pre_event.subtract(post_event);
print(ndvi_diff, 'NDVI difference Image 2013 / 2017)');

var dndviParams = {min: -1, max: 1, palette: ['DarkGreen', 'green', 'LimeGreen', 'white', 'burlywood', 'brown', 'maroon']};
Map.addLayer(ndvi_diff, dndviParams, 'NDVI diff Image 2013 / 2017', false);


/////////////////////////////////////////////////////////////

var pre_event_ic = L8_2013_collection
                  .select(['NDVI'],['NDVI_pre']); //This line allows us to select the band 'NDVI' and simultaneously rename it to 'NDVI_pre' in the new variable 
print(pre_event_ic, 'Pre-Event ImageCollection 2013');
Map.addLayer(pre_event_ic, ndviVis, 'Pre-Event IC 2013', false);

var post_event_ic = L8_2017_collection
              .select(['NDVI'],['NDVI_post']); //this line allows us to select the band 'NDVI' and simultaneously rename it to 'NDVI_post' in the new variable 
print(post_event_ic, 'Post-Event ImageCollection 2017');
Map.addLayer(post_event_ic, ndviVis, 'Post-Event IC 2017', false);

//Add a time series chart of the mean NDVI values
// To keep processing times low and reduce the chance of producing errors, we are going to downsample our data to a spatial resolution of 200m via 'scale: 200'. Feel free to change this to 'Scale: 30' for smaller subsets to increase accuracy.
var chart_pre_event = ui.Chart.image.series({
  imageCollection: pre_event_ic,
  region: Golestan,
  reducer: ee.Reducer.mean(),
  scale: 300
})
.setOptions({
          title: 'Mean NDVI Value by Months Pre Event',
          hAxis: {title: 'Month', titleTextStyle: {italic: false, bold: true}},
          vAxis: {title: 'NDVI',titleTextStyle: {italic: false, bold: true}},
  });
print(chart_pre_event)



var chart_post_event = ui.Chart.image.series({
  imageCollection: post_event_ic,
  region: Golestan,
  reducer: ee.Reducer.mean(),
  scale: 300
})
.setOptions({
          title: 'Mean NDVI Value by Months Post Event',
          hAxis: {title: 'Month', titleTextStyle: {italic: false, bold: true}},
          vAxis: {title: 'NDVI',titleTextStyle: {italic: false, bold: true}},
  });
print(chart_post_event)


//////////////////// HISTOGRAM NDVI //////////////
var histogram_pre_event =
    ui.Chart.image
        .histogram({
          image: pre_event,
          region: Golestan,
          scale: 3000,
          minBucketWidth: 0.1, //define the width of a single bucket; in this example, each bucket shows a range of 0.1
        })
         .setOptions({
          title: 'NDVI 2013 historgram',
          hAxis: {
            title: 'NDVI ',
            titleTextStyle: {italic: false, bold: true},
          },
          vAxis:
              {title: 'Count', titleTextStyle: {italic: false, bold: true}}

        })
        
        
print(histogram_pre_event);


var histogram_post_event =
    ui.Chart.image
        .histogram({
          image: post_event,
          region: Golestan,
          scale: 3000,
          minBucketWidth: 0.1, //define the width of a single bucket; in this example, each bucket shows a range of 0.1
        })
         .setOptions({
          title: 'NDVI 2017 historgram',
          hAxis: {
            title: 'NDVI ',
            titleTextStyle: {italic: false, bold: true},
          },
          vAxis:
              {title: 'Count', titleTextStyle: {italic: false, bold: true}}

        })
        
        
        ;
print(histogram_post_event);





var histogram_diff_img =
    ui.Chart.image.histogram({image: ndvi_diff, region: Golestan, scale: 3000, minBucketWidth: 0.1})
    .setOptions({
          title: 'NDVI difference historgram',
          hAxis: {
            title: 'NDVI ',
            minValue:-1,
            titleTextStyle: {italic: false, bold: true},
          },
          vAxis:
              {title: 'Count', titleTextStyle: {italic: false, bold: true}}
        });
        
print(histogram_diff_img);


var thresholds = ee.Image([-0.2, 0, 0.1, 0.2, 0.3, 0.4, 1]); //Define the thresholds
var pre_event_classified = pre_event.gt(thresholds).reduce('sum').toInt(); //Create the classified Image
print(pre_event_classified, 'pre_event_classified');

var post_event_classified = post_event.gt(thresholds).reduce('sum').toInt(); //Create the classified Image
print(post_event_classified, 'post_event_classified');

//Define new visualization parameters for the classification: The values are now ranging from 0 to 7, one for each class
var classifiedParams = {min: 0, max: 7, palette: ['blue', 'white', 'brown', 'burlywood', 'LimeGreen', 'ForestGreen', 'DarkGreen']};
Map.addLayer(pre_event_classified.clip(Golestan), classifiedParams, 'pre_event_classified');
Map.addLayer(post_event_classified.clip(Golestan), classifiedParams, 'post_event_classified');



//First, we want to count the number of pixels in the entire layer for future reference.
var pre_event_allpix =  pre_event_classified.updateMask(pre_event_classified);  // mask the entire layer
var pre_event_pixstats = pre_event_allpix.reduceRegion({
  reducer: ee.Reducer.count(),               // count all pixels in a single class
  geometry: Golestan,
  scale: 300,
  maxPixels: 1e10
  });
var pre_event_allpixels = ee.Number(pre_event_pixstats.get('sum')); // extract pixel count as a number


// Then, we want to create an empty list to store the area values we will calculate in
var pre_arealist = [];

// Now, we can create a function to derive the extent of one NDVI class
// The arguments are class number (cnr) and class name (name)
var areacount = function(cnr, name) {
var singleMask =  pre_event_classified.updateMask(pre_event_classified.eq(cnr));  // mask a single class
var stats = singleMask.reduceRegion({
  reducer: ee.Reducer.count(),               // count pixels in a single class
  geometry: Golestan,
  scale: 300,
  maxPixels: 1e10
  });
var pix =  ee.Number(stats.get('sum'));
var hect = pix.multiply(900).divide(10000);                // Landsat pixel = 30m x 30m --> 900 sqm
var perc = pix.divide(pre_event_allpixels).multiply(10000).round().divide(100);   // get area percent by class and round to 2 decimals
pre_arealist.push({Class: name, Pixels: pix, Hectares: hect, Percentage: perc});
};

// Create a list that contains the NDVI class names (7 classes, ranging from [-0.2, 0, 0.1, 0.2, 0.3, 0.4, 1])
var names2 = ['Water', 'No Vegetation', 'Very Low Vegetation',
'Low Vegetation', 'Moderate Vegetation','Moderate-high Vegetation', 'High Vegetation'];

// execute function for each class
for (var i = 0; i < 7; i++) {
  areacount(i, names2[i]);
  }

//Print the results to the Console and examine it.
print('Vegetated Area 2013 by NDVI Class', pre_arealist, '--> click list objects for individual classes');


var post_event_allpix =  post_event_classified.updateMask(post_event_classified);  // mask the entire layer
var post_event_pixstats = post_event_allpix.reduceRegion({
  reducer: ee.Reducer.count(),               // count all pixels in a single class
  geometry: Golestan,
  scale: 300,
  maxPixels: 1e10
  });
var post_event_allpixels = ee.Number(post_event_pixstats.get('sum')); // extract pixel count as a number


// Then, we want to create an empty list to store the area values we will calculate in
var post_arealist = [];

// Now, we can create a function to derive the extent of one NDVI class
// The arguments are class number (cnr) and class name (name)
var areacount = function(cnr, name) {
var singleMask =  post_event_classified.updateMask(post_event_classified.eq(cnr));  // mask a single class
var stats = singleMask.reduceRegion({
  reducer: ee.Reducer.count(),               // count pixels in a single class
  geometry: Golestan,
  scale: 300,
  maxPixels: 1e10
  });
var pix =  ee.Number(stats.get('sum'));
var hect = pix.multiply(900).divide(10000);                // Landsat pixel = 30m x 30m --> 900 sqm
var perc = pix.divide(post_event_allpixels).multiply(10000).round().divide(100);   // get area percent by class and round to 2 decimals
post_arealist.push({Class: name, Pixels: pix, Hectares: hect, Percentage: perc});
};

// Create a list that contains the NDVI class names (7 classes, ranging from [-0.2, 0, 0.1, 0.2, 0.3, 0.4, 1])
var names2 = ['Water', 'No Vegetation', 'Very Low Vegetation',
'Low Vegetation', 'Moderate Vegetation','Moderate-high Vegetation', 'High Vegetation'];

// execute function for each class
for (var i = 0; i < 7; i++) {
  areacount(i, names2[i]);
  }

//Print the results to the Console and examine it.
print('Vegetated Area 2017 by NDVI Class', post_arealist, '--> click list objects for individual classes');




