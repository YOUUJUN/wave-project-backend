const Path = require("path");
const fs = require("fs");
const http = require("http");
const { PassThrough } = require("stream");
const { exec, execFile, spawn } = require("child_process");

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

//音频剪辑功能
function clipAudio(inputFile, outputFile, startTime, duration) {
    const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFile}" -ss ${startTime} -t ${duration} -c copy "${outputFile}"`;
    exec(ffmpegCommond, (error, stdout, stderr) => {
        if (error) {
            console.error("Error during ffmpeg exec", error);
            return;
        }
    });
}

//将音频文件转化成 wav 格式并以流的形式输出
function convertToWavStream(inputFile) {
    const passThroughStream = new PassThrough();
    const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFile}" -f wav -`;
    const ffmpegProcess = exec(ffmpegCommond, {
        encoding: "binary",
        maxBuffer: Infinity,
    });

    ffmpegProcess.stdout.pipe(passThroughStream);

    ffmpegProcess.on("error", (error) => {
        console.error("Error during WAV conversion", error);
    });
    ffmpegProcess.on("close", (code) => {
        console.log("FFmpeg process closed with code", code);
        passThroughStream.end();
    });

    return passThroughStream;
}

//将音频流数据转化为 ArrayBuffer
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => {
            chunks.push(chunk);
        });
        stream.on("end", () => {
            const buffer = Buffer.concat(chunks);

            resolve(buffer);

            // resolve(
            //     buffer.buffer.slice(
            //         buffer.byteOffset,
            //         buffer.byteOffset + buffer.byteLength
            //     )
            // );
        });
        stream.on("error", reject);
    });
}

//读取音频数据
function readAudioFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                return reject(err);
            }

            resolve(data);
        });
    });
}

//音频转wav格式
function convertToWav(inputFilePath) {
    return new Promise((resolve, reject) => {
        const outputFilePath = Path.join(appDataPath, "test.wav");
        const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" "${outputFilePath}"`;
        execFile(ffmpegCommond, (error) => {
            if (error) {
                return reject(error);
            }

            const outputBuffer = fs.writeFileSync(outputFilePath);
            fs.unlinkSync(outputFilePath);
            resolve(outputBuffer);
        });
    });
}

function convertAudioToBuffer(filePath) {
    return new Promise((resolve, reject) => {
        // 使用 child_process 来执行 ffmpeg 命令
        const ffmpegProcess = spawn(ffmpegFilePath, [
            "-i",
            filePath, // 输入文件路径
            "-f",
            "wav", // 指定输出格式为 wav
            "-acodec",
            "pcm_s16le", // 设置音频编解码器
            "-ar",
            "44100", // 设置采样率
            "-ac",
            "2", // 设置通道数
            "pipe:1", // 将输出数据通过管道传递到 stdout
        ]);

        let chunks = [];

        // 收集数据块
        ffmpegProcess.stdout.on("data", (chunk) => {
            chunks.push(chunk);
        });

        // 监听结束事件
        ffmpegProcess.stdout.on("end", () => {
            const buffer = Buffer.concat(chunks); // 将数据块组合成 Buffer
            resolve(buffer);
        });

        // 错误处理
        ffmpegProcess.on("error", (err) => {
            reject(err);
        });

        ffmpegProcess.stderr.on("data", (data) => {
            console.error(`ffmpeg 错误信息: ${data}`);
        });
    });
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
    convertToWavStream,
    convertToWav,
    streamToBuffer,
    readAudioFile,
    convertAudioToBuffer,
};
