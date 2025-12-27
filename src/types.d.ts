declare module 'oled-i2c-bus' {
    import { PromisifiedBus } from 'i2c-bus';
  
    interface OledOptions {
        width: number;
        height: number;
        address: number;
    }
  
    class Oled {
        constructor(bus: any, opts: OledOptions);
        clearDisplay(): void;
        turnOnDisplay(): void;
        setCursor(x: number, y: number): void;
        writeString(font: any, size: number, text: string, color: number, wrap: boolean): void;
        drawPixel(pixels: [number, number, number] | [number, number, number][]): void;
    }
    export = Oled;
}

declare module 'oled-font-5x7' {
    const font: any;
    export = font;
}