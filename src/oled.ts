import i2c from "i2c-bus";
import Oled from "oled-i2c-bus";
import font from "oled-font-5x7";
import si from "systeminformation";

// --- 설정값 ---
const I2C_BUS = 1;
const OLED_ADDR = 0x3c;
const SCREEN_WIDTH = 128;
const SCREEN_HEIGHT = 64;

// 왼쪽 여백 12px
const OFFSET_X = 0;
const PADDING_TOP = 0;
const LINE_HEIGHT = 16;

// 아이콘과 글자 사이 간격
const ICON_GAP = 5;

// Font Size 2 글자 너비 (대략)
const CHAR_WIDTH = 12;

// --- 아이콘 (8x8 Pixel Art) ---
const ICON_CPU: string[] = [
  "00001000",
  "00011000",
  "00111000",
  "01111110",
  "00011100",
  "00011000",
  "00010000",
  "00000000",
];

const ICON_RAM: string[] = [
  "00000000",
  "01111110",
  "01011010",
  "01011010",
  "01111110",
  "01011010",
  "01011010",
  "00000000",
];

const ICON_DISK: string[] = [
  "00000000",
  "00111100",
  "01000010",
  "01000010",
  "00111100",
  "01000010",
  "00111100",
  "00000000",
];

const ICON_DOCKER: string[] = [
  "00000000",
  "10000001",
  "10000001",
  "11011011",
  "11011011",
  "11111111",
  "01111100",
  "00000000",
];

const ICON_CLOCK: string[] = [
  "00111100",
  "01000010",
  "10010001",
  "10011001",
  "10000001",
  "01000010",
  "00111100",
  "00000000",
];

// --- 초기화 ---
const i2cBus = i2c.openSync(I2C_BUS);
const oledOpts = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  address: OLED_ADDR,
};

// @ts-ignore (라이브러리 타입 호환 문제 방지)
const display = new Oled(i2cBus, oledOpts);
display.clearDisplay();
display.turnOnDisplay();

// --- 유틸리티 함수 ---

function drawIcon(startX: number, startY: number, pattern: string[]) {
  const yOffset = startY + 4;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (pattern[y][x] === "1") {
        display.drawPixel([startX + x, yOffset + y, 1]);
      }
    }
  }
}

// 업타임 포맷 (단순화: 1d, 1h, 1m)
function formatUptime(uptimeSeconds: number): string {
  const days = Math.floor(uptimeSeconds / (3600 * 24));
  const hours = Math.floor(uptimeSeconds / 3600);
  const mins = Math.floor(uptimeSeconds / 60);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

// 2자리 숫자 포맷팅 (앞에 공백 추가)
function formatNumber(num: number): string {
  return Math.round(num).toString().padStart(2, " ");
}

// --- 메인 로직 ---
async function updateStatus() {
  try {
    const [cpuTemp, load, mem, fs, docker, time] = await Promise.all([
      si.cpuTemperature(),
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.dockerContainers(false),
      si.time(),
    ]);

    display.clearDisplay();

    // 텍스트 시작 X 좌표
    const TEXT_X = OFFSET_X + 8 + ICON_GAP;

    // ------------------------------------------------
    // 1. CPU
    // ------------------------------------------------
    const y1 = PADDING_TOP;
    drawIcon(OFFSET_X, y1, ICON_CPU);

    const cpuLoad = formatNumber(load.currentLoad);
    const temp = Math.round(cpuTemp.main || 0);

    display.setCursor(TEXT_X, y1);
    display.writeString(font, 2, `${cpuLoad}% ${temp}°C`, 1, true);

    // ------------------------------------------------
    // 2. RAM
    // ------------------------------------------------
    const y2 = PADDING_TOP + LINE_HEIGHT;
    drawIcon(OFFSET_X, y2, ICON_RAM);

    const memPercent = formatNumber((mem.active / mem.total) * 100);
    const memUsed = (mem.active / 1024 / 1024 / 1024).toFixed(1);

    display.setCursor(TEXT_X, y2);
    display.writeString(font, 2, `${memPercent}% ${memUsed}G`, 1, true);

    // ------------------------------------------------
    // 3. Disk
    // ------------------------------------------------
    const y3 = PADDING_TOP + LINE_HEIGHT * 2;
    drawIcon(OFFSET_X, y3, ICON_DISK);

    const rootDrive = fs.find((d) => d.mount === "/") || fs[0];
    const diskPercent = formatNumber(rootDrive.use);
    const diskUsed = Math.round(rootDrive.used / 1024 / 1024 / 1024);

    display.setCursor(TEXT_X, y3);
    display.writeString(font, 2, `${diskPercent}% ${diskUsed}G`, 1, true);

    // ------------------------------------------------
    // 4. Docker & Uptime
    // ------------------------------------------------
    const y4 = PADDING_TOP + LINE_HEIGHT * 3;

    // 4-1. Docker 아이콘
    drawIcon(OFFSET_X, y4, ICON_DOCKER);

    // 4-2. Docker 수 (2자리 확보)
    const dockerCount = docker ? docker.length : 0;
    const dockerCountStr = dockerCount.toString().padStart(2, " ");

    display.setCursor(TEXT_X, y4);
    display.writeString(font, 2, dockerCountStr, 1, true);

    // 다음 아이콘 위치 계산 (Docker 글자 길이 + 여백)
    const nextIconX = TEXT_X + dockerCountStr.length * CHAR_WIDTH + ICON_GAP;

    // 4-3. 시계 아이콘
    drawIcon(nextIconX, y4, ICON_CLOCK);

    // 4-4. 업타임
    const uptimeStr = formatUptime(time.uptime);
    const uptimeTextX = nextIconX + 8 + ICON_GAP;

    display.setCursor(uptimeTextX, y4);
    display.writeString(font, 2, uptimeStr, 1, true);
  } catch (err) {
    console.error("Update Error:", err);
  }
}

export const main = () => {
  // 3초마다 갱신
  setInterval(updateStatus, 3000);
  updateStatus();

  console.log("TS OLED Dashboard Started...");
};
