// 没有自带类型的依赖：只声明用到的部分

declare module 'svg2ttf' {
  interface Svg2TtfResult {
    buffer: Uint8Array
  }
  export default function svg2ttf(
    svg: string,
    options?: { ts?: number; description?: string; url?: string },
  ): Svg2TtfResult
}

declare module 'subset-font' {
  interface SubsetOptions {
    targetFormat: 'sfnt' | 'woff' | 'woff2'
    variationAxes?: Record<string, number>
  }
  export default function subsetFont(
    font: Buffer,
    text: string,
    options: SubsetOptions,
  ): Promise<Buffer>
}
