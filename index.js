// import nodejs bindings to native tensorflow,
// not required, but will speed up things drastically (python required)
var Stream = require('stream').Transform;
var canvas = require("canvas");
var http = require("https");
var fs = require('fs');
var faceapi = require('face-api.js');
var Blob = require('node-fetch');
var foundFace = false;
const MODEL_URL = '/models';
var hasLoadedModel = false;
const { Canvas, Image, ImageData } = canvas;

const config = require('./config');
const twit = require('twit');
const T = new twit(config);

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const tinyFaceNet = faceapi.nets.tinyFaceDetector;
//getTinyFaceNetModel('wikiHowImage' + 0);
getWikiHowImages();

function tweetImage() {
    var b64content = fs.readFileSync('CroppedFace0.png', { encoding: 'base64' });

    T.post('media/upload', { media_data: b64content }, function (err, data, response) {

        var mediaIdStr = data.media_id_string;
        var altText = "Wikihow face";
        var meta_params = { media_id: mediaIdStr, alt_text: { text: altText } }

        T.post('media/metadata/create', meta_params, function (err, data, response) {
            if (!err) {
                // now we can reference the media and post a tweet (media will attach to the tweet)
                var params = { status: '', media_ids: [mediaIdStr] }

                T.post('statuses/update', params, function (err, data, response) {
                    console.log(data)
                })
            }
        });

    });
}



async function getTinyFaceNetModel(imageURI) {

    if (!hasLoadedModel) {
        await tinyFaceNet.loadFromDisk('./public/models');
        hasLoadedModel = true;
    }
    // var imageBlob = await loadImage(testFaceURL);
    var htmlImage = await canvas.loadImage(imageURI + ".png");//await/ faceapi.bufferToImage(imageBlob)
    const img = new Image();
    const canvasCreated = canvas.createCanvas(htmlImage.naturalWidth, htmlImage.naturalHeight);
    const ctx = canvasCreated.getContext('2d');
    img.src = imageURI + ".png";
    ctx.drawImage(img, 0, 0);
    //img.src = testFaceURL;
    var allFaces = await tinyFaceNet.locateFaces(img);

    allFaces.forEach((element) => {
        var heightOffset = element.box.height;
        var widthOffset = element.box.width;
        var xPos = element.box.x - widthOffset / 2;
        var yPos = element.box.y - heightOffset / 2;
        var clampedXPos = Math.max(0, Math.min(htmlImage.naturalWidth, xPos));
        var clampedYPos = Math.max(0, Math.min(htmlImage.naturalHeight, yPos));

        var finalWidth = element.box.width + widthOffset;
        var finalHeight = element.box.height + heightOffset;

        finalHeight -= clampedYPos - yPos;
        finalWidth -= clampedXPos - xPos;

        var croppedImageData = ctx.getImageData(clampedXPos, clampedYPos, finalWidth, finalHeight);
        const croppedCanvas = canvas.createCanvas(finalWidth, finalHeight);
        const croppedCanvasContext = croppedCanvas.getContext('2d');
        croppedCanvasContext.putImageData(croppedImageData, 0, 0);
        var croppedBuffer = croppedCanvas.toBuffer();
        fs.writeFileSync("CroppedFace" + ".png", croppedBuffer);
        ctx.strokeRect(xPos, yPos, finalWidth, finalHeight);
        foundFace = true;
    });
    var buf = canvasCreated.toBuffer();
    fs.writeFileSync(imageURI + "WithRects.png", buf);
    if (!foundFace) {
        getWikiHowImages();
    }
    else {
        tweetImage();
    }
}

async function loadImage(imageURL) {

    var image = await http.request(imageURL, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            return body;
        });
    }).end();
}



console.log("test");

function getWikiHowImages() {
    var options = {
        "method": "GET",
        "hostname": "hargrimm-wikihow-v1.p.rapidapi.com",
        "port": null,
        "path": "/images?count=1",
        "headers": {
            "x-rapidapi-host": "hargrimm-wikihow-v1.p.rapidapi.com",
            "x-rapidapi-key": "79a967c738msh6939a16b2677140p1cbb1ejsn6b69826c923f"
        }
    };
    var chunks = [];
    var outJson;

    var req = http.request(options, function (res) {

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            outJson = JSON.parse(body.toString());
            Object.values(outJson).forEach((element, elementIndex) => { findFaces(element, elementIndex, getTinyFaceNetModel) });

        });
    });
    req.end();

}

function findFaces(imageURL, index, onComplete) {
    console.log("finding faces in " + imageURL);
    var imageFileName = 'wikiHowImage' + index;
    http.request(imageURL, function (response) {
        var data = new Stream();

        response.on('data', function (chunk) {
            data.push(chunk);
        });

        response.on('end', function () {
            fs.writeFileSync(imageFileName + '.png', data.read());
            onComplete(imageFileName);
        });
    }).end();
}

