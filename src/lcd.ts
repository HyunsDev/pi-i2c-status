import i2c from "i2c-bus";
import si from "systeminformation";

// --- 설정값 ---
const I2C_BUS = 1;
const LCD_ADDR = 0x27; // 보통 0x27 또는 0x3f 입니다. 안 되면 변경해보세요.
const UPDATE_INTERVAL = 3000; // 3초

// --- LCD 제어 클래스 (PCF8574 I2C Backpack 호환) ---
class LcdDevice {
  private bus: i2c.PromisifiedBus;
  private addr: number;
  private backlight: number = 0x08; // 백라이트 ON

  constructor(busNum: number, addr: number) {
    this.addr = addr;
    // @ts-ignore: i2c-bus 타입 정의와 실제 openPromisified 간의 차이 무시
    this.bus = i2c.openPromisified(busNum);
  }

  async init() {
    // 초기화 시퀀스 (HD44780 스펙)
    await this.sleep(50);
    await this.send(0x03, 0);
    await this.sleep(5);
    await this.send(0x03, 0);
    await this.sleep(5);
    await this.send(0x03, 0);
    await this.sleep(5);
    await this.send(0x02, 0); // 4비트 모드 설정

    // 설정 커맨드
    await this.command(0x28); // 4-bit, 2 line, 5x8 dots
    await this.command(0x0c); // Display ON, Cursor OFF
    await this.command(0x06); // Entry Mode (Auto increment)
    await this.command(0x01); // Clear Display
    await this.sleep(2);
  }

  // 커맨드 전송 (RS=0)
  async command(cmd: number) {
    await this.send(cmd, 0);
  }

  // 데이터(글자) 전송 (RS=1)
  async write(data: number) {
    await this.send(data, 1);
  }

  // 문자열 출력
  async print(str: string) {
    for (let i = 0; i < str.length; i++) {
      await this.write(str.charCodeAt(i));
    }
  }

  // 커서 이동 (row: 0-1, col: 0-15)
  async setCursor(col: number, row: number) {
    const rowOffsets = [0x00, 0x40];
    await this.command(0x80 | (col + rowOffsets[row]));
  }

  // 화면 지우기
  async clear() {
    await this.command(0x01);
    await this.sleep(2);
  }

  // 커스텀 캐릭터 등록 (0-7번 슬롯)
  async createChar(location: number, charMap: number[]) {
    location &= 0x7; // 0-7만 허용
    await this.command(0x40 | (location << 3));
    for (let i = 0; i < 8; i++) {
      await this.write(charMap[i]);
    }
  }

  // 내부: 4비트 전송 로직
  private async send(value: number, mode: number) {
    const high = value & 0xf0;
    const low = (value << 4) & 0xf0;
    await this.write4Bits(high | mode | this.backlight);
    await this.write4Bits(low | mode | this.backlight);
  }

  private async write4Bits(value: number) {
    await this.bus.writeByte(this.addr, 0, value | 0x04); // Enable High
    await this.bus.writeByte(this.addr, 0, value & ~0x04); // Enable Low
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- 아이콘 (5x8 Pixel for LCD) ---
// LCD는 0~7번까지 커스텀 문자를 저장할 수 있습니다.
const ICONS = {
  CPU: [0x04, 0x0a, 0x0a, 0x0a, 0x1f, 0x11, 0x11, 0x00], // 0: CPU Chip
  RAM: [0x0a, 0x0a, 0x1f, 0x0a, 0x0a, 0x1f, 0x0a, 0x0a], // 1: RAM Stick
  DISK: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x0e, 0x00], // 2: HDD Cylinder
  DOCKER: [0x00, 0x10, 0x18, 0x1c, 0x1e, 0x1c, 0x00, 0x00], // 3: Whale/Box
  TEMP: [0x04, 0x0a, 0x0a, 0x0a, 0x0a, 0x11, 0x1f, 0x0e], // 4: Thermometer
};

// --- 메인 로직 ---

export async function main() {
  const lcd = new LcdDevice(I2C_BUS, LCD_ADDR);
  await lcd.init();

  // 커스텀 아이콘 등록
  await lcd.createChar(0, ICONS.CPU);
  await lcd.createChar(1, ICONS.RAM);
  await lcd.createChar(2, ICONS.DISK);
  await lcd.createChar(3, ICONS.DOCKER);
  await lcd.createChar(4, ICONS.TEMP);

  let page = 0; // 0: CPU/RAM, 1: DISK/DOCKER

  const loop = async () => {
    try {
      // 데이터 수집
      const [cpuTemp, load, mem, fs, docker, time] = await Promise.all([
        si.cpuTemperature(),
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.dockerContainers(false),
        si.time(),
      ]);

      await lcd.clear();

      if (page === 0) {
        // --- PAGE 1: CPU & RAM ---

        // Line 1: [ICON_CPU] 12% [ICON_TEMP] 45C
        const cpuLoad = Math.round(load.currentLoad)
          .toString()
          .padStart(2, " ");
        const temp = Math.round(cpuTemp.main || 0).toString();

        await lcd.setCursor(0, 0);
        await lcd.write(0); // CPU Icon
        await lcd.print(` ${cpuLoad}% `);
        await lcd.write(4); // Temp Icon
        await lcd.print(` ${temp}C`);

        // Line 2: [ICON_RAM] 45% 2.1G
        const memPercent = Math.round((mem.active / mem.total) * 100)
          .toString()
          .padStart(2, " ");
        const memUsed = (mem.active / 1024 / 1024 / 1024).toFixed(1);

        await lcd.setCursor(0, 1);
        await lcd.write(1); // RAM Icon
        await lcd.print(` ${memPercent}% ${memUsed}GB`);
      } else {
        // --- PAGE 2: DISK & DOCKER/UPTIME ---

        // Line 1: [ICON_DISK] 55% 100G
        const rootDrive = fs.find((d) => d.mount === "/") || fs[0];
        const diskPercent = Math.round(rootDrive.use)
          .toString()
          .padStart(2, " ");
        const diskUsed = Math.round(rootDrive.used / 1024 / 1024 / 1024);

        await lcd.setCursor(0, 0);
        await lcd.write(2); // Disk Icon
        await lcd.print(` ${diskPercent}% ${diskUsed}GB`);

        // Line 2: [ICON_DOCKER] 3  UP: 5h
        const dockerCount = docker ? docker.length : 0;
        const uptimeStr = formatUptimeSimple(time.uptime);

        await lcd.setCursor(0, 1);
        await lcd.write(3); // Docker Icon
        await lcd.print(` ${dockerCount}  UP:${uptimeStr}`);
      }

      // 페이지 전환
      page = page === 0 ? 1 : 0;
    } catch (err) {
      console.error("Update Error:", err);
      // 에러 시 LCD에 표시 시도
      try {
        await lcd.clear();
        await lcd.print("Error Occurred");
      } catch (e) {}
    }
  };

  // 초기 실행 후 주기적 실행
  await loop();
  setInterval(loop, UPDATE_INTERVAL);
  console.log("TS LCD 1602 Dashboard Started...");
}

// 1602 LCD용 아주 짧은 Uptime (공간 부족)
function formatUptimeSimple(uptimeSeconds: number): string {
  const days = Math.floor(uptimeSeconds / (3600 * 24));
  const hours = Math.floor(uptimeSeconds / 3600);
  const mins = Math.floor(uptimeSeconds / 60);

  if (days > 99) return "99d+";
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

main().catch(console.error);
