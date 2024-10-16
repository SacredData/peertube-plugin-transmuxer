const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const process = require("process");
const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client, S3 } = require("@aws-sdk/client-s3");
const { fromEnv } = require("@aws-sdk/credential-providers");
const fs = require("fs");

const fieldName = "transmux-m4a";
const fieldName2 = "episode-number";
const fieldName3 = "episode-premiere";

async function register({ registerHook, peertubeHelpers, storageManager }) {
  // Store data associated to this video
  registerHook({
    target: "action:api.video.updated",
    handler: ({ video, body }) => {
      if (!body.pluginData) return;

      const value = body.pluginData[fieldName];
      const value2 = body.pluginData[fieldName2];
      const value3 = body.pluginData[fieldName3];

      if (value) storageManager.storeData(fieldName + "-" + video.id, value);
      if (value2) storageManager.storeData(fieldName2 + "-" + video.id, value2);
      if (value3) storageManager.storeData(fieldName3 + "-" + video.id, value3);
    },
  });

  // Add your custom value to the video, so the client autofill your field using the previously stored value
  registerHook({
    target: "filter:api.video.get.result",
    handler: async (video) => {
      if (!video) return video;
      if (!video.pluginData) video.pluginData = {};

      const result = await storageManager.getData(fieldName + "-" + video.id);
      const result2 = await storageManager.getData(fieldName2 + "-" + video.id);
      const result3 = await storageManager.getData(fieldName3 + "-" + video.id);
      video.pluginData[fieldName] = result;
      video.pluginData[fieldName2] = result2;
      video.pluginData[fieldName3] = result3;

      return video;
    },
  });

  registerHook({
    target: "action:api.video.uploaded",
    handler: async ({ video, body }) => {
      console.log(video, body);
      const audioOutput = await doFfmpeg(video.id, video.name);
      console.log("output the audio file", audioOutput, "and uploaded to S3");
      await postToCms(video.id);
    },
  });

  async function doFfmpeg(videoId, videoName) {
    let number = null;
    while (!number) {
      number =
        (await storageManager.getData(fieldName2 + "-" + videoId)) || null;
    }
    console.log("FUCKING NUMBER", number);
    const videoFiles = await peertubeHelpers.videos.getFiles(videoId);
    console.log("got the video files", videoFiles);
    const { webVideo, hls } = videoFiles;
    const videoFile =
      hls.videoFiles.length > 0
        ? hls.videoFiles[0].path || hls.videoFiles[0].url
        : webVideo.videoFiles[0].path || webVideo.videoFiles[0].url;
    return new Promise((resolve, reject) => {
      // Store a copy of the video for playout
      fs.copyFileSync(
        videoFile,
        `/var/www/peertube/playouts/${number}${path.extname(videoFile)}`,
      );
      console.log(
        "copied upload to playouts dir",
        fs.readdirSync("/var/www/peertube/playouts"),
      );
      const fullOutPath = `/data/${videoName.startsWith("Exclusive") ? "E" + number : number}.m4a`;
      console.log("FULLOUTPATH", fullOutPath);

      ffmpeg(videoFile)
        .outputOptions([
          "-sn",
          "-vn",
          "-dn",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-f",
          "ipod",
        ])
        .output(fullOutPath)
        .on("start", (cmd) => console.log("started ffmpeg cmd", cmd))
        .on("progress", (prog) => console.log(prog))
        .on("error", (err) => reject(err))
        .on("end", () => resolve(uploadAudio(fullOutPath)))
        .run();

      console.log("ran ffmpeg cmd");
      console.log("PROCESS.ENV", process.env);
    });
  }

  async function uploadAudio(filePath) {
    const bucket = "tube-podcast-audio";
    const key = `potp/${path.basename(filePath)}`;
    const stream = fs.createReadStream(filePath);
    try {
      const uploadToS3 = new Upload({
        client: new S3({}) || new S3Client({}),
        leavePartsOnError: false,
        params: {
          Bucket: bucket,
          Key: `${key}`,
          Body: stream,
        },
      });

      //inputStream.pipe(stream)

      console.log("S3 STREEEEEEEAAAAAM", uploadToS3, stream);
      // if write() returns false. You should pause writing until a drain event occurs
      //stream.write("Hello");
      //stream.end();

      return await uploadToS3.done();
    } catch (e) {
      console.log(e);
    }
  }

  async function postToCms(videoId) {
    try {
      const token = await cmsLogin();
      console.log("got token", token);
      const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);
      console.log(video, video.id, video.name);
      const number =
        (await storageManager.getData(fieldName2 + "-" + videoId)) || null;
      const pubDate =
        (await storageManager.getData(fieldName3 + "-" + videoId)) || null;
      const episodeRecord = {
        number,
        title: video.name,
        guid: `${video.name.startsWith("Exclusive") ? "E" : "POTP_"}${number}`,
        audio: `https://pa.tube.sh/hn021FGl8ekgR9rk1Jjfig==,2216921583/potp/${video.name.startsWith("Exclusive") ? "E" + number : number}.m4a`,
        peertubeId: `https://gas.tube.sh/videos/embed/${video.uuid}`,
        pubDate:
          pubDate !== null
            ? new Date(pubDate)
            : video.originallyPublishedAt || video.publishedAt,
      };
      const requestBody = JSON.stringify(episodeRecord);
      const request = await fetch(
        `https://gascms.tube.sh/payload/api/episodes?draft=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
        },
      );
      console.log(await request.json());
    } catch (err) {
      console.error(err);
      return new Error(err);
    }
  }
}

async function unregister() {
  return;
}

async function cmsLogin() {
  try {
    const req = await fetch("https://gascms.tube.sh/payload/api/users/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "andrew+queue@tube.sh",
        password: "taco1bra",
      }),
    });
    const data = await req.json();
    console.log(data);
    return data.token;
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  register,
  unregister,
};
