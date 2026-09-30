// 业务参数：05 章第 1.6 节是它的文字版，名字和初始值两边一致；代码、测试只引用这里的名字

export const PAGE_SIZE = 20
export const PAGE_SIZE_MAX = 50
export const TODO_PREVIEW_COUNT = 3
export const DEMAND_DEFAULT_DAYS = 7
export const STORE_INVITE_TTL_DAYS = 7
export const STORE_INVITE_TOKEN_BYTES = 32
export const AFTER_IMAGE_MAX_COUNT = 3
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const UPLOAD_TICKET_TTL_MINUTES = 10
export const FILE_URL_TTL_MINUTES = 60
export const IDEMPOTENCY_TTL_HOURS = 24
export const WS_PING_INTERVAL_SECONDS = 25
export const WS_IDLE_TIMEOUT_SECONDS = 60
// 「前缀-YYMMDD-三位序号」：{seq:3} 表示至少 3 位，超过 999 自然变 4 位
export const DOC_NO_FORMAT = '{prefix}-{yymmdd}-{seq:3}'
export const MATERIAL_CODE_PREFIX = 'HC-'
export const REQUEST_TIMEOUT_MS = 10_000
export const READ_RETRY_COUNT = 1
export const RECONNECT_DELAYS_SECONDS = [1, 2, 5, 10, 30] as const
export const SKELETON_DELAY_MS = 300
export const SUBMIT_SPINNER_DELAY_MS = 800
export const SEARCH_DEBOUNCE_MS = 300
export const TOAST_DURATION_MS = 1500
