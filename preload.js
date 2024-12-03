const Path = require("path");
const fs = require("fs");
const https = require("https");
const zlib = require("zlib");
const crypto = require("crypto");
const { PassThrough } = require("stream");
const { exec, execFile, spawn } = require("child_process");

let ffmpegFilePath = "";
if (utools.isWindows()) {
    ffmpegFilePath = Path.join(utools.getPath("downloads"), "ffmpeg.exe");
} else if (utools.isMacOS() || tools.isLinux()) {
    ffmpegFilePath = Path.join(utools.getPath("downloads"), "ffmpeg");
}

let audioOutputDataPath = utools.getPath("downloads");

//初始化用户数据
function initUserData() {
    const audioOutputData = utools.db.get("audioOutputPath");
    const ffmpegData = utools.db.get("ffmpeg");

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
function downloadFFmpeg(fileSavePath) {
    console.log("downloading...");
    return new Promise((resolve, reject) => {
        let downloaUrl = "";
        if (utools.isMacOS()) {
            downloaUrl = "https://res.u-tools.cn/ffmpeg/5.0.1/darwin-x64.gz";
        } else if (utools.isWindows()) {
            downloaUrl = "https://res.u-tools.cn/ffmpeg/5.0.1/win32-x64.gz";
        } else if (utools.isLinux()) {
            downloaUrl = "https://res.u-tools.cn/ffmpeg/5.0.1/linux-x64.gz";
        }

        downloadAndExtractGz(downloaUrl, fileSavePath)
            .then(() => {
                console.log("ok");
                resolve();
            })
            .catch((err) => {
                console.error("err", err);
                reject();
            });
    });
}

function downloadAndExtractGz(url, outputFilePath) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (response) => {
                if (response.statusCode !== 200) {
                    console.error(`下载资源获取失败: ${response.statusCode}`);
                    reject();
                    return;
                }

                // 解压 .gz 文件并保存内容
                const gunzip = zlib.createGunzip();
                const writeStream = fs.createWriteStream(outputFilePath);

                response
                    .pipe(gunzip) // 解压缩流
                    .pipe(writeStream) // 写入解压后的数据
                    .on("finish", () => {
                        writeStream.close(() => {
                            console.log("下载并解压完成.");
                            setExecutablePermission(outputFilePath);
                            resolve();
                        });
                    })
                    .on("error", (err) => {
                        fs.unlink(outputFilePath, () => {});
                        console.error(`解压失败: ${err.message}`);
                        reject();
                    });
            })
            .on("error", (err) => {
                fs.unlink(outputFilePath, () => {});
                console.error(`下载失败: ${err.message}`);
                reject();
            });
    });
}

// 设置文件为可执行 (Linux/macOS)
function setExecutablePermission(filePath) {
    fs.chmodSync(filePath, 0o755);
}

