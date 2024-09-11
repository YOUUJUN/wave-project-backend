const Path = require("path");
const fs = require("fs");
const http = require("http");

const appDataPath = utools.getPath("userData");
const ffmpegFilePath = Path.join(appDataPath, "ffmpeg.exe");
console.log("appDataPath", appDataPath);

//下载ffmpeg
function downloadFFmpeg(filePath) {
    console.log("downloading...");
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        let downloaUrl = "";
        if (utools.isMacOS()) {
            downloaUrl = "";
        } else if (utools.isWindows()) {
            downloaUrl = "http://127.0.0.1:5173/ffmpeg.exe";
        } else if (utools.isLinux()) {
            downloaUrl = "";
        }

        http.get(downloaUrl, (res) => {
            res.pipe(file);
            file.on("finish", () => {
                file.close(() => {
                    console.log("FFmpeg downloaded successfully");
                    resolve();
                });
            });
        }).on("error", (err) => {
            fs.unlink(filePath, () => {});
            console.log("Error downloading ffmpeg:", err);
            reject(err);
        });
    });
}

//检查有无ffmpeg
async function checkIfFFmpegExist() {
    if (!fs.existsSync(ffmpegFilePath)) {
        console.log("no exist ffmpeg");
        return downloadFFmpeg(ffmpegFilePath);
    } else {
        console.log("have ffmpeg");
        return;
    }
}

//初始化插件
utools.onPluginEnter(() => {
    checkIfFFmpegExist().then((res) => {
        console.log("all set");
    });
});

function getUserDataPath() {
    console.log("appDataPath", appDataPath);
}

window.services = {
    getUserDataPath,
};
