var GolestanProvince = Golestan ;
Map.addLayer(GolestanProvince, {},  "Golestan"); 
Map.setCenter(54.0, 33.0, 5);

// /////////////////////////////// FUNCTIONS ////////////////////////////
// Define a function that scales and masks Landsat 8 surface reflectance images
// and adds an NDVI band.
function prepSrL8(image) {
  // Develop masks for unwanted pixels (fill, cloud, cloud shadow).
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Apply the scaling factors to the appropriate bands.
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);

  // Calculate NDVI.
  var ndvi = opticalBands.normalizedDifference(['SR_B5', 'SR_B4'])
      .rename('NDVI');

  // Replace original bands with scaled bands, add NDVI band, and apply masks.
  return image.addBands(opticalBands, null, true)
      .addBands(thermalBands, null, true)
      .addBands(ndvi)
      .updateMask(qaMask)
      .updateMask(saturationMask);
}

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


//Selecting Landsat 8 2017, since the ground truth for the training is from 2017 Sentinel2 
var L8_filtered = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(Golestan)
    .filter(ee.Filter.calendarRange(6, 8, 'month'))
    .filter(ee.Filter.eq('IMAGE_QUALITY_OLI', 9))
    .filter(ee.Filter.lt('CLOUD_COVER', 10))
    .sort('CLOUD_COVER',false)
    .map(prepSrL8)
    .map(function(image){return image.clip(Golestan)});


//remove the outlier data from 9th of July 2017
var start_bad_data = '2017-07-09T00:00:00';
var end_bad_data = '2017-07-10T00:00:00';
var bad_data_filter = ee.Filter.date(start_bad_data, end_bad_data);
var L8_good_data = L8_filtered.filter(bad_data_filter.not());



///////////////////////////////// 2013 - 2017 /////////////////////////////
var L8_2017_collection = L8_good_data.filterDate('2017-01-01', '2017-12-31');
var L8_2013_collection = L8_good_data.filterDate('2013-01-01', '2013-12-31');
var L8_img_2017 = L8_2017_collection.median();
var L8_img_2013 = L8_2013_collection.median();

print(L8_2017_collection, 'L8_2017_collection with NDVI');
print(L8_2013_collection, 'L8_2013_collection with NDVI');
print("number of processed images in 2017", L8_2017_collection.size());
print("number of processed images in 2013", L8_2013_collection.size());


var l8_fc1 = {bands: ['SR_B6','SR_B5','SR_B4'], min: 0, max: 0.5, gamma: 0.9};
Map.addLayer(L8_img_2017, l8_fc1, 'L8_img_2017 False Color');
Map.addLayer(L8_img_2013, l8_fc1, 'L8_img_2013 False Color');

///////////////////////////////// histograms ///////////////////////////////
var histogram_vis_options = {
  title: 'Landsat8 2017 reflectance histogram bands',
  fontSize: 20,
  hAxis: {title: 'Reflectance'},
  vAxis: {title: 'Count'},
  series: {
    0: {color: '1d6b99'}, // 
    1: {color: '0f8755'}, // 
    2: {color: 'cf513e'}, //  
    3: {color: 'FF9900'}, // 
  }};

var hist = ui.Chart.image.histogram(L8_img_2017.select('SR_B[2-5]'), Golestan, 300)
    .setSeriesNames(['blue', 'green', 'red', 'nir'])
    .setOptions(histogram_vis_options);
print(hist);

var histogram_vis_options = {
  title: 'Landsat8 2013 reflectance histogram bands',
  fontSize: 20,
  hAxis: {title: 'Reflectance'},
  vAxis: {title: 'Count'},
  series: {
    0: {color: '1d6b99'}, // 
    1: {color: '0f8755'}, // 
    2: {color: 'cf513e'}, //  
    3: {color: 'FF9900'}, // 
  }};

var hist = ui.Chart.image.histogram(L8_img_2013.select('SR_B[2-5]'), Golestan, 300)
    .setSeriesNames(['blue', 'green', 'red', 'nir'])
    .setOptions(histogram_vis_options);
print(hist);

///////////////////////////////////  NDVI ///////////////////////////////
var ndvi_2017 = L8_2017_collection.select('NDVI');
var ndvi_2017_median = ndvi_2017.median()
print(ndvi_2017, 'NDVI 2017')
Map.addLayer(ndvi_2017, ndviVis, 'NDVI 2017', false);
Map.addLayer(ndvi_2017.median(), ndviVis, 'MEDIAN NDVI 2017', false);

var ndvi_2013 = L8_2013_collection.select('NDVI');
var ndvi_2013_median = ndvi_2013.median()
print(ndvi_2013, 'NDVI 2013')
Map.addLayer(ndvi_2013, ndviVis, 'NDVI 2013', false);
Map.addLayer(ndvi_2013.median(), ndviVis, 'MEDIAN NDVI 2013', false);


var ndvi_diff = ndvi_2013_median.subtract(ndvi_2017_median);
print(ndvi_diff, 'NDVI difference Image 2013 / 2017)');


var dndviParams = {min: -0.2, max: 0.2, palette: ['DarkGreen', 'green', 'LimeGreen', 'white', 'burlywood', 'brown', 'maroon']};
Map.addLayer(ndvi_diff, dndviParams, 'NDVI diff Image 2013 / 2017', false);
//Map.addLayer(ndvi_diff, {min: -1, max: 1, palette: ['black', 'yellow', 'green']}, 'continuous NDVI',false);


// export 2018 classifier map 
Export.image.toDrive({
  image: ndvi_diff,
  description: 'ndvi difference map',
  folder: 'ndvi_diff',
  fileNamePrefix: 'ndvi_difference_map',
  region: Golestan,
  scale: 30,
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
})



/////////////////////////////////// NDVI Histogram ///////////////////////////////
//////////////////// HISTOGRAM NDVI //////////////
var histogram_ndvi_2013_median =
    ui.Chart.image
        .histogram({
          image: ndvi_2013_median,
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
        
        
print(histogram_ndvi_2013_median);


var histogram_ndvi_2017_median =
    ui.Chart.image
        .histogram({
          image: ndvi_2017_median,
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
print(histogram_ndvi_2017_median);

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

////////////////////////////////////////  NDVI classification /////////////////
var thresholds = ee.Image([-0.4, -0.2, 0, 0.1, 0.2, 0.3, 0.4, 1]); //Define the thresholds
var ndvi_2013_median_classified = ndvi_2013_median.gt(thresholds).reduce('sum').toInt(); //Create the classified Image
print(ndvi_2013_median_classified, 'ndvi_2013_median_classified');

var ndvi_2017_median_classified = ndvi_2017_median.gt(thresholds).reduce('sum').toInt(); //Create the classified Image
print(ndvi_2017_median_classified, 'ndvi_2017_median_classified');

//Define new visualization parameters for the classification: The values are now ranging from 0 to 7, one for each class
var classifiedParams = {min: 0, max: 8, palette: ['blue', 'white', 'brown', 'burlywood', 'LimeGreen', 'ForestGreen', 'DarkGreen']};
Map.addLayer(ndvi_2013_median_classified.clip(Golestan), classifiedParams, 'ndvi_2013_median_classified');
Map.addLayer(ndvi_2017_median_classified.clip(Golestan), classifiedParams, 'ndvi_2017_median_classified');


