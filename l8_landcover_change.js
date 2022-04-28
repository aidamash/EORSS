Map.setCenter(54.0, 33.0, 5);

var aoi = Golestan;
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

//Selecting Landsat 8 2017, since the ground truth for the training is from 2017 Sentinel2 
var L8_filtered = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(aoi)
    .filter(ee.Filter.calendarRange(6, 8, 'month'))
    .filter(ee.Filter.eq('IMAGE_QUALITY_OLI', 9))
    .filter(ee.Filter.lt('CLOUD_COVER', 10))
    .sort('CLOUD_COVER',false)
    .map(prepSrL8)
    .map(function(image){return image.clip(aoi)});
    
//remove the outlier data from 9th of July 2017
var start_bad_data = '2017-07-09T00:00:00';
var end_bad_data = '2017-07-10T00:00:00';
var bad_data_filter = ee.Filter.date(start_bad_data, end_bad_data);
var L8_good_data = L8_filtered.filter(bad_data_filter.not());
///////////////////////////////// 2013 - 2017 /////////////////////////////
var L8_2017_collection = L8_good_data.filterDate('2017-01-01', '2017-12-31');
var L8_2013_collection = L8_good_data.filterDate('2013-01-01', '2013-12-31');


var L8_img_2017 = L8_2017_collection.median().setDefaultProjection('EPSG:4326', null, 30);
var L8_img_2013 = L8_2013_collection.median().setDefaultProjection('EPSG:4326', null, 30);

print(L8_2017_collection, 'L8_2017_collection with NDVI');
print(L8_2013_collection, 'L8_2013_collection with NDVI');
print("number of processed images in 2017", L8_2017_collection.size());
print("number of processed images in 2013", L8_2013_collection.size());



var iranLC = ee.Image("KNTU/LiDARLab/IranLandCover/V1")
.select('classification')
.rename('landcover')
.clip(aoi);

var minMax = iranLC.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: aoi,
    scale: 30,
    maxPixels: 1e10
})

print('Min & Max all bands: ', minMax)

var visualization = {
  bands: ['landcover']
};
//  Palette with the colors
var palette =['000000',
              '006eff',
              '41a661',
              'ff7f7f',
              'bee8ff',
              'ff00c5',
              'ff0000',
              '00734c',
              '732600', 
              'ffaa00', 
              'd3ffbe', 
              '446589', 
              'cccccc'];

// name of the legend
var names = ['Urban', 'Water', 'Wetland', 'Kalut (yardang)', 'Marshland', 'Salty Land', 'Clay', 'Forest', 'Outcrop', 'Uncovered Plain', 'Sand', 'Farm Land', 'Range Land'];

// set position of panel
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});

// Create legend title
var legendTitle = ui.Label({
  value: 'Iran Land cover',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
    }
});

// Add the title to the panel
legend.add(legendTitle);
    
// Creates and styles 1 row of the legend.
var makeRow = function(color, name) {
      
      // Create the label that is actually the colored box.
      var colorBox = ui.Label({
        style: {
          backgroundColor: '#' + color,
          // Use padding to give the box height and width.
          padding: '8px',
          margin: '0 0 4px 0'
        }
      });
      
      // Create the label filled with the description text.
      var description = ui.Label({
        value: name,
        style: {margin: '0 0 4px 6px'}
      });
      
      // return the panel
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      });
};
// Add color and and names
for (var i = 0; i < 13; i++) {
  legend.add(makeRow(palette[i], names[i]));
  }  
Map.addLayer(iranLC, {min:1, max:13 , palette:['000000',  '006eff',  '41a661',  'ff7f7f',  'bee8ff',  'ff00c5',  'ff0000',  '00734c',  '732600',  'ffaa00',  'd3ffbe',  '446589',  'cccccc']}, "landcover");
// add legend to map (alternatively you can also print the legend to the console)  
Map.add(legend);  
 
 
 
 
// Sample the input imagery to get a FeatureCollection of training data.
var points = L8_img_2017.addBands(iranLC).sample({
  region: aoi,
  numPixels: 1000,
  seed: 0,
  tileScale : 16
});

// The randomColumn() method will add a column of uniform random
// numbers in a column named 'random' by default.
var sample = points.randomColumn();

var split = 0.7;  // Roughly 70% training, 30% testing.
var training = sample.filter(ee.Filter.lt('random', split));
var validation = sample.filter(ee.Filter.gte('random', split));

print(training.size());
print(validation.size());

// Spatial join.
var distFilter = ee.Filter.withinDistance({
  distance: 1000,
  leftField: '.geo',
  rightField: '.geo',
  maxError: 10
});

var join = ee.Join.inverted();

// Apply the join.
training = join.apply(training, validation, distFilter);
print(training.size());



// Make a Random Forest classifier and train it.
var classifier = ee.Classifier.smileRandomForest(10)
    .train({
      features: training,
      classProperty: 'landcover',
      inputProperties: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7']
    });

// Classify the input imagery.
var classified = L8_img_2017.classify(classifier); 

// Get a confusion matrix representing resubstitution accuracy.
var trainAccuracy = classifier.confusionMatrix();
print('Resubstitution error matrix: ', trainAccuracy);
print('Training overall accuracy: ', trainAccuracy.accuracy());




var validated = validation.classify(classifier);
print('validated', validated);

// Get a confusion matrix representing expected accuracy.
var testAccuracy = validated.errorMatrix('landcover', 'classification');
print('Validation error matrix: ', testAccuracy);
print('Validation overall accuracy: ', testAccuracy.accuracy());

var OAV = testAccuracy.accuracy();
var UAV = testAccuracy.consumersAccuracy();
var PAV = testAccuracy.producersAccuracy();
var Kappa = testAccuracy.kappa();

print('Performance  metrics - Minimun distance classifier'); print('Error Matrix:', testAccuracy);
print('Overall Accuracy:', OAV);
print('User Accuracy:', UAV);
print('Producer Accuracy:', PAV);
print('Kappa Coefficient: ', Kappa);




var options = {
lineWidth: 1,
pointSize: 2,
colors: palette,
SeriesNames: [
          'Urban', 'Water', 'Wetland', 'Kalut (yardang)', 'Marshland', 'Salty Land', 'Clay', 'Forest', 'Outcrop', 'Uncovered Plain', 'Sand', 'Farm Land', 'Range Land'],
hAxis: {title: 'Classes'},
vAxis: {title: 'Sum of pixels area'},
title: 'sum of pixels in each class in square km.'

}; 


var areaChart = ui.Chart.image.byClass({
  image: ee.Image.pixelArea().addBands(classified),
  classBand: 'classification', 
  region: aoi,
  scale: 300,
  reducer: ee.Reducer.sum()/1000

})
.setOptions(options)
print(areaChart);
