import { readsSettled } from '../core/request'

interface HomeComponent {
  load(): Promise<void>
}

interface Host {
  selectComponent(selector: string): HomeComponent | null
}

// 模块首页的内容在 hz-module-home 组件里；下拉刷新让组件重新读，读请求都回来再收起（02 章第 5.1 节）
export const moduleHomePage = {
  onPullDownRefresh(this: Host) {
    void this.selectComponent('.module-home')?.load()
    setTimeout(() => {
      void readsSettled().then(() => wx.stopPullDownRefresh())
    }, 0)
  },
}
