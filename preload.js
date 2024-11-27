const Path = require("path");
const fs = require("fs");
const http = require("http");
const zlib = require("zlib");
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
function downloadFFmpeg(fileSavePath) {
    console.log("downloading...");
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(fileSavePath);
        let downloaUrl = "";
        if (utools.isMacOS()) {
            downloaUrl = "https://evermeet.cx/ffmpeg/ffmpeg.zip";
        } else if (utools.isWindows()) {
            downloaUrl = "http://127.0.0.1:5173/win32-x64.gz";
        } else if (utools.isLinux()) {
            downloaUrl =
                "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";
        }

        downloadAndExtractGz(downloaUrl, fileSavePath).then(() => {
            console.log('ok')
            resolve();
        });

        // https
        //     .get(downloaUrl, (res) => {
        //         res.pipe(unzipper.Extract(file));
        //         file.on("finish", () => {
        //             file.close(() => {
        //                 console.log("FFmpeg downloaded successfully");
        //                 // 解压 ZIP 文件
        //                 // fs.createReadStream(fileSavePath).pipe(
        //                 //     unzipper.Extract({ path: fileSavePath })
        //                 // );

        //                 resolve();
        //             });
        //         });
        //     })
        //     .on("error", (err) => {
        //         fs.unlink(fileSavePath, () => {});
        //         console.log("Error downloading ffmpeg:", err);
        //         reject(err);
        //     });
    });
}

// 下载并解压.gz文件
function downloadAndExtractGz(url, outputFilePath) {
    return new Promise((resolve, reject) => {
        // 创建文件写入流
        const tempFilePath = Path.join(__dirname, "temp.gz");
        const fileStream = fs.createWriteStream(tempFilePath);

        // 下载 .gz 文件
        http.get(url, (response) => {
            response.pipe(fileStream);
            fileStream.on("finish", () => {
                fileStream.close();

                // 解压缩 .gz 文件
                const gzipStream = fs
                    .createReadStream(tempFilePath)
                    .pipe(zlib.createGunzip());
                const outputStream = fs.createWriteStream(outputFilePath);

                gzipStream.pipe(outputStream);
                gzipStream.on("end", () => {
                    // 删除临时文件
                    fs.unlinkSync(tempFilePath);
                    if (!utools.isWindows()) {
                        setExecutablePermission(outputStream);
                    }
                    console.log(`File saved to ${outputFilePath}`)
                    resolve(`File saved to ${outputFilePath}`);
                });

                gzipStream.on("error", (err) => reject(err));
            });
        }).on("error", (err) => reject(err));
    });
}

// 设置文件为可执行 (Linux/macOS)
const setExecutablePermission = async (filePath) => {
    return new Promise((resolve, reject) => {
        exec(`chmod +x ${filePath}`, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

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
/**
 *
 * @param {*} inputFilePath 输入音频路径
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
    startTime,
    duration,
    bands,
    envelopes,
    cutMode,
    exportExt
) {
    return new Promise((resolve, reject) => {
        let fileExtensionName = Path.extname(inputFilePath);
        switch (exportExt) {
            case "mp3":
                fileExtensionName = ".mp3";
                break;
            case "m4a":
                fileExtensionName = ".m4a";
                break;
            case "m4r":
                fileExtensionName = ".m4r";
                break;
            case "flac":
                fileExtensionName = ".flac";
                break;
            case "wav":
                fileExtensionName = ".wav";
                break;
        }

        console.log("fileExtensionName", fileExtensionName);

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

        let cutCommond = genAudioCutCommond(cutMode, startTime, duration);

        // const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" -ss ${startTime} -t ${duration} ${equalizerCommond} ${afadeCommond} "${outputFilePath}"`;
        const ffmpegCommond = `"${ffmpegFilePath}" -i "${inputFilePath}" ${equalizerCommond} ${afadeCommond} ${cutCommond} "${outputFilePath}"`;

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

//生成音频剪切时间命令
/**
 *
 * @param {*} cutMode 1: 留中间； 2: 留俩边;
 */
function genAudioCutCommond(cutMode, startTime, duration) {
    const endTime = startTime + duration;
    let cutCommond = "";
    if (cutMode === "1") {
        cutCommond = `-ss ${startTime} -t ${duration}`;
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
