const Path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { PassThrough } = require("stream");
const { exec, execFile, spawn } = require("child_process");

let ffmpegFilePath = Path.join(utools.getPath("downloads"), "ffmpeg.exe");
let audioOutputDataPath = utools.getPath("downloads");

//初始化用户数据
function initUserData() {
    const audioOutputData = utools.db.get("audioOutputPath");
    const ffmpegData = utools.db.get("ffmpeg");
    console.log("ffmpegData", ffmpegData, audioOutputData);

    if (ffmpegData) {
        let path = ffmpegData.data;
        if (["downloads", "music", "desktop"].includes(path)) {
            path = utools.getPath(ffmpegData.data);
        }
        ffmpegFilePath = Path.join(path);
    }

    if (audioOutputData) {
        let path = audioOutputData.data;
        if (["downloads", "music", "desktop"].includes(path)) {
            path = utools.getPath(audioOutputData.data);
        }
        audioOutputDataPath = Path.join(path);
    }
}

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
function checkIfFFmpegExist() {
    console.log("ffmpegFilePath", ffmpegFilePath);

    return new Promise((resolve, reject) => {
        const ffmpegCommond = `"${ffmpegFilePath}" -version`;
        exec(ffmpegCommond, (error, stdout, stderr) => {
            if (error) {
                console.error("Dont have ffmpeg");
                return reject();
            }

            return resolve();
        });
    });
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
        const outputFilePath = Path.join(audioOutputDataPath, "test.wav");
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

//音频文件转成wav格式流
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

//音频剪切
function cutAudio(inputFilePath, startTime, duration, bands) {
    return new Promise((resolve, reject) => {
        const fileExtensionName = Path.extname(inputFilePath);
        const randowId = crypto.randomBytes(16).toString("hex");
        const outputFileName = `${randowId}${fileExtensionName}`;
        const outputFilePath = Path.join(audioOutputDataPath, outputFileName);

        let equalizerCommond = "";
        if (bands?.length > 0) {
            equalizerCommond = genAudioEqualizerCommond(bands);
            console.log("equalizerCommond", equalizerCommond);
        }

        // const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" -ss ${startTime} -t ${duration} -af "equalizer=f=60:t=q:w=1:g=15" -acodec copy "${outputFilePath}"`;
        // const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" -ss ${startTime} -t ${duration} -af "equalizer=f=60:t=q:w=1:g=15" "${outputFilePath}"`;
        const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" -ss ${startTime} -t ${duration} ${equalizerCommond} "${outputFilePath}"`;
        console.log("ffmpegCommond", ffmpegCommond);
        exec(ffmpegCommond, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }

            if (stderr) {
                reject(stderr);
                return;
            }

            resolve(stdout);
        });
    });
}

//音频均衡器滤镜
function genAudioEqualizerCommond(bandsData) {
    let equalizerCommond = bandsData
        .map((item, index) => {
            const { frequencyValue, value } = item;
            // return `equalizer=f=${frequencyValue}:width_type=h:width=1:g=${value}`;
            return `equalizer=f=${frequencyValue}:t=q:w=1:g=${value}`;
        })
        .join(",");

    let ffmpegCommond = `-af "${equalizerCommond}"`;
    return ffmpegCommond;
}

//在数据库新增或更新数据
function addOrUpdataDataBase(id, data) {
    const result = utools.db.get(id);
    const updateParams = {
        _id: id,
        data,
    };
    if (result) {
        const { _rev } = result;
        Object.assign(updateParams, {
            _rev,
        });
    }

    return utools.db.put(updateParams);
}

//用户选择保存路径保存ffmpeg
async function userCtrlDownloadFFmpeg() {
    const savePath = utools.showSaveDialog({
        title: "FFmpeg存放路径",
        defaultPath: "ffmpeg.exe",
        buttonLabel: "保存",
    });

    if (savePath?.length > 0) {
        addOrUpdataDataBase("ffmpeg", savePath);
        initUserData();
        return downloadFFmpeg(savePath);
    }
}

//通过音频路径获取音频文件名称
function getfileNameByPath(filePath) {
    return Path.basename(filePath);
}

//初始化插件
utools.onPluginEnter(() => {
    initUserData();
});

window.services = {
    convertToWavStream,
    convertToWav,
    streamToBuffer,
    readAudioFile,
    convertAudioToBuffer,
    cutAudio,
    initUserData,
    userCtrlDownloadFFmpeg,
    checkIfFFmpegExist,
    addOrUpdataDataBase,
    getfileNameByPath,
};
