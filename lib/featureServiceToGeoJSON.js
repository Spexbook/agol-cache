const fetch = require("node-fetch")
const fs = require("fs");

module.exports = function featureServiceToGeoJSON(featureServiceUrl) {
  getFeatureService(featureServiceUrl)
  .then(service => {
    const layers = getLayers(service);

    layers.map((l,i) => {
      getFeatures(`${featureServiceUrl}${i + 1}/`, l)
    })

  })
}

async function getFeatureService(serviceURL) {
  const res = await fetch(serviceURL + "?f=json")
  const serviceDefinition = await res.json();
  return serviceDefinition;
}


function getLayers(serviceDefinition) {
  return serviceDefinition.layers.reduce((i, l) => {
    return [...i, convertName(l.name)]
  }, [])
}

function convertName(name) {
  return name.toLowerCase().replace(/ /g, '_').replace(/-/g, '_')
}

async function getFeatures(layerUrl, layerName) {

  const statistics = [
    { "statisticType": "min", "onStatisticField": "objectid", "outStatisticFieldName": "min" },
    { "statisticType": "max", "onStatisticField": "objectid", "outStatisticFieldName": "max" }
  ]

  const urlEncoded = encodeURI(JSON.stringify(statistics))

  // const res = await fetch(url  + "query?where=objectid+%3E+0&returnGeometry=false&returnCountOnly=true&f=pjson" );
  const res = await fetch(`${layerUrl}query?outStatistics=${urlEncoded}&f=pjson`);

  const json = await res.json();

  const count = json.features[0].attributes.max;

  const max = 999;

  const features = [];

  if (max >= count) {

    const geojson = await queryAGOL(layerUrl, 0, 999);
    fs.writeFileSync(`geojson-cache/${layerName}.geojson`, JSON.stringify(geojson))
    console.log("wrote", count, "features to", layerName + ".geojson");

  } else {
    const queryArray = [];
    const totalQueries = (Number(count / max)).toFixed(0);

    for (let i = 1; i <= totalQueries; i++) {
      const end = max * i
      const start = end - 999;
      queryArray.push({
        start: start,
        end: end
      })
    }


    let progress = queryArray.length;

    for (let i = 0; i < queryArray.length; i++) {

      const q = queryArray[i];

      const geojson = await queryAGOL(layerUrl, q.start, q.end);
      geojson.features.map(f => {
        features.push(f)
      });

      progress = progress - 1;
      if (!progress) {
        let finalGeoJSON = {
          type: "FeatureCollection",
          features: features
        }
        fs.writeFileSync(`geojson-cache/${layerName}.geojson`, JSON.stringify(finalGeoJSON))
        console.log("wrote", count, "features to", layerName + ".geojson");

      }

    }

  }

}

async function queryAGOL(url, start, end) {
  const res = await fetch(`${url}query?where=objectid+between+${start}+and+${end}&outFields=*&f=geojson`);
  const data = await res.json()
  return data;
}