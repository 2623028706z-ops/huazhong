// 当前小程序版本对应的云托管环境（01 章第 5 节）：开发版、体验版 → 开发环境；正式版 → 生产环境
import { cloudEnvs } from '../config/env'

export interface CloudTarget {
  env: string
  service: string
}

export function cloudTarget(): CloudTarget {
  const { envVersion } = wx.getAccountInfoSync().miniProgram
  return envVersion === 'release' ? cloudEnvs.prod : cloudEnvs.dev
}