//检查有无ffmpeg
function checkIfFFmpegExist() {
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
/**
 *
 * @param {*} inputFilePath 输入音频路径
 * @param {*} formatedStartTime 处理后的剪切开始时间 00:00:00
 * @param {*} formatedDuration 处理后的剪切时长 00:00:00
 * @param {*} startTime 剪切开始时间
 * @param {*} duration 剪切时长
 * @param {*} bands 均衡器数据
 * @param {*} envelopes 包络器数据
 * @param {*} cutMode 剪切模式
 * @param {*} exportExt 导出格式
 * @returns 音频流
 */
function cutAudio(
    inputFilePath,
    formatedStartTime,
    formatedDuration,
    startTime,
    duration,
    bands,
    envelopes,
    cutMode,
    exportExt
) {
    return new Promise((resolve, reject) => {
        const { fileExtensionName, formatCommond } = genAudioFormatCommond(
            inputFilePath,
            exportExt
        );

        console.log("fileExtensionName", fileExtensionName);
        console.log("formatCommond", formatCommond);

        const randowId = crypto.randomBytes(16).toString("hex");
        const outputFileName = `${randowId}${fileExtensionName}`;
        const outputFilePath = Path.join(audioOutputDataPath, outputFileName);

        let equalizerCommond = "";
        if (bands?.length > 0) {
            equalizerCommond = genAudioEqualizerCommond(bands);
            console.log("equalizerCommond", equalizerCommond);
        }

        let afadeCommond = "";
        if (envelopes?.length > 0) {
            afadeCommond = genAudioAfadeCommond(envelopes);
            console.log("afadeCommond", afadeCommond);
        }

        let cutCommond = genAudioCutCommond(
            cutMode,
            startTime,
            duration,
            formatedStartTime,
            formatedDuration
        );

        // const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" -ss ${startTime} -t ${duration} ${equalizerCommond} ${afadeCommond} "${outputFilePath}"`;
        const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" ${equalizerCommond} ${afadeCommond} ${cutCommond} ${formatCommond} "${outputFilePath}"`;

        console.log("ffmpegCommond", ffmpegCommond);
        exec(ffmpegCommond, (error, stdout, stderr) => {
            if (error) {
                reject({
                    flag: "error",
                    messgae: error,
                });
                return;
            }

            utools.shellOpenPath(Path.dirname(outputFilePath));

            resolve({
                flag: "success",
                messgae: "",
            });
        });
    });
}

//生成音频转码命令
/**
 *
 * @param {*} exportExt 需要转换的格式
 */
function genAudioFormatCommond(inputFilePath, exportExt) {
    let fileExtensionName = Path.extname(inputFilePath);
    let formatCommond = "";
    switch (exportExt) {
        case "origin":
            if (fileExtensionName === ".m4r") {
                formatCommond = `-c:a "aac" -vn -b:a "128k" -ar "44100" -ac "2" -f "ipod"`;
            }
            break;
        case "mp3":
            fileExtensionName = ".mp3";
            formatCommond = `-c:a "libmp3lame" -b:a "192k" -ar "44100"`;
            break;
        case "m4a":
            fileExtensionName = ".m4a";
            formatCommond = `-c:a "aac" -vn -b:a "192k" -ar "48000" -f "ipod"`;
            break;
        case "m4r":
            fileExtensionName = ".m4r";
            formatCommond = `-c:a "aac" -vn -b:a "128k" -ar "44100" -ac "2" -f "ipod"`;
            break;
        case "flac":
            fileExtensionName = ".flac";
            formatCommond = `-c:a "flac" -compression_level "5" -ar "96000"`;
            break;
        case "wav":
            fileExtensionName = ".wav";
            formatCommond = `-c:a "pcm_s16le" -ar "44100"`;
            break;
    }

    return {
        fileExtensionName,
        formatCommond,
    };
}

//生成音频剪切时间命令
/**
 *
 * @param {*} cutMode 1: 留中间； 2: 留俩边;
 */
function genAudioCutCommond(
    cutMode,
    startTime,
    duration,
    formatedStartTime,
    formatedDuration
) {
    const endTime = startTime + duration;
    let cutCommond = "";
    if (cutMode === "1") {
        cutCommond = `-ss ${formatedStartTime} -t ${formatedDuration}`;
    } else if (cutMode === "2") {
        cutCommond = `-filter_complex \
        "[0]atrim=0:${startTime},asetpts=PTS-STARTPTS[ahead]; \
         [0]atrim=${endTime},asetpts=PTS-STARTPTS[atail]; \
         [ahead][atail]concat=n=2:v=0:a=1[out]" \
         -map "[out]"`;
    }

    return cutCommond;
}

//音频均衡器滤镜
function genAudioEqualizerCommond(bandsData) {
    let equalizerCommond = bandsData
        .map((item, index) => {
            const { frequencyValue, value } = item;
            return `equalizer=f=${frequencyValue}:t=q:w=1:g=${value}`;
        })
        .join(",");

    let ffmpegCommond = `-af "${equalizerCommond}"`;
    return ffmpegCommond;
}

//音频音量淡出滤镜
function genAudioAfadeCommond(envelopesData) {
    const volumeExpression = generateVolumeExpression(envelopesData);
    let afadeCommond = `-af "volume='${volumeExpression}':eval=frame"`;
    return afadeCommond;
}

/**
 * 生成ffmpeg Volume滤镜Commond
 * @param {*} points [{time: 0, volume: 0.5}, {time: 10, volume: 1}]
 * @returns
 */
function generateVolumeExpression(points) {
    let expressions = [];

    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];

        // 计算线性插值的公式
        const slope = (end.volume - start.volume) / (end.time - start.time);
        const intercept = start.volume - slope * start.time;

        // 创建嵌套的if条件表达式
        expressions.push(
            `between(t,${start.time},${end.time})*(${slope.toFixed(
                5
            )}*t+${intercept.toFixed(5)})`
        );
    }

    // 最后一个点的音量
    const lastVolume = points[points.length - 1].volume;
    expressions.push(`gte(t,${points[points.length - 1].time})*${lastVolume}`);

    return expressions.join("+");
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
    let defaultPath = "";
    if (utools.isWindows()) {
        defaultPath = "ffmpeg.exe";
    } else if (utools.isMacOS() || tools.isLinux()) {
        defaultPath = "ffmpeg";
    }

    const savePath = utools.showSaveDialog({
        title: "FFmpeg存放路径",
        defaultPath,
        buttonLabel: "保存",
    });
    console.log("savePath", savePath);

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
